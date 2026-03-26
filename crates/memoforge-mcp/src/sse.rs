//! SSE MCP Server 实现
//! 参考: 技术实现文档 §2.5

use axum::{
    extract::State,
    response::{sse::Event, Sse, IntoResponse},
    routing::{get, post},
    Router,
    http::StatusCode,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::BTreeMap,
    convert::Infallible,
    net::SocketAddr,
    sync::{
        Arc,
        Mutex,
        atomic::{AtomicU64, Ordering},
    },
};
use tokio::sync::watch;
use tower_http::cors::{CorsLayer, Any};
use futures::stream::Stream;

/// MCP SSE Server 配置
#[derive(Debug, Clone)]
pub struct McpServerConfig {
    pub port: u16,
    pub host: String,
}

impl Default for McpServerConfig {
    fn default() -> Self {
        // 优先从环境变量读取端口，否则使用默认值
        let port = std::env::var("MEMOFORGE_MCP_PORT")
            .ok()
            .and_then(|p| p.parse().ok())
            .unwrap_or(31415);

        Self {
            port,
            host: "127.0.0.1".to_string(),
        }
    }
}

/// MCP Server 状态
pub struct McpServerState {
    #[allow(dead_code)]
    pub config: McpServerConfig,
    /// 编辑器状态发送器（用于连接变更时主动刷新快照）
    pub editor_state_tx: watch::Sender<EditorStateSnapshot>,
    /// 编辑器状态接收器（从 Tauri 接收）
    pub editor_state_rx: watch::Receiver<EditorStateSnapshot>,
    /// 当前活跃的 SSE 连接
    connections: Mutex<BTreeMap<u64, SseConnection>>,
    next_connection_id: AtomicU64,
}

#[derive(Debug, Clone)]
struct SseConnection {
    started_at: String,
}

/// 编辑器状态快照（用于 SSE 推送）
/// 注意：此结构体必须与 PRD canonical schema 保持一致
#[derive(Debug, Clone, Serialize, Default)]
pub struct EditorStateSnapshot {
    /// 运行模式 (sse)
    pub mode: String,
    /// 桌面应用状态
    #[serde(skip_serializing_if = "Option::is_none")]
    pub desktop: Option<DesktopInfo>,
    /// 当前知识库
    #[serde(skip_serializing_if = "Option::is_none")]
    pub current_kb: Option<CurrentKb>,
    /// 当前知识点
    #[serde(skip_serializing_if = "Option::is_none")]
    pub current_knowledge: Option<CurrentKnowledge>,
    /// 文本选区
    #[serde(skip_serializing_if = "Option::is_none")]
    pub selection: Option<Selection>,
    /// 活跃 Agent 列表
    pub active_agents: Vec<ActiveAgent>,
    /// 状态是否有效
    pub state_valid: bool,
    /// 更新时间
    pub updated_at: String,
    /// 错误信息
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// 桌面端信息（与 PRD canonical schema 一致）
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct DesktopInfo {
    pub running: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pid: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub focused: Option<bool>,
}

/// 活跃 Agent 信息（与 PRD canonical schema 一致）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActiveAgent {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pid: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub started_at: Option<String>,
}

impl McpServerState {
    pub fn new(
        config: McpServerConfig,
        editor_state_tx: watch::Sender<EditorStateSnapshot>,
        editor_state_rx: watch::Receiver<EditorStateSnapshot>,
    ) -> Self {
        Self {
            config,
            editor_state_tx,
            editor_state_rx,
            connections: Mutex::new(BTreeMap::new()),
            next_connection_id: AtomicU64::new(1),
        }
    }

    pub fn connection_count(&self) -> usize {
        self.connections.lock().unwrap().len()
    }

    pub fn register_connection(&self) -> u64 {
        let connection_id = self.next_connection_id.fetch_add(1, Ordering::Relaxed);
        self.connections.lock().unwrap().insert(connection_id, SseConnection {
            started_at: chrono::Utc::now().to_rfc3339(),
        });
        connection_id
    }

    pub fn unregister_connection(&self, connection_id: u64) {
        self.connections.lock().unwrap().remove(&connection_id);
    }

    pub fn publish_snapshot(&self, snapshot: EditorStateSnapshot) {
        let _ = self.editor_state_tx.send(self.snapshot_with_connections(&snapshot));
    }

    pub fn current_snapshot(&self) -> EditorStateSnapshot {
        self.snapshot_with_connections(&self.editor_state_rx.borrow().clone())
    }

    fn snapshot_with_connections(&self, snapshot: &EditorStateSnapshot) -> EditorStateSnapshot {
        let mut merged = snapshot.clone();
        merged.active_agents.retain(|agent| agent.name != "sse-client");
        merged.active_agents.extend(self.sse_active_agents());
        merged
    }

