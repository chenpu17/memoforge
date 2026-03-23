//! MCP Tools Implementation
//! 参考: 技术实现文档 §4

use memoforge_core::{ErrorCode, MemoError, LoadLevel};
use serde_json::{json, Value};
use std::path::PathBuf;
use std::sync::Mutex;

static KB_PATH: Mutex<Option<PathBuf>> = Mutex::new(None);

pub fn set_kb_path(path: PathBuf) {
    *KB_PATH.lock().unwrap() = Some(path);
}

fn get_kb_path() -> Result<PathBuf, MemoError> {
    KB_PATH.lock().unwrap().clone().ok_or_else(|| MemoError {
        code: ErrorCode::NotInitialized,
        message: "Knowledge base not initialized".to_string(),
        retry_after_ms: None,
        context: None,
    })
}

pub fn list_tools() -> Vec<Value> {
    vec![
        json!({
            "name": "list_knowledge",
            "description": "List knowledge entries with optional filtering",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "level": {
                        "type": "string",
                        "enum": ["L0", "L1"],
                        "description": "L0: metadata only, L1: include summary"
                    },
                    "category_id": { "type": "string" },
                    "tags": { "type": "array", "items": { "type": "string" } },
                    "limit": { "type": "integer" },
                    "offset": { "type": "integer" }
                }
            }
        }),
        json!({
            "name": "get_knowledge",
            "description": "Get a single knowledge entry by ID",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "id": { "type": "string" },
                    "level": {
                        "type": "string",
                        "enum": ["L0", "L1", "L2"],
                        "description": "L0: metadata, L1: +summary, L2: +full content"
                    }
                },
                "required": ["id", "level"]
            }
        }),
        json!({
            "name": "create_knowledge",
            "description": "Create a new knowledge entry",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "title": { "type": "string" },
                    "content": { "type": "string" },
                    "tags": { "type": "array", "items": { "type": "string" } },
                    "category_id": { "type": "string" },
                    "summary": { "type": "string" }
                },
                "required": ["title", "content"]
            }
        }),
        json!({
            "name": "update_knowledge",
            "description": "Update knowledge entry (partial update)",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "id": { "type": "string" },
                    "title": { "type": "string" },
                    "content": { "type": "string" },
                    "tags": { "type": "array", "items": { "type": "string" } },
                    "summary": { "type": "string" }
                },
                "required": ["id"]
            }
        }),
        json!({
            "name": "delete_knowledge",
            "description": "Delete a knowledge entry",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "id": { "type": "string" }
                },
                "required": ["id"]
            }
        }),
        json!({
            "name": "move_knowledge",
            "description": "Move knowledge to a different category",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "id": { "type": "string" },
                    "new_category_id": { "type": "string" }
                },
                "required": ["id", "new_category_id"]
            }
        }),
        json!({
            "name": "search_knowledge",
            "description": "Search knowledge entries by query",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "query": { "type": "string" },
                    "tags": { "type": "array", "items": { "type": "string" } },
                    "category_id": { "type": "string" },
                    "limit": { "type": "integer" }
                },
                "required": ["query"]
            }
        }),
        json!({
            "name": "list_categories",
            "description": "List all categories in tree structure",
            "inputSchema": {
                "type": "object",
                "properties": {}
            }
        }),
        json!({
            "name": "create_category",
            "description": "Create a new category",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "name": { "type": "string" },
                    "parent_id": { "type": "string" },
                    "description": { "type": "string" }
                },
                "required": ["name"]
            }
        }),
        json!({
            "name": "update_category",
            "description": "Update category metadata",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "id": { "type": "string" },
                    "name": { "type": "string" },
                    "description": { "type": "string" }
                },
                "required": ["id"]
            }
        }),
        json!({
            "name": "delete_category",
            "description": "Delete a category",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "id": { "type": "string" },
                    "force": { "type": "boolean" }
                },
                "required": ["id"]
            }
        }),
        json!({
            "name": "get_status",
            "description": "Get knowledge base status",
            "inputSchema": {
                "type": "object",
                "properties": {}
            }
        }),
        json!({
            "name": "get_tags",
            "description": "Get all tags from knowledge base",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "prefix": { "type": "string", "description": "Filter tags by prefix" }
                }
            }
        }),
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
        "list_knowledge" => handle_list_knowledge(arguments),
        "get_knowledge" => handle_get_knowledge(arguments),
        "create_knowledge" => check_readonly(readonly, || handle_create_knowledge(arguments)),
        "update_knowledge" => check_readonly(readonly, || handle_update_knowledge(arguments)),
        "delete_knowledge" => check_readonly(readonly, || handle_delete_knowledge(arguments)),
        "move_knowledge" => check_readonly(readonly, || handle_move_knowledge(arguments)),
        "search_knowledge" => handle_search_knowledge(arguments),
        "list_categories" => handle_list_categories(arguments),
        "create_category" => check_readonly(readonly, || handle_create_category(arguments)),
        "update_category" => check_readonly(readonly, || handle_update_category(arguments)),
        "delete_category" => check_readonly(readonly, || handle_delete_category(arguments)),
        "get_status" => handle_get_status(arguments),
        "get_tags" => handle_get_tags(arguments),
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

