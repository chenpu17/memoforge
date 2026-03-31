//! MemoForge Desktop Application
//! 参考: 技术实现文档 §2.3

mod desktop_state_publisher;
mod memory_state;

use desktop_state_publisher::DesktopStatePublisher;
use memory_state::StateManager;

use chrono::Utc;
use std::fs::{self, OpenOptions};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use memoforge_core::{
    agent::{get_active_agents, get_agent_count, AgentInfo},
    api::{get_knowledge_graph, PaginatedKnowledge},
    close_store, complete_knowledge_links, create_category, create_knowledge, delete_category,
    delete_knowledge, get_knowledge_by_id, get_knowledge_with_stale, get_tags,
    get_tags_with_counts,
    git::{git_commit, git_diff, git_log, git_pull, git_push, git_status, is_git_repo, GitCommit},
    grep,
    import::{import_markdown_folder, preview_import, ImportOptions, ImportStats},
    init::{init_new, init_open, is_initialized},
    init_store,
    links::{
        get_backlinks, get_outgoing_links, get_related, BacklinksResult, KnowledgeGraph, LinkInfo,
        RelatedResult,
    },
    list_categories, list_knowledge, move_knowledge, preview_delete_knowledge,
    preview_move_knowledge, read_recent_events,
    registry::{
        get_current_kb, get_last_kb, get_recent_kbs, list_knowledge_bases, register_kb, switch_kb,
        unregister_kb, KnowledgeBaseInfo,
    },
    search_knowledge, update_category, update_knowledge, Category, DeletePreview, Event, GrepMatch,
    Knowledge, KnowledgeLinkCompletion, KnowledgeWithStale, LoadLevel, MemoError, MovePreview,
};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager, Runtime, Window};
use tauri_plugin_shell::ShellExt;

// 全局状态：知识库路径
static KB_PATH: Mutex<Option<PathBuf>> = Mutex::new(None);
static APP_LOG_FILE: Mutex<Option<PathBuf>> = Mutex::new(None);

// 全局状态发布器（兼容旧代码）
pub struct StatePublisher(pub Arc<Mutex<DesktopStatePublisher>>);

// 内存状态管理器（新架构）
pub struct MemoryState(pub Arc<StateManager>);

// 内嵌 SSE MCP Server 状态
pub struct McpServer(pub Arc<memoforge_mcp::sse::McpServerState>);

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

#[derive(Debug, Serialize, Deserialize)]
struct AssetPayload {
    file_name: String,
    mime_type: Option<String>,
    bytes: Vec<u8>,
}

#[derive(Debug, Serialize)]
struct ImportedAsset {
    file_name: String,
    relative_path: String,
    markdown: String,
    reused: bool,
}

#[derive(Debug, Serialize)]
struct AppDiagnostics {
    log_dir: String,
    log_file: String,
    current_kb: Option<String>,
    recent_logs: Vec<String>,
}

// 辅助函数：转换 MemoError 为 Tauri Result
fn to_tauri_error(e: MemoError) -> String {
    serde_json::to_string(&e).unwrap_or_else(|_| e.message)
}

fn get_kb_path() -> Result<PathBuf, String> {
    KB_PATH
        .lock()
        .unwrap()
        .clone()
        .ok_or_else(|| "Knowledge base not initialized".to_string())
}

fn sanitize_log_message(message: &str) -> String {
    message
        .replace('\n', " \\n ")
        .replace('\r', " ")
        .replace('\t', " ")
}

fn append_app_log(level: &str, scope: &str, message: &str) {
    let Some(log_file) = APP_LOG_FILE.lock().unwrap().clone() else {
        return;
    };

    let line = format!(
        "{} [{}] [{}] {}\n",
        Utc::now().to_rfc3339(),
        level,
        scope,
        sanitize_log_message(message)
    );

    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(log_file) {
        let _ = std::io::Write::write_all(&mut file, line.as_bytes());
    }
}

fn init_app_logging<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    let log_dir = app.path().app_log_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&log_dir).map_err(|e| e.to_string())?;
    let log_file = log_dir.join("memoforge-desktop.log");
    *APP_LOG_FILE.lock().unwrap() = Some(log_file.clone());
    append_app_log(
        "INFO",
        "startup",
        &format!("Desktop log initialized at {}", log_file.display()),
    );
    Ok(())
}

