//! MemoForge Desktop Application
//! 参考: 技术实现文档 §2.3

use memoforge_core::{
    init_store, MemoError, Knowledge, Category, LoadLevel,
    git::{git_pull, git_push, git_commit, git_log, git_diff, GitCommit},
    init::{init_open, init_new},
    list_knowledge, get_knowledge_by_id, create_knowledge, update_knowledge,
    delete_knowledge, move_knowledge, search_knowledge,
    list_categories, create_category, update_category, delete_category,
    get_tags,
};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Mutex;

// 全局状态：知识库路径
static KB_PATH: Mutex<Option<PathBuf>> = Mutex::new(None);

#[derive(Debug, Serialize, Deserialize)]
struct KnowledgePatch {
    title: Option<String>,
    content: Option<String>,
    tags: Option<Vec<String>>,
    category: Option<String>,
    summary: Option<String>,
}

#[derive(Debug, Serialize)]
struct StatusResponse {
    initialized: bool,
    kb_path: Option<String>,
}

// 辅助函数：转换 MemoError 为 Tauri Result
fn to_tauri_error(e: MemoError) -> String {
    serde_json::to_string(&e).unwrap_or_else(|_| e.message)
}

fn get_kb_path() -> Result<PathBuf, String> {
    KB_PATH.lock().unwrap()
        .clone()
        .ok_or_else(|| "Knowledge base not initialized".to_string())
}

// 初始化命令
#[tauri::command]
fn init_kb_cmd(path: String, mode: String) -> Result<(), String> {
    let kb_path = PathBuf::from(&path);

    match mode.as_str() {
        "open" => init_open(&kb_path).map_err(to_tauri_error)?,
        "new" => init_new(&kb_path, false).map_err(to_tauri_error)?,
        "clone" => return Err("Clone not supported in this command".to_string()),
        _ => return Err("Invalid mode".to_string()),
    }

    init_store(kb_path.clone()).map_err(to_tauri_error)?;
    *KB_PATH.lock().unwrap() = Some(kb_path);
    Ok(())
}

#[tauri::command]
fn get_status_cmd() -> Result<StatusResponse, String> {
    let kb_path = KB_PATH.lock().unwrap().clone();
    Ok(StatusResponse {
        initialized: kb_path.is_some(),
        kb_path: kb_path.map(|p| p.to_string_lossy().to_string()),
    })
}

// 知识管理命令
#[tauri::command]
fn list_knowledge_cmd(
    level: u8,
    category_id: Option<String>,
    tags: Option<Vec<String>>,
    limit: Option<usize>,
    offset: Option<usize>,
) -> Result<Vec<Knowledge>, String> {
    let kb_path = get_kb_path()?;
    let load_level = match level {
        0 => LoadLevel::L0,
        1 => LoadLevel::L1,
        _ => LoadLevel::L2,
    };

    list_knowledge(
        &kb_path,
        load_level,
        category_id.as_deref(),
        tags.as_deref(),
        limit,
        offset,
    ).map_err(to_tauri_error)
}

#[tauri::command]
fn get_knowledge_cmd(id: String, level: u8) -> Result<Knowledge, String> {
    let kb_path = get_kb_path()?;
    let load_level = match level {
        0 => LoadLevel::L0,
        1 => LoadLevel::L1,
        _ => LoadLevel::L2,
    };

    get_knowledge_by_id(&kb_path, &id, load_level).map_err(to_tauri_error)
}

#[tauri::command]
fn create_knowledge_cmd(
    title: String,
    content: String,
    tags: Vec<String>,
    category_id: Option<String>,
    summary: Option<String>,
) -> Result<String, String> {
    let kb_path = get_kb_path()?;
    create_knowledge(&kb_path, &title, &content, tags, category_id, summary)
        .map_err(to_tauri_error)
}