    fn sse_active_agents(&self) -> Vec<ActiveAgent> {
        self.connections
            .lock()
            .unwrap()
            .values()
            .map(|connection| ActiveAgent {
                name: "sse-client".to_string(),
                pid: None,
                started_at: Some(connection.started_at.clone()),
            })
            .collect()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CurrentKb {
    pub path: String,
    pub name: String,
    pub knowledge_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CurrentKnowledge {
    pub path: String,
    pub title: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub category: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Selection {
    pub start_line: usize,
    pub end_line: usize,
    pub has_text: bool,
    pub text_length: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub selected_text: Option<String>,
}

#[derive(Debug, Deserialize)]
struct JsonRpcRequest {
    #[allow(dead_code)]
    jsonrpc: String,
    #[serde(skip)]
    id: Option<Value>,
    method: String,
    params: Option<Value>,
}

#[derive(Debug, Serialize)]
struct JsonRpcResponse {
    jsonrpc: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    id: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    result: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<JsonRpcError>,
}

#[derive(Debug, Serialize)]
struct JsonRpcError {
    code: i32,
    message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    data: Option<Value>,
}

impl JsonRpcResponse {
    #[allow(dead_code)]
    fn success(result: Value) -> Self {
        Self {
            jsonrpc: "2.0".to_string(),
            id: None,
            result: Some(result),
            error: None,
        }
    }

    #[allow(dead_code)]
    fn error(id: Option<Value>, code: i32, message: &str) -> Self {
        Self {
            jsonrpc: "2.0".to_string(),
            id,
            result: None,
            error: Some(JsonRpcError {
                code,
                message: message.to_string(),
                data: None,
            }),
        }
    }
}

/// 启动 SSE MCP Server (Streamable HTTP transport - MCP 2025-03-26)
pub async fn start_sse_server(state: Arc<McpServerState>) -> Result<(), Box<dyn std::error::Error>> {
    let app = Router::new()
        // Streamable HTTP: 单一端点同时支持 POST 和 GET
        .route("/mcp", post(handle_mcp_request).get(handle_sse_connect))
        // 健康检查
        .route("/health", get(handle_health))
        .layer(
            CorsLayer::new()
                .allow_origin(Any)
                .allow_methods(Any)
                .allow_headers(Any),
        )
        .with_state(state);

    let config = McpServerConfig::default();
    let addr = format!("{}:{}", config.host, config.port);

    let addr: SocketAddr = addr.parse()?;
    let listener = tokio::net::TcpListener::bind(addr).await?;

    eprintln!("[MCP SSE] Server listening on http://{}", addr);

    axum::serve(listener, app).await?;

    Ok(())
}

/// 健康检查
async fn handle_health() -> impl IntoResponse {
    (StatusCode::OK, "OK")
}

/// 处理 MCP JSON-RPC 请求
async fn handle_mcp_request(
    State(state): State<Arc<McpServerState>>,
    body: String,
) -> Result<String, StatusCode> {
    let request: JsonRpcRequest = match serde_json::from_str(&body) {
        Ok(r) => r,
        Err(e) => {
            eprintln!("[MCP] JSON 解析失败: {}", e);
            return Err(StatusCode::BAD_REQUEST);
        }
    };

    let response = match request.method.as_str() {
        "initialize" => handle_initialize(request.id),
        "tools/list" => handle_tools_list(request.id),
        "tools/call" => handle_tools_call(request.id, request.params, &state),
        _ => json_rpc_error(request.id, -32601, "Method not found"),
    };

    Ok(serde_json::to_string(&response).unwrap())
}

/// 处理 SSE 连接
async fn handle_sse_connect(
    State(state): State<Arc<McpServerState>>,
) -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
    struct ConnectionGuard {
        connection_id: u64,
        state: Arc<McpServerState>,
    }

    impl Drop for ConnectionGuard {
        fn drop(&mut self) {
            self.state.unregister_connection(self.connection_id);
            let snapshot = self.state.editor_state_rx.borrow().clone();
            self.state.publish_snapshot(snapshot);
        }
    }

    let connection_id = state.register_connection();
    let current_snapshot = state.current_snapshot();
    state.publish_snapshot(current_snapshot);

    let mut rx = state.editor_state_rx.clone();
    let state_for_stream = Arc::clone(&state);

    // 创建一个流，用于发送 SSE 事件
    let stream = async_stream::stream! {
        let _guard = ConnectionGuard {
            connection_id,
            state: Arc::clone(&state_for_stream),
        };

        // 发送初始状态
        let initial = state_for_stream.current_snapshot();
        if let Ok(json) = serde_json::to_string(&initial) {
            yield Ok(Event::default().data(json));
        }

        // 持续监听状态变化
        loop {
            match rx.changed().await {
                Ok(()) => {
                    let state_snapshot = rx.borrow().clone();
                    if let Ok(json) = serde_json::to_string(&state_snapshot) {
                        yield Ok(Event::default().data(json));
                    }
                }
                Err(_) => {
                    // Channel 关闭，结束流
                    break;
                }
            }
        }
    };

    Sse::new(stream).keep_alive(
        axum::response::sse::KeepAlive::new()
            .interval(std::time::Duration::from_secs(30))
            .text("keepalive"),
    )
}

/// 处理 initialize 请求
fn handle_initialize(id: Option<Value>) -> JsonRpcResponse {
    JsonRpcResponse {
        jsonrpc: "2.0".to_string(),
        id,
        result: Some(json!({
            "protocolVersion": "2024-11-05",
            "capabilities": {
                "tools": {}
            },
            "serverInfo": {
                "name": "memoforge",
                "version": env!("CARGO_PKG_VERSION")
            }
        })),
        error: None,
    }
}

/// 处理 tools/list 请求
fn handle_tools_list(id: Option<Value>) -> JsonRpcResponse {
    // 复用 tools.rs 的工具列表
    let tools = crate::tools::list_tools();
    JsonRpcResponse {
        jsonrpc: "2.0".to_string(),
        id,
        result: Some(json!({
            "tools": tools
        })),
        error: None,
    }
}

/// 处理 tools/call 请求
fn handle_tools_call(
    id: Option<Value>,
    params: Option<Value>,
    state: &McpServerState,
) -> JsonRpcResponse {
    let params = match params {
        Some(p) if p.is_object() => p,
        _ => return json_rpc_error(id, -32602, "Invalid params"),
    };

    // 获取工具名称
    let tool_name = params.get("name").and_then(|v| v.as_str()).unwrap_or("");

    // SSE 模式下，get_editor_state 直接返回内存状态（不读文件）
    if tool_name == "get_editor_state" {
        let snapshot = state.current_snapshot();
        return JsonRpcResponse {
            jsonrpc: "2.0".to_string(),
            id,
            result: Some(json!({
                "content": [{ "type": "text", "text": serde_json::to_string(&snapshot).unwrap_or_default() }]
            })),
            error: None,
        };
    }

    // 其他工具复用 tools.rs 的实现
    // 注意：SSE 模式嵌入在 Tauri 进程中，tools::set_kb_path 已由 Tauri 设置
    match crate::tools::call_tool(Some(params), false) {
        Ok(result) => JsonRpcResponse {
            jsonrpc: "2.0".to_string(),
            id,
            result: Some(json!({
                "content": [{ "type": "text", "text": result }]
            })),
            error: None,
        },
        Err(e) => JsonRpcResponse {
            jsonrpc: "2.0".to_string(),
            id,
            result: None,
            error: Some(JsonRpcError {
                code: -32000,
                message: e.message,
                data: Some(json!({ "code": e.code })),
            }),
        },
    }
}

/// 构造 JSON-RPC 错误响应
fn json_rpc_error(id: Option<Value>, code: i32, message: &str) -> JsonRpcResponse {
    JsonRpcResponse {
        jsonrpc: "2.0".to_string(),
        id,
        result: None,
        error: Some(JsonRpcError {
            code,
            message: message.to_string(),
            data: None,
        }),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_config() {
        let config = McpServerConfig::default();
        assert_eq!(config.port, 31415);
        assert_eq!(config.host, "127.0.0.1");
    }

    #[test]
    fn test_editor_state_snapshot_serialization() {
        let snapshot = EditorStateSnapshot {
            mode: "sse".to_string(),
            desktop: Some(DesktopInfo {
                running: true,
                pid: Some(42),
                focused: Some(true),
            }),
            current_kb: Some(CurrentKb {
                path: "/test/path".to_string(),
                name: "Test KB".to_string(),
                knowledge_count: 100,
            }),
            current_knowledge: Some(CurrentKnowledge {
                path: "test.md".to_string(),
                title: "Test".to_string(),
                category: Some("Category".to_string()),
            }),
            selection: Some(Selection {
                start_line: 1,
                end_line: 5,
                has_text: true,
                text_length: 100,
                selected_text: Some("test text".to_string()),
            }),
            active_agents: vec![],
            state_valid: true,
            updated_at: "2024-01-01T00:00:00Z".to_string(),
            error: None,
        };

        let json = serde_json::to_string(&snapshot).unwrap();
        assert!(json.contains("test.md"));
        assert!(json.contains("Test KB"));
    }

    #[test]
    fn test_connection_tracking_is_reflected_in_snapshot() {
        let base_snapshot = EditorStateSnapshot {
            mode: "sse".to_string(),
            updated_at: "2026-03-25T00:00:00Z".to_string(),
            ..Default::default()
        };
        let (tx, rx) = watch::channel(base_snapshot.clone());
        let state = McpServerState {
            config: McpServerConfig::default(),
            editor_state_tx: tx,
            editor_state_rx: rx,
            connections: Mutex::new(BTreeMap::new()),
            next_connection_id: AtomicU64::new(1),
        };

        let connection_id = state.register_connection();
        state.publish_snapshot(base_snapshot.clone());

        let with_connection = state.current_snapshot();
        assert_eq!(state.connection_count(), 1);
        assert_eq!(with_connection.active_agents.len(), 1);
        assert_eq!(with_connection.active_agents[0].name, "sse-client");

        state.unregister_connection(connection_id);
        state.publish_snapshot(base_snapshot);

        let without_connection = state.current_snapshot();
        assert_eq!(state.connection_count(), 0);
        assert!(without_connection.active_agents.is_empty());
    }
}
