//! MemoForge Desktop Application
//! 参考: 技术实现文档 §2.3

mod desktop_state_publisher;
mod memory_state;

use desktop_state_publisher::DesktopStatePublisher;
use memory_state::StateManager;

use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use memoforge_core::{
    init_store, close_store, MemoError, Knowledge, KnowledgeWithStale, Category, LoadLevel, GrepMatch, Event,
    git::{git_pull, git_push, git_commit, git_log, git_diff, git_status, GitCommit, is_git_repo},
    init::{init_open, init_new},
    list_knowledge, get_knowledge_by_id, get_knowledge_with_stale, create_knowledge, update_knowledge,
    delete_knowledge, move_knowledge, search_knowledge, grep,
    list_categories, create_category, update_category, delete_category,
    get_tags, get_tags_with_counts, read_recent_events,
    import::{import_markdown_folder, preview_import, ImportOptions, ImportStats},
    registry::{KnowledgeBaseInfo, list_knowledge_bases, get_current_kb, switch_kb, register_kb, unregister_kb, get_recent_kbs, get_last_kb},
    preview_delete_knowledge, preview_move_knowledge, DeletePreview, MovePreview,
    links::{LinkInfo, BacklinksResult, RelatedResult, get_outgoing_links, get_backlinks, get_related, KnowledgeGraph},
    api::{get_knowledge_graph, PaginatedKnowledge},
    agent::{AgentInfo, get_active_agents, get_agent_count},
};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::{Manager, Window};

// 全局状态：知识库路径
static KB_PATH: Mutex<Option<PathBuf>> = Mutex::new(None);

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

// 辅助函数：转换 MemoError 为 Tauri Result
fn to_tauri_error(e: MemoError) -> String {
    serde_json::to_string(&e).unwrap_or_else(|_| e.message)
}

fn get_kb_path() -> Result<PathBuf, String> {
    KB_PATH.lock().unwrap()
        .clone()
        .ok_or_else(|| "Knowledge base not initialized".to_string())
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
    memory_state.0.set_kb(canonical_kb_path.clone(), kb_info.name.clone(), kb_info.count);

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

    match mode.as_str() {
        "open" => init_open(&kb_path).map_err(to_tauri_error)?,
        "new" => init_new(&kb_path, false).map_err(to_tauri_error)?,
        "clone" => return Err("Clone not supported in this command".to_string()),
        _ => return Err("Invalid mode".to_string()),
    }

    init_store(kb_path.clone()).map_err(to_tauri_error)?;
    let canonical_kb_path = std::fs::canonicalize(&kb_path).unwrap_or(kb_path.clone());
    *KB_PATH.lock().unwrap() = Some(canonical_kb_path.clone());

    // 同步设置 tools 模块的 KB 路径（供 SSE 模式使用）
    memoforge_mcp::tools::set_kb_path(canonical_kb_path.clone());
    memoforge_mcp::tools::set_mode("sse".to_string());

    // 注册到知识库列表
    let _ = register_kb(&canonical_kb_path, None);

    sync_kb_state(&publisher, &memory_state, canonical_kb_path)?;

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
        .or_else(|| kb_path.file_name().and_then(|value| value.to_str()).map(String::from))
        .unwrap_or_else(|| "knowledge-base".to_string());

    // 获取知识点数量
    let result = memoforge_core::list_knowledge(kb_path, memoforge_core::LoadLevel::L0, None, None, None, None)
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
    ).map_err(to_tauri_error)
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
        patch.category.as_deref(),
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
    search_knowledge(&kb_path, &query, tags.as_deref(), category_id.as_deref(), limit)
        .map_err(to_tauri_error)
}

#[tauri::command]
fn grep_cmd(
    query: String,
    tags: Option<Vec<String>>,
    category_id: Option<String>,
    limit: Option<usize>,
) -> Result<Vec<GrepMatch>, String> {
    let kb_path = get_kb_path()?;
    grep(&kb_path, &query, tags.as_deref(), category_id.as_deref(), limit)
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
    preview_import(&kb_path, PathBuf::from(&source_path).as_path())
        .map_err(|e| e.to_string())
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
    switch_kb(&path).map_err(|e| e.to_string())?;

    let kb_path = std::fs::canonicalize(PathBuf::from(&path)).unwrap_or_else(|_| PathBuf::from(&path));

    // 更新全局 KB_PATH
    *KB_PATH.lock().unwrap() = Some(kb_path.clone());

    sync_kb_state(&publisher, &memory_state, kb_path)?;

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

    let folder_path = app.dialog()
        .file()
        .blocking_pick_folder();

    Ok(folder_path.map(|p| p.to_string()))
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
fn get_mcp_connection_count_cmd(
    server: tauri::State<McpServer>,
) -> Result<usize, String> {
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
    publisher.0.lock().unwrap().set_knowledge(path.clone(), title.clone(), category.clone());
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
    publisher.0.lock().unwrap().set_selection(start_line, end_line, text_length, text.clone());
    // 更新内存态（供 SSE 使用）
    memory_state.0.set_selection(start_line, end_line, text_length, text);
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
    let canonical_kb_path = std::fs::canonicalize(PathBuf::from(&path)).unwrap_or_else(|_| PathBuf::from(&path));
    // 更新文件态（兼容旧流程）
    publisher.0.lock().unwrap().set_kb(canonical_kb_path.clone(), name.clone(), count);
    // 更新内存态（供 SSE 使用）
    memory_state.0.set_kb(canonical_kb_path.clone(), name, count);
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
    memory_state.0.set_selection(start_line, end_line, text_length, text);
    Ok(())
}

/// 清除内存中的知识点状态
#[tauri::command]
fn clear_memory_knowledge_cmd(
    memory_state: tauri::State<MemoryState>,
) -> Result<(), String> {
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
