//! MemoForge MCP Server
//! 参考: 技术实现文档 §4

mod tools;

use clap::Parser;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::io::{self, BufRead, Write};

#[derive(Parser)]
#[command(name = "memoforge", version, about = "MemoForge - AI-driven knowledge management")]
enum Cli {
    Serve {
        #[arg(long)]
        knowledge_path: std::path::PathBuf,
        #[arg(long, default_value = "readwrite")]
        mode: String,
    },
}

#[derive(Debug, Deserialize)]
struct JsonRpcRequest {
    jsonrpc: String,
    id: Option<Value>,
    method: String,
    params: Option<Value>,
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
        Cli::Serve { knowledge_path, mode } => {
            let readonly = mode == "readonly";
            run_server(knowledge_path, readonly);
        }
    }
}

fn run_server(knowledge_path: std::path::PathBuf, readonly: bool) {
    // Initialize knowledge base
    if let Err(e) = memoforge_core::init::init_open(&knowledge_path) {
        eprintln!("Failed to open knowledge base: {}", e.message);
        std::process::exit(1);
    }

    tools::set_kb_path(knowledge_path);

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

        let response = handle_request(request, readonly);

        if let Ok(json) = serde_json::to_string(&response) {
            let _ = writeln!(stdout, "{}", json);
            let _ = stdout.flush();
        }
    }
}

fn handle_request(req: JsonRpcRequest, readonly: bool) -> JsonRpcResponse {
    match req.method.as_str() {
        "initialize" => JsonRpcResponse {
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
        },
        "tools/list" => {
            let tools = tools::list_tools();
            JsonRpcResponse {
                jsonrpc: "2.0".to_string(),
                id: req.id,
                result: Some(json!({ "tools": tools })),
                error: None,
            }
        },
        "tools/call" => {
            let result = tools::call_tool(req.params, readonly);
            match result {
                Ok(content) => JsonRpcResponse {
                    jsonrpc: "2.0".to_string(),
                    id: req.id,
                    result: Some(json!({ "content": [{ "type": "text", "text": content }] })),
                    error: None,
                },
                Err(e) => JsonRpcResponse {
                    jsonrpc: "2.0".to_string(),
                    id: req.id,
                    result: None,
                    error: Some(JsonRpcError {
                        code: -32000,
                        message: e.message,
                        data: Some(json!({ "code": e.code })),
                    }),
                }
            }
        },
        _ => JsonRpcResponse {
            jsonrpc: "2.0".to_string(),
            id: req.id,
            result: None,
            error: Some(JsonRpcError {
                code: -32601,
                message: "Method not found".to_string(),
                data: None,
            }),
        },
    }
}
