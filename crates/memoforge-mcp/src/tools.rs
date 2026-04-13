//! MCP Tools Implementation
//! 参考: 技术实现文档 §4

use memoforge_core::config::load_config;
use memoforge_core::context_pack::{ContextPack, ContextPackScope};
use memoforge_core::context_pack_store::ContextPackStore;
use memoforge_core::events::{log_git_pull, log_git_push};
use memoforge_core::knowledge::split_sections;
use memoforge_core::{ErrorCode, EventSource, LoadLevel, MemoError};
use serde_json::{json, Value};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

static KB_PATH: Mutex<Option<PathBuf>> = Mutex::new(None);
static MODE: Mutex<Option<String>> = Mutex::new(None);
static ALLOW_STALE_KB: Mutex<bool> = Mutex::new(false);
static AGENT_NAME: Mutex<Option<String>> = Mutex::new(None);
static LAST_REGISTERED_KB: Mutex<Option<PathBuf>> = Mutex::new(None);
static PROFILE: Mutex<Profile> = Mutex::new(Profile::GenericStdio);

// ---------------------------------------------------------------------------
// Profile Gate
// ---------------------------------------------------------------------------

/// MCP tool exposure profile.
///
/// Controls which tools are visible to clients based on the connection scenario.
/// See `docs/planning/releases/v0.3.0/ForgeNerve-v0.3.0-MCP契约矩阵.md` for
/// the frozen profile definitions.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Profile {
    /// Generic Agent, no desktop collaboration. Minimum tool surface (<= 12).
    GenericStdio,
    /// Agent collaborating with the desktop app. Extended read-only tools.
    DesktopAssisted,
    /// Full backward-compatible surface. For debugging / legacy only.
    LegacyFull,
}

impl Profile {
    pub fn from_str(s: &str) -> Self {
        match s {
            "generic-stdio" => Profile::GenericStdio,
            "desktop-assisted" => Profile::DesktopAssisted,
            "legacy-full" => Profile::LegacyFull,
            _ => Profile::GenericStdio, // default to safest
        }
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            Profile::GenericStdio => "generic-stdio",
            Profile::DesktopAssisted => "desktop-assisted",
            Profile::LegacyFull => "legacy-full",
        }
    }
}

/// Tools recommended for `generic-stdio` profile (<= 12 tools).
/// Core agent tools: Draft workflow, Session tracking, Inbox flow.
/// See `docs/planning/releases/v0.3.0/ForgeNerve-v0.3.0-MCP契约矩阵.md`.
const GENERIC_STDIO_TOOLS: &[&str] = &[
    // Draft workflow (6)
    "read_knowledge",
    "start_draft",
    "update_draft",
    "preview_draft",
    "commit_draft",
    "discard_draft",
    // Session tracking (3)
    "start_agent_session",
    "append_agent_session_context",
    "complete_agent_session",
    // Inbox flow (3)
    "create_inbox_item",
    "promote_inbox_item_to_draft",
    "list_inbox_items",
];

/// Additional tools exposed in `desktop-assisted` profile.
/// Read-only information and review tools for desktop AI assistants.
const DESKTOP_ONLY_TOOLS: &[&str] = &[
    // Editor state (1)
    "get_editor_state",
    // Review queue (2)
    "list_review_items",
    "get_review_item",
    // Workflow templates (1)
    "list_workflow_templates",
    // Governance (1)
    "get_knowledge_governance",
    // Reliability (1)
    "list_reliability_issues",
];

/// Legacy-only tools. Only visible under the `legacy-full` profile.
#[allow(dead_code)] // kept for documentation and future profile-gating extensions
const LEGACY_ONLY_TOOLS: &[&str] = &[
    "list_knowledge",
    "get_summary",
    "get_content",
    "get_knowledge_with_stale",
    "grep",
    "get_tags",
    "get_backlinks",
    "get_related",
    "get_knowledge_graph",
    "create_knowledge",
    "update_knowledge",
    "update_metadata",
    "delete_knowledge",
    "move_knowledge",
    "git_status",
    "git_commit",
    "git_pull",
    "git_push",
    "git_log",
    "create_fix_draft_from_issue",
    "create_context_pack",
    "get_context_pack",
    "export_context_pack",
    "list_context_packs",
    // Moved from DESKTOP_ONLY_TOOLS (desktop-assisted → legacy-only)
    "get_agent_session",
    "list_agent_sessions",
    "list_drafts",
    "get_reliability_issue_detail",
    "start_workflow_run",
    "apply_review_decision",
    "start_review",
    "update_knowledge_governance",
];

/// Check whether a tool is visible under the given profile.
fn is_tool_visible(tool_name: &str, profile: &Profile) -> bool {
    match profile {
        Profile::LegacyFull => true,
        Profile::GenericStdio => GENERIC_STDIO_TOOLS.contains(&tool_name),
        Profile::DesktopAssisted => {
            GENERIC_STDIO_TOOLS.contains(&tool_name)
                || DESKTOP_ONLY_TOOLS.contains(&tool_name)
        }
    }
}

/// Public visibility check for cross-module use (e.g., SSE early-return paths).
pub fn is_tool_visible_for_review(tool_name: &str, profile: &Profile) -> bool {
    is_tool_visible(tool_name, profile)
}

pub fn set_profile(profile: Profile) {
    let mut guard = PROFILE.lock().unwrap();
    // Only update if actually changed to reduce mutex contention
    if *guard != profile {
        *guard = profile;
    }
}

pub fn get_profile() -> Profile {
    PROFILE.lock().unwrap().clone()
}

pub fn set_kb_path(path: PathBuf) {
    *KB_PATH.lock().unwrap() = Some(path);
}

pub fn set_mode(mode: String) {
    *MODE.lock().unwrap() = Some(mode);
}

pub fn set_allow_stale_kb(allow: bool) {
    *ALLOW_STALE_KB.lock().unwrap() = allow;
}

pub fn set_agent_name(name: String) {
    *AGENT_NAME.lock().unwrap() = Some(name);
}

fn get_allow_stale_kb() -> bool {
    *ALLOW_STALE_KB.lock().unwrap()
}

fn get_agent_name() -> String {
    AGENT_NAME
        .lock()
        .unwrap()
        .clone()
        .unwrap_or_else(|| memoforge_core::infer_agent_name())
}

fn get_kb_path() -> Result<PathBuf, MemoError> {
    let mode = get_mode();

    // follow 模式：每次都从全局状态文件读取当前 KB
    if mode == "follow" {
        match memoforge_core::editor_state::EditorState::load_global() {
            Ok(Some(state)) if state.state_valid && state.current_kb.is_some() => {
                let kb_path = state.current_kb.unwrap().path;

                // 动态注册 Agent（仅在 KB 变化时）
                ensure_agent_registered(&kb_path);

                Ok(kb_path)
            }
            Ok(_) if get_allow_stale_kb() => {
                // 回退到最近知识库（仅只读操作）
                match memoforge_core::get_last_kb()? {
                    Some(kb_path) => {
                        // 不注册 Agent（stale KB）
                        Ok(PathBuf::from(kb_path))
                    }
                    None => Err(MemoError {
                        code: ErrorCode::NotInitialized,
                        message: "编辑器状态无效，且没有最近使用的知识库".to_string(),
                        retry_after_ms: Some(5000),
                        context: None,
                    }),
                }
            }
            Ok(_) => Err(MemoError {
                code: ErrorCode::NotInitialized,
                message: "编辑器状态无效，请确保桌面应用正在运行".to_string(),
                retry_after_ms: Some(5000),
                context: None,
            }),
            Err(e) => Err(e),
        }
    } else {
        // bound 模式：使用静态路径
        KB_PATH.lock().unwrap().clone().ok_or_else(|| MemoError {
            code: ErrorCode::NotInitialized,
            message: "Knowledge base not initialized".to_string(),
            retry_after_ms: None,
            context: None,
        })
    }
}

/// 确保 Agent 已注册到当前 KB（follow 模式）
/// 仅在 KB 路径变化时重新注册
fn ensure_agent_registered(kb_path: &PathBuf) {
    let mut last_kb = LAST_REGISTERED_KB.lock().unwrap();

    if last_kb.as_ref() != Some(kb_path) {
        // 注销旧 KB 的 Agent
        if let Some(old_kb) = last_kb.take() {
            let _ = memoforge_core::unregister_agent(&old_kb);
        }

        // 注册到新 KB
        let agent_name = get_agent_name();
        let _ = memoforge_core::register_agent(kb_path, &agent_name);

        *last_kb = Some(kb_path.clone());
    }
}

fn get_mode() -> String {
    MODE.lock()
        .unwrap()
        .clone()
        .unwrap_or_else(|| "bound".to_string())
}

fn tool(name: &str, description: &str, input_schema: Value) -> Value {
    json!({
        "name": name,
        "description": description,
        "inputSchema": input_schema,
    })
}

