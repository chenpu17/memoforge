//! MCP Tools Implementation
//! 参考: 技术实现文档 §4

use memoforge_core::config::load_config;
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
    vec![
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
    ]
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
    let dry_run = optional_bool_arg(&args, &["dry_run"]).unwrap_or(args.get("path").is_some());

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
    let dry_run = optional_bool_arg(&args, &["dry_run"]).unwrap_or(move_target.is_some());

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

    let results =
        memoforge_core::grep(&kb_path, query, tags.as_deref(), category_id.as_deref(), limit)?;
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
        let one_of = schema
            .get("oneOf")
            .and_then(Value::as_array)
            .unwrap();
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
