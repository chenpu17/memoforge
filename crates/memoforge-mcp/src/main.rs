//! MemoForge MCP Server
//! 参考: 技术实现文档 §4

use clap::Parser;
use memoforge_mcp::tools;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::io::{self, BufRead, Write};

#[derive(Parser)]
#[command(
    name = "memoforge",
    version,
    about = "MemoForge - AI-driven knowledge management"
)]
enum Cli {
    Serve {
        /// 运行模式：follow(跟随当前编辑器) 或 bound(绑定指定知识库)
        /// 未显式指定时：提供 --knowledge-path 则推断为 bound，否则为 follow
        #[arg(long, value_parser = ["follow", "bound"])]
        mode: Option<String>,

        /// 知识库路径（提供后默认进入 bound 模式）
        #[arg(long)]
        knowledge_path: Option<std::path::PathBuf>,

        /// [follow 模式] 允许在状态无效时回退到最近使用的知识库（仅只读操作）
        #[arg(long, default_value = "false")]
        allow_stale_kb: bool,

        /// 强制只读模式（无论 follow/bound）
        #[arg(long, default_value = "false")]
        readonly: bool,

        /// Agent 名称
        #[arg(long, default_value = "unknown")]
        agent_name: String,
    },
}

#[derive(Debug, Deserialize)]
struct JsonRpcRequest {
    jsonrpc: String,
    id: Option<Value>,
    method: String,
    params: Option<Value>,
}

impl JsonRpcRequest {
    fn is_json_rpc_2(&self) -> bool {
        self.jsonrpc == "2.0"
    }
}

