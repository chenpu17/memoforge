//! MemoForge Desktop Application
//! 鍙傝€? 鎶€鏈疄鐜版枃妗?搂2.3

mod desktop_state_publisher;
mod memory_state;

use axum::{
    extract::State as AxumState,
    http::StatusCode,
    routing::{get, post},
    Json, Router,
};
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
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager, Runtime, Window};
use tauri_plugin_shell::ShellExt;

// 鍏ㄥ眬鐘舵€侊細鐭ヨ瘑搴撹矾寰?
static KB_PATH: Mutex<Option<PathBuf>> = Mutex::new(None);
static APP_LOG_FILE: Mutex<Option<PathBuf>> = Mutex::new(None);

// 鍏ㄥ眬鐘舵€佸彂甯冨櫒锛堝吋瀹规棫浠ｇ爜锛?
pub struct StatePublisher(pub Arc<Mutex<DesktopStatePublisher>>);

// 鍐呭瓨鐘舵€佺鐞嗗櫒锛堟柊鏋舵瀯锛?
pub struct MemoryState(pub Arc<StateManager>);

// 鍐呭祵 SSE MCP Server 鐘舵€?
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

#[derive(Clone)]
struct AutomationState {
    publisher: Arc<Mutex<DesktopStatePublisher>>,
    memory_state: Arc<StateManager>,
    server_state: Arc<memoforge_mcp::sse::McpServerState>,
    app: AppHandle,
}

#[derive(Debug, Deserialize)]
struct AutomationInvokeRequest {
    command: String,
    #[serde(default)]
    args: Value,
}

#[derive(Debug, Deserialize)]
struct InitKbArgs {
    path: String,
    mode: String,
}

#[derive(Debug, Deserialize)]
struct PathArg {
    path: String,
}

#[derive(Debug, Deserialize)]
struct LimitArg {
    limit: Option<usize>,
}

#[derive(Debug, Deserialize)]
struct SourcePathArg {
    source_path: String,
}

#[derive(Debug, Deserialize)]
struct ImportFolderArgs {
    source_path: String,
    generate_frontmatter: bool,
    auto_categories: bool,
    dry_run: bool,
}

#[derive(Debug, Deserialize)]
struct ImportAssetsArgs {
    knowledge_id: String,
    assets: Vec<AssetPayload>,
}

#[derive(Debug, Deserialize)]
struct SelectKnowledgeArgs {
    path: String,
    title: String,
    category: Option<String>,
}

#[derive(Debug, Deserialize)]
struct UpdateSelectionArgs {
    start_line: usize,
    end_line: usize,
    text_length: usize,
    text: Option<String>,
}

#[derive(Debug, Deserialize)]
struct SetKbArgs {
    path: String,
    name: String,
    count: usize,
}

#[derive(Debug, Deserialize)]
struct UpdateMemoryKbArgs {
    path: String,
    name: String,
    count: usize,
}

#[derive(Debug, Deserialize)]
struct UpdateMemoryKnowledgeArgs {
    path: String,
    title: String,
    category: Option<String>,
}

fn automation_port_from_env() -> Option<u16> {
    std::env::var("MEMOFORGE_TAURI_AUTOMATION_PORT")
        .ok()
        .and_then(|value| value.parse::<u16>().ok())
}

fn parse_automation_args<T: for<'de> Deserialize<'de>>(value: Value) -> Result<T, String> {
    serde_json::from_value(value).map_err(|error| format!("Invalid automation arguments: {}", error))
}

fn to_automation_error(error: String) -> (StatusCode, String) {
    (StatusCode::INTERNAL_SERVER_ERROR, error)
}

async fn automation_health() -> &'static str {
    "OK"
}