// Tool handlers (stub implementations for Sprint 3)
fn handle_list_knowledge(args: Value) -> Result<String, MemoError> {
    let kb_path = get_kb_path()?;
    let level = match args.get("level").and_then(|v| v.as_str()) {
        Some("L0") => LoadLevel::L0,
        Some("L1") => LoadLevel::L1,
        _ => LoadLevel::L0,
    };
    let category_id = args.get("category_id").and_then(|v| v.as_str());
    let tags = args.get("tags").and_then(|v| v.as_array()).map(|arr| {
        arr.iter().filter_map(|v| v.as_str().map(String::from)).collect::<Vec<_>>()
    });
    let limit = args.get("limit").and_then(|v| v.as_u64()).map(|v| v as usize);
    let offset = args.get("offset").and_then(|v| v.as_u64()).map(|v| v as usize);

    let knowledge = memoforge_core::list_knowledge(
        &kb_path, level, category_id, tags.as_deref(), limit, offset
    )?;

    Ok(json!({ "knowledge": knowledge, "total": knowledge.len() }).to_string())
}

fn handle_get_knowledge(args: Value) -> Result<String, MemoError> {
    let kb_path = get_kb_path()?;
    let id = args.get("id").and_then(|v| v.as_str()).ok_or_else(|| MemoError {
        code: ErrorCode::InvalidPath,
        message: "Missing id".to_string(),
        retry_after_ms: None,
        context: None,
    })?;
    let level = match args.get("level").and_then(|v| v.as_str()) {
        Some("L0") => LoadLevel::L0,
        Some("L1") => LoadLevel::L1,
        Some("L2") => LoadLevel::L2,
        _ => LoadLevel::L2,
    };

    let knowledge = memoforge_core::get_knowledge_by_id(&kb_path, id, level)?;
    Ok(serde_json::to_string(&knowledge).unwrap())
}

fn handle_create_knowledge(args: Value) -> Result<String, MemoError> {
    let kb_path = get_kb_path()?;
    let title = args.get("title").and_then(|v| v.as_str()).ok_or_else(|| MemoError {
        code: ErrorCode::InvalidPath,
        message: "Missing title".to_string(),
        retry_after_ms: None,
        context: None,
    })?;
    let content = args.get("content").and_then(|v| v.as_str()).ok_or_else(|| MemoError {
        code: ErrorCode::InvalidPath,
        message: "Missing content".to_string(),
        retry_after_ms: None,
        context: None,
    })?;
    let tags = args.get("tags").and_then(|v| v.as_array()).map(|arr| {
        arr.iter().filter_map(|v| v.as_str().map(String::from)).collect()
    }).unwrap_or_default();
    let category = args.get("category_id").and_then(|v| v.as_str()).map(String::from);
    let summary = args.get("summary").and_then(|v| v.as_str()).map(String::from);

    let id = memoforge_core::create_knowledge(&kb_path, title, content, tags, category, summary)?;
    Ok(json!({ "id": id, "created": true }).to_string())
}

fn handle_update_knowledge(args: Value) -> Result<String, MemoError> {
    let kb_path = get_kb_path()?;
    let id = args.get("id").and_then(|v| v.as_str()).ok_or_else(|| MemoError {
        code: ErrorCode::InvalidPath,
        message: "Missing id".to_string(),
        retry_after_ms: None,
        context: None,
    })?;
    let title = args.get("title").and_then(|v| v.as_str());
    let content = args.get("content").and_then(|v| v.as_str());
    let tags = args.get("tags").and_then(|v| v.as_array()).map(|arr| {
        arr.iter().filter_map(|v| v.as_str().map(String::from)).collect()
    });
    let summary = args.get("summary").and_then(|v| v.as_str());

    memoforge_core::update_knowledge(&kb_path, id, title, content, tags, summary)?;
    Ok(json!({ "updated": true }).to_string())
}

fn handle_delete_knowledge(args: Value) -> Result<String, MemoError> {
    let kb_path = get_kb_path()?;
    let id = args.get("id").and_then(|v| v.as_str()).ok_or_else(|| MemoError {
        code: ErrorCode::InvalidPath,
        message: "Missing id".to_string(),
        retry_after_ms: None,
        context: None,
    })?;

    memoforge_core::delete_knowledge(&kb_path, id)?;
    Ok(json!({ "deleted": true }).to_string())
}