#[derive(Debug, Serialize)]
struct JsonRpcResponse {
    jsonrpc: String,
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

fn main() {
    let cli = Cli::parse();

    match cli {
        Cli::Serve {
            mode,
            knowledge_path,
            allow_stale_kb,
            readonly,
            agent_name,
        } => {
            let effective_mode = mode.unwrap_or_else(|| {
                if knowledge_path.is_some() {
                    "bound".to_string()
                } else {
                    "follow".to_string()
                }
            });

            match effective_mode.as_str() {
                "follow" => {
                    // follow 模式：启动时不验证 KB，延迟到工具调用时
                    // 这样即使没有全局状态文件，get_editor_state 也可用于诊断
                    run_server_follow_mode(allow_stale_kb, readonly, &agent_name);
                }
                "bound" => {
                    // bound 模式：必须有显式路径，启动时验证
                    let path = knowledge_path.ok_or_else(|| {
                        eprintln!("bound 模式必须指定 --knowledge-path");
                        std::process::exit(1);
                    });
                    match path {
                        Ok(kb_path) => {
                            // 验证并初始化知识库
                            match validate_and_init_kb(&kb_path) {
                                Ok(()) => run_server_bound_mode(kb_path, readonly, &agent_name),
                                Err(e) => {
                                    eprintln!("Failed to initialize knowledge base: {}", e.message);
                                    std::process::exit(1);
                                }
                            }
                        }
                        Err(_) => std::process::exit(1),
                    }
                }
                _ => {
                    eprintln!("mode 必须是 follow 或 bound");
                    std::process::exit(1);
                }
            }
        }
    }
}

/// 验证并初始化知识库（用于 bound 模式）
fn validate_and_init_kb(kb_path: &std::path::PathBuf) -> Result<(), memoforge_core::MemoError> {
    if !kb_path.exists() {
        return Err(memoforge_core::MemoError {
            code: memoforge_core::ErrorCode::InvalidPath,
            message: format!("知识库路径不存在: {}", kb_path.display()),
            retry_after_ms: None,
            context: None,
        });
    }

    // 初始化知识库
    memoforge_core::init::init_open(kb_path)?;
    Ok(())
}

/// follow 模式服务器：延迟验证 KB
fn run_server_follow_mode(allow_stale_kb: bool, readonly: bool, agent_name: &str) {
    // 不初始化 KB，只设置模式和配置
    tools::set_mode("follow".to_string());
    tools::set_allow_stale_kb(allow_stale_kb);
    tools::set_agent_name(agent_name.to_string());

    // follow 模式不注册 Agent（延迟到实际使用 KB 时）

    let stdin = io::stdin();
    let mut stdout = io::stdout();

    for line in stdin.lock().lines() {
        let line = match line {
            Ok(l) => l,
            Err(_) => break,
        };

        let request: JsonRpcRequest = match serde_json::from_str(&line) {
            Ok(r) => r,
            Err(_) => continue,
        };

        if !request.is_json_rpc_2() {
            continue;
        }

        if let Some(response) = handle_request(request, "follow", readonly) {
            if let Ok(json) = serde_json::to_string(&response) {
                let _ = writeln!(stdout, "{}", json);
                let _ = stdout.flush();
            }
        }
    }
}

/// bound 模式服务器：启动时绑定固定 KB
fn run_server_bound_mode(knowledge_path: std::path::PathBuf, readonly: bool, agent_name: &str) {
    // 注册 Agent
    let agent_name = if agent_name == "unknown" {
        memoforge_core::infer_agent_name()
    } else {
        agent_name.to_string()
    };

    if let Err(e) = memoforge_core::register_agent(&knowledge_path, &agent_name) {
        eprintln!("Warning: Failed to register agent: {}", e.message);
    }

    // Setup cleanup on exit
    let kb_path = knowledge_path.clone();
    ctrlc::set_handler(move || {
        memoforge_core::unregister_agent(&kb_path);
        std::process::exit(0);
    })
    .ok();

    tools::set_kb_path(knowledge_path.clone());
    tools::set_mode("bound".to_string());
    tools::set_agent_name(agent_name);

    let stdin = io::stdin();
    let mut stdout = io::stdout();

    for line in stdin.lock().lines() {
        let line = match line {
            Ok(l) => l,
            Err(_) => break,
        };

        let request: JsonRpcRequest = match serde_json::from_str(&line) {
            Ok(r) => r,
            Err(_) => continue,
        };

        if !request.is_json_rpc_2() {
            continue;
        }

        if let Some(response) = handle_request(request, "bound", readonly) {
            if let Ok(json) = serde_json::to_string(&response) {
                let _ = writeln!(stdout, "{}", json);
                let _ = stdout.flush();
            }
        }
    }

    // Cleanup on normal exit
    memoforge_core::unregister_agent(&knowledge_path);
}

fn handle_request(
    req: JsonRpcRequest,
    mode: &str,
    force_readonly: bool,
) -> Option<JsonRpcResponse> {
    match req.method.as_str() {
        "initialize" => Some(JsonRpcResponse {
            jsonrpc: "2.0".to_string(),
            id: req.id,
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
        }),
        "ping" => Some(JsonRpcResponse {
            jsonrpc: "2.0".to_string(),
            id: req.id,
            result: Some(json!({})),
            error: None,
        }),
        "notifications/initialized" => None,
        "tools/list" => {
            let tools = tools::list_tools();
            Some(JsonRpcResponse {
                jsonrpc: "2.0".to_string(),
                id: req.id,
                result: Some(json!({ "tools": tools })),
                error: None,
            })
        }
        "tools/call" => {
            // follow 模式下，检查状态有效性来决定是否只读
            let readonly = if force_readonly {
                true
            } else if mode == "follow" {
                // 检查编辑器状态是否有效
                match memoforge_core::editor_state::EditorState::load_global() {
                    Ok(Some(state)) if state.state_valid => false, // 状态有效，允许写入
                    _ => true,                                     // 状态无效，只读
                }
            } else {
                false // bound 模式始终可写
            };

            let result = tools::call_tool(req.params, readonly);
            match result {
                Ok(content) => Some(JsonRpcResponse {
                    jsonrpc: "2.0".to_string(),
                    id: req.id,
                    result: Some(json!({ "content": [{ "type": "text", "text": content }] })),
                    error: None,
                }),
                Err(e) => Some(JsonRpcResponse {
                    jsonrpc: "2.0".to_string(),
                    id: req.id,
                    result: None,
                    error: Some(JsonRpcError {
                        code: -32000,
                        message: e.message,
                        data: Some(json!({ "code": e.code })),
                    }),
                }),
            }
        }
        _ => Some(JsonRpcResponse {
            jsonrpc: "2.0".to_string(),
            id: req.id,
            result: None,
            error: Some(JsonRpcError {
                code: -32601,
                message: "Method not found".to_string(),
                data: None,
            }),
        }),
    }
}