pub fn list_tools() -> Vec<Value> {
    let all_tools = vec![
        tool(
            "get_editor_state",
            "Get current MemoForge desktop editor state including: mode (follow/bound), desktop app status, current knowledge base path, current knowledge being edited, text selection info, and list of active AI agents. Call this to understand the user's current context.",
            json!({
                "type": "object",
                "properties": {},
                "description": "Returns real-time state from the desktop application when connected via SSE mode"
            }),
        ),
        tool(
            "get_status",
            "Get knowledge base overview: total knowledge count, category count, Git initialization status, and current access mode (readonly/readwrite). Call this to verify KB accessibility.",
            json!({
                "type": "object",
                "properties": {},
                "description": "Returns KB statistics and connectivity status"
            }),
        ),
        tool(
            "get_config",
            "Get knowledge base configuration including KB name, version, and all registered categories with their paths and descriptions. IMPORTANT: Call this before creating new knowledge to understand the category structure.",
            json!({
                "type": "object",
                "properties": {},
                "description": "Returns configuration from .memoforge/config.yaml"
            }),
        ),
        tool(
            "list_knowledge",
            "List knowledge entries with optional filtering. This is the primary discovery tool - call it first to explore the knowledge base before diving into specific content.",
            json!({
                "type": "object",
                "properties": {
                    "level": {
                        "type": "string",
                        "enum": ["L0", "L1"],
                        "description": "Detail level: L0 (default) = metadata only (fast), L1 = include AI-generated summaries"
                    },
                    "path": {
                        "type": "string",
                        "description": "Filter by category path prefix, e.g., '技术/Rust'. Prefer category path over opaque category id."
                    },
                    "category_id": {
                        "type": "string",
                        "description": "Legacy: Filter by category id. Prefer 'path' when available."
                    },
                    "tags": {
                        "type": "array",
                        "items": { "type": "string" },
                        "description": "Filter by tags (AND logic)"
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Max results to return (default: 50)"
                    },
                    "offset": {
                        "type": "integer",
                        "description": "Pagination offset"
                    }
                }
            }),
        ),
        tool(
            "get_summary",
            "Get knowledge summary (L1 level) with metadata. Summary is AI-generated and may be stale if content was recently modified (check summary_stale flag).",
            json!({
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Knowledge file path relative to KB root, e.g., '技术/Rust异步编程.md'"
                    },
                    "id": {
                        "type": "string",
                        "description": "Legacy: Knowledge ID (use path instead)"
                    }
                },
                "required": ["path"]
            }),
        ),
        tool(
            "get_content",
            "Get full knowledge content (L2) with markdown body. Optionally retrieve a specific section by index (0-based) or exact title. Use section parameter to avoid loading large documents entirely.",
            json!({
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Knowledge file path relative to KB root"
                    },
                    "id": {
                        "type": "string",
                        "description": "Legacy: Knowledge ID (use path instead)"
                    },
                    "section": {
                        "description": "Optional: section index (integer, 0-based) or exact section title (string) to retrieve only that section",
                        "oneOf": [
                            { "type": "integer" },
                            { "type": "string" }
                        ]
                    }
                },
                "required": ["path"]
            }),
        ),
        tool(
            "get_knowledge_with_stale",
            "Get full knowledge data (L2) including content, metadata, and a boolean flag indicating whether the AI-generated summary needs regeneration due to recent content changes.",
            json!({
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Knowledge file path relative to KB root"
                    },
                    "id": {
                        "type": "string",
                        "description": "Legacy: Knowledge ID (use path instead)"
                    }
                },
                "required": ["path"]
            }),
        ),
        tool(
            "grep",
            "Search knowledge content by regex pattern or substring. Returns matching knowledge entries with highlighted context. Supports filtering by tags and category.",
            json!({
                "type": "object",
                "properties": {
                    "pattern": {
                        "type": "string",
                        "description": "Regex pattern or substring to search for"
                    },
                    "query": {
                        "type": "string",
                        "description": "Alias for pattern"
                    },
                    "tags": {
                        "type": "array",
                        "items": { "type": "string" },
                        "description": "Filter results to entries with these tags (AND logic)"
                    },
                    "path": {
                        "type": "string",
                        "description": "Filter to entries under this category path prefix"
                    },
                    "category_id": {
                        "type": "string",
                        "description": "Filter to entries in this exact category ID"
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Max results (default: 20)"
                    }
                },
                "required": ["pattern"]
            }),
        ),
        tool(
            "get_tags",
            "List all tags used across the knowledge base with their usage counts. Use prefix parameter to filter tags starting with a specific string.",
            json!({
                "type": "object",
                "properties": {
                    "prefix": {
                        "type": "string",
                        "description": "Filter tags starting with this prefix, e.g., 'rust' matches 'rust', 'rust-async', 'rust-patterns'"
                    }
                }
            }),
        ),
        tool(
            "get_backlinks",
            "Get all knowledge entries that link TO the specified knowledge (reverse links). Essential for understanding what references this piece of knowledge. Returns list of source paths and link context.",
            json!({
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Knowledge file path to find backlinks for"
                    },
                    "id": {
                        "type": "string",
                        "description": "Legacy: Knowledge ID (use path instead)"
                    }
                },
                "required": ["path"]
            }),
        ),
        tool(
            "get_related",
            "Get knowledge entries related to the specified knowledge through: (1) outgoing wiki links, (2) backlinks from other entries, (3) shared tags. Returns a relevance-scored list.",
            json!({
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Knowledge file path to find related entries for"
                    },
                    "id": {
                        "type": "string",
                        "description": "Legacy: Knowledge ID (use path instead)"
                    }
                },
                "required": ["path"]
            }),
        ),
        tool(
            "get_knowledge_graph",
            "Get the complete knowledge graph structure with nodes (knowledge entries) and edges (links between entries). Use this to visualize relationships or find clusters of related content.",
            json!({
                "type": "object",
                "properties": {},
                "description": "Returns graph suitable for visualization tools like ReactFlow or D3.js"
            }),
        ),
        tool(
            "create_knowledge",
            "Create a new knowledge entry. IMPORTANT: For a single request with multiple topics (e.g., 'analyze X and save'), merge all content into ONE document with ## section headings instead of creating multiple entries. Preferred docs-style call: provide 'path' + 'content'; 'metadata.title' is optional and defaults to the filename stem. Legacy fallback: provide 'title' + 'content' (optionally 'category_id').",
            json!({
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Preferred: relative file path from KB root, e.g., '技术/Rust异步编程.md'. Must end with .md. If provided, title can be omitted and defaults to the file stem."
                    },
                    "content": {
                        "type": "string",
                        "description": "Full markdown content. For multi-topic content, use ## headings to organize sections within one document"
                    },
                    "metadata": {
                        "type": "object",
                        "description": "Optional metadata object for docs-style input",
                        "properties": {
                            "title": { "type": "string", "description": "Display title" },
                            "tags": { "type": "array", "items": { "type": "string" }, "description": "Tags for categorization" },
                            "summary": { "type": "string", "description": "Brief summary (auto-generated if omitted)" }
                        }
                    },
                    "title": { "type": "string", "description": "Legacy fallback: required only when 'path' is omitted" },
                    "tags": { "type": "array", "items": { "type": "string" }, "description": "Legacy: Tags array" },
                    "category_id": { "type": "string", "description": "Legacy: Category path or opaque category id. Prefer category path when available." },
                    "summary": { "type": "string", "description": "Legacy: Summary text" }
                },
                "required": ["content"],
                "oneOf": [
                    { "required": ["path"] },
                    { "required": ["title"] }
                ]
            }),
        ),
        tool(
            "update_knowledge",
            "Update existing knowledge content and/or metadata. For content changes, this replaces the entire body. Use update_metadata for metadata-only updates to preserve content.",
            json!({
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Knowledge file path to update"
                    },
                    "id": {
                        "type": "string",
                        "description": "Legacy: Knowledge ID (use path instead)"
                    },
                    "content": {
                        "type": "string",
                        "description": "New markdown content (replaces entire body)"
                    },
                    "metadata": {
                        "type": "object",
                        "description": "Metadata to update",
                        "properties": {
                            "title": { "type": "string" },
                            "tags": { "type": "array", "items": { "type": "string" } },
                            "summary": { "type": "string" },
                            "category": { "type": "string" }
                        }
                    },
                    "title": { "type": "string", "description": "Legacy: Update title" },
                    "tags": { "type": "array", "items": { "type": "string" }, "description": "Legacy: Update tags" },
                    "summary": { "type": "string", "description": "Legacy: Update summary" },
                    "category_id": { "type": "string", "description": "Legacy: Move to category path or opaque category id. Prefer category path when available." }
                }
            }),
        ),
        tool(
            "update_metadata",
            "Update ONLY the frontmatter metadata (title, tags, summary) without modifying content. Use this for quick metadata fixes. For content + metadata updates, use update_knowledge instead.",
            json!({
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Knowledge file path to update metadata for"
                    },
                    "id": {
                        "type": "string",
                        "description": "Legacy: Knowledge ID (use path instead)"
                    },
                    "metadata": {
                        "type": "object",
                        "description": "Metadata object to merge",
                        "properties": {
                            "title": { "type": "string", "description": "New title" },
                            "tags": { "type": "array", "items": { "type": "string" }, "description": "Replace tags array" },
                            "summary": { "type": "string", "description": "New summary (will be marked stale if content unchanged)" }
                        }
                    },
                    "title": { "type": "string", "description": "Legacy: Update title directly" },
                    "tags": { "type": "array", "items": { "type": "string" }, "description": "Legacy: Update tags directly" },
                    "summary": { "type": "string", "description": "Legacy: Update summary directly" }
                }
            }),
        ),
        tool(
            "delete_knowledge",
            "Delete a knowledge entry. IMPORTANT: This is a safety-first tool - docs-style path calls default to dry_run=true (preview mode). Set dry_run=false ONLY after user confirmation. Returns affected files that reference this knowledge.",
            json!({
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Knowledge file path to delete"
                    },
                    "id": {
                        "type": "string",
                        "description": "Legacy: Knowledge ID (use path instead)"
                    },
                    "dry_run": {
                        "type": "boolean",
                        "description": "If true (default for path), returns preview without deleting. Set false to actually delete."
                    }
                }
            }),
        ),
        tool(
            "move_knowledge",
            "Move/rename a knowledge entry to a new path or category. IMPORTANT: This is a safety-first tool - docs-style from/to calls default to dry_run=true. Set dry_run=false ONLY after user confirmation. Updates all wiki links referencing the old path.",
            json!({
                "type": "object",
                "properties": {
                    "from": {
                        "type": "string",
                        "description": "Source path (docs-style)"
                    },
                    "to": {
                        "type": "string",
                        "description": "Destination path (docs-style)"
                    },
                    "path": {
                        "type": "string",
                        "description": "Legacy: Source path (use from instead)"
                    },
                    "id": {
                        "type": "string",
                        "description": "Legacy: Source ID (use from instead)"
                    },
                    "new_category_id": {
                        "type": "string",
                        "description": "Legacy: Move to this category ID"
                    },
                    "dry_run": {
                        "type": "boolean",
                        "description": "If true (default), preview the move without executing. Set false to actually move."
                    }
                }
            }),
        ),
        tool(
            "create_category",
            "Create a new category (folder) in the knowledge base. Supports docs-style path/label input (recommended) or legacy name/parent_id input.",
            json!({
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Category path relative to KB root, e.g., '技术/编程语言'. Creates nested folders if needed."
                    },
                    "label": {
                        "type": "string",
                        "description": "Human-readable display name, e.g., 'Programming Languages'. Defaults to last path segment if omitted."
                    },
                    "name": {
                        "type": "string",
                        "description": "Legacy: Category name (use path/label instead)"
                    },
                    "parent_id": {
                        "type": "string",
                        "description": "Legacy: Parent category ID"
                    },
                    "description": {
                        "type": "string",
                        "description": "Category description for display"
                    }
                }
            }),
        ),
        tool(
            "list_categories",
            "List all registered categories with their paths, labels, and descriptions. Use the returned 'path' field when creating or moving knowledge; 'id' is an opaque legacy identifier.",
            json!({
                "type": "object",
                "properties": {},
                "description": "Returns all categories from .memoforge/config.yaml"
            }),
        ),
        tool(
            "update_category",
            "Update category display label or description. Does not affect the folder structure or knowledge content.",
            json!({
                "type": "object",
                "properties": {
                    "id": {
                        "type": "string",
                        "description": "Category ID to update"
                    },
                    "path": {
                        "type": "string",
                        "description": "Category path (alternative to ID)"
                    },
                    "label": {
                        "type": "string",
                        "description": "New display label/name"
                    },
                    "name": {
                        "type": "string",
                        "description": "Legacy: New name (use label instead)"
                    },
                    "description": {
                        "type": "string",
                        "description": "New category description"
                    }
                }
            }),
        ),
        tool(
            "delete_category",
            "Delete a category registration from config. WARNING: Does NOT delete knowledge files in the category. Use force=true to delete category even if it contains knowledge entries.",
            json!({
                "type": "object",
                "properties": {
                    "id": {
                        "type": "string",
                        "description": "Category ID to delete"
                    },
                    "path": {
                        "type": "string",
                        "description": "Category path (alternative to ID)"
                    },
                    "force": {
                        "type": "boolean",
                        "description": "Force deletion even if category contains knowledge entries (default: false)"
                    }
                }
            }),
        ),
        tool(
            "git_status",
            "Get the current Git working tree status for the knowledge base. Returns staged, unstaged, and untracked files. Use this to review changes before committing.",
            json!({
                "type": "object",
                "properties": {},
                "description": "Returns file status from git status command"
            }),
        ),
        tool(
            "git_commit",
            "Stage all changes and commit to the knowledge base repository. A meaningful commit message is recommended but optional (auto-generated if omitted).",
            json!({
                "type": "object",
                "properties": {
                    "message": {
                        "type": "string",
                        "description": "Commit message. Describe what changed and why. Auto-generated if omitted."
                    }
                }
            }),
        ),
        tool(
            "git_pull",
            "Pull (fetch + merge) remote changes from the configured Git remote into the local repository. Handles merge conflicts if any.",
            json!({
                "type": "object",
                "properties": {},
                "description": "Requires remote to be configured. Safe operation - won't overwrite local changes."
            }),
        ),
        tool(
            "git_push",
            "Push local commits to the configured Git remote. IMPORTANT: Safety-first - defaults to dry_run=true (preview mode). Set dry_run=false ONLY after user confirms they want to push.",
            json!({
                "type": "object",
                "properties": {
                    "dry_run": {
                        "type": "boolean",
                        "description": "If true (default), preview what would be pushed without actually pushing. Set false to execute push."
                    }
                }
            }),
        ),
        tool(
            "git_log",
            "Get recent Git commit history for the repository. Use this to understand recent changes and find specific commits.",
            json!({
                "type": "object",
                "properties": {
                    "limit": {
                        "type": "integer",
                        "description": "Number of commits to return (default: 10, max: 100)"
                    }
                }
            }),
        ),
        tool(
            "read_knowledge",
            "Unified read interface optimized for AI agents. Returns metadata, content, section list, and staleness info in one call. Recommended workflow: 1) Use list_knowledge to discover entries, 2) Use read_knowledge with level=L1 to see summaries, 3) Use read_knowledge with section parameter to read specific sections progressively. More efficient than separate get_content/get_summary calls.",
            json!({
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Knowledge file path relative to KB root"
                    },
                    "level": {
                        "type": "string",
                        "enum": ["L0", "L1", "L2"],
                        "description": "Detail level: L0=metadata only, L1=metadata+summary (default), L2=full content"
                    },
                    "section": {
                        "type": "string",
                        "description": "Optional: read only this section by exact heading title"
                    },
                    "include_metadata": {
                        "type": "boolean",
                        "description": "Include full frontmatter metadata (default: true)"
                    },
                    "include_stale": {
                        "type": "boolean",
                        "description": "Include summary staleness check (default: true)"
                    }
                },
                "required": ["path"]
            }),
        ),
        tool(
            "start_draft",
            "Start a draft for staged editing. Agents should prefer the draft workflow over direct create/update for writing long content. Drafts support incremental section operations (append, replace, remove), diff preview, and safe commit with conflict detection. The user can review the preview before committing. Workflow: start_draft -> update_draft (multiple) -> preview_draft -> commit_draft.",
            json!({
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Target knowledge path. For existing knowledge: provide the path. For new knowledge: omit path (or set to null)."
                    },
                    "metadata": {
                        "type": "object",
                        "description": "Initial metadata for new knowledge (ignored for existing knowledge)",
                        "properties": {
                            "title": { "type": "string", "description": "Title for new knowledge" },
                            "tags": { "type": "array", "items": { "type": "string" }, "description": "Tags" },
                            "summary": { "type": "string", "description": "Summary" },
                            "category": { "type": "string", "description": "Category path" }
                        }
                    }
                }
            }),
        ),
        tool(
            "update_draft",
            "Apply a structured operation to a draft. Can be called multiple times to build content incrementally. Each call appends the operation to the draft's history. Use preview_draft to review changes before committing.",
            json!({
                "type": "object",
                "properties": {
                    "draft_id": {
                        "type": "string",
                        "description": "Draft ID returned by start_draft"
                    },
                    "op": {
                        "type": "string",
                        "enum": ["set_content", "append_section", "replace_section", "remove_section", "update_metadata"],
                        "description": "Operation type: set_content (replace entire body), append_section (add new ## section), replace_section (replace section body by heading), remove_section (delete section by heading), update_metadata (patch title/tags/summary)"
                    },
                    "heading": {
                        "type": "string",
                        "description": "Section heading text (required for append_section, replace_section, remove_section)"
                    },
                    "level": {
                        "type": "integer",
                        "description": "Heading level for append_section (default: 2, i.e. ##)"
                    },
                    "content": {
                        "type": "string",
                        "description": "Content for set_content, append_section body, or replace_section body"
                    },
                    "metadata": {
                        "type": "object",
                        "description": "Metadata patch for update_metadata op",
                        "properties": {
                            "title": { "type": "string" },
                            "tags": { "type": "array", "items": { "type": "string" } },
                            "summary": { "type": "string" }
                        }
                    }
                },
                "required": ["draft_id", "op"]
            }),
        ),
        tool(
            "preview_draft",
            "Preview what a draft commit would change. Returns diff summary (sections changed, lines added/removed), whether summary will become stale, and warnings (e.g. conflict detected). Always call this before commit_draft to show the user what will change.",
            json!({
                "type": "object",
                "properties": {
                    "draft_id": {
                        "type": "string",
                        "description": "Draft ID to preview"
                    }
                },
                "required": ["draft_id"]
            }),
        ),
        tool(
            "commit_draft",
            "Commit a draft to the knowledge base. Performs conflict detection: if the source file was modified since the draft was created, returns a conflict error with recovery instructions. The draft is preserved on conflict - use read_knowledge to see current content, then start a new draft if needed. On success, the draft is deleted.",
            json!({
                "type": "object",
                "properties": {
                    "draft_id": {
                        "type": "string",
                        "description": "Draft ID to commit"
                    }
                },
                "required": ["draft_id"]
            }),
        ),
        tool(
            "discard_draft",
            "Discard a draft without applying any changes. The knowledge file is not modified. Use this to cancel a draft that is no longer needed or after a conflict when you want to start fresh.",
            json!({
                "type": "object",
                "properties": {
                    "draft_id": {
                        "type": "string",
                        "description": "Draft ID to discard"
                    }
                },
                "required": ["draft_id"]
            }),
        ),
        // Sprint 1: Inbox tools
        tool(
            "list_inbox_items",
            "List inbox items (knowledge candidates) with optional filtering. Returns all pending items awaiting review or promotion. Use this to see what AI agents have generated or what has been imported.",
            json!({
                "type": "object",
                "properties": {
                    "status": {
                        "type": "string",
                        "enum": ["new", "triaged", "drafted", "promoted", "ignored"],
                        "description": "Filter by inbox item status (optional)"
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Max results to return (optional)"
                    }
                }
            }),
        ),
        tool(
            "create_inbox_item",
            "Create a new inbox item (knowledge candidate). Inbox items flow through a triage process before becoming knowledge entries. Use this when an agent generates content that needs review.",
            json!({
                "type": "object",
                "properties": {
                    "title": {
                        "type": "string",
                        "description": "Candidate title for the knowledge entry"
                    },
                    "source_type": {
                        "type": "string",
                        "enum": ["agent", "import", "paste", "manual", "reliability"],
                        "description": "Source type of this inbox item"
                    },
                    "content_markdown": {
                        "type": "string",
                        "description": "Full candidate content in markdown format (optional)"
                    },
                    "proposed_path": {
                        "type": "string",
                        "description": "Suggested path for where this should be stored (optional)"
                    },
                    "linked_session_id": {
                        "type": "string",
                        "description": "ID of the session that created this item (optional)"
                    }
                },
                "required": ["title", "source_type"]
            }),
        ),
        tool(
            "promote_inbox_item_to_draft",
            "Promote an inbox item to a draft, transitioning it from candidate to editable state. Creates a Draft, updates inbox status to 'drafted', and writes review metadata to the draft. The draft can then be previewed and committed.",
            json!({
                "type": "object",
                "properties": {
                    "inbox_item_id": {
                        "type": "string",
                        "description": "ID of the inbox item to promote"
                    },
                    "draft_title": {
                        "type": "string",
                        "description": "Optional title override for the draft (defaults to inbox item title)"
                    }
                },
                "required": ["inbox_item_id"]
            }),
        ),
        tool(
            "dismiss_inbox_item",
            "Dismiss an inbox item by marking it as ignored. Ignored items are kept but excluded from normal triage flow. Can be restored later.",
            json!({
                "type": "object",
                "properties": {
                    "inbox_item_id": {
                        "type": "string",
                        "description": "ID of the inbox item to dismiss"
                    },
                    "reason": {
                        "type": "string",
                        "description": "Optional reason for dismissal (for audit trail)"
                    }
                },
                "required": ["inbox_item_id"]
            }),
        ),
        // Sprint 1: Session tools
        tool(
            "start_agent_session",
            "Start a new agent session to track AI interaction and context consumption. Sessions generate inbox items and drafts. Call this when beginning a multi-step AI task.",
            json!({
                "type": "object",
                "properties": {
                    "agent_name": {
                        "type": "string",
                        "description": "Name of the agent (e.g., 'claude-code', 'opencode')"
                    },
                    "goal": {
                        "type": "string",
                        "description": "Goal/objective of this session"
                    },
                    "agent_source": {
                        "type": "string",
                        "description": "Agent source system (optional)"
                    },
                    "context_pack_ids": {
                        "type": "array",
                        "items": { "type": "string" },
                        "description": "IDs of context packs referenced (optional, Sprint 4: validated)"
                    }
                },
                "required": ["agent_name", "goal"]
            }),
        ),
        tool(
            "append_agent_session_context",
            "Append a single context item to an agent session. Only allowed when session is in 'running' state. Use this to track what knowledge or resources the agent consumed.",
            json!({
                "type": "object",
                "properties": {
                    "session_id": {
                        "type": "string",
                        "description": "ID of the session to append context to"
                    },
                    "context_item": {
                        "type": "object",
                        "description": "Context item to append",
                        "properties": {
                            "ref_type": {
                                "type": "string",
                                "enum": ["knowledge", "pack", "url", "file"],
                                "description": "Type of the referenced object"
                            },
                            "ref_id": {
                                "type": "string",
                                "description": "Stable reference (path, pack_id, url, or file path)"
                            },
                            "summary": {
                                "type": "string",
                                "description": "Optional summary of the context"
                            }
                        },
                        "required": ["ref_type", "ref_id"]
                    }
                },
                "required": ["session_id", "context_item"]
            }),
        ),
        tool(
            "list_agent_sessions",
            "List agent sessions with optional filtering. Returns session metadata including status, goal, and timing. Use this to see active or completed agent work.",
            json!({
                "type": "object",
                "properties": {
                    "status": {
                        "type": "string",
                        "enum": ["running", "completed", "failed", "cancelled"],
                        "description": "Filter by session status (optional)"
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Max results to return (optional)"
                    }
                }
            }),
        ),
        tool(
            "get_agent_session",
            "Get full details of an agent session including all context items, draft IDs, and inbox item IDs produced.",
            json!({
                "type": "object",
                "properties": {
                    "session_id": {
                        "type": "string",
                        "description": "ID of the session to retrieve"
                    }
                },
                "required": ["session_id"]
            }),
        ),
        tool(
            "complete_agent_session",
            "Complete an agent session, transitioning it from 'running' to a terminal state. Sets finished_at timestamp and optional result summary.",
            json!({
                "type": "object",
                "properties": {
                    "session_id": {
                        "type": "string",
                        "description": "ID of the session to complete"
                    },
                    "result_summary": {
                        "type": "string",
                        "description": "Optional summary of the session result"
                    },
                    "status": {
                        "type": "string",
                        "enum": ["completed", "failed", "cancelled"],
                        "description": "Terminal status to transition to (default: 'completed')"
                    }
                },
                "required": ["session_id"]
            }),
        ),
        // Sprint 2: Reliability tools
        tool(
            "list_reliability_issues",
            "List reliability issues with optional filtering by severity, status, and limit. Returns issues sorted by severity (High > Medium > Low) and detection time. Use this to see all detected reliability problems in the knowledge base.",
            json!({
                "type": "object",
                "properties": {
                    "severity": {
                        "type": "string",
                        "enum": ["high", "medium", "low"],
                        "description": "Filter by severity level"
                    },
                    "status": {
                        "type": "string",
                        "enum": ["open", "ignored", "resolved"],
                        "description": "Filter by issue status"
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Max results to return (optional)"
                    }
                },
                "description": "Returns filtered reliability issues with statistics"
            }),
        ),
        tool(
            "get_reliability_issue_detail",
            "Get full details of a specific reliability issue by ID. Returns complete issue information including linked draft ID and timestamps.",
            json!({
                "type": "object",
                "properties": {
                    "issue_id": {
                        "type": "string",
                        "description": "Reliability issue ID"
                    }
                },
                "required": ["issue_id"],
                "description": "Returns complete issue details"
            }),
        ),
        tool(
            "create_fix_draft_from_issue",
            "Create a draft for fixing a reliability issue. Creates a draft targeting the affected knowledge file, links the draft to the issue, and returns the draft ID for editing. Use this workflow: 1) get_reliability_issue_detail to understand the issue, 2) create_fix_draft_from_issue to start a draft, 3) update_draft to make changes, 4) preview_draft and commit_draft to apply the fix.",
            json!({
                "type": "object",
                "properties": {
                    "issue_id": {
                        "type": "string",
                        "description": "Reliability issue ID to fix"
                    },
                    "fix_instructions": {
                        "type": "string",
                        "description": "Optional fix instructions or notes to include in draft metadata"
                    }
                },
                "required": ["issue_id"],
                "description": "Creates a draft linked to the issue and returns draft ID and updated issue"
            }),
        ),
        // Sprint 4: Context Pack tools
        tool(
            "list_context_packs",
            "List all context packs with optional filtering by scope type. Returns full pack details including item paths. Use this to discover available context packs for AI agent sessions.",
            json!({
                "type": "object",
                "properties": {
                    "scope_type": {
                        "type": "string",
                        "enum": ["tag", "folder", "topic", "manual"],
                        "description": "Filter by scope type (optional)"
                    }
                },
                "description": "Returns filtered context packs with full details"
            }),
        ),
        tool(
            "create_context_pack",
            "Create a new context pack. Context packs group knowledge items by scope (tag, folder, topic, or manual). They can be referenced in agent sessions to provide targeted context.",
            json!({
                "type": "object",
                "properties": {
                    "name": {
                        "type": "string",
                        "description": "Context pack name"
                    },
                    "scope_type": {
                        "type": "string",
                        "enum": ["tag", "folder", "topic", "manual"],
                        "description": "Scope type for the pack"
                    },
                    "scope_value": {
                        "type": "string",
                        "description": "Scope value (e.g., tag name, folder path, topic name, or empty for manual)"
                    },
                    "item_paths": {
                        "type": "array",
                        "items": { "type": "string" },
                        "description": "Knowledge paths to include in the pack"
                    },
                    "summary": {
                        "type": "string",
                        "description": "Optional summary describing the pack"
                    }
                },
                "required": ["name", "scope_type", "scope_value", "item_paths"],
                "description": "Creates a new context pack and returns the created pack"
            }),
        ),
        tool(
            "get_context_pack",
            "Get a context pack by ID with full details including all item paths. Use this to view pack contents before referencing in a session.",
            json!({
                "type": "object",
                "properties": {
                    "pack_id": {
                        "type": "string",
                        "description": "Context pack ID"
                    }
                },
                "required": ["pack_id"],
                "description": "Returns complete context pack details"
            }),
        ),
        tool(
            "export_context_pack",
            "Export a context pack in the specified format. For Sprint 4, only JSON export is supported. Future versions may support ZIP export.",
            json!({
                "type": "object",
                "properties": {
                    "pack_id": {
                        "type": "string",
                        "description": "Context pack ID to export"
                    },
                    "format": {
                        "type": "string",
                        "enum": ["json"],
                        "description": "Export format (default: json)"
                    }
                },
                "required": ["pack_id"],
                "description": "Returns exported pack data and format"
            }),
        ),
        // Sprint 2: Workflow template tools
        tool(
            "list_workflow_templates",
            "List available workflow templates. Returns built-in templates and any custom templates. Use enabled_only=true to filter out disabled templates.",
            json!({
                "type": "object",
                "properties": {
                    "enabled_only": {
                        "type": "boolean",
                        "description": "If true, only return enabled templates (default: false)"
                    }
                },
                "description": "Returns list of workflow templates with template_id, name, goal, and enabled status"
            }),
        ),
        tool(
            "start_workflow_run",
            "Start a workflow run from a template. Creates an agent session and optionally a draft based on the template configuration. Returns run_id and associated resource IDs.",
            json!({
                "type": "object",
                "properties": {
                    "template_id": {
                        "type": "string",
                        "description": "ID of the workflow template to run"
                    },
                    "goal_override": {
                        "type": "string",
                        "description": "Optional: Override the template's default goal"
                    },
                    "context_refs": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "ref_type": {
                                    "type": "string",
                                    "enum": ["knowledge", "pack", "url", "file"],
                                    "description": "Context reference type"
                                },
                                "ref_id": {
                                    "type": "string",
                                    "description": "Path / pack_id / URL reference"
                                },
                                "required": {
                                    "type": "boolean",
                                    "description": "Whether this context is mandatory"
                                },
                                "reason": {
                                    "type": "string",
                                    "description": "Recommended reason"
                                }
                            },
                            "required": ["ref_type", "ref_id", "required"]
                        },
                        "description": "Optional: Override default context references for this run"
                    },
                    "suggested_output_target": {
                        "type": "string",
                        "description": "Optional: Override the template's suggested output target (category path or file path)"
                    }
                },
                "required": ["template_id"],
                "description": "Returns run_id, session_id, draft_id (if created), and inbox_item_ids"
            }),
        ),
        // Sprint 3: Unified Review Queue tools
        tool(
            "list_review_items",
            "List items in the unified review queue. Review items are projected from drafts that have review context metadata. By default only returns active (non-terminal) items: pending, in_review, returned. Set include_terminal=true to also see approved/discarded items. Returns items sorted by creation time (newest first). Use this to see what content awaits human review.",
            json!({
                "type": "object",
                "properties": {
                    "status": {
                        "type": "string",
                        "enum": ["pending", "in_review", "approved", "returned", "discarded"],
                        "description": "Filter by review status. Overrides the default non-terminal filter."
                    },
                    "source_type": {
                        "type": "string",
                        "enum": ["agent_draft", "inbox_promotion", "reliability_fix", "import_cleanup"],
                        "description": "Filter by source type (optional)"
                    },
                    "include_terminal": {
                        "type": "boolean",
                        "description": "Include terminal states (approved, discarded). Default: false."
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Max results to return (optional, default: all)"
                    }
                },
                "description": "Returns filtered review items with review_item_id, draft_id, title, source_type, status, and risk_flags"
            }),
        ),
        tool(
            "get_review_item",
            "Get full details of a single review item by ID. Returns source type, source reference, status, risk flags, and decision metadata if available.",
            json!({
                "type": "object",
                "properties": {
                    "review_item_id": {
                        "type": "string",
                        "description": "Review item ID (format: ri_{draft_id})"
                    }
                },
                "required": ["review_item_id"],
                "description": "Returns complete review item details"
            }),
        ),
        tool(
            "apply_review_decision",
            "Apply a review decision to an item in the review queue. 'approve' commits the underlying draft to the knowledge base. 'discard' removes the draft. 'return' sends the item back for revision. 'reopen' re-queues a returned item. State transitions follow the frozen state machine: pending/in_review -> approved/returned/discarded, returned -> pending.",
            json!({
                "type": "object",
                "properties": {
                    "review_item_id": {
                        "type": "string",
                        "description": "Review item ID to decide on (format: ri_{draft_id})"
                    },
                    "decision": {
                        "type": "string",
                        "enum": ["approve", "return", "discard", "reopen"],
                        "description": "Decision to apply: approve (commit draft), return (send back for revision), discard (remove draft), reopen (re-queue returned item)"
                    },
                    "notes": {
                        "type": "string",
                        "description": "Optional notes explaining the decision (for audit trail)"
                    }
                },
                "required": ["review_item_id", "decision"],
                "description": "Returns updated review item with new status"
            }),
        ),
        tool(
            "start_review",
            "Start a review on a pending review item, transitioning it from 'pending' to 'in_review'. Only items in 'pending' status can be started. Use this to signal that a reviewer is actively looking at the item.",
            json!({
                "type": "object",
                "properties": {
                    "review_item_id": {
                        "type": "string",
                        "description": "Review item ID to start reviewing (format: ri_{draft_id})"
                    },
                    "reviewer": {
                        "type": "string",
                        "description": "Optional: Name or ID of the reviewer starting the review"
                    }
                },
                "required": ["review_item_id"],
                "description": "Returns updated review item with 'in_review' status"
            }),
        ),
        // Sprint 4: Governance tools
        tool(
            "get_knowledge_governance",
            "Get governance metadata (evidence and freshness) for a knowledge entry. Returns evidence metadata, freshness policy, and the effective SLA days computed from the inheritance chain: knowledge > category > global config > 90 days default.",
            json!({
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Docs-style path to the knowledge entry, e.g., 'tech/rust-async.md'"
                    }
                },
                "required": ["path"],
                "description": "Returns evidence, freshness, and effective_sla_days"
            }),
        ),
        tool(
            "update_knowledge_governance",
            "Update governance metadata (evidence and/or freshness) for a knowledge entry. Accepts partial updates — only provided fields will be overwritten. Use this to set ownership, link evidence, or configure review cycles.",
            json!({
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Docs-style path to the knowledge entry, e.g., 'tech/rust-async.md'"
                    },
                    "evidence": {
                        "type": "object",
                        "description": "Evidence metadata to set. All fields are optional. Provided fields overwrite existing values.",
                        "properties": {
                            "owner": { "type": "string", "description": "Responsible person" },
                            "source_url": { "type": "string", "description": "Source URL" },
                            "linked_issue_ids": { "type": "array", "items": { "type": "string" }, "description": "Linked issue IDs" },
                            "linked_pr_ids": { "type": "array", "items": { "type": "string" }, "description": "Linked PR IDs" },
                            "linked_commit_shas": { "type": "array", "items": { "type": "string" }, "description": "Linked commit SHAs" },
                            "command_output_refs": { "type": "array", "items": { "type": "string" }, "description": "Command output references" },
                            "verified_at": { "type": "string", "description": "Last verification time (ISO 8601)" },
                            "verified_by": { "type": "string", "description": "Verifier" },
                            "valid_for_version": { "type": "string", "description": "Applicable version" }
                        }
                    },
                    "freshness": {
                        "type": "object",
                        "description": "Freshness policy to set. All fields are optional. Provided fields overwrite existing values.",
                        "properties": {
                            "sla_days": { "type": "integer", "description": "Review cycle in days" },
                            "last_verified_at": { "type": "string", "description": "Last verification time (ISO 8601)" },
                            "next_review_at": { "type": "string", "description": "Next review time (ISO 8601)" },
                            "review_owner": { "type": "string", "description": "Review responsible person" },
                            "review_status": { "type": "string", "enum": ["ok", "due", "overdue", "unknown"], "description": "Current review status" }
                        }
                    }
                },
                "required": ["path"],
                "description": "Returns updated evidence and freshness metadata"
            }),
        ),
    ];

    // Filter by current profile
    let profile = PROFILE.lock().unwrap().clone();
    all_tools
        .into_iter()
        .filter(|t| {
            let name = t.get("name").and_then(|n| n.as_str()).unwrap_or("");
            is_tool_visible(name, &profile)
        })
        .collect()
}