#[tauri::command]
fn update_knowledge_cmd(id: String, patch: KnowledgePatch) -> Result<(), String> {
    let kb_path = get_kb_path()?;
    update_knowledge(
        &kb_path,
        &id,
        patch.title.as_deref(),
        patch.content.as_deref(),
        patch.tags,
        patch.summary.as_deref(),
    ).map_err(to_tauri_error)
}

#[tauri::command]
fn delete_knowledge_cmd(id: String) -> Result<(), String> {
    let kb_path = get_kb_path()?;
    delete_knowledge(&kb_path, &id).map_err(to_tauri_error)
}

#[tauri::command]
fn move_knowledge_cmd(id: String, new_category_id: String) -> Result<(), String> {
    let kb_path = get_kb_path()?;
    move_knowledge(&kb_path, &id, &new_category_id).map_err(to_tauri_error)
}

#[tauri::command]
fn search_knowledge_cmd(
    query: String,
    tags: Option<Vec<String>>,
    category_id: Option<String>,
    limit: Option<usize>,
) -> Result<Vec<Knowledge>, String> {
    let kb_path = get_kb_path()?;
    search_knowledge(&kb_path, &query, tags.as_deref(), category_id.as_deref(), limit)
        .map_err(to_tauri_error)
}

// 分类管理命令
#[tauri::command]
fn list_categories_cmd() -> Result<Vec<Category>, String> {
    let kb_path = get_kb_path()?;
    list_categories(&kb_path).map_err(to_tauri_error)
}

#[tauri::command]
fn create_category_cmd(
    name: String,
    parent_id: Option<String>,
    description: Option<String>,
) -> Result<String, String> {
    let kb_path = get_kb_path()?;
    create_category(&kb_path, &name, parent_id, description).map_err(to_tauri_error)
}

#[tauri::command]
fn update_category_cmd(
    id: String,
    name: Option<String>,
    description: Option<String>,
) -> Result<(), String> {
    let kb_path = get_kb_path()?;
    update_category(&kb_path, &id, name.as_deref(), description.as_deref())
        .map_err(to_tauri_error)
}

#[tauri::command]
fn delete_category_cmd(id: String, force: bool) -> Result<(), String> {
    let kb_path = get_kb_path()?;
    delete_category(&kb_path, &id, force).map_err(to_tauri_error)
}

// Git 命令
#[tauri::command]
fn git_pull_cmd() -> Result<(), String> {
    let kb_path = get_kb_path()?;
    git_pull(&kb_path).map_err(to_tauri_error)
}

#[tauri::command]
fn git_push_cmd() -> Result<(), String> {
    let kb_path = get_kb_path()?;
    git_push(&kb_path).map_err(to_tauri_error)
}

#[tauri::command]
fn git_commit_cmd(message: String) -> Result<(), String> {
    let kb_path = get_kb_path()?;
    git_commit(&kb_path, &message).map_err(to_tauri_error)
}

#[tauri::command]
fn git_log_cmd(limit: usize) -> Result<Vec<GitCommit>, String> {
    let kb_path = get_kb_path()?;
    git_log(&kb_path, limit).map_err(to_tauri_error)
}

#[tauri::command]
fn git_diff_cmd() -> Result<String, String> {
    let kb_path = get_kb_path()?;
    git_diff(&kb_path).map_err(to_tauri_error)
}

// 标签命令
#[tauri::command]
fn get_tags_cmd(prefix: Option<String>) -> Result<Vec<String>, String> {
    let kb_path = get_kb_path()?;
    get_tags(&kb_path, prefix.as_deref()).map_err(to_tauri_error)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            init_kb_cmd,
            get_status_cmd,
            list_knowledge_cmd,
            get_knowledge_cmd,
            create_knowledge_cmd,
            update_knowledge_cmd,
            delete_knowledge_cmd,
            move_knowledge_cmd,
            search_knowledge_cmd,
            list_categories_cmd,
            create_category_cmd,
            update_category_cmd,
            delete_category_cmd,
            git_pull_cmd,
            git_push_cmd,
            git_commit_cmd,
            git_log_cmd,
            git_diff_cmd,
            get_tags_cmd,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