async fn automation_invoke(
    AxumState(state): AxumState<AutomationState>,
    Json(request): Json<AutomationInvokeRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let response = match request.command.as_str() {
        "get_status" => {
            let kb_path = KB_PATH.lock().unwrap().clone();
            json!(StatusResponse {
                initialized: kb_path.is_some(),
                kb_path: kb_path.map(|path| path.to_string_lossy().to_string()),
            })
        }
        "init_kb" => {
            let args: InitKbArgs = parse_automation_args(request.args).map_err(to_automation_error)?;
            let publisher = StatePublisher(Arc::clone(&state.publisher));
            let memory_state = MemoryState(Arc::clone(&state.memory_state));
            init_kb_inner(&publisher, &memory_state, &args.path, &args.mode)
                .map_err(to_automation_error)?;
            Value::Null
        }
        "list_kb" => json!(list_knowledge_bases().map_err(|e| e.to_string()).map_err(to_automation_error)?),
        "get_current_kb" => json!(get_current_kb().map_err(|e| e.to_string()).map_err(to_automation_error)?),
        "switch_kb" => {
            let args: PathArg = parse_automation_args(request.args).map_err(to_automation_error)?;
            let publisher = StatePublisher(Arc::clone(&state.publisher));
            let memory_state = MemoryState(Arc::clone(&state.memory_state));
            switch_kb_inner(&publisher, &memory_state, &args.path).map_err(to_automation_error)?;
            Value::Null
        }
        "unregister_kb" => {
            let args: PathArg = parse_automation_args(request.args).map_err(to_automation_error)?;
            unregister_kb(&args.path)
                .map_err(|e| e.to_string())
                .map_err(to_automation_error)?;
            Value::Null
        }
        "close_kb" => {
            close_kb_inner();
            Value::Null
        }
        "get_recent_kbs" => {
            let args: LimitArg = parse_automation_args(request.args).map_err(to_automation_error)?;
            json!(get_recent_kbs(args.limit.unwrap_or(10)).map_err(|e| e.to_string()).map_err(to_automation_error)?)
        }
        "get_last_kb" => json!(get_last_kb().map_err(|e| e.to_string()).map_err(to_automation_error)?),
        "is_git_repo" => json!(is_git_repo_inner().map_err(to_automation_error)?),
        "git_diff" => json!(git_diff_inner().map_err(to_automation_error)?),
        "read_events" => {
            let args: LimitArg = parse_automation_args(request.args).map_err(to_automation_error)?;
            json!(read_events_inner(args.limit.unwrap_or(10)).map_err(to_automation_error)?)
        }
        "preview_import" => {
            let args: SourcePathArg = parse_automation_args(request.args).map_err(to_automation_error)?;
            json!(preview_import_inner(&args.source_path).map_err(to_automation_error)?)
        }
        "import_folder" => {
            let args: ImportFolderArgs = parse_automation_args(request.args).map_err(to_automation_error)?;
            json!(import_folder_inner(
                &args.source_path,
                args.generate_frontmatter,
                args.auto_categories,
                args.dry_run
            )
            .map_err(to_automation_error)?)
        }
        "get_app_diagnostics" => json!(get_app_diagnostics_inner(&state.app).map_err(to_automation_error)?),
        "import_assets" => {
            let args: ImportAssetsArgs = parse_automation_args(request.args).map_err(to_automation_error)?;
            json!(import_assets_inner(&args.knowledge_id, args.assets).map_err(to_automation_error)?)
        }
        "get_outgoing_links" => {
            let args: PathArg = parse_automation_args(request.args).map_err(to_automation_error)?;
            json!(get_outgoing_links_inner(&args.path).map_err(to_automation_error)?)
        }
        "get_mcp_connection_count" => json!(get_mcp_connection_count_inner(&state.server_state).map_err(to_automation_error)?),
        "select_knowledge" => {
            let args: SelectKnowledgeArgs = parse_automation_args(request.args).map_err(to_automation_error)?;
            let publisher = StatePublisher(Arc::clone(&state.publisher));
            let memory_state = MemoryState(Arc::clone(&state.memory_state));
            select_knowledge_inner(
                &publisher,
                &memory_state,
                args.path,
                args.title,
                args.category,
            )
            .map_err(to_automation_error)?;
            Value::Null
        }
        "update_selection" => {
            let args: UpdateSelectionArgs = parse_automation_args(request.args).map_err(to_automation_error)?;
            let publisher = StatePublisher(Arc::clone(&state.publisher));
            let memory_state = MemoryState(Arc::clone(&state.memory_state));
            update_selection_inner(
                &publisher,
                &memory_state,
                args.start_line,
                args.end_line,
                args.text_length,
                args.text,
            )
            .map_err(to_automation_error)?;
            Value::Null
        }
        "clear_selection" => {
            let publisher = StatePublisher(Arc::clone(&state.publisher));
            let memory_state = MemoryState(Arc::clone(&state.memory_state));
            clear_selection_inner(&publisher, &memory_state).map_err(to_automation_error)?;
            Value::Null
        }
        "clear_knowledge" => {
            let publisher = StatePublisher(Arc::clone(&state.publisher));
            let memory_state = MemoryState(Arc::clone(&state.memory_state));
            clear_knowledge_inner(&publisher, &memory_state).map_err(to_automation_error)?;
            Value::Null
        }
        "set_kb" => {
            let args: SetKbArgs = parse_automation_args(request.args).map_err(to_automation_error)?;
            let publisher = StatePublisher(Arc::clone(&state.publisher));
            let memory_state = MemoryState(Arc::clone(&state.memory_state));
            set_kb_inner(&publisher, &memory_state, &args.path, args.name, args.count)
                .map_err(to_automation_error)?;
            Value::Null
        }
        "refresh_kb_state" => {
            let publisher = StatePublisher(Arc::clone(&state.publisher));
            let memory_state = MemoryState(Arc::clone(&state.memory_state));
            refresh_kb_state_inner(&publisher, &memory_state).map_err(to_automation_error)?;
            Value::Null
        }
        "get_memory_state" => json!(state.memory_state.get_state()),
        "update_memory_kb" => {
            let args: UpdateMemoryKbArgs = parse_automation_args(request.args).map_err(to_automation_error)?;
            state
                .memory_state
                .set_kb(PathBuf::from(args.path), args.name, args.count);
            Value::Null
        }
        "update_memory_knowledge" => {
            let args: UpdateMemoryKnowledgeArgs =
                parse_automation_args(request.args).map_err(to_automation_error)?;
            state
                .memory_state
                .set_knowledge(args.path, args.title, args.category);
            Value::Null
        }
        "update_memory_selection" => {
            let args: UpdateSelectionArgs = parse_automation_args(request.args).map_err(to_automation_error)?;
            state.memory_state.set_selection(
                args.start_line,
                args.end_line,
                args.text_length,
                args.text,
            );
            Value::Null
        }
        "clear_memory_knowledge" => {
            state.memory_state.clear_knowledge();
            Value::Null
        }
        other => {
            return Err((
                StatusCode::BAD_REQUEST,
                format!("Unsupported automation command: {}", other),
            ));
        }
    };

    Ok(Json(json!({ "ok": true, "result": response })))
}