fn get_log_paths<R: Runtime>(app: &AppHandle<R>) -> Result<(PathBuf, PathBuf), String> {
    if let Some(log_file) = APP_LOG_FILE.lock().unwrap().clone() {
        let log_dir = log_file
            .parent()
            .map(PathBuf::from)
            .ok_or_else(|| "Invalid desktop log path".to_string())?;
        return Ok((log_dir, log_file));
    }

    let log_dir = app.path().app_log_dir().map_err(|e| e.to_string())?;
    Ok((log_dir.clone(), log_dir.join("memoforge-desktop.log")))
}

fn read_recent_log_lines(log_file: &Path, limit: usize) -> Vec<String> {
    let Ok(content) = fs::read_to_string(log_file) else {
        return Vec::new();
    };

    let mut lines = content
        .lines()
        .rev()
        .take(limit)
        .map(str::to_string)
        .collect::<Vec<_>>();
    lines.reverse();
    lines
}

fn is_empty_directory(path: &Path) -> Result<bool, String> {
    let mut entries = fs::read_dir(path).map_err(|e| e.to_string())?;
    Ok(entries.next().is_none())
}

fn prepare_kb_for_open(kb_path: &Path) -> Result<Option<&'static str>, String> {
    if is_initialized(kb_path) {
        init_open(kb_path).map_err(to_tauri_error)?;
        return Ok(None);
    }

    if !kb_path.exists() {
        return Err("所选目录不存在。请先创建目录，或选择一个已有目录。".to_string());
    }

    if !kb_path.is_dir() {
        return Err("所选路径不是文件夹。请选择一个目录作为知识库。".to_string());
    }

    if is_empty_directory(kb_path)? {
        init_new(kb_path, false).map_err(to_tauri_error)?;
        return Ok(Some("empty_dir_auto_initialized"));
    }

    Err("所选目录还不是 MemoForge 知识库。空目录会自动初始化；如果目录里已有文件，请先导入 Markdown，或选择一个已初始化目录。".to_string())
}

fn sanitize_asset_file_name(file_name: &str) -> String {
    let sanitized = file_name
        .chars()
        .map(|ch| match ch {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '-',
            c if c.is_control() => '-',
            c if c.is_whitespace() => '-',
            c => c,
        })
        .collect::<String>()
        .trim_matches('.')
        .trim_matches('-')
        .to_string();

    if sanitized.is_empty() {
        "asset".to_string()
    } else {
        sanitized
    }
}

fn build_asset_markdown(relative_path: &str, file_name: &str, mime_type: Option<&str>) -> String {
    if mime_type
        .map(|value| value.starts_with("image/"))
        .unwrap_or(false)
    {
        let alt_text = file_name
            .rsplit_once('.')
            .map(|(name, _)| name)
            .unwrap_or(file_name);
        format!("![{}]({})", alt_text, relative_path)
    } else {
        format!("[{}]({})", file_name, relative_path)
    }
}

fn resolve_unique_asset_path(assets_dir: &Path, file_name: &str) -> PathBuf {
    let sanitized_name = sanitize_asset_file_name(file_name);
    let candidate_path = assets_dir.join(&sanitized_name);
    if !candidate_path.exists() {
        return candidate_path;
    }

    let stem = Path::new(&sanitized_name)
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("asset");
    let extension = Path::new(&sanitized_name)
        .extension()
        .and_then(|value| value.to_str());

    let mut counter = 1;
    loop {
        let next_name = match extension {
            Some(ext) => format!("{}-{}.{}", stem, counter, ext),
            None => format!("{}-{}", stem, counter),
        };
        let next_path = assets_dir.join(next_name);
        if !next_path.exists() {
            return next_path;
        }
        counter += 1;
    }
}

fn find_existing_asset_by_content(assets_dir: &Path, bytes: &[u8]) -> Option<PathBuf> {
    let entries = std::fs::read_dir(assets_dir).ok()?;
    let expected_len = bytes.len() as u64;

    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }

        let Ok(metadata) = entry.metadata() else {
            continue;
        };
        if metadata.len() != expected_len {
            continue;
        }

        if std::fs::read(&path).ok().as_deref() == Some(bytes) {
            return Some(path);
        }
    }

    None
}