fn handle_move_knowledge(args: Value) -> Result<String, MemoError> {
    let kb_path = get_kb_path()?;
    let id = args.get("id").and_then(|v| v.as_str()).ok_or_else(|| MemoError {
        code: ErrorCode::InvalidPath,
        message: "Missing id".to_string(),
        retry_after_ms: None,
        context: None,
    })?;
    let new_category_id = args.get("new_category_id").and_then(|v| v.as_str()).ok_or_else(|| MemoError {
        code: ErrorCode::InvalidPath,
        message: "Missing new_category_id".to_string(),
        retry_after_ms: None,
        context: None,
    })?;

    memoforge_core::move_knowledge(&kb_path, id, new_category_id)?;
    Ok(json!({ "moved": true }).to_string())
}

fn handle_search_knowledge(args: Value) -> Result<String, MemoError> {
    let kb_path = get_kb_path()?;
    let query = args.get("query").and_then(|v| v.as_str()).ok_or_else(|| MemoError {
        code: ErrorCode::InvalidPath,
        message: "Missing query".to_string(),
        retry_after_ms: None,
        context: None,
    })?;
    let tags = args.get("tags").and_then(|v| v.as_array()).map(|arr| {
        arr.iter().filter_map(|v| v.as_str().map(String::from)).collect::<Vec<_>>()
    });
    let category_id = args.get("category_id").and_then(|v| v.as_str());
    let limit = args.get("limit").and_then(|v| v.as_u64()).map(|v| v as usize);

    let results = memoforge_core::search_knowledge(&kb_path, query, tags.as_deref(), category_id, limit)?;
    Ok(json!({ "results": results, "total": results.len() }).to_string())
}

fn handle_list_categories(_args: Value) -> Result<String, MemoError> {
    let kb_path = get_kb_path()?;
    let categories = memoforge_core::list_categories(&kb_path)?;
    Ok(json!({ "categories": categories }).to_string())
}

fn handle_create_category(args: Value) -> Result<String, MemoError> {
    let kb_path = get_kb_path()?;
    let name = args.get("name").and_then(|v| v.as_str()).ok_or_else(|| MemoError {
        code: ErrorCode::InvalidPath,
        message: "Missing name".to_string(),
        retry_after_ms: None,
        context: None,
    })?;
    let parent_id = args.get("parent_id").and_then(|v| v.as_str()).map(String::from);
    let description = args.get("description").and_then(|v| v.as_str()).map(String::from);

    let id = memoforge_core::create_category(&kb_path, name, parent_id, description)?;
    Ok(json!({ "id": id, "created": true }).to_string())
}

fn handle_update_category(args: Value) -> Result<String, MemoError> {
    let kb_path = get_kb_path()?;
    let id = args.get("id").and_then(|v| v.as_str()).ok_or_else(|| MemoError {
        code: ErrorCode::InvalidPath,
        message: "Missing id".to_string(),
        retry_after_ms: None,
        context: None,
    })?;
    let name = args.get("name").and_then(|v| v.as_str());
    let description = args.get("description").and_then(|v| v.as_str());

    memoforge_core::update_category(&kb_path, id, name, description)?;
    Ok(json!({ "updated": true }).to_string())
}

fn handle_delete_category(args: Value) -> Result<String, MemoError> {
    let kb_path = get_kb_path()?;
    let id = args.get("id").and_then(|v| v.as_str()).ok_or_else(|| MemoError {
        code: ErrorCode::InvalidPath,
        message: "Missing id".to_string(),
        retry_after_ms: None,
        context: None,
    })?;
    let force = args.get("force").and_then(|v| v.as_bool()).unwrap_or(false);

    memoforge_core::delete_category(&kb_path, id, force)?;
    Ok(json!({ "deleted": true }).to_string())
}

fn handle_get_status(_args: Value) -> Result<String, MemoError> {
    let kb_path = get_kb_path()?;
    let (knowledge_count, category_count, git_initialized) = memoforge_core::get_status(&kb_path)?;
    Ok(json!({
        "knowledge_count": knowledge_count,
        "category_count": category_count,
        "git_initialized": git_initialized
    }).to_string())
}

fn handle_get_tags(args: Value) -> Result<String, MemoError> {
    let kb_path = get_kb_path()?;
    let prefix = args.get("prefix").and_then(|v| v.as_str());
    let tags = memoforge_core::get_tags(&kb_path, prefix)?;
    Ok(json!({ "tags": tags, "total": tags.len() }).to_string())
}