pub fn call_tool(params: Option<Value>, readonly: bool) -> Result<String, MemoError> {
    let params = params.ok_or_else(|| MemoError {
        code: ErrorCode::InvalidPath,
        message: "Missing params".to_string(),
        retry_after_ms: None,
        context: None,
    })?;

    let name = params["name"].as_str().ok_or_else(|| MemoError {
        code: ErrorCode::InvalidPath,
        message: "Missing tool name".to_string(),
        retry_after_ms: None,
        context: None,
    })?;

    // Profile gate: reject tools not visible under current profile
    {
        let profile = PROFILE.lock().unwrap().clone();
        if !is_tool_visible(name, &profile) {
            return Err(MemoError {
                code: ErrorCode::PermissionProfileDenied,
                message: format!(
                    "Tool '{}' not found or not available in current profile ({})",
                    name,
                    profile.as_str()
                ),
                retry_after_ms: None,
                context: None,
            });
        }
    }

    let arguments = params.get("arguments").cloned().unwrap_or(json!({}));

    match name {
        "get_editor_state" => handle_get_editor_state(arguments),
        "get_status" => handle_get_status(arguments, readonly),
        "get_config" => handle_get_config(arguments),
        "list_knowledge" => handle_list_knowledge(arguments),
        "get_knowledge" => handle_get_knowledge(arguments),
        "get_summary" => handle_get_summary(arguments),
        "get_content" => handle_get_content(arguments),
        "get_knowledge_with_stale" => handle_get_knowledge_with_stale(arguments),
        "grep" | "search_knowledge" => handle_grep(arguments),
        "get_tags" => handle_get_tags(arguments),
        "get_backlinks" => handle_get_backlinks(arguments),
        "get_related" => handle_get_related(arguments),
        "get_knowledge_graph" => handle_get_knowledge_graph(arguments),
        "create_knowledge" => check_readonly(readonly, || handle_create_knowledge(arguments)),
        "update_knowledge" => check_readonly(readonly, || handle_update_knowledge(arguments)),
        "update_metadata" => check_readonly(readonly, || handle_update_metadata(arguments)),
        "delete_knowledge" => check_readonly(readonly, || handle_delete_knowledge(arguments)),
        "move_knowledge" => check_readonly(readonly, || handle_move_knowledge(arguments)),
        "create_category" => check_readonly(readonly, || handle_create_category(arguments)),
        "list_categories" => handle_list_categories(arguments),
        "update_category" => check_readonly(readonly, || handle_update_category(arguments)),
        "delete_category" => check_readonly(readonly, || handle_delete_category(arguments)),
        "git_status" => handle_git_status(arguments),
        "git_commit" => check_readonly(readonly, || handle_git_commit(arguments)),
        "git_pull" => check_readonly(readonly, || handle_git_pull(arguments)),
        "git_push" => check_readonly(readonly, || handle_git_push(arguments)),
        "git_log" => handle_git_log(arguments),
        "read_knowledge" => handle_read_knowledge(arguments),
        "start_draft" => check_readonly(readonly, || handle_start_draft(arguments)),
        "update_draft" => check_readonly(readonly, || handle_update_draft(arguments)),
        "preview_draft" => handle_preview_draft(arguments),
        "commit_draft" => check_readonly(readonly, || handle_commit_draft(arguments)),
        "discard_draft" => check_readonly(readonly, || handle_discard_draft(arguments)),
        // Sprint 1: Inbox tools
        "list_inbox_items" => handle_list_inbox_items(arguments),
        "create_inbox_item" => check_readonly(readonly, || handle_create_inbox_item(arguments)),
        "promote_inbox_item_to_draft" => {
            check_readonly(readonly, || handle_promote_inbox_item_to_draft(arguments))
        }
        "dismiss_inbox_item" => check_readonly(readonly, || handle_dismiss_inbox_item(arguments)),
        // Sprint 1: Session tools
        "start_agent_session" => check_readonly(readonly, || handle_start_agent_session(arguments)),
        "append_agent_session_context" => {
            check_readonly(readonly, || handle_append_agent_session_context(arguments))
        }
        "list_agent_sessions" => handle_list_agent_sessions(arguments),
        "get_agent_session" => handle_get_agent_session(arguments),
        "complete_agent_session" => {
            check_readonly(readonly, || handle_complete_agent_session(arguments))
        }
        // Sprint 2: Reliability tools
        "list_reliability_issues" => handle_list_reliability_issues(arguments),
        "get_reliability_issue_detail" => handle_get_reliability_issue_detail(arguments),
        "create_fix_draft_from_issue" => {
            check_readonly(readonly, || handle_create_fix_draft_from_issue(arguments))
        }
        // Sprint 4: Context Pack tools
        "list_context_packs" => handle_list_context_packs(arguments),
        "create_context_pack" => check_readonly(readonly, || handle_create_context_pack(arguments)),
        "get_context_pack" => handle_get_context_pack(arguments),
        "export_context_pack" => handle_export_context_pack(arguments),
        // Sprint 2: Workflow template tools
        "list_workflow_templates" => handle_list_workflow_templates(arguments),
        "start_workflow_run" => {
            check_readonly(readonly, || handle_start_workflow_run(arguments))
        }
        // Sprint 3: Unified Review Queue tools
        "list_review_items" => handle_list_review_items(arguments),
        "get_review_item" => handle_get_review_item(arguments),
        "apply_review_decision" => {
            check_readonly(readonly, || handle_apply_review_decision(arguments))
        }
        "start_review" => {
            check_readonly(readonly, || handle_start_review(arguments))
        }
        // Sprint 4: Governance tools
        "get_knowledge_governance" => handle_get_knowledge_governance(arguments),
        "update_knowledge_governance" => {
            check_readonly(readonly, || handle_update_knowledge_governance(arguments))
        }
        _ => Err(MemoError {
            code: ErrorCode::InvalidPath,
            message: format!("Unknown tool: {}", name),
            retry_after_ms: None,
            context: None,
        }),
    }
}