fn bootstrap_kb_from_env() {
    let Ok(path) = std::env::var("MEMOFORGE_TEST_KB_PATH") else {
        return;
    };

    let kb_path = PathBuf::from(path);
    if init_open(&kb_path).is_ok() && init_store(kb_path.clone()).is_ok() {
        let canonical_kb_path = std::fs::canonicalize(&kb_path).unwrap_or(kb_path.clone());
        *KB_PATH.lock().unwrap() = Some(canonical_kb_path.clone());
        let _ = register_kb(&canonical_kb_path, None);
        // 同步设置 tools 模块的 KB 路径（供 SSE 模式使用）
        memoforge_mcp::tools::set_kb_path(canonical_kb_path);
        memoforge_mcp::tools::set_mode("sse".to_string());
    }
}

fn sync_kb_state(
    publisher: &StatePublisher,
    memory_state: &MemoryState,
    kb_path: PathBuf,
) -> Result<KBInfo, String> {
    let canonical_kb_path = std::fs::canonicalize(&kb_path).unwrap_or(kb_path);
    let kb_info = get_kb_info(&canonical_kb_path)?;

    publisher.0.lock().unwrap().set_kb(
        canonical_kb_path.clone(),
        kb_info.name.clone(),
        kb_info.count,
    );
    memory_state.0.set_kb(
        canonical_kb_path.clone(),
        kb_info.name.clone(),
        kb_info.count,
    );

    memoforge_mcp::tools::set_kb_path(canonical_kb_path);

    Ok(kb_info)
}

// 初始化命令
#[tauri::command]
fn init_kb_cmd(
    publisher: tauri::State<StatePublisher>,
    memory_state: tauri::State<MemoryState>,
    path: String,
    mode: String,
) -> Result<(), String> {
    let kb_path = PathBuf::from(&path);

    let init_result = match mode.as_str() {
        "open" => prepare_kb_for_open(&kb_path),
        "new" => init_new(&kb_path, false)
            .map(|_| None)
            .map_err(to_tauri_error),
        "clone" => Err("Clone not supported in this command".to_string()),
        _ => Err("Invalid mode".to_string()),
    };

    let auto_init_reason = match init_result {
        Ok(reason) => reason,
        Err(error) => {
            append_app_log(
                "ERROR",
                "init_kb",
                &format!(
                    "Failed to initialize knowledge base {}: {}",
                    kb_path.display(),
                    error
                ),
            );
            return Err(error);
        }
    };

    init_store(kb_path.clone()).map_err(to_tauri_error)?;
    let canonical_kb_path = std::fs::canonicalize(&kb_path).unwrap_or(kb_path.clone());
    *KB_PATH.lock().unwrap() = Some(canonical_kb_path.clone());

    // 同步设置 tools 模块的 KB 路径（供 SSE 模式使用）
    memoforge_mcp::tools::set_kb_path(canonical_kb_path.clone());
    memoforge_mcp::tools::set_mode("sse".to_string());

    // 注册到知识库列表
    let _ = register_kb(&canonical_kb_path, None);

    sync_kb_state(&publisher, &memory_state, canonical_kb_path)?;

    let mut detail = format!("Opened knowledge base {}", path);
    if auto_init_reason == Some("empty_dir_auto_initialized") {
        detail.push_str(" (empty directory was automatically initialized)");
    }
    append_app_log("INFO", "init_kb", &detail);

    Ok(())
}

/// 辅助函数：获取知识库信息
fn get_kb_info(kb_path: &PathBuf) -> Result<KBInfo, String> {
    use memoforge_core::config::load_config;

    let config = load_config(kb_path).map_err(|e| e.to_string())?;
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

    // 获取知识点数量
    let result = memoforge_core::list_knowledge(
        kb_path,
        memoforge_core::LoadLevel::L0,
        None,
        None,
        None,
        None,
    )
    .map_err(|e| e.to_string())?;
    let count = result.total;

    Ok(KBInfo { name, count })
}

/// 知识库信息结构
struct KBInfo {
    name: String,
    count: usize,
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
    level: Option<u8>,
    category_id: Option<String>,
    tags: Option<Vec<String>>,
    limit: Option<usize>,
    offset: Option<usize>,
) -> Result<PaginatedKnowledge, String> {
    let kb_path = get_kb_path()?;
    let load_level = match level.unwrap_or(1) {
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
    )
    .map_err(to_tauri_error)
}