fn start_automation_server(
    port: u16,
    publisher: Arc<Mutex<DesktopStatePublisher>>,
    memory_state: Arc<StateManager>,
    server_state: Arc<memoforge_mcp::sse::McpServerState>,
    app: AppHandle,
) {
    std::thread::spawn(move || {
        let runtime = tokio::runtime::Runtime::new().expect("Failed to create automation runtime");
        runtime.block_on(async move {
            let app_state = AutomationState {
                publisher,
                memory_state,
                server_state,
                app,
            };
            let router = Router::new()
                .route("/health", get(automation_health))
                .route("/invoke", post(automation_invoke))
                .with_state(app_state);
            let addr = format!("127.0.0.1:{}", port);
            let listener = tokio::net::TcpListener::bind(&addr)
                .await
                .expect("Failed to bind automation server");
            eprintln!("[automation] Server listening on http://{}", addr);
            if let Err(error) = axum::serve(listener, router).await {
                eprintln!("[automation] Server error: {}", error);
            }
        });
    });
}

// 杈呭姪鍑芥暟锛氳浆鎹?MemoError 涓?Tauri Result
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

fn resolve_log_dir<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    if let Ok(dir) = app.path().app_log_dir() {
        return Ok(dir);
    }

    if let Ok(dir) = app.path().app_data_dir() {
        return Ok(dir.join("logs"));
    }

    let fallback = std::env::temp_dir().join("MemoForge").join("logs");
    Ok(fallback)
}