fn check_readonly<F>(readonly: bool, f: F) -> Result<String, MemoError>
where
    F: FnOnce() -> Result<String, MemoError>,
{
    if readonly {
        Err(MemoError {
            code: ErrorCode::PermissionReadonly,
            message: "Write operations not allowed in readonly mode".to_string(),
            retry_after_ms: None,
            context: None,
        })
    } else {
        f()
    }
}

fn missing_arg(name: &str) -> MemoError {
    MemoError {
        code: ErrorCode::InvalidPath,
        message: format!("Missing {}", name),
        retry_after_ms: None,
        context: None,
    }
}

fn invalid_arg(message: impl Into<String>) -> MemoError {
    MemoError {
        code: ErrorCode::InvalidPath,
        message: message.into(),
        retry_after_ms: None,
        context: None,
    }
}

fn io_error(prefix: &str, error: std::io::Error) -> MemoError {
    MemoError {
        code: ErrorCode::InvalidPath,
        message: format!("{}: {}", prefix, error),
        retry_after_ms: None,
        context: None,
    }
}

fn optional_str_arg<'a>(args: &'a Value, names: &[&str]) -> Option<&'a str> {
    names
        .iter()
        .find_map(|name| args.get(*name).and_then(|value| value.as_str()))
}

fn required_str_arg<'a>(args: &'a Value, names: &[&str]) -> Result<&'a str, MemoError> {
    optional_str_arg(args, names).ok_or_else(|| missing_arg(names[0]))
}

fn optional_bool_arg(args: &Value, names: &[&str]) -> Option<bool> {
    names
        .iter()
        .find_map(|name| args.get(*name).and_then(|value| value.as_bool()))
}

fn optional_usize_arg(args: &Value, names: &[&str]) -> Option<usize> {
    names.iter().find_map(|name| {
        args.get(*name)
            .and_then(|value| value.as_u64())
            .map(|value| value as usize)
    })
}

fn optional_string_array_arg(args: &Value, names: &[&str]) -> Option<Vec<String>> {
    names.iter().find_map(|name| {
        args.get(*name).and_then(|value| {
            value.as_array().map(|items| {
                items
                    .iter()
                    .filter_map(|item| item.as_str().map(String::from))
                    .collect::<Vec<_>>()
            })
        })
    })
}

fn metadata_object(args: &Value) -> Option<&Value> {
    args.get("metadata").filter(|value| value.is_object())
}

fn metadata_str_arg<'a>(args: &'a Value, key: &str) -> Option<&'a str> {
    metadata_object(args)
        .and_then(|metadata| metadata.get(key))
        .and_then(Value::as_str)
}

fn metadata_string_array_arg(args: &Value, key: &str) -> Option<Vec<String>> {
    metadata_object(args)
        .and_then(|metadata| metadata.get(key))
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(|item| item.as_str().map(String::from))
                .collect()
        })
}

fn normalize_relative_path(value: &str) -> String {
    value.trim().trim_matches('/').replace('\\', "/")
}

fn first_path_segment(path: &str) -> Option<String> {
    normalize_relative_path(path)
        .split('/')
        .find(|segment| !segment.is_empty())
        .map(String::from)
}