#[tauri::command]
fn get_knowledge_cmd(id: String, level: Option<u8>) -> Result<Knowledge, String> {
    let kb_path = get_kb_path()?;
    let load_level = match level.unwrap_or(2) {
        0 => LoadLevel::L0,
        1 => LoadLevel::L1,
        _ => LoadLevel::L2,
    };

    get_knowledge_by_id(&kb_path, &id, load_level).map_err(to_tauri_error)
}

#[tauri::command]
fn get_knowledge_with_stale_cmd(id: String) -> Result<KnowledgeWithStale, String> {
    let kb_path = get_kb_path()?;
    get_knowledge_with_stale(&kb_path, &id).map_err(to_tauri_error)
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
    create_knowledge(&kb_path, &title, &content, tags, category_id, summary).map_err(to_tauri_error)
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
        patch.category.as_deref(),
        patch.summary.as_deref(),
    )
    .map_err(to_tauri_error)
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
fn preview_delete_knowledge_cmd(id: String) -> Result<DeletePreview, String> {
    let kb_path = get_kb_path()?;
    preview_delete_knowledge(&kb_path, &id).map_err(to_tauri_error)
}

#[tauri::command]
fn preview_move_knowledge_cmd(id: String, new_category_id: String) -> Result<MovePreview, String> {
    let kb_path = get_kb_path()?;
    preview_move_knowledge(&kb_path, &id, &new_category_id).map_err(to_tauri_error)
}

#[tauri::command]
fn search_knowledge_cmd(
    query: String,
    tags: Option<Vec<String>>,
    category_id: Option<String>,
    limit: Option<usize>,
) -> Result<Vec<Knowledge>, String> {
    let kb_path = get_kb_path()?;
    search_knowledge(
        &kb_path,
        &query,
        tags.as_deref(),
        category_id.as_deref(),
        limit,
    )
    .map_err(to_tauri_error)
}

#[tauri::command]
fn complete_knowledge_links_cmd(
    query: String,
    limit: Option<usize>,
) -> Result<Vec<KnowledgeLinkCompletion>, String> {
    let kb_path = get_kb_path()?;
    complete_knowledge_links(&kb_path, &query, limit).map_err(to_tauri_error)
}

