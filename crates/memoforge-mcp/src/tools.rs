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
    AGENT_NAME.lock().unwrap()
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
    MODE.lock().unwrap().clone().unwrap_or_else(|| "bound".to_string())
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
            "Get current editor state, including mode, desktop status, current knowledge base, current knowledge, selection info, active agents, and state validity.",
            json!({
                "type": "object",
                "properties": {}
            }),
        ),
        tool(
            "get_status",
            "Get knowledge base status, category counts, Git availability, and current access mode.",
            json!({
                "type": "object",
                "properties": {}
            }),
        ),
        tool(
            "get_config",
            "Get knowledge base configuration and registered categories. Call this before creating new knowledge.",
            json!({
                "type": "object",
                "properties": {}
            }),
        ),
        tool(
            "list_knowledge",
            "List knowledge entries with optional filtering. Use this as the first step to explore the knowledge base.",
            json!({
                "type": "object",
                "properties": {
                    "level": {
                        "type": "string",
                        "enum": ["L0", "L1"],
                        "description": "L0: metadata only, L1: include summary"
                    },
                    "path": {
                        "type": "string",
                        "description": "Optional category or directory prefix filter"
                    },
                    "category_id": { "type": "string" },
                    "tags": { "type": "array", "items": { "type": "string" } },
                    "limit": { "type": "integer" },
                    "offset": { "type": "integer" }
                }
            }),
        ),
        tool(
            "get_summary",
            "Get summary-level knowledge data (L1), including summary staleness information.",
            json!({
                "type": "object",
                "properties": {
                    "path": { "type": "string" },
                    "id": { "type": "string" }
                },
                "required": ["path"]
            }),
        ),
        tool(
            "get_content",
            "Get full knowledge content (L2). Supports an optional section index or section title.",
            json!({
                "type": "object",
                "properties": {
                    "path": { "type": "string" },
                    "id": { "type": "string" },
                    "section": {
                        "description": "Optional section index (integer) or exact section title (string)",
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
            "Get full knowledge data together with a boolean that indicates whether the summary is stale.",
            json!({
                "type": "object",
                "properties": {
                    "path": { "type": "string" },
                    "id": { "type": "string" }
                },
                "required": ["path"]
            }),
        ),
        tool(
            "grep",
            "Search knowledge content by regex or substring. Supports tag and category filtering.",
            json!({
                "type": "object",
                "properties": {
                    "pattern": { "type": "string" },
                    "query": { "type": "string" },
                    "tags": { "type": "array", "items": { "type": "string" } },
                    "path": { "type": "string" },
                    "category_id": { "type": "string" },
                    "limit": { "type": "integer" },
                    "options": {
                        "type": "object",
                        "properties": {
                            "max_results": { "type": "integer" }
                        }
                    }
                }
            }),
        ),
        tool(
            "get_tags",
            "List all tags used in the knowledge base, with optional prefix filtering.",
            json!({
                "type": "object",
                "properties": {
                    "prefix": { "type": "string" }
                }
            }),
        ),
        tool(
            "get_backlinks",
            "Get all knowledge entries that reference the specified knowledge entry.",
            json!({
                "type": "object",
                "properties": {
                    "path": { "type": "string" },
                    "id": { "type": "string" }
                },
                "required": ["path"]
            }),
        ),
        tool(
            "get_related",
            "Get related knowledge based on outgoing links, backlinks, and shared tags.",
            json!({
                "type": "object",
                "properties": {
                    "path": { "type": "string" },
                    "id": { "type": "string" }
                },
                "required": ["path"]
            }),
        ),
        tool(
            "get_knowledge_graph",
            "Get the knowledge graph with nodes and edges representing relationships between knowledge entries.",
            json!({
                "type": "object",
                "properties": {}
            }),
        ),
        tool(
            "create_knowledge",
            "Create a new knowledge entry. Supports either docs-style path metadata input or legacy title/category input.",
            json!({
                "type": "object",
                "properties": {
                    "path": { "type": "string" },
                    "content": { "type": "string" },
                    "metadata": {
                        "type": "object",
                        "properties": {
                            "title": { "type": "string" },
                            "tags": { "type": "array", "items": { "type": "string" } },
                            "summary": { "type": "string" }
                        }
                    },
                    "title": { "type": "string" },
                    "tags": { "type": "array", "items": { "type": "string" } },
                    "category_id": { "type": "string" },
                    "summary": { "type": "string" }
                },
                "required": ["content"]
            }),
        ),
        tool(
            "update_knowledge",
            "Update knowledge content and/or metadata. Supports both docs-style path input and legacy id input.",
            json!({
                "type": "object",
                "properties": {
                    "path": { "type": "string" },
                    "id": { "type": "string" },
                    "content": { "type": "string" },
                    "metadata": {
                        "type": "object",
                        "properties": {
                            "title": { "type": "string" },
                            "tags": { "type": "array", "items": { "type": "string" } },
                            "summary": { "type": "string" },
                            "category": { "type": "string" }
                        }
                    },
                    "title": { "type": "string" },
                    "tags": { "type": "array", "items": { "type": "string" } },
                    "summary": { "type": "string" },
                    "category_id": { "type": "string" }
                }
            }),
        ),
        tool(
            "update_metadata",
            "Update knowledge frontmatter only. Suitable for summary, tags, and title updates.",
            json!({
                "type": "object",
                "properties": {
                    "path": { "type": "string" },
                    "id": { "type": "string" },
                    "metadata": {
                        "type": "object",
                        "properties": {
                            "title": { "type": "string" },
                            "tags": { "type": "array", "items": { "type": "string" } },
                            "summary": { "type": "string" }
                        }
                    },
                    "title": { "type": "string" },
                    "tags": { "type": "array", "items": { "type": "string" } },
                    "summary": { "type": "string" }
                }
            }),
        ),
        tool(
            "delete_knowledge",
            "Delete a knowledge entry. Docs-style path calls default to dry-run preview; set dry_run=false to actually delete.",
            json!({
                "type": "object",
                "properties": {
                    "path": { "type": "string" },
                    "id": { "type": "string" },
                    "dry_run": { "type": "boolean" }
                }
            }),
        ),
        tool(
            "move_knowledge",
            "Move a knowledge entry to another category. Docs-style from/to calls default to dry-run preview.",
            json!({
                "type": "object",
                "properties": {
                    "from": { "type": "string" },
                    "to": { "type": "string" },
                    "path": { "type": "string" },
                    "id": { "type": "string" },
                    "new_category_id": { "type": "string" },
                    "dry_run": { "type": "boolean" }
                }
            }),
        ),
        tool(
            "create_category",
            "Create a category. Supports docs-style path/label input and legacy name input.",
            json!({
                "type": "object",
                "properties": {
                    "path": { "type": "string" },
                    "label": { "type": "string" },
                    "name": { "type": "string" },
                    "parent_id": { "type": "string" },
                    "description": { "type": "string" }
                }
            }),
        ),
        tool(
            "list_categories",
            "List all registered categories.",
            json!({
                "type": "object",
                "properties": {}
            }),
        ),
        tool(
            "update_category",
            "Update category display name or description.",
            json!({
                "type": "object",
                "properties": {
                    "id": { "type": "string" },
                    "path": { "type": "string" },
                    "name": { "type": "string" },
                    "label": { "type": "string" },
                    "description": { "type": "string" }
                }
            }),
        ),
        tool(
            "delete_category",
            "Delete a category registration.",
            json!({
                "type": "object",
                "properties": {
                    "id": { "type": "string" },
                    "path": { "type": "string" },
                    "force": { "type": "boolean" }
                }
            }),
        ),
        tool(
            "git_status",
            "Get the current Git status for the knowledge base repository.",
            json!({
                "type": "object",
                "properties": {}
            }),
        ),
        tool(
            "git_commit",
            "Commit current repository changes with an optional commit message.",
            json!({
                "type": "object",
                "properties": {
                    "message": { "type": "string" }
                }
            }),
        ),
        tool(
            "git_pull",
            "Pull remote changes into the local repository.",
            json!({
                "type": "object",
                "properties": {}
            }),
        ),
        tool(
            "git_push",
            "Push local commits to the configured remote. Defaults to dry-run preview.",
            json!({
                "type": "object",
                "properties": {
                    "dry_run": { "type": "boolean" }
                }
            }),
        ),
        tool(
            "git_log",
            "Get recent Git commit history for the repository.",
            json!({
                "type": "object",
                "properties": {
                    "limit": { "type": "integer" }
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
    metadata_object(args).and_then(|metadata| metadata.get(key)).and_then(Value::as_str)
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
    let category_id = optional_str_arg(&args, &["category_id", "path"]);
    let tags = optional_string_array_arg(&args, &["tags"]);
    let limit = optional_usize_arg(&args, &["limit"]);
    let offset = optional_usize_arg(&args, &["offset"]);

    let knowledge = memoforge_core::list_knowledge(
        &kb_path,
        level,
        category_id,
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
    let section_titles = sections.iter().map(|section| section.title.clone()).collect::<Vec<_>>();
    let section_arg = extract_section_argument(&args);
    let content = if let Some(section_value) = section_arg {
        if let Ok(section_index) = section_value.parse::<usize>() {
            sections
                .get(section_index)
                .map(|section| section.content.clone())
                .ok_or_else(|| invalid_arg(format!("Section index out of range: {}", section_index)))?
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

    let title = required_str_arg(&args, &["title"])?;
    let content = required_str_arg(&args, &["content"])?;
    let tags = optional_string_array_arg(&args, &["tags"]).unwrap_or_default();
    let category = optional_str_arg(&args, &["category_id"]).map(String::from);
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
        .or_else(|| optional_str_arg(&args, &["category", "category_id"]));
    let summary =
        metadata_str_arg(&args, "summary").or_else(|| optional_str_arg(&args, &["summary"]));

    memoforge_core::update_knowledge(&kb_path, id, title, content, tags, category, summary)?;
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
            let preview =
                memoforge_core::preview_move_knowledge_to_path(&kb_path, source, &normalized_target)?;
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
        let category = required_str_arg(&args, &["new_category_id"])?;
        if dry_run {
            let preview = memoforge_core::preview_move_knowledge(&kb_path, source, category)?;
            return Ok(json!({
                "dry_run": true,
                "from": preview.old_path,
                "to": preview.new_path,
                "title": preview.title,
                "affected_files": preview.references
            })
            .to_string());
        }

        let preview = memoforge_core::preview_move_knowledge(&kb_path, source, category)?;
        memoforge_core::move_knowledge(&kb_path, source, category)?;
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
    let category_id = optional_str_arg(&args, &["path", "category_id"]);
    let limit = optional_usize_arg(&args, &["limit"]).or_else(|| {
        args.get("options")
            .and_then(|value| value.get("max_results"))
            .and_then(|value| value.as_u64())
            .map(|value| value as usize)
    });

    let results = memoforge_core::grep(&kb_path, query, tags.as_deref(), category_id, limit)?;
    Ok(json!({ "results": results, "total": results.len() }).to_string())
}

fn handle_list_categories(_args: Value) -> Result<String, MemoError> {
    let kb_path = get_kb_path()?;
    let categories = memoforge_core::list_categories(&kb_path)?;
    Ok(json!({ "categories": categories }).to_string())
}

fn handle_create_category(args: Value) -> Result<String, MemoError> {
    let kb_path = get_kb_path()?;
    let description = optional_str_arg(&args, &["description"]).map(String::from);

    if let Some(path) = optional_str_arg(&args, &["path"]) {
        let category_id = memoforge_core::create_category(&kb_path, path, None, description.clone())?;
        if let Some(label) = optional_str_arg(&args, &["label"]) {
            if label != path {
                memoforge_core::update_category(&kb_path, &category_id, Some(label), description.as_deref())?;
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
        .or_else(|| kb_path.file_name().and_then(|value| value.to_str()).map(String::from))
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
    let _ = memoforge_core::log_git_commit(&kb_path, EventSource::Mcp, message, pending_files.len());
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