fn file_stem_title(path: &str) -> String {
    let stem = Path::new(path)
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("Untitled");
    stem.split(['-', '_'])
        .filter(|part| !part.is_empty())
        .map(|part| {
            let mut chars = part.chars();
            match chars.next() {
                Some(first) => format!("{}{}", first.to_uppercase(), chars.as_str()),
                None => String::new(),
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

fn extract_section_argument(args: &Value) -> Option<String> {
    match args.get("section") {
        Some(Value::String(value)) => Some(value.clone()),
        Some(Value::Number(value)) => Some(value.to_string()),
        _ => None,
    }
}

fn resolve_category_identifier(kb_path: &Path, value: &str) -> Result<String, MemoError> {
    let config = load_config(kb_path)?;
    config
        .categories
        .into_iter()
        .find(|category| category.id == value || category.path == value || category.name == value)
        .map(|category| category.id)
        .ok_or_else(|| MemoError {
            code: ErrorCode::NotFoundCategory,
            message: format!("Category not found: {}", value),
            retry_after_ms: None,
            context: None,
        })
}

fn canonicalize_category_reference(kb_path: &Path, value: &str) -> Result<String, MemoError> {
    let config = load_config(kb_path)?;
    Ok(config
        .categories
        .into_iter()
        .find(|category| category.id == value || category.path == value || category.name == value)
        .map(|category| category.path)
        .unwrap_or_else(|| value.trim().trim_matches('/').replace('\\', "/")))
}

fn create_knowledge_target_error() -> MemoError {
    MemoError {
        code: ErrorCode::InvalidArgument,
        message: "create_knowledge requires either 'path' or legacy 'title'. Recommended: use docs-style input with 'path' + 'content'; 'metadata.title' is optional.".to_string(),
        retry_after_ms: None,
        context: None,
    }
}

fn handle_get_editor_state(_args: Value) -> Result<String, MemoError> {
    use memoforge_core::editor_state::EditorState;

    let mode = get_mode();

    // 从全局状态文件加载（桌面端写入的是全局文件）
    let state_result = EditorState::load_global();

    match state_result {
        Ok(Some(state)) => {
            // 状态文件存在且加载成功，返回完整状态
            let response = json!({
                "mode": mode,
                "desktop": state.desktop,
                "current_kb": state.current_kb,
                "current_knowledge": state.current_knowledge,
                "selection": state.selection,
                "active_agents": state.active_agents,
                "state_valid": state.state_valid,
                "updated_at": state.updated_at,
                "error": state.error
            });
            Ok(response.to_string())
        }
        Ok(None) => {
            // 状态文件不存在，返回基本信息
            let response = json!({
                "mode": mode,
                "desktop": null,
                "current_kb": null,
                "current_knowledge": null,
                "selection": null,
                "active_agents": [],
                "state_valid": false,
                "updated_at": null,
                "error": "Editor state file not found. Please ensure the desktop application is running."
            });
            Ok(response.to_string())
        }
        Err(e) => {
            // 读取错误，返回错误信息
            let response = json!({
                "mode": mode,
                "desktop": null,
                "current_kb": null,
                "current_knowledge": null,
                "selection": null,
                "active_agents": [],
                "state_valid": false,
                "updated_at": null,
                "error": format!("Failed to load editor state: {}", e.message)
            });
            Ok(response.to_string())
        }
    }
}

fn handle_list_knowledge(args: Value) -> Result<String, MemoError> {
    let kb_path = get_kb_path()?;
    let level = match optional_str_arg(&args, &["level"]) {
        Some("L0") => LoadLevel::L0,
        Some("L1") => LoadLevel::L1,
        _ => LoadLevel::L0,
    };
    let category_id = optional_str_arg(&args, &["category_id", "path"])
        .map(|value| canonicalize_category_reference(&kb_path, value))
        .transpose()?;
    let tags = optional_string_array_arg(&args, &["tags"]);
    let limit = optional_usize_arg(&args, &["limit"]);
    let offset = optional_usize_arg(&args, &["offset"]);

    let knowledge = memoforge_core::list_knowledge(
        &kb_path,
        level,
        category_id.as_deref(),
        tags.as_deref(),
        limit,
        offset,
    )?;

    Ok(json!({ "knowledge": knowledge.items, "total": knowledge.total }).to_string())
}

fn handle_get_knowledge(args: Value) -> Result<String, MemoError> {
    let kb_path = get_kb_path()?;
    let id = required_str_arg(&args, &["id", "path"])?;
    let level = match optional_str_arg(&args, &["level"]) {
        Some("L0") => LoadLevel::L0,
        Some("L1") => LoadLevel::L1,
        Some("L2") => LoadLevel::L2,
        _ => LoadLevel::L2,
    };

    let knowledge = memoforge_core::get_knowledge_by_id(&kb_path, id, level)?;
    Ok(serde_json::to_string(&knowledge).unwrap())
}

fn handle_get_summary(args: Value) -> Result<String, MemoError> {
    let kb_path = get_kb_path()?;
    let id = required_str_arg(&args, &["path", "id"])?;
    let mut result = memoforge_core::get_knowledge_with_stale(&kb_path, id)?;
    result.knowledge.content = None;
    result.knowledge.summary_stale = Some(result.summary_stale);
    Ok(serde_json::to_string(&result.knowledge).unwrap())
}

fn handle_get_content(args: Value) -> Result<String, MemoError> {
    let kb_path = get_kb_path()?;
    let id = required_str_arg(&args, &["path", "id"])?;
    let full_content = memoforge_core::get_content(&kb_path, id, None)?;
    let sections = split_sections(&full_content);
    let section_titles = sections
        .iter()
        .map(|section| section.title.clone())
        .collect::<Vec<_>>();
    let section_arg = extract_section_argument(&args);
    let content = if let Some(section_value) = section_arg {
        if let Ok(section_index) = section_value.parse::<usize>() {
            sections
                .get(section_index)
                .map(|section| section.content.clone())
                .ok_or_else(|| {
                    invalid_arg(format!("Section index out of range: {}", section_index))
                })?
        } else {
            memoforge_core::get_content(&kb_path, id, Some(&section_value))?
        }
    } else {
        full_content
    };
    let mut metadata = memoforge_core::get_knowledge_with_stale(&kb_path, id)?.knowledge;
    metadata.content = None;

    Ok(json!({
        "id": id,
        "metadata": metadata,
        "content": content,
        "sections": section_titles
    })
    .to_string())
}

fn handle_get_knowledge_with_stale(args: Value) -> Result<String, MemoError> {
    let kb_path = get_kb_path()?;
    let id = required_str_arg(&args, &["path", "id"])?;
    let result = memoforge_core::get_knowledge_with_stale(&kb_path, id)?;
    Ok(serde_json::to_string(&result).unwrap())
}

fn handle_create_knowledge(args: Value) -> Result<String, MemoError> {
    let kb_path = get_kb_path()?;

    if let Some(path) = optional_str_arg(&args, &["path"]) {
        let requested_path = normalize_relative_path(path);
        if requested_path.is_empty() || !requested_path.ends_with(".md") {
            return Err(invalid_arg("path must be a relative .md file path"));
        }

        let content = required_str_arg(&args, &["content"])?;
        let title = metadata_str_arg(&args, "title")
            .or_else(|| optional_str_arg(&args, &["title"]))
            .map(String::from)
            .unwrap_or_else(|| file_stem_title(&requested_path));
        let tags = metadata_string_array_arg(&args, "tags")
            .or_else(|| optional_string_array_arg(&args, &["tags"]))
            .unwrap_or_default();
        let summary = metadata_str_arg(&args, "summary")
            .or_else(|| optional_str_arg(&args, &["summary"]))
            .map(String::from);
        let category = first_path_segment(&requested_path);

        let created_path =
            memoforge_core::create_knowledge(&kb_path, &title, content, tags, category, summary)?;
        let created_abs = kb_path.join(&created_path);
        let requested_abs = kb_path.join(&requested_path);

        if created_abs != requested_abs {
            if requested_abs.exists() {
                return Err(invalid_arg(format!(
                    "Knowledge already exists at target path: {}",
                    requested_path
                )));
            }
            if let Some(parent) = requested_abs.parent() {
                fs::create_dir_all(parent)
                    .map_err(|error| io_error("Failed to create target directory", error))?;
            }
            fs::rename(&created_abs, &requested_abs)
                .map_err(|error| io_error("Failed to place knowledge at requested path", error))?;
        }

        return Ok(json!({
            "created": true,
            "path": requested_path,
            "id": title
        })
        .to_string());
    }

    let title = optional_str_arg(&args, &["title"]).ok_or_else(create_knowledge_target_error)?;
    let content = required_str_arg(&args, &["content"])?;
    let tags = optional_string_array_arg(&args, &["tags"]).unwrap_or_default();
    let category = optional_str_arg(&args, &["category_id"])
        .map(|value| canonicalize_category_reference(&kb_path, value))
        .transpose()?;
    let summary = optional_str_arg(&args, &["summary"]).map(String::from);

    let path = memoforge_core::create_knowledge(&kb_path, title, content, tags, category, summary)?;
    Ok(json!({ "created": true, "path": path }).to_string())
}

fn handle_update_knowledge(args: Value) -> Result<String, MemoError> {
    let kb_path = get_kb_path()?;
    let id = required_str_arg(&args, &["path", "id"])?;
    let title = metadata_str_arg(&args, "title").or_else(|| optional_str_arg(&args, &["title"]));
    let content = optional_str_arg(&args, &["content"]);
    let tags = metadata_string_array_arg(&args, "tags")
        .or_else(|| optional_string_array_arg(&args, &["tags"]));
    let category = metadata_str_arg(&args, "category")
        .or_else(|| optional_str_arg(&args, &["category", "category_id"]))
        .map(|value| canonicalize_category_reference(&kb_path, value))
        .transpose()?;
    let summary =
        metadata_str_arg(&args, "summary").or_else(|| optional_str_arg(&args, &["summary"]));

    memoforge_core::update_knowledge(
        &kb_path,
        id,
        title,
        content,
        tags,
        category.as_deref(),
        summary,
    )?;
    Ok(json!({ "updated": true, "path": id }).to_string())
}

fn handle_update_metadata(args: Value) -> Result<String, MemoError> {
    let kb_path = get_kb_path()?;
    let id = required_str_arg(&args, &["path", "id"])?;
    let title = metadata_str_arg(&args, "title").or_else(|| optional_str_arg(&args, &["title"]));
    let tags = metadata_string_array_arg(&args, "tags")
        .or_else(|| optional_string_array_arg(&args, &["tags"]));
    let summary =
        metadata_str_arg(&args, "summary").or_else(|| optional_str_arg(&args, &["summary"]));

    memoforge_core::update_metadata(&kb_path, id, title, tags, summary)?;
    let stale = memoforge_core::get_knowledge_with_stale(&kb_path, id)?.summary_stale;
    Ok(json!({ "updated": true, "path": id, "summary_stale": stale }).to_string())
}

fn handle_delete_knowledge(args: Value) -> Result<String, MemoError> {
    let kb_path = get_kb_path()?;
    let id = required_str_arg(&args, &["path", "id"])?;
    let dry_run = optional_bool_arg(&args, &["dry_run"]).unwrap_or(true);

    if dry_run {
        let preview = memoforge_core::preview_delete_knowledge(&kb_path, id)?;
        return Ok(json!({
            "dry_run": true,
            "path": preview.path,
            "title": preview.title,
            "affected_files": preview.references
        })
        .to_string());
    }

    memoforge_core::delete_knowledge(&kb_path, id)?;
    Ok(json!({ "deleted": true, "path": id }).to_string())
}

fn handle_move_knowledge(args: Value) -> Result<String, MemoError> {
    let kb_path = get_kb_path()?;
    let source = required_str_arg(&args, &["from", "path", "id"])?;
    let move_target = optional_str_arg(&args, &["to"]);
    let dry_run = optional_bool_arg(&args, &["dry_run"]).unwrap_or(true);

    let display_target = if let Some(target) = move_target {
        let normalized_target = normalize_relative_path(target);
        if dry_run {
            let preview = memoforge_core::preview_move_knowledge_to_path(
                &kb_path,
                source,
                &normalized_target,
            )?;
            return Ok(json!({
                "dry_run": true,
                "from": preview.old_path,
                "to": preview.new_path,
                "title": preview.title,
                "affected_files": preview.references
            })
            .to_string());
        }

        memoforge_core::move_knowledge_to_path(&kb_path, source, &normalized_target)?;
        normalized_target
    } else {
        let category = canonicalize_category_reference(
            &kb_path,
            required_str_arg(&args, &["new_category_id"])?,
        )?;
        if dry_run {
            let preview = memoforge_core::preview_move_knowledge(&kb_path, source, &category)?;
            return Ok(json!({
                "dry_run": true,
                "from": preview.old_path,
                "to": preview.new_path,
                "title": preview.title,
                "affected_files": preview.references
            })
            .to_string());
        }

        let preview = memoforge_core::preview_move_knowledge(&kb_path, source, &category)?;
        memoforge_core::move_knowledge(&kb_path, source, &category)?;
        preview.new_path
    };

    Ok(json!({
        "moved": true,
        "from": source,
        "to": display_target
    })
    .to_string())
}

fn handle_grep(args: Value) -> Result<String, MemoError> {
    let kb_path = get_kb_path()?;
    let query = required_str_arg(&args, &["pattern", "query"])?;
    let tags = optional_string_array_arg(&args, &["tags"]);
    let category_id = optional_str_arg(&args, &["path", "category_id"])
        .map(|value| canonicalize_category_reference(&kb_path, value))
        .transpose()?;
    let limit = optional_usize_arg(&args, &["limit"]).or_else(|| {
        args.get("options")
            .and_then(|value| value.get("max_results"))
            .and_then(|value| value.as_u64())
            .map(|value| value as usize)
    });

    let results = memoforge_core::grep(
        &kb_path,
        query,
        tags.as_deref(),
        category_id.as_deref(),
        limit,
    )?;
    Ok(json!({ "results": results, "total": results.len() }).to_string())
}

fn handle_list_categories(_args: Value) -> Result<String, MemoError> {
    let kb_path = get_kb_path()?;
    let counts = memoforge_core::list_categories(&kb_path)?
        .into_iter()
        .map(|category| (category.id, category.count.unwrap_or(0)))
        .collect::<std::collections::HashMap<_, _>>();
    let config = load_config(&kb_path)?;

    let categories = config
        .categories
        .into_iter()
        .map(|category| {
            json!({
                "id": category.id,
                "name": category.name,
                "label": category.name,
                "path": category.path,
                "parent_id": category.parent_id,
                "description": category.description,
                "count": counts.get(&category.id).copied().unwrap_or(0)
            })
        })
        .collect::<Vec<_>>();
    Ok(json!({ "categories": categories }).to_string())
}

fn handle_create_category(args: Value) -> Result<String, MemoError> {
    let kb_path = get_kb_path()?;
    let description = optional_str_arg(&args, &["description"]).map(String::from);

    if let Some(path) = optional_str_arg(&args, &["path"]) {
        let category_id =
            memoforge_core::create_category(&kb_path, path, None, description.clone())?;
        if let Some(label) = optional_str_arg(&args, &["label"]) {
            if label != path {
                memoforge_core::update_category(
                    &kb_path,
                    &category_id,
                    Some(label),
                    description.as_deref(),
                )?;
            }
        }
        return Ok(json!({ "created": true, "id": category_id, "path": path }).to_string());
    }

    let name = required_str_arg(&args, &["name"])?;
    let parent_id = optional_str_arg(&args, &["parent_id"]).map(String::from);
    let category_id = memoforge_core::create_category(&kb_path, name, parent_id, description)?;
    Ok(json!({ "created": true, "id": category_id }).to_string())
}

fn handle_update_category(args: Value) -> Result<String, MemoError> {
    let kb_path = get_kb_path()?;
    let raw_id = required_str_arg(&args, &["id", "path"])?;
    let id = resolve_category_identifier(&kb_path, raw_id)?;
    let name = optional_str_arg(&args, &["label", "name"]);
    let description = optional_str_arg(&args, &["description"]);

    memoforge_core::update_category(&kb_path, &id, name, description)?;
    Ok(json!({ "updated": true, "id": id }).to_string())
}

fn handle_delete_category(args: Value) -> Result<String, MemoError> {
    let kb_path = get_kb_path()?;
    let raw_id = required_str_arg(&args, &["id", "path"])?;
    let id = resolve_category_identifier(&kb_path, raw_id)?;
    let force = optional_bool_arg(&args, &["force"]).unwrap_or(false);

    memoforge_core::delete_category(&kb_path, &id, force)?;
    Ok(json!({ "deleted": true, "id": id }).to_string())
}

fn handle_get_status(_args: Value, readonly: bool) -> Result<String, MemoError> {
    let kb_path = get_kb_path()?;
    let (knowledge_count, category_count, git_initialized) = memoforge_core::get_status(&kb_path)?;
    Ok(json!({
        "initialized": true,
        "knowledge_count": knowledge_count,
        "category_count": category_count,
        "git_initialized": git_initialized,
        "readonly": readonly,
        "mode": if readonly { "readonly" } else { "readwrite" }
    })
    .to_string())
}

fn handle_get_config(_args: Value) -> Result<String, MemoError> {
    let kb_path = get_kb_path()?;
    let config = load_config(&kb_path)?;
    let name = config
        .metadata
        .as_ref()
        .map(|metadata| metadata.name.clone())
        .or_else(|| {
            kb_path
                .file_name()
                .and_then(|value| value.to_str())
                .map(String::from)
        })
        .unwrap_or_else(|| "knowledge-base".to_string());

    let categories = config
        .categories
        .into_iter()
        .map(|category| {
            json!({
                "id": category.id,
                "name": category.name,
                "path": category.path,
                "parent_id": category.parent_id,
                "description": category.description
            })
        })
        .collect::<Vec<_>>();

    Ok(json!({
        "name": name,
        "version": config.version,
        "categories": categories
    })
    .to_string())
}

fn handle_get_tags(args: Value) -> Result<String, MemoError> {
    let kb_path = get_kb_path()?;
    let prefix = optional_str_arg(&args, &["prefix"]);
    let mut tags = memoforge_core::get_tags_with_counts(&kb_path)?
        .into_iter()
        .filter(|(name, _count)| prefix.map(|value| name.starts_with(value)).unwrap_or(true))
        .map(|(name, count)| json!({ "name": name, "count": count }))
        .collect::<Vec<_>>();
    tags.sort_by(|left, right| {
        left.get("name")
            .and_then(Value::as_str)
            .cmp(&right.get("name").and_then(Value::as_str))
    });
    Ok(json!({ "tags": tags, "total": tags.len() }).to_string())
}

fn handle_get_backlinks(args: Value) -> Result<String, MemoError> {
    let kb_path = get_kb_path()?;
    let id = required_str_arg(&args, &["path", "id"])?;
    let backlinks = memoforge_core::get_backlinks(&kb_path, id)?;
    Ok(serde_json::to_string(&backlinks).unwrap())
}

fn handle_get_related(args: Value) -> Result<String, MemoError> {
    let kb_path = get_kb_path()?;
    let id = required_str_arg(&args, &["path", "id"])?;
    let related = memoforge_core::get_related(&kb_path, id)?;
    Ok(serde_json::to_string(&related).unwrap())
}

fn handle_get_knowledge_graph(_args: Value) -> Result<String, MemoError> {
    let kb_path = get_kb_path()?;
    let graph = memoforge_core::get_knowledge_graph(&kb_path)?;
    Ok(serde_json::to_string(&graph).unwrap())
}

fn handle_git_status(_args: Value) -> Result<String, MemoError> {
    let kb_path = get_kb_path()?;
    let files = memoforge_core::git::git_status(&kb_path)?;
    Ok(json!({ "files": files, "total": files.len() }).to_string())
}

fn handle_git_commit(args: Value) -> Result<String, MemoError> {
    let kb_path = get_kb_path()?;
    let message = optional_str_arg(&args, &["message"]).unwrap_or("MemoForge MCP commit");
    let pending_files = memoforge_core::git::git_status(&kb_path).unwrap_or_default();

    memoforge_core::git::git_commit(&kb_path, message)?;
    let _ =
        memoforge_core::log_git_commit(&kb_path, EventSource::Mcp, message, pending_files.len());
    let latest_commit = memoforge_core::git::git_log(&kb_path, 1)?
        .into_iter()
        .next();

    Ok(json!({
        "committed": true,
        "message": message,
        "files_committed": pending_files.len(),
        "commit": latest_commit
    })
    .to_string())
}

fn handle_git_pull(_args: Value) -> Result<String, MemoError> {
    let kb_path = get_kb_path()?;
    memoforge_core::git::git_pull(&kb_path)?;
    let _ = log_git_pull(&kb_path, EventSource::Mcp);
    Ok(json!({ "pulled": true }).to_string())
}

fn handle_git_push(args: Value) -> Result<String, MemoError> {
    let kb_path = get_kb_path()?;
    let dry_run = optional_bool_arg(&args, &["dry_run"]).unwrap_or(true);

    if dry_run {
        return Ok(json!({ "dry_run": true }).to_string());
    }

    memoforge_core::git::git_push(&kb_path)?;
    let _ = log_git_push(&kb_path, EventSource::Mcp);
    Ok(json!({ "pushed": true }).to_string())
}

fn handle_git_log(args: Value) -> Result<String, MemoError> {
    let kb_path = get_kb_path()?;
    let limit = optional_usize_arg(&args, &["limit"]).unwrap_or(10);
    let commits = memoforge_core::git::git_log(&kb_path, limit)?;
    Ok(json!({ "commits": commits }).to_string())
}

fn handle_read_knowledge(args: Value) -> Result<String, MemoError> {
    let kb_path = get_kb_path()?;
    let path = required_str_arg(&args, &["path"])?;
    let level = match optional_str_arg(&args, &["level"]) {
        Some("L0") => LoadLevel::L0,
        Some("L1") => LoadLevel::L1,
        Some("L2") => LoadLevel::L2,
        _ => LoadLevel::L1,
    };
    let section = optional_str_arg(&args, &["section"]);
    let include_metadata = optional_bool_arg(&args, &["include_metadata"]).unwrap_or(true);
    let include_stale = optional_bool_arg(&args, &["include_stale"]).unwrap_or(true);

    let result = memoforge_core::read_knowledge_unified(
        &kb_path,
        path,
        level,
        section,
        include_metadata,
        include_stale,
    )?;

    Ok(json!({
        "metadata": result.metadata,
        "content": result.content,
        "sections": result.sections,
        "summary_stale": result.summary_stale
    })
    .to_string())
}

fn handle_start_draft(args: Value) -> Result<String, MemoError> {
    let kb_path = get_kb_path()?;
    let path = optional_str_arg(&args, &["path"]);
    let metadata = args.get("metadata").cloned().filter(|v| v.is_object());
    let agent_name = get_agent_name();

    let draft_id = memoforge_core::start_draft(&kb_path, path, metadata, &agent_name)?;

    Ok(json!({
        "draft_id": draft_id,
        "path": path,
        "created": true
    })
    .to_string())
}

fn handle_update_draft(args: Value) -> Result<String, MemoError> {
    let kb_path = get_kb_path()?;
    let draft_id = required_str_arg(&args, &["draft_id"])?;
    let op_type = required_str_arg(&args, &["op"])?;

    let operation = match op_type {
        "set_content" => {
            let content = required_str_arg(&args, &["content"])?.to_string();
            memoforge_core::DraftOperation::SetContent { content }
        }
        "append_section" => {
            let heading = required_str_arg(&args, &["heading"])?.to_string();
            let level = optional_usize_arg(&args, &["level"]).unwrap_or(2);
            let body = optional_str_arg(&args, &["content"])
                .unwrap_or("")
                .to_string();
            memoforge_core::DraftOperation::AppendSection {
                heading,
                level,
                body,
            }
        }
        "replace_section" => {
            let heading = required_str_arg(&args, &["heading"])?.to_string();
            let new_body = optional_str_arg(&args, &["content"])
                .unwrap_or("")
                .to_string();
            memoforge_core::DraftOperation::ReplaceSection { heading, new_body }
        }
        "remove_section" => {
            let heading = required_str_arg(&args, &["heading"])?.to_string();
            memoforge_core::DraftOperation::RemoveSection { heading }
        }
        "update_metadata" => {
            let patch = args
                .get("metadata")
                .cloned()
                .filter(|v| v.is_object())
                .unwrap_or(json!({}));
            memoforge_core::DraftOperation::UpdateMetadata { patch }
        }
        _ => {
            return Err(MemoError {
                code: ErrorCode::InvalidArgument,
                message: format!(
                    "Unknown draft operation '{}'. Supported: set_content, append_section, replace_section, remove_section, update_metadata",
                    op_type
                ),
                retry_after_ms: None,
                context: None,
            });
        }
    };

    let draft = memoforge_core::update_draft(&kb_path, draft_id, operation)?;

    Ok(json!({
        "draft_id": draft.draft_id,
        "ops_applied": draft.ops.len()
    })
    .to_string())
}

fn handle_preview_draft(args: Value) -> Result<String, MemoError> {
    let kb_path = get_kb_path()?;
    let draft_id = required_str_arg(&args, &["draft_id"])?;

    let preview = memoforge_core::preview_draft(&kb_path, draft_id)?;

    Ok(json!({
        "sections_changed": preview.sections_changed,
        "summary_will_be_stale": preview.summary_will_be_stale,
        "warnings": preview.warnings,
        "diff_summary": preview.diff_summary
    })
    .to_string())
}

fn handle_commit_draft(args: Value) -> Result<String, MemoError> {
    let kb_path = get_kb_path()?;
    let draft_id = required_str_arg(&args, &["draft_id"])?;

    match memoforge_core::commit_draft(&kb_path, draft_id) {
        Ok(result) => Ok(json!({
            "committed": true,
            "path": result.path,
            "changed_sections": result.changed_sections,
            "draft_id": result.draft_id
        })
        .to_string()),
        Err(e) if e.code == ErrorCode::ConflictFileLocked => {
            // Return a user-friendly error with recovery instructions
            Err(MemoError {
                code: ErrorCode::ConflictFileLocked,
                message: format!(
                    "{}\n\nRecovery: The draft '{}' has been preserved. You can:\n\
                     1. Use read_knowledge to view the current file content\n\
                     2. Use discard_draft to cancel this draft\n\
                     3. Start a new draft with start_draft to re-apply your changes",
                    e.message, draft_id
                ),
                retry_after_ms: None,
                context: e.context,
            })
        }
        Err(e) => Err(e),
    }
}

fn handle_discard_draft(args: Value) -> Result<String, MemoError> {
    let kb_path = get_kb_path()?;
    let draft_id = required_str_arg(&args, &["draft_id"])?;

    memoforge_core::discard_draft(&kb_path, draft_id)?;

    Ok(json!({
        "discarded": true,
        "draft_id": draft_id
    })
    .to_string())
}

// Sprint 1: Inbox handlers

fn handle_list_inbox_items(args: Value) -> Result<String, MemoError> {
    let kb_path = get_kb_path()?;

    let status = optional_str_arg(&args, &["status"]).and_then(|s| match s {
        "new" => Some(memoforge_core::InboxStatus::New),
        "triaged" => Some(memoforge_core::InboxStatus::Triaged),
        "drafted" => Some(memoforge_core::InboxStatus::Drafted),
        "promoted" => Some(memoforge_core::InboxStatus::Promoted),
        "ignored" => Some(memoforge_core::InboxStatus::Ignored),
        _ => None,
    });

    let limit = optional_usize_arg(&args, &["limit"]);

    let store = memoforge_core::InboxStore::new(kb_path);
    let items = store.list_inbox_items(status, limit)?;

    Ok(json!({ "items": items, "total": items.len() }).to_string())
}

fn handle_create_inbox_item(args: Value) -> Result<String, MemoError> {
    let kb_path = get_kb_path()?;

    let title = required_str_arg(&args, &["title"])?.to_string();
    let source_type = match required_str_arg(&args, &["source_type"])? {
        "agent" => memoforge_core::InboxSourceType::Agent,
        "import" => memoforge_core::InboxSourceType::Import,
        "paste" => memoforge_core::InboxSourceType::Paste,
        "manual" => memoforge_core::InboxSourceType::Manual,
        "reliability" => memoforge_core::InboxSourceType::Reliability,
        other => {
            return Err(MemoError {
                code: ErrorCode::InvalidArgument,
                message: format!(
                    "Invalid source_type '{}'. Valid: agent, import, paste, manual, reliability",
                    other
                ),
                retry_after_ms: None,
                context: None,
            });
        }
    };

    let mut item = memoforge_core::InboxItem::new(source_type, title);

    if let Some(content) = optional_str_arg(&args, &["content_markdown"]) {
        item.content_markdown = Some(content.to_string());
    }

    if let Some(proposed_path) = optional_str_arg(&args, &["proposed_path"]) {
        item.proposed_path = Some(proposed_path.to_string());
    }

    if let Some(linked_session_id) = optional_str_arg(&args, &["linked_session_id"]) {
        item.linked_session_id = Some(linked_session_id.to_string());
    }
    if item.source_type == memoforge_core::InboxSourceType::Agent {
        item.source_agent = Some(get_agent_name());
    }

    if let Some(session_id) = item.linked_session_id.as_deref() {
        let session_store = memoforge_core::SessionStore::new(kb_path.clone());
        session_store.get_session(session_id)?;
    }

    let store = memoforge_core::InboxStore::new(kb_path);
    let created = store.create_inbox_item(item)?;
    if let Some(session_id) = created.linked_session_id.as_deref() {
        let session_store = memoforge_core::SessionStore::new(get_kb_path()?);
        session_store.get_session(session_id)?;
        session_store.add_inbox_item_id(session_id, created.id.clone())?;
    }

    Ok(json!({ "item": created }).to_string())
}

fn handle_promote_inbox_item_to_draft(args: Value) -> Result<String, MemoError> {
    let kb_path = get_kb_path()?;

    let inbox_item_id = required_str_arg(&args, &["inbox_item_id"])?;

    // Read the inbox item
    let inbox_store = memoforge_core::InboxStore::new(kb_path.clone());
    let inbox_item = inbox_store.get_inbox_item(inbox_item_id)?;

    // Validate state transition (must be New or Triaged)
    if !inbox_item.can_transition_to(&memoforge_core::InboxStatus::Drafted) {
        return Err(MemoError {
            code: ErrorCode::InvalidArgument,
            message: format!(
                "Cannot promote inbox item in {:?} state. Only 'new' or 'triaged' items can be promoted.",
                inbox_item.status
            ),
            retry_after_ms: None,
            context: None,
        });
    }

    let draft_title = optional_str_arg(&args, &["draft_title"]);
    let agent_name = get_agent_name();
    let draft_id = memoforge_core::start_draft_from_inbox_item(
        &kb_path,
        &inbox_item,
        draft_title,
        &agent_name,
    )?;

    // Update inbox item status to Drafted
    let mut updated_inbox =
        inbox_store.update_inbox_status(inbox_item_id, memoforge_core::InboxStatus::Drafted)?;
    updated_inbox.linked_draft_id = Some(draft_id.clone());
    let updated_inbox = inbox_store.update_inbox_item(updated_inbox)?;
    if let Some(session_id) = updated_inbox.linked_session_id.as_deref() {
        let session_store = memoforge_core::SessionStore::new(kb_path.clone());
        session_store.add_draft_id(session_id, draft_id.clone())?;
    }

    Ok(json!({
        "draft_id": draft_id,
        "inbox_item": updated_inbox
    })
    .to_string())
}

fn handle_dismiss_inbox_item(args: Value) -> Result<String, MemoError> {
    let kb_path = get_kb_path()?;

    let inbox_item_id = required_str_arg(&args, &["inbox_item_id"])?;

    let store = memoforge_core::InboxStore::new(kb_path);
    let item = store.dismiss_inbox_item(inbox_item_id)?;

    Ok(json!({ "item": item }).to_string())
}

// Sprint 1: Session handlers

fn handle_start_agent_session(args: Value) -> Result<String, MemoError> {
    let kb_path = get_kb_path()?;

    let agent_name = required_str_arg(&args, &["agent_name"])?.to_string();
    let goal = required_str_arg(&args, &["goal"])?.to_string();
    let agent_source = optional_str_arg(&args, &["agent_source"]).map(String::from);

    // Validate context_pack_ids if provided
    let context_pack_ids = optional_string_array_arg(&args, &["context_pack_ids"]);
    if let Some(ref pack_ids) = context_pack_ids {
        let pack_store = ContextPackStore::new(&kb_path);
        for pack_id in pack_ids {
            pack_store.get(pack_id).map_err(|_| MemoError {
                code: ErrorCode::InvalidArgument,
                message: format!("Context pack not found: {}", pack_id),
                retry_after_ms: None,
                context: None,
            })?;
        }
    }

    let mut session = memoforge_core::AgentSession::new(agent_name, goal);
    session.agent_source = agent_source;
    if let Some(pack_ids) = context_pack_ids {
        session.context_pack_ids = pack_ids;
    }

    let store = memoforge_core::SessionStore::new(kb_path);
    let created = store.create_session(session)?;

    Ok(json!({ "session": created }).to_string())
}

fn handle_append_agent_session_context(args: Value) -> Result<String, MemoError> {
    let kb_path = get_kb_path()?;

    let session_id = required_str_arg(&args, &["session_id"])?;

    let context_obj = args
        .get("context_item")
        .ok_or_else(|| missing_arg("context_item"))?;

    let ref_type = match context_obj.get("ref_type").and_then(Value::as_str) {
        Some("knowledge") => memoforge_core::ContextRefType::Knowledge,
        Some("pack") => memoforge_core::ContextRefType::Pack,
        Some("url") => memoforge_core::ContextRefType::Url,
        Some("file") => memoforge_core::ContextRefType::File,
        Some(other) => {
            return Err(MemoError {
                code: ErrorCode::InvalidArgument,
                message: format!(
                    "Invalid ref_type '{}'. Valid: knowledge, pack, url, file",
                    other
                ),
                retry_after_ms: None,
                context: None,
            });
        }
        None => {
            return Err(missing_arg("context_item.ref_type"));
        }
    };

    let ref_id = context_obj
        .get("ref_id")
        .and_then(Value::as_str)
        .ok_or_else(|| missing_arg("context_item.ref_id"))?
        .to_string();

    let summary = context_obj
        .get("summary")
        .and_then(Value::as_str)
        .map(String::from);

    let context_item = memoforge_core::ContextItem {
        ref_type,
        ref_id,
        accessed_at: chrono::Utc::now().to_rfc3339(),
        summary,
    };

    let store = memoforge_core::SessionStore::new(kb_path);
    let updated = store.append_context(session_id, context_item)?;

    Ok(json!({ "session": updated }).to_string())
}

fn handle_list_agent_sessions(args: Value) -> Result<String, MemoError> {
    let kb_path = get_kb_path()?;

    let status = optional_str_arg(&args, &["status"]).and_then(|s| match s {
        "running" => Some(memoforge_core::SessionStatus::Running),
        "completed" => Some(memoforge_core::SessionStatus::Completed),
        "failed" => Some(memoforge_core::SessionStatus::Failed),
        "cancelled" => Some(memoforge_core::SessionStatus::Cancelled),
        _ => None,
    });

    let limit = optional_usize_arg(&args, &["limit"]);

    let store = memoforge_core::SessionStore::new(kb_path);
    let sessions = store.list_sessions(status, limit)?;

    Ok(json!({ "sessions": sessions, "total": sessions.len() }).to_string())
}

fn handle_get_agent_session(args: Value) -> Result<String, MemoError> {
    let kb_path = get_kb_path()?;

    let session_id = required_str_arg(&args, &["session_id"])?;

    let store = memoforge_core::SessionStore::new(kb_path);
    let session = store.get_session(session_id)?;

    Ok(json!({ "session": session }).to_string())
}

fn handle_complete_agent_session(args: Value) -> Result<String, MemoError> {
    let kb_path = get_kb_path()?;

    let session_id = required_str_arg(&args, &["session_id"])?;
    let result_summary = optional_str_arg(&args, &["result_summary"]).map(String::from);

    let status_target = optional_str_arg(&args, &["status"]).unwrap_or("completed");

    let store = memoforge_core::SessionStore::new(kb_path);
    let updated = match status_target {
        "completed" => store.complete_session(session_id, result_summary)?,
        "failed" => store.fail_session(session_id, result_summary)?,
        "cancelled" => store.cancel_session(session_id)?,
        other => {
            return Err(MemoError {
                code: ErrorCode::InvalidArgument,
                message: format!(
                    "Invalid status '{}'. Valid: completed, failed, cancelled",
                    other
                ),
                retry_after_ms: None,
                context: None,
            });
        }
    };

    Ok(json!({ "session": updated }).to_string())
}

// Sprint 2: Reliability handlers

fn handle_list_reliability_issues(args: Value) -> Result<String, MemoError> {
    let kb_path = get_kb_path()?;

    // Auto-scan to detect issues before listing
    if let Ok(issues) = memoforge_core::scan_kb(&kb_path) {
        let store = memoforge_core::ReliabilityStore::new(kb_path.clone());
        let _ = store.save_issues(issues);
    }

    let severity = optional_str_arg(&args, &["severity"]).and_then(|s| match s {
        "high" => Some(memoforge_core::IssueSeverity::High),
        "medium" => Some(memoforge_core::IssueSeverity::Medium),
        "low" => Some(memoforge_core::IssueSeverity::Low),
        _ => None,
    });

    let status = optional_str_arg(&args, &["status"]).and_then(|s| match s {
        "open" => Some(memoforge_core::IssueStatus::Open),
        "ignored" => Some(memoforge_core::IssueStatus::Ignored),
        "resolved" => Some(memoforge_core::IssueStatus::Resolved),
        _ => None,
    });

    let limit = optional_usize_arg(&args, &["limit"]);

    let store = memoforge_core::ReliabilityStore::new(kb_path);
    let stats = store.get_stats()?;
    let issues = store.list_issues(memoforge_core::ListFilter {
        severity,
        status,
        limit,
        ..Default::default()
    })?;

    Ok(json!({ "issues": issues, "stats": stats, "total": issues.len() }).to_string())
}

fn handle_get_reliability_issue_detail(args: Value) -> Result<String, MemoError> {
    let kb_path = get_kb_path()?;

    let issue_id = required_str_arg(&args, &["issue_id"])?;

    let store = memoforge_core::ReliabilityStore::new(kb_path);
    let issue = store.get_issue(issue_id)?;

    Ok(serde_json::to_string_pretty(&issue).unwrap())
}

fn handle_create_fix_draft_from_issue(args: Value) -> Result<String, MemoError> {
    let kb_path = get_kb_path()?;

    let issue_id = required_str_arg(&args, &["issue_id"])?;
    let fix_instructions = optional_str_arg(&args, &["fix_instructions"]).map(String::from);

    // Get issue details first
    let store = memoforge_core::ReliabilityStore::new(kb_path.clone());
    let issue = store.get_issue(issue_id)?;

    // Check if issue already has a linked draft
    if issue.linked_draft_id.is_some() {
        return Err(MemoError {
            code: ErrorCode::InvalidArgument,
            message: format!(
                "Issue '{}' already has a linked draft: {}",
                issue_id,
                issue.linked_draft_id.unwrap()
            ),
            retry_after_ms: None,
            context: None,
        });
    }

    // Create draft for the knowledge file
    let agent_name = get_agent_name();
    let draft_metadata = if let Some(instructions) = fix_instructions {
        json!({
            "fix_issue_id": issue_id,
            "fix_instructions": instructions
        })
    } else {
        json!({
            "fix_issue_id": issue_id
        })
    };

    let draft_id = memoforge_core::start_draft(
        &kb_path,
        Some(&issue.knowledge_path),
        Some(draft_metadata),
        &agent_name,
    )?;

    // Inject review metadata so the draft appears in the unified review queue
    let _ = memoforge_core::update_draft_review_state(
        &kb_path,
        &draft_id,
        "pending",
        Some("reliability_fix".to_string()),
        None,
        None,
    );

    // Link draft to issue
    let updated_issue = store.link_draft(issue_id, draft_id.clone())?;

    Ok(json!({
        "draft_id": draft_id,
        "issue": updated_issue
    })
    .to_string())
}

// Sprint 4: Context Pack handlers

fn handle_list_context_packs(args: Value) -> Result<String, MemoError> {
    let kb_path = get_kb_path()?;

    let scope_type = optional_str_arg(&args, &["scope_type"]).and_then(|s| match s {
        "tag" => Some(ContextPackScope::Tag),
        "folder" => Some(ContextPackScope::Folder),
        "topic" => Some(ContextPackScope::Topic),
        "manual" => Some(ContextPackScope::Manual),
        _ => None,
    });

    let store = ContextPackStore::new(&kb_path);
    let packs = store.list(scope_type, None)?;

    Ok(json!({ "packs": packs }).to_string())
}

fn handle_create_context_pack(args: Value) -> Result<String, MemoError> {
    let kb_path = get_kb_path()?;

    let name = required_str_arg(&args, &["name"])?.to_string();
    let scope_type = match required_str_arg(&args, &["scope_type"])? {
        "tag" => ContextPackScope::Tag,
        "folder" => ContextPackScope::Folder,
        "topic" => ContextPackScope::Topic,
        "manual" => ContextPackScope::Manual,
        other => {
            return Err(MemoError {
                code: ErrorCode::InvalidArgument,
                message: format!(
                    "Invalid scope_type '{}'. Valid: tag, folder, topic, manual",
                    other
                ),
                retry_after_ms: None,
                context: None,
            });
        }
    };
    let scope_value = required_str_arg(&args, &["scope_value"])?.to_string();

    let item_paths =
        optional_string_array_arg(&args, &["item_paths"]).ok_or_else(|| MemoError {
            code: ErrorCode::InvalidArgument,
            message: "Missing 'item_paths' parameter".to_string(),
            retry_after_ms: None,
            context: None,
        })?;

    let mut pack = ContextPack::new(name, scope_type, scope_value);

    for path in item_paths {
        pack.add_item_path(path);
    }

    if let Some(summary) = optional_str_arg(&args, &["summary"]) {
        pack.update_summary(Some(summary.to_string()));
    }

    let store = ContextPackStore::new(&kb_path);
    let created = store.create(pack)?;

    Ok(json!({ "pack": created }).to_string())
}

fn handle_get_context_pack(args: Value) -> Result<String, MemoError> {
    let kb_path = get_kb_path()?;

    let pack_id = required_str_arg(&args, &["pack_id"])?;

    let store = ContextPackStore::new(&kb_path);
    let pack = store.get(pack_id)?;

    Ok(json!({ "pack": pack }).to_string())
}

fn handle_export_context_pack(args: Value) -> Result<String, MemoError> {
    let kb_path = get_kb_path()?;

    let pack_id = required_str_arg(&args, &["pack_id"])?;
    let format = optional_str_arg(&args, &["format"]).unwrap_or("json");

    if format != "json" {
        return Err(MemoError {
            code: ErrorCode::InvalidArgument,
            message: format!(
                "Unsupported export format '{}'. Only 'json' is supported in Sprint 4",
                format
            ),
            retry_after_ms: None,
            context: None,
        });
    }

    let store = ContextPackStore::new(&kb_path);
    let pack = store.get(pack_id)?;

    Ok(json!({
        "pack": pack,
        "export_format": format
    })
    .to_string())
}

// ---------------------------------------------------------------------------
// Sprint 2: Workflow template tools
// ---------------------------------------------------------------------------

fn handle_list_workflow_templates(args: Value) -> Result<String, MemoError> {
    let kb_path = get_kb_path()?;

    let enabled_only = args
        .get("enabled_only")
        .and_then(Value::as_bool)
        .unwrap_or(false);

    let store = memoforge_core::WorkflowTemplateStore::new(kb_path);
    let mut templates = store.list_all_templates()?;

    if enabled_only {
        templates.retain(|t| t.enabled);
    }

    let summary: Vec<serde_json::Value> = templates
        .into_iter()
        .map(|t| {
            json!({
                "template_id": t.template_id,
                "name": t.name,
                "goal": t.goal,
                "enabled": t.enabled,
            })
        })
        .collect();

    Ok(json!({ "templates": summary }).to_string())
}

fn handle_start_workflow_run(args: Value) -> Result<String, MemoError> {
    let kb_path = get_kb_path()?;

    let template_id = required_str_arg(&args, &["template_id"])?;
    let goal_override = optional_str_arg(&args, &["goal_override"]).map(String::from);
    let suggested_output_target =
        optional_str_arg(&args, &["suggested_output_target"]).map(String::from);

    // Parse context_refs if provided
    let context_refs = args
        .get("context_refs")
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .filter_map(|item| {
                    let ref_type_str = item.get("ref_type").and_then(Value::as_str)?;
                    let ref_id = item.get("ref_id").and_then(Value::as_str)?;
                    let required = item
                        .get("required")
                        .and_then(Value::as_bool)
                        .unwrap_or(false);
                    let reason = item
                        .get("reason")
                        .and_then(Value::as_str)
                        .map(String::from);

                    let ref_type = match ref_type_str {
                        "knowledge" => memoforge_core::ContextRefType::Knowledge,
                        "pack" => memoforge_core::ContextRefType::Pack,
                        "url" => memoforge_core::ContextRefType::Url,
                        "file" => memoforge_core::ContextRefType::File,
                        _ => return None,
                    };

                    Some(memoforge_core::ContextRef {
                        ref_type,
                        ref_id: ref_id.to_string(),
                        required,
                        reason,
                        snapshot_summary: None,
                    })
                })
                .collect::<Vec<_>>()
        });

    let agent_name = get_agent_name();

    let params = memoforge_core::StartWorkflowRunParams {
        template_id,
        goal_override: goal_override.as_deref(),
        context_refs,
        suggested_output_target: suggested_output_target.as_deref(),
        agent_name: &agent_name,
    };

    let run = memoforge_core::start_workflow_run(&kb_path, params)?;

    // Count context items with snapshots by loading the created session
    let snapshot_count = run.session_id.as_ref().and_then(|sid| {
        let session_store = memoforge_core::SessionStore::new(kb_path.clone());
        session_store.get_session(sid).ok().map(|session| {
            session
                .context_items
                .iter()
                .filter(|item| item.summary.is_some())
                .count()
        })
    });

    Ok(json!({
        "run_id": run.run_id,
        "session_id": run.session_id,
        "draft_id": run.draft_id,
        "inbox_item_ids": run.inbox_item_ids,
        "context_items_with_snapshots": snapshot_count,
    })
    .to_string())
}

// ---------------------------------------------------------------------------
// Sprint 3: Unified Review Queue tools
// ---------------------------------------------------------------------------

fn handle_list_review_items(args: Value) -> Result<String, MemoError> {
    let kb_path = get_kb_path()?;

    let status = optional_str_arg(&args, &["status"]).and_then(|s| match s {
        "pending" => Some(memoforge_core::ReviewStatus::Pending),
        "in_review" => Some(memoforge_core::ReviewStatus::InReview),
        "approved" => Some(memoforge_core::ReviewStatus::Approved),
        "returned" => Some(memoforge_core::ReviewStatus::Returned),
        "discarded" => Some(memoforge_core::ReviewStatus::Discarded),
        _ => None,
    });
    let source_type = optional_str_arg(&args, &["source_type"]).and_then(|s| match s {
        "agent_draft" => Some(memoforge_core::ReviewSourceType::AgentDraft),
        "inbox_promotion" => Some(memoforge_core::ReviewSourceType::InboxPromotion),
        "reliability_fix" => Some(memoforge_core::ReviewSourceType::ReliabilityFix),
        "import_cleanup" => Some(memoforge_core::ReviewSourceType::ImportCleanup),
        _ => None,
    });
    let limit = optional_usize_arg(&args, &["limit"]);

    let filter = memoforge_core::ReviewListFilter {
        status,
        source_type,
        include_terminal: optional_bool_arg(&args, &["include_terminal"]).unwrap_or(false),
        limit,
    };

    let items = memoforge_core::list_review_items(&kb_path, filter)?;

    let items_json: Vec<serde_json::Value> = items
        .into_iter()
        .map(|item| {
            json!({
                "review_item_id": item.review_item_id,
                "draft_id": item.draft_id,
                "title": item.title,
                "source_type": item.source_type,
                "status": item.status,
                "risk_flags": item.risk_flags,
            })
        })
        .collect();

    Ok(json!({ "items": items_json }).to_string())
}

fn handle_get_review_item(args: Value) -> Result<String, MemoError> {
    let kb_path = get_kb_path()?;
    let review_item_id = required_str_arg(&args, &["review_item_id"])?;

    let item = memoforge_core::get_review_item(&kb_path, review_item_id)?;

    Ok(json!({
        "item": {
            "review_item_id": item.review_item_id,
            "draft_id": item.draft_id,
            "source_type": item.source_type,
            "source_ref_id": item.source_ref_id,
            "status": item.status,
            "risk_flags": item.risk_flags,
            "decided_by": item.decided_by,
            "decided_at": item.decided_at,
        }
    })
    .to_string())
}

fn handle_apply_review_decision(args: Value) -> Result<String, MemoError> {
    let kb_path = get_kb_path()?;
    let review_item_id = required_str_arg(&args, &["review_item_id"])?;

    let decision_str = required_str_arg(&args, &["decision"])?;
    let decision = match decision_str {
        "approve" => memoforge_core::ReviewDecision::Approve,
        "return" => memoforge_core::ReviewDecision::Return,
        "discard" => memoforge_core::ReviewDecision::Discard,
        "reopen" => memoforge_core::ReviewDecision::Reopen,
        _ => {
            return Err(MemoError {
                code: ErrorCode::InvalidArgument,
                message: format!(
                    "Invalid decision '{}'. Must be one of: approve, return, discard, reopen",
                    decision_str
                ),
                retry_after_ms: None,
                context: None,
            })
        }
    };

    let notes = optional_str_arg(&args, &["notes"]).map(String::from);
    let agent_name = get_agent_name();
    let decided_by = Some(agent_name);

    let item =
        memoforge_core::apply_review_decision(&kb_path, review_item_id, decision, decided_by, notes)?;

    Ok(json!({
        "item": {
            "review_item_id": item.review_item_id,
            "status": item.status,
            "decided_by": item.decided_by,
            "decided_at": item.decided_at,
        }
    })
    .to_string())
}

fn handle_start_review(args: Value) -> Result<String, MemoError> {
    let kb_path = get_kb_path()?;
    let review_item_id = required_str_arg(&args, &["review_item_id"])?;
    let reviewer = optional_str_arg(&args, &["reviewer"]).map(String::from);

    let item = memoforge_core::start_review(&kb_path, review_item_id, reviewer)?;

    Ok(json!({
        "item": {
            "review_item_id": item.review_item_id,
            "draft_id": item.draft_id,
            "status": item.status,
            "decided_by": item.decided_by,
            "decided_at": item.decided_at,
        }
    })
    .to_string())
}

// ---------------------------------------------------------------------------
// Sprint 4: Governance handlers
// ---------------------------------------------------------------------------

fn handle_get_knowledge_governance(args: Value) -> Result<String, MemoError> {
    let kb_path = get_kb_path()?;
    let path = required_str_arg(&args, &["path"])?;
    let normalized = normalize_relative_path(path);

    // Ensure .md extension
    let knowledge_path = if normalized.ends_with(".md") {
        normalized
    } else {
        format!("{}.md", normalized)
    };

    let evidence = memoforge_core::read_evidence(&kb_path, &knowledge_path)?;
    let freshness = memoforge_core::effective_freshness(&kb_path, &knowledge_path)?;

    Ok(json!({
        "evidence": evidence,
        "freshness": {
            "sla_days": freshness.sla_days,
            "last_verified_at": freshness.last_verified_at,
            "next_review_at": freshness.next_review_at,
            "review_owner": freshness.review_owner,
            "review_status": freshness.review_status,
        },
        "effective_sla_days": freshness.sla_days,
    })
    .to_string())
}

fn handle_update_knowledge_governance(args: Value) -> Result<String, MemoError> {
    let kb_path = get_kb_path()?;
    let path = required_str_arg(&args, &["path"])?;
    let normalized = normalize_relative_path(path);

    // Ensure .md extension
    let knowledge_path = if normalized.ends_with(".md") {
        normalized
    } else {
        format!("{}.md", normalized)
    };

    // Update evidence if provided
    if let Some(evidence_val) = args.get("evidence").filter(|v| v.is_object()) {
        let mut current = memoforge_core::read_evidence(&kb_path, &knowledge_path)?
            .unwrap_or_default();

        if let Some(v) = evidence_val.get("owner").and_then(|v| v.as_str()) {
            current.owner = if v.is_empty() { None } else { Some(v.to_string()) };
        }
        if let Some(v) = evidence_val.get("source_url").and_then(|v| v.as_str()) {
            current.source_url = if v.is_empty() { None } else { Some(v.to_string()) };
        }
        if let Some(v) = evidence_val.get("linked_issue_ids").and_then(|v| v.as_array()) {
            current.linked_issue_ids = v.iter().filter_map(|i| i.as_str().map(String::from)).collect();
        }
        if let Some(v) = evidence_val.get("linked_pr_ids").and_then(|v| v.as_array()) {
            current.linked_pr_ids = v.iter().filter_map(|i| i.as_str().map(String::from)).collect();
        }
        if let Some(v) = evidence_val.get("linked_commit_shas").and_then(|v| v.as_array()) {
            current.linked_commit_shas = v.iter().filter_map(|i| i.as_str().map(String::from)).collect();
        }
        if let Some(v) = evidence_val.get("command_output_refs").and_then(|v| v.as_array()) {
            current.command_output_refs = v.iter().filter_map(|i| i.as_str().map(String::from)).collect();
        }
        if let Some(v) = evidence_val.get("verified_at").and_then(|v| v.as_str()) {
            current.verified_at = if v.is_empty() { None } else { Some(v.to_string()) };
        }
        if let Some(v) = evidence_val.get("verified_by").and_then(|v| v.as_str()) {
            current.verified_by = if v.is_empty() { None } else { Some(v.to_string()) };
        }
        if let Some(v) = evidence_val.get("valid_for_version").and_then(|v| v.as_str()) {
            current.valid_for_version = if v.is_empty() { None } else { Some(v.to_string()) };
        }

        memoforge_core::write_evidence(&kb_path, &knowledge_path, &current)?;
    }

    // Update freshness if provided
    if let Some(freshness_val) = args.get("freshness").filter(|v| v.is_object()) {
        let mut current = memoforge_core::read_freshness(&kb_path, &knowledge_path)?
            .unwrap_or_else(|| {
                // Compute effective freshness as baseline
                memoforge_core::effective_freshness(&kb_path, &knowledge_path).unwrap()
            });

        if let Some(v) = freshness_val.get("sla_days").and_then(|v| v.as_u64()) {
            current.sla_days = v as u32;
        }
        if let Some(v) = freshness_val.get("last_verified_at").and_then(|v| v.as_str()) {
            current.last_verified_at = if v.is_empty() { None } else { Some(v.to_string()) };
        }
        if let Some(v) = freshness_val.get("next_review_at").and_then(|v| v.as_str()) {
            current.next_review_at = if v.is_empty() { None } else { Some(v.to_string()) };
        }
        if let Some(v) = freshness_val.get("review_owner").and_then(|v| v.as_str()) {
            current.review_owner = if v.is_empty() { None } else { Some(v.to_string()) };
        }
        if let Some(v) = freshness_val.get("review_status").and_then(|v| v.as_str()) {
            current.review_status = match v {
                "ok" => memoforge_core::FreshnessReviewStatus::Ok,
                "due" => memoforge_core::FreshnessReviewStatus::Due,
                "overdue" => memoforge_core::FreshnessReviewStatus::Overdue,
                _ => memoforge_core::FreshnessReviewStatus::Unknown,
            };
        }

        memoforge_core::write_freshness(&kb_path, &knowledge_path, &current)?;
    }

    // Return the updated governance state (same shape as get_knowledge_governance)
    let evidence = memoforge_core::read_evidence(&kb_path, &knowledge_path)?;
    let freshness = memoforge_core::effective_freshness(&kb_path, &knowledge_path)?;

    Ok(json!({
        "evidence": evidence,
        "freshness": {
            "sla_days": freshness.sla_days,
            "last_verified_at": freshness.last_verified_at,
            "next_review_at": freshness.next_review_at,
            "review_owner": freshness.review_owner,
            "review_status": freshness.review_status,
        },
        "effective_sla_days": freshness.sla_days,
    })
    .to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    static TEST_LOCK: Mutex<()> = Mutex::new(());

    fn with_temp_kb<T>(test_fn: impl FnOnce(&TempDir) -> T) -> T {
        let _guard = TEST_LOCK.lock().unwrap();
        let temp = TempDir::new().unwrap();
        memoforge_core::init::init_new(temp.path(), false).unwrap();
        set_mode("bound".to_string());
        set_kb_path(temp.path().to_path_buf());
        test_fn(&temp)
    }

    #[test]
    fn create_knowledge_schema_requires_path_or_title() {
        // This tool is only visible under LegacyFull profile
        set_profile(Profile::LegacyFull);
        let tools = list_tools();
        let create_tool = tools
            .into_iter()
            .find(|tool| tool.get("name") == Some(&Value::String("create_knowledge".to_string())))
            .unwrap();

        let description = create_tool
            .get("description")
            .and_then(Value::as_str)
            .unwrap();
        assert!(description.contains("Preferred docs-style call"));

        let schema = create_tool.get("inputSchema").unwrap();
        let one_of = schema.get("oneOf").and_then(Value::as_array).unwrap();
        assert!(one_of.contains(&json!({ "required": ["path"] })));
        assert!(one_of.contains(&json!({ "required": ["title"] })));
    }

    #[test]
    fn create_knowledge_returns_guidance_when_path_and_title_are_missing() {
        with_temp_kb(|_| {
            let error = handle_create_knowledge(json!({
                "content": "# Missing target"
            }))
            .unwrap_err();

            assert_eq!(error.code, ErrorCode::InvalidArgument);
            assert!(error.message.contains("either 'path' or legacy 'title'"));
        });
    }

    #[test]
    fn create_knowledge_resolves_category_id_to_category_path() {
        with_temp_kb(|temp| {
            let category_id =
                memoforge_core::create_category(temp.path(), "devops", None, None).unwrap();

            let result = handle_create_knowledge(json!({
                "title": "Category Id Write",
                "content": "# Category Id Write\n\nLegacy write using category id.",
                "category_id": category_id
            }))
            .unwrap();
            let payload: Value = serde_json::from_str(&result).unwrap();
            let path = payload.get("path").and_then(Value::as_str).unwrap();

            assert!(path.starts_with("devops/"), "{path}");
            assert!(!path.contains("/devops/devops"));
        });
    }
}