fn init_app_logging<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    let log_dir = resolve_log_dir(app)?;
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

    let log_dir = resolve_log_dir(app)?;
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
        return Err("Selected path does not exist. Create the directory first or choose an existing knowledge base directory.".to_string());
    }

    if !kb_path.is_dir() {
        return Err("Selected path is not a directory. Choose a folder to use as the knowledge base.".to_string());
    }

    if is_empty_directory(kb_path)? {
        init_new(kb_path, false).map_err(to_tauri_error)?;
        return Ok(Some("empty_dir_auto_initialized"));
    }

    Err("Selected directory is not an initialized MemoForge knowledge base. Empty directories can be auto-initialized; otherwise import Markdown first or choose an existing MemoForge directory.".to_string())
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
        // 鍚屾璁剧疆 tools 妯″潡鐨?KB 璺緞锛堜緵 SSE 妯″紡浣跨敤锛?
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

fn init_kb_inner(
    publisher: &StatePublisher,
    memory_state: &MemoryState,
    path: &str,
    mode: &str,
) -> Result<(), String> {
    let kb_path = PathBuf::from(path);

    let init_result = match mode {
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

    memoforge_mcp::tools::set_kb_path(canonical_kb_path.clone());
    memoforge_mcp::tools::set_mode("sse".to_string());

    let _ = register_kb(&canonical_kb_path, None);

    sync_kb_state(publisher, memory_state, canonical_kb_path)?;

    let mut detail = format!("Opened knowledge base {}", path);
    if auto_init_reason == Some("empty_dir_auto_initialized") {
        detail.push_str(" (empty directory was automatically initialized)");
    }
    append_app_log("INFO", "init_kb", &detail);

    Ok(())
}

fn switch_kb_inner(
    publisher: &StatePublisher,
    memory_state: &MemoryState,
    path: &str,
) -> Result<(), String> {
    switch_kb(path).map_err(|e| {
        let message = e.to_string();
        append_app_log(
            "ERROR",
            "switch_kb",
            &format!("Failed to switch knowledge base {}: {}", path, message),
        );
        message
    })?;

    let kb_path = std::fs::canonicalize(PathBuf::from(path)).unwrap_or_else(|_| PathBuf::from(path));
    *KB_PATH.lock().unwrap() = Some(kb_path.clone());

    sync_kb_state(publisher, memory_state, kb_path)?;
    append_app_log("INFO", "switch_kb", &format!("Switched knowledge base to {}", path));

    Ok(())
}

fn close_kb_inner() {
    close_store();
    *KB_PATH.lock().unwrap() = None;
}

fn is_git_repo_inner() -> Result<bool, String> {
    let kb_path = get_kb_path()?;
    Ok(is_git_repo(&kb_path))
}

fn git_diff_inner() -> Result<String, String> {
    let kb_path = get_kb_path()?;
    git_diff(&kb_path).map_err(to_tauri_error)
}

fn read_events_inner(limit: usize) -> Result<Vec<Event>, String> {
    let kb_path = get_kb_path()?;
    read_recent_events(&kb_path, limit).map_err(|e| e.to_string())
}

fn preview_import_inner(source_path: &str) -> Result<ImportStats, String> {
    let kb_path = get_kb_path()?;
    preview_import(&kb_path, PathBuf::from(source_path).as_path()).map_err(|e| e.to_string())
}

fn import_folder_inner(
    source_path: &str,
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
    import_markdown_folder(&kb_path, PathBuf::from(source_path).as_path(), options)
        .map_err(|e| e.to_string())
}

fn get_app_diagnostics_inner(app: &AppHandle) -> Result<AppDiagnostics, String> {
    let (log_dir, log_file) = get_log_paths(app)?;
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

fn import_assets_inner(
    knowledge_id: &str,
    assets: Vec<AssetPayload>,
) -> Result<Vec<ImportedAsset>, String> {
    let kb_path = get_kb_path()?;
    let knowledge_path = kb_path.join(knowledge_id);
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

fn get_outgoing_links_inner(id: &str) -> Result<Vec<LinkInfo>, String> {
    let kb_path = get_kb_path()?;
    get_outgoing_links(&kb_path, id).map_err(|e| e.to_string())
}

fn get_mcp_connection_count_inner(
    server_state: &Arc<memoforge_mcp::sse::McpServerState>,
) -> Result<usize, String> {
    let sse_connections = server_state.connection_count();
    let agent_connections = match get_kb_path() {
        Ok(kb_path) => get_agent_count(&kb_path),
        Err(_) => 0,
    };
    Ok(sse_connections + agent_connections)
}

fn select_knowledge_inner(
    publisher: &StatePublisher,
    memory_state: &MemoryState,
    path: String,
    title: String,
    category: Option<String>,
) -> Result<(), String> {
    publisher
        .0
        .lock()
        .unwrap()
        .set_knowledge(path.clone(), title.clone(), category.clone());
    memory_state.0.set_knowledge(path, title, category);
    Ok(())
}

fn update_selection_inner(
    publisher: &StatePublisher,
    memory_state: &MemoryState,
    start_line: usize,
    end_line: usize,
    text_length: usize,
    text: Option<String>,
) -> Result<(), String> {
    publisher
        .0
        .lock()
        .unwrap()
        .set_selection(start_line, end_line, text_length, text.clone());
    memory_state
        .0
        .set_selection(start_line, end_line, text_length, text);
    Ok(())
}

fn clear_selection_inner(
    publisher: &StatePublisher,
    memory_state: &MemoryState,
) -> Result<(), String> {
    publisher.0.lock().unwrap().clear_selection();
    memory_state.0.clear_selection();
    Ok(())
}

fn clear_knowledge_inner(
    publisher: &StatePublisher,
    memory_state: &MemoryState,
) -> Result<(), String> {
    publisher.0.lock().unwrap().clear_knowledge();
    memory_state.0.clear_knowledge();
    Ok(())
}

fn set_kb_inner(
    publisher: &StatePublisher,
    memory_state: &MemoryState,
    path: &str,
    name: String,
    count: usize,
) -> Result<(), String> {
    let canonical_kb_path =
        std::fs::canonicalize(PathBuf::from(path)).unwrap_or_else(|_| PathBuf::from(path));
    publisher
        .0
        .lock()
        .unwrap()
        .set_kb(canonical_kb_path.clone(), name.clone(), count);
    memory_state
        .0
        .set_kb(canonical_kb_path.clone(), name, count);
    memoforge_mcp::tools::set_kb_path(canonical_kb_path);
    Ok(())
}

fn refresh_kb_state_inner(
    publisher: &StatePublisher,
    memory_state: &MemoryState,
) -> Result<(), String> {
    let kb_path = get_kb_path()?;
    sync_kb_state(publisher, memory_state, kb_path)?;
    Ok(())
}

// 鍒濆鍖栧懡浠?
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

    // 鍚屾璁剧疆 tools 妯″潡鐨?KB 璺緞锛堜緵 SSE 妯″紡浣跨敤锛?
    memoforge_mcp::tools::set_kb_path(canonical_kb_path.clone());
    memoforge_mcp::tools::set_mode("sse".to_string());

    // 娉ㄥ唽鍒扮煡璇嗗簱鍒楄〃
    let _ = register_kb(&canonical_kb_path, None);

    sync_kb_state(&publisher, &memory_state, canonical_kb_path)?;

    let mut detail = format!("Opened knowledge base {}", path);
    if auto_init_reason == Some("empty_dir_auto_initialized") {
        detail.push_str(" (empty directory was automatically initialized)");
    }
    append_app_log("INFO", "init_kb", &detail);

    Ok(())
}

/// 杈呭姪鍑芥暟锛氳幏鍙栫煡璇嗗簱淇℃伅
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

    // 鑾峰彇鐭ヨ瘑鐐规暟閲?
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

/// 鐭ヨ瘑搴撲俊鎭粨鏋?
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

// 鐭ヨ瘑绠＄悊鍛戒护
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

// 鍒嗙被绠＄悊鍛戒护
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

// Git 鍛戒护
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

// 鏍囩鍛戒护
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

// 浜嬩欢鏃ュ織鍛戒护
#[tauri::command]
fn read_events_cmd(limit: usize) -> Result<Vec<Event>, String> {
    let kb_path = get_kb_path()?;
    read_recent_events(&kb_path, limit).map_err(|e| e.to_string())
}

// 瀵煎叆鍛戒护
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

// 澶氱煡璇嗗簱绠＄悊鍛戒护
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

    // 鏇存柊鍏ㄥ眬 KB_PATH
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

// 閾炬帴绠＄悊鍛戒护
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

// AI 鍗忎綔鐩稿叧鍛戒护 - 鍚屾椂鏇存柊鏂囦欢鎬?StatePublisher)鍜屽唴瀛樻€?StateManager)
#[tauri::command]
fn select_knowledge_cmd(
    publisher: tauri::State<StatePublisher>,
    memory_state: tauri::State<MemoryState>,
    path: String,
    title: String,
    category: Option<String>,
) -> Result<(), String> {
    // 鏇存柊鏂囦欢鎬侊紙鍏煎鏃ф祦绋嬶級
    publisher
        .0
        .lock()
        .unwrap()
        .set_knowledge(path.clone(), title.clone(), category.clone());
    // 鏇存柊鍐呭瓨鎬侊紙渚?SSE 浣跨敤锛?
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
    // 鏇存柊鏂囦欢鎬侊紙鍏煎鏃ф祦绋嬶級
    publisher
        .0
        .lock()
        .unwrap()
        .set_selection(start_line, end_line, text_length, text.clone());
    // 鏇存柊鍐呭瓨鎬侊紙渚?SSE 浣跨敤锛?
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
    // 鏇存柊鏂囦欢鎬侊紙鍏煎鏃ф祦绋嬶級
    publisher.0.lock().unwrap().clear_selection();
    // 鏇存柊鍐呭瓨鎬侊紙渚?SSE 浣跨敤锛?
    memory_state.0.clear_selection();
    Ok(())
}

#[tauri::command]
fn clear_knowledge_cmd(
    publisher: tauri::State<StatePublisher>,
    memory_state: tauri::State<MemoryState>,
) -> Result<(), String> {
    // 鏇存柊鏂囦欢鎬侊紙鍏煎鏃ф祦绋嬶級
    publisher.0.lock().unwrap().clear_knowledge();
    // 鏇存柊鍐呭瓨鎬侊紙渚?SSE 浣跨敤锛?
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
    // 鏇存柊鏂囦欢鎬侊紙鍏煎鏃ф祦绋嬶級
    publisher
        .0
        .lock()
        .unwrap()
        .set_kb(canonical_kb_path.clone(), name.clone(), count);
    // 鏇存柊鍐呭瓨鎬侊紙渚?SSE 浣跨敤锛?
    memory_state
        .0
        .set_kb(canonical_kb_path.clone(), name, count);
    // 鍚屾鏇存柊 MCP 宸ュ叿灞?
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

// ==================== 鍐呭瓨鐘舵€佺鐞嗗懡浠?(鏂版灦鏋? ====================

/// 鑾峰彇褰撳墠鍐呭瓨鐘舵€?
#[tauri::command]
fn get_memory_state_cmd(
    memory_state: tauri::State<MemoryState>,
) -> Result<memory_state::MemoryEditorState, String> {
    Ok(memory_state.0.get_state())
}

/// 鏇存柊鍐呭瓨涓殑鐭ヨ瘑搴撶姸鎬?
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

/// 鏇存柊鍐呭瓨涓殑鐭ヨ瘑鐐圭姸鎬?
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

/// 鏇存柊鍐呭瓨涓殑閫夊尯鐘舵€?
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

/// 娓呴櫎鍐呭瓨涓殑鐭ヨ瘑鐐圭姸鎬?
#[tauri::command]
fn clear_memory_knowledge_cmd(memory_state: tauri::State<MemoryState>) -> Result<(), String> {
    memory_state.0.clear_knowledge();
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
fn main() {
    bootstrap_kb_from_env();

    let state_publisher = StatePublisher(Arc::new(Mutex::new(DesktopStatePublisher::new(false))));

    // 鍒涘缓鍐呭瓨鐘舵€佺鐞嗗櫒
    let memory_state = Arc::new(StateManager::new());
    let managed_memory_state = MemoryState(Arc::clone(&memory_state));

    if let Some(kb_path) = KB_PATH.lock().unwrap().clone() {
        let _ = sync_kb_state(&state_publisher, &managed_memory_state, kb_path);
    }

    // Follow 妯″紡渚濊禆鍏ㄥ眬 editor_state.yaml锛屽畾鏈熷埛鏂版椂闂存埑閬垮厤绌洪棽瓒呰繃 TTL 鍚庨€€鍖栦负鍙銆?
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
    let automation_port = automation_port_from_env();
    let automation_publisher = Arc::clone(&state_publisher.0);
    let automation_memory_state = Arc::clone(&memory_state);
    let automation_server_state = Arc::clone(&server_state);

    // 鍚姩 SSE MCP Server锛堝湪鍚庡彴绾跨▼锛?
    let memory_state_for_sse = Arc::clone(&memory_state);
    let server_state_for_sync = Arc::clone(&server_state);
    let server_state_for_http = Arc::clone(&server_state);
    std::thread::spawn(move || {
        // 鍒涘缓 Tokio runtime
        let rt = tokio::runtime::Runtime::new().expect("Failed to create Tokio runtime");
        rt.block_on(async {
            // 鑾峰彇 watch receiver锛堢敤浜庤Е鍙戝垵濮嬪揩鐓э級
            let _state_rx = memory_state_for_sse.get_watcher();

            // 鍚姩鐘舵€佸悓姝ヤ换鍔?
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

            // 鍚姩 SSE 鏈嶅姟鍣?
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
        .setup(move |app| {
            if let Err(error) = init_app_logging(app.handle()) {
                eprintln!("[desktop-log] failed to initialize logging: {}", error);
            }
            if let Some(port) = automation_port {
                start_automation_server(
                    port,
                    Arc::clone(&automation_publisher),
                    Arc::clone(&automation_memory_state),
                    Arc::clone(&automation_server_state),
                    app.handle().clone(),
                );
            }
            // 鏄剧ず涓荤獥鍙ｏ紙閰嶇疆涓?visible: false锛岄渶瑕佹墜鍔ㄦ樉绀猴級
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
            // 鏂板锛氬唴瀛樼姸鎬佺鐞嗗懡浠?
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
    use super::{
        build_asset_markdown, find_existing_asset_by_content, prepare_kb_for_open,
        resolve_unique_asset_path,
    };
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

        assert!(error.contains("Empty directories can be auto-initialized"));
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

    #[test]
    fn build_asset_markdown_uses_image_syntax_for_images() {
        assert_eq!(
            build_asset_markdown("./assets/example.png", "example.png", Some("image/png")),
            "![example](./assets/example.png)"
        );
        assert_eq!(
            build_asset_markdown("./assets/doc.pdf", "doc.pdf", Some("application/pdf")),
            "[doc.pdf](./assets/doc.pdf)"
        );
    }

    #[test]
    fn resolve_unique_asset_path_appends_counter_for_conflicts() {
        let temp = TempDir::new().unwrap();
        fs::create_dir_all(temp.path()).unwrap();
        fs::write(temp.path().join("diagram.png"), b"one").unwrap();
        fs::write(temp.path().join("diagram-1.png"), b"two").unwrap();

        let next = resolve_unique_asset_path(temp.path(), "diagram.png");

        assert_eq!(next.file_name().and_then(|v| v.to_str()), Some("diagram-2.png"));
    }

    #[test]
    fn find_existing_asset_by_content_reuses_same_bytes() {
        let temp = TempDir::new().unwrap();
        fs::create_dir_all(temp.path()).unwrap();
        let existing = temp.path().join("asset.bin");
        fs::write(&existing, b"same-bytes").unwrap();
        fs::write(temp.path().join("other.bin"), b"different").unwrap();

        let found = find_existing_asset_by_content(temp.path(), b"same-bytes");

        assert_eq!(found.as_deref(), Some(existing.as_path()));
    }
}