#[tauri::command]
fn grep_cmd(
    query: String,
    tags: Option<Vec<String>>,
    category_id: Option<String>,
    limit: Option<usize>,
) -> Result<Vec<GrepMatch>, String> {
    let kb_path = get_kb_path()?;
    grep(
        &kb_path,
        &query,
        tags.as_deref(),
        category_id.as_deref(),
        limit,
    )
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
    update_category(&kb_path, &id, name.as_deref(), description.as_deref()).map_err(to_tauri_error)
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
fn git_status_cmd() -> Result<Vec<String>, String> {
    let kb_path = get_kb_path()?;
    git_status(&kb_path).map_err(to_tauri_error)
}

#[tauri::command]
fn is_git_repo_cmd() -> Result<bool, String> {
    let kb_path = get_kb_path()?;
    Ok(is_git_repo(&kb_path))
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

#[tauri::command]
fn get_tags_with_counts_cmd() -> Result<Vec<(String, usize)>, String> {
    let kb_path = get_kb_path()?;
    get_tags_with_counts(&kb_path).map_err(to_tauri_error)
}

// 事件日志命令
#[tauri::command]
fn read_events_cmd(limit: usize) -> Result<Vec<Event>, String> {
    let kb_path = get_kb_path()?;
    read_recent_events(&kb_path, limit).map_err(|e| e.to_string())
}

// 导入命令
#[tauri::command]
fn import_folder_cmd(
    source_path: String,
    generate_frontmatter: bool,
    auto_categories: bool,
    dry_run: bool,
) -> Result<ImportStats, String> {
    let kb_path = get_kb_path()?;
    let options = ImportOptions {
        generate_frontmatter,
        auto_categories,
        dry_run,
    };
    import_markdown_folder(&kb_path, PathBuf::from(&source_path).as_path(), options)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn preview_import_cmd(source_path: String) -> Result<ImportStats, String> {
    let kb_path = get_kb_path()?;
    preview_import(&kb_path, PathBuf::from(&source_path).as_path()).map_err(|e| e.to_string())
}

// 多知识库管理命令
#[tauri::command]
fn list_kb_cmd() -> Result<Vec<KnowledgeBaseInfo>, String> {
    list_knowledge_bases().map_err(|e| e.to_string())
}

#[tauri::command]
fn get_current_kb_cmd() -> Result<Option<String>, String> {
    get_current_kb().map_err(|e| e.to_string())
}

#[tauri::command]
fn switch_kb_cmd(
    publisher: tauri::State<StatePublisher>,
    memory_state: tauri::State<MemoryState>,
    path: String,
) -> Result<(), String> {
    switch_kb(&path).map_err(|e| {
        let message = e.to_string();
        append_app_log(
            "ERROR",
            "switch_kb",
            &format!("Failed to switch knowledge base {}: {}", path, message),
        );
        message
    })?;

    let kb_path =
        std::fs::canonicalize(PathBuf::from(&path)).unwrap_or_else(|_| PathBuf::from(&path));

    // 更新全局 KB_PATH
    *KB_PATH.lock().unwrap() = Some(kb_path.clone());

    sync_kb_state(&publisher, &memory_state, kb_path)?;
    append_app_log(
        "INFO",
        "switch_kb",
        &format!("Switched knowledge base to {}", path),
    );

    Ok(())
}

#[tauri::command]
fn unregister_kb_cmd(path: String) -> Result<(), String> {
    unregister_kb(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn close_kb_cmd() -> Result<(), String> {
    close_store();
    *KB_PATH.lock().unwrap() = None;
    Ok(())
}

#[tauri::command]
fn get_recent_kbs_cmd(limit: Option<usize>) -> Result<Vec<KnowledgeBaseInfo>, String> {
    get_recent_kbs(limit.unwrap_or(10)).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_last_kb_cmd() -> Result<Option<String>, String> {
    get_last_kb().map_err(|e| e.to_string())
}

#[tauri::command]
async fn select_folder_cmd(app: tauri::AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;

    let folder_path = app.dialog().file().blocking_pick_folder();

    if let Some(path) = folder_path.as_ref() {
        append_app_log(
            "INFO",
            "select_folder",
            &format!("Selected folder {}", path),
        );
    } else {
        append_app_log("INFO", "select_folder", "Folder selection cancelled");
    }

    Ok(folder_path.map(|p| p.to_string()))
}

#[tauri::command]
fn get_app_diagnostics_cmd(app: tauri::AppHandle) -> Result<AppDiagnostics, String> {
    let (log_dir, log_file) = get_log_paths(&app)?;
    Ok(AppDiagnostics {
        log_dir: log_dir.to_string_lossy().to_string(),
        log_file: log_file.to_string_lossy().to_string(),
        current_kb: KB_PATH
            .lock()
            .unwrap()
            .as_ref()
            .map(|path| path.to_string_lossy().to_string()),
        recent_logs: read_recent_log_lines(&log_file, 20),
    })
}

#[tauri::command]
fn open_app_log_dir_cmd(app: tauri::AppHandle) -> Result<(), String> {
    let (log_dir, _) = get_log_paths(&app)?;
    #[allow(deprecated)]
    app.shell()
        .open(log_dir.to_string_lossy().to_string(), None)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn import_assets_cmd(
    knowledge_id: String,
    assets: Vec<AssetPayload>,
) -> Result<Vec<ImportedAsset>, String> {
    let kb_path = get_kb_path()?;
    let knowledge_path = kb_path.join(&knowledge_id);
    let knowledge_parent = knowledge_path.parent().unwrap_or(kb_path.as_path());
    let assets_dir = knowledge_parent.join("assets");

    std::fs::create_dir_all(&assets_dir).map_err(|error| {
        format!(
            "Failed to create assets directory {}: {}",
            assets_dir.display(),
            error
        )
    })?;

    let mut imported_assets = Vec::with_capacity(assets.len());

    for asset in assets {
        let (target_path, reused) = if let Some(existing_path) =
            find_existing_asset_by_content(&assets_dir, &asset.bytes)
        {
            (existing_path, true)
        } else {
            let next_path = resolve_unique_asset_path(&assets_dir, &asset.file_name);
            std::fs::write(&next_path, &asset.bytes).map_err(|error| {
                format!("Failed to write asset {}: {}", next_path.display(), error)
            })?;
            (next_path, false)
        };

        let saved_file_name = target_path
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or(&asset.file_name)
            .to_string();
        let relative_path = format!("./assets/{}", saved_file_name);
        let markdown =
            build_asset_markdown(&relative_path, &saved_file_name, asset.mime_type.as_deref());

        imported_assets.push(ImportedAsset {
            file_name: saved_file_name,
            relative_path,
            markdown,
            reused,
        });
    }

    Ok(imported_assets)
}

// 链接管理命令
#[tauri::command]
fn get_outgoing_links_cmd(id: String) -> Result<Vec<LinkInfo>, String> {
    let kb_path = get_kb_path()?;
    get_outgoing_links(&kb_path, &id).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_backlinks_cmd(id: String) -> Result<BacklinksResult, String> {
    let kb_path = get_kb_path()?;
    get_backlinks(&kb_path, &id).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_related_cmd(id: String) -> Result<RelatedResult, String> {
    let kb_path = get_kb_path()?;
    get_related(&kb_path, &id).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_knowledge_graph_cmd() -> Result<KnowledgeGraph, String> {
    let kb_path = get_kb_path()?;
    get_knowledge_graph(&kb_path).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_active_agents_cmd() -> Result<Vec<AgentInfo>, String> {
    let kb_path = get_kb_path()?;
    Ok(get_active_agents(&kb_path))
}

#[tauri::command]
fn get_agent_count_cmd() -> Result<usize, String> {
    let kb_path = get_kb_path()?;
    Ok(get_agent_count(&kb_path))
}

#[tauri::command]
fn get_mcp_connection_count_cmd(server: tauri::State<McpServer>) -> Result<usize, String> {
    let sse_connections = server.0.connection_count();
    let agent_connections = match get_kb_path() {
        Ok(kb_path) => get_agent_count(&kb_path),
        Err(_) => 0,
    };

    Ok(sse_connections + agent_connections)
}

#[tauri::command]
fn start_window_drag_cmd(window: Window) -> Result<(), String> {
    window.start_dragging().map_err(|e| e.to_string())
}

// AI 协作相关命令 - 同时更新文件态(StatePublisher)和内存态(StateManager)
#[tauri::command]
fn select_knowledge_cmd(
    publisher: tauri::State<StatePublisher>,
    memory_state: tauri::State<MemoryState>,
    path: String,
    title: String,
    category: Option<String>,
) -> Result<(), String> {
    // 更新文件态（兼容旧流程）
    publisher
        .0
        .lock()
        .unwrap()
        .set_knowledge(path.clone(), title.clone(), category.clone());
    // 更新内存态（供 SSE 使用）
    memory_state.0.set_knowledge(path, title, category);
    Ok(())
}

#[tauri::command]
fn update_selection_cmd(
    publisher: tauri::State<StatePublisher>,
    memory_state: tauri::State<MemoryState>,
    start_line: usize,
    end_line: usize,
    text_length: usize,
    text: Option<String>,
) -> Result<(), String> {
    // 更新文件态（兼容旧流程）
    publisher
        .0
        .lock()
        .unwrap()
        .set_selection(start_line, end_line, text_length, text.clone());
    // 更新内存态（供 SSE 使用）
    memory_state
        .0
        .set_selection(start_line, end_line, text_length, text);
    Ok(())
}

#[tauri::command]
fn clear_selection_cmd(
    publisher: tauri::State<StatePublisher>,
    memory_state: tauri::State<MemoryState>,
) -> Result<(), String> {
    // 更新文件态（兼容旧流程）
    publisher.0.lock().unwrap().clear_selection();
    // 更新内存态（供 SSE 使用）
    memory_state.0.clear_selection();
    Ok(())
}

#[tauri::command]
fn clear_knowledge_cmd(
    publisher: tauri::State<StatePublisher>,
    memory_state: tauri::State<MemoryState>,
) -> Result<(), String> {
    // 更新文件态（兼容旧流程）
    publisher.0.lock().unwrap().clear_knowledge();
    // 更新内存态（供 SSE 使用）
    memory_state.0.clear_knowledge();
    Ok(())
}

#[tauri::command]
fn set_kb_cmd(
    publisher: tauri::State<StatePublisher>,
    memory_state: tauri::State<MemoryState>,
    path: String,
    name: String,
    count: usize,
) -> Result<(), String> {
    let canonical_kb_path =
        std::fs::canonicalize(PathBuf::from(&path)).unwrap_or_else(|_| PathBuf::from(&path));
    // 更新文件态（兼容旧流程）
    publisher
        .0
        .lock()
        .unwrap()
        .set_kb(canonical_kb_path.clone(), name.clone(), count);
    // 更新内存态（供 SSE 使用）
    memory_state
        .0
        .set_kb(canonical_kb_path.clone(), name, count);
    // 同步更新 MCP 工具层
    memoforge_mcp::tools::set_kb_path(canonical_kb_path);
    Ok(())
}

#[tauri::command]
fn refresh_kb_state_cmd(
    publisher: tauri::State<StatePublisher>,
    memory_state: tauri::State<MemoryState>,
) -> Result<(), String> {
    let kb_path = get_kb_path()?;
    sync_kb_state(&publisher, &memory_state, kb_path)?;
    Ok(())
}

// ==================== 内存状态管理命令 (新架构) ====================

/// 获取当前内存状态
#[tauri::command]
fn get_memory_state_cmd(
    memory_state: tauri::State<MemoryState>,
) -> Result<memory_state::MemoryEditorState, String> {
    Ok(memory_state.0.get_state())
}

/// 更新内存中的知识库状态
#[tauri::command]
fn update_memory_kb_cmd(
    memory_state: tauri::State<MemoryState>,
    path: String,
    name: String,
    count: usize,
) -> Result<(), String> {
    memory_state.0.set_kb(PathBuf::from(path), name, count);
    Ok(())
}

/// 更新内存中的知识点状态
#[tauri::command]
fn update_memory_knowledge_cmd(
    memory_state: tauri::State<MemoryState>,
    path: String,
    title: String,
    category: Option<String>,
) -> Result<(), String> {
    memory_state.0.set_knowledge(path, title, category);
    Ok(())
}

/// 更新内存中的选区状态
#[tauri::command]
fn update_memory_selection_cmd(
    memory_state: tauri::State<MemoryState>,
    start_line: usize,
    end_line: usize,
    text_length: usize,
    text: Option<String>,
) -> Result<(), String> {
    memory_state
        .0
        .set_selection(start_line, end_line, text_length, text);
    Ok(())
}

/// 清除内存中的知识点状态
#[tauri::command]
fn clear_memory_knowledge_cmd(memory_state: tauri::State<MemoryState>) -> Result<(), String> {
    memory_state.0.clear_knowledge();
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
fn main() {
    bootstrap_kb_from_env();

    let state_publisher = StatePublisher(Arc::new(Mutex::new(DesktopStatePublisher::new(false))));

    // 创建内存状态管理器
    let memory_state = Arc::new(StateManager::new());
    let managed_memory_state = MemoryState(Arc::clone(&memory_state));

    if let Some(kb_path) = KB_PATH.lock().unwrap().clone() {
        let _ = sync_kb_state(&state_publisher, &managed_memory_state, kb_path);
    }

    // Follow 模式依赖全局 editor_state.yaml，定期刷新时间戳避免空闲超过 TTL 后退化为只读。
    let heartbeat_publisher = Arc::clone(&state_publisher.0);
    thread::spawn(move || loop {
        thread::sleep(Duration::from_secs(60));
        if let Ok(mut publisher) = heartbeat_publisher.lock() {
            publisher.heartbeat();
        }
    });

    let initial_snapshot = memory_state.to_sse_snapshot();
    let (sse_tx, sse_rx) = tokio::sync::watch::channel(initial_snapshot.clone());
    let server_state = Arc::new(memoforge_mcp::sse::McpServerState::new(
        memoforge_mcp::sse::McpServerConfig::default(),
        sse_tx,
        sse_rx,
    ));

    // 启动 SSE MCP Server（在后台线程）
    let memory_state_for_sse = Arc::clone(&memory_state);
    let server_state_for_sync = Arc::clone(&server_state);
    let server_state_for_http = Arc::clone(&server_state);
    std::thread::spawn(move || {
        // 创建 Tokio runtime
        let rt = tokio::runtime::Runtime::new().expect("Failed to create Tokio runtime");
        rt.block_on(async {
            // 获取 watch receiver（用于触发初始快照）
            let _state_rx = memory_state_for_sse.get_watcher();

            // 启动状态同步任务
            let sync_state = memory_state_for_sse.clone();
            let sync_server_state = Arc::clone(&server_state_for_sync);
            tokio::spawn(async move {
                let mut state_rx = sync_state.get_watcher();
                loop {
                    if state_rx.changed().await.is_ok() {
                        let snapshot = sync_state.to_sse_snapshot();
                        sync_server_state.publish_snapshot(snapshot);
                    }
                }
            });

            // 启动 SSE 服务器
            eprintln!("[SSE] Starting SSE MCP Server on port 31415...");
            match memoforge_mcp::sse::start_sse_server(server_state_for_http).await {
                Ok(()) => eprintln!("[SSE] Server stopped"),
                Err(e) => eprintln!("[SSE] Server error: {}", e),
            }
        });
    });

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(state_publisher)
        .manage(managed_memory_state)
        .manage(McpServer(server_state))
        .setup(|app| {
            if let Err(error) = init_app_logging(app.handle()) {
                eprintln!("[desktop-log] failed to initialize logging: {}", error);
            }
            // 显示主窗口（配置中 visible: false，需要手动显示）
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            init_kb_cmd,
            get_status_cmd,
            list_knowledge_cmd,
            get_knowledge_cmd,
            get_knowledge_with_stale_cmd,
            create_knowledge_cmd,
            update_knowledge_cmd,
            delete_knowledge_cmd,
            move_knowledge_cmd,
            preview_delete_knowledge_cmd,
            preview_move_knowledge_cmd,
            search_knowledge_cmd,
            complete_knowledge_links_cmd,
            grep_cmd,
            list_categories_cmd,
            create_category_cmd,
            update_category_cmd,
            delete_category_cmd,
            git_status_cmd,
            is_git_repo_cmd,
            git_pull_cmd,
            git_push_cmd,
            git_commit_cmd,
            git_log_cmd,
            git_diff_cmd,
            get_tags_cmd,
            get_tags_with_counts_cmd,
            read_events_cmd,
            import_folder_cmd,
            preview_import_cmd,
            list_kb_cmd,
            get_current_kb_cmd,
            switch_kb_cmd,
            unregister_kb_cmd,
            close_kb_cmd,
            get_recent_kbs_cmd,
            get_last_kb_cmd,
            select_folder_cmd,
            get_app_diagnostics_cmd,
            open_app_log_dir_cmd,
            import_assets_cmd,
            get_outgoing_links_cmd,
            get_backlinks_cmd,
            get_related_cmd,
            get_knowledge_graph_cmd,
            get_active_agents_cmd,
            get_agent_count_cmd,
            get_mcp_connection_count_cmd,
            start_window_drag_cmd,
            select_knowledge_cmd,
            update_selection_cmd,
            clear_selection_cmd,
            clear_knowledge_cmd,
            set_kb_cmd,
            refresh_kb_state_cmd,
            // 新增：内存状态管理命令
            get_memory_state_cmd,
            update_memory_kb_cmd,
            update_memory_knowledge_cmd,
            update_memory_selection_cmd,
            clear_memory_knowledge_cmd,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::prepare_kb_for_open;
    use std::fs;
    use tempfile::TempDir;

    #[test]
    fn prepare_kb_for_open_auto_initializes_empty_directory() {
        let temp = TempDir::new().unwrap();

        let reason = prepare_kb_for_open(temp.path()).unwrap();

        assert_eq!(reason, Some("empty_dir_auto_initialized"));
        assert!(temp.path().join(".memoforge").exists());
        assert!(temp.path().join(".memoforge/config.yaml").exists());
    }

    #[test]
    fn prepare_kb_for_open_rejects_non_empty_non_initialized_directory() {
        let temp = TempDir::new().unwrap();
        fs::write(temp.path().join("notes.md"), "# hello").unwrap();

        let error = prepare_kb_for_open(temp.path()).unwrap_err();

        assert!(error.contains("空目录会自动初始化"));
    }

    #[test]
    fn prepare_kb_for_open_accepts_initialized_directory() {
        let temp = TempDir::new().unwrap();
        fs::create_dir_all(temp.path().join(".memoforge")).unwrap();
        fs::write(
            temp.path().join(".memoforge/config.yaml"),
            "version: \"1.0\"\ncategories: []\n",
        )
        .unwrap();

        let reason = prepare_kb_for_open(temp.path()).unwrap();

        assert_eq!(reason, None);
    }
}
