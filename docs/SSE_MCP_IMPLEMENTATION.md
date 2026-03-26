# SSE MCP Server 实现文档

## 概述

本实现为 MemoForge 项目添加了 SSE (Server-Sent Events) MCP Server 支持，允许 Tauri 桌面应用内嵌 MCP 服务，实现实时状态同步。

## 架构设计

### 端口配置

- **默认端口**: 31415
- **环境变量**: `MEMOFORGE_MCP_PORT`
- **绑定地址**: 127.0.0.1（仅本地访问）

### 端点说明

| 端点 | 方法 | 说明 |
|------|------|------|
| `/health` | GET | 健康检查 |
| `/mcp` | POST | MCP JSON-RPC 请求 |
| `/sse` | GET | SSE 状态推送 |

### 数据流

```
┌─────────────────────────────────────────────────────────┐
│                    Tauri Desktop App                    │
│                                                          │
│  ┌──────────────┐          ┌────────────────────────┐  │
│  │  React UI    │          │  SSE MCP Server        │  │
│  │              │──────────│  (localhost:31415)     │  │
│  │  - Editor    │  State   │  - /mcp endpoint       │  │
│  │  - Sidebar   │  Update  │  - /sse endpoint       │  │
│  └──────────────┘          └────────────────────────┘  │
│                                      │                   │
│                                      │ SSE               │
│                                      ▼                   │
│                          ┌──────────────────────┐       │
│                          │  AI Agent            │       │
│                          │  (Claude Code)       │       │
│                          └──────────────────────┘       │
└─────────────────────────────────────────────────────────┘
```

## 使用方法

### 启动 SSE Server

**方式 1: 启动 Tauri 桌面应用**（推荐）

```bash
cargo tauri dev
# 或
./start.sh
```

Tauri 应用启动后，SSE 服务器会自动在端口 31415 启动。

**方式 2: 独立 MCP Server**（仅支持 follow/bound 模式）

```bash
# follow 模式 - 跟随桌面应用状态
cargo run -p memoforge-mcp -- serve --mode follow

# bound 模式 - 绑定指定知识库
cargo run -p memoforge-mcp -- serve --mode bound --knowledge-path /path/to/kb
```

### 2. 测试端点

```bash
# 健康检查
curl http://127.0.0.1:31415/health

# MCP Initialize
curl -X POST http://127.0.0.1:31415/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize"}'

# 获取编辑器状态
curl -X POST http://127.0.0.1:31415/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"get_editor_state"}}'

# 监听 SSE 事件流
curl -N http://127.0.0.1:31415/sse
```

### 3. Claude Code 配置

```json
{
  "mcpServers": {
    "memoforge": {
      "type": "sse",
      "url": "http://127.0.0.1:31415/mcp"
    }
  }
}
```

## 实现细节

### 状态管理

使用 `tokio::sync::watch` 通道实现状态广播：

```rust
// 创建 watch channel
let (tx, rx) = watch::channel(initial_state);

// MCP Server 持有接收器
pub struct McpServerState {
    pub editor_state_rx: watch::Receiver<EditorStateSnapshot>,
}

// Tauri 端持有发送器
tx.send(new_state)?;
```

### SSE 事件流

```rust
async fn handle_sse_connect(
    State(state): State<Arc<McpServerState>>,
) -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
    let mut rx = state.editor_state_rx.clone();

    let stream = async_stream::stream! {
        // 发送初始状态
        yield Ok(Event::default().data(serde_json::to_string(&rx.borrow()).unwrap()));

        // 监听状态变化
        loop {
            match rx.changed().await {
                Ok(()) => yield Ok(Event::default().data(...)),
                Err(_) => break,
            }
        }
    };

    Sse::new(stream).keep_alive(
        axum::response::sse::KeepAlive::new()
            .interval(Duration::from_secs(30))
            .text("keepalive")
    )
}
```

### 编辑器状态结构

```rust
#[derive(Debug, Clone, Serialize, Default)]
pub struct EditorStateSnapshot {
    pub current_kb: Option<CurrentKb>,
    pub current_knowledge: Option<CurrentKnowledge>,
    pub selection: Option<Selection>,
    pub updated_at: String,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct CurrentKb {
    pub path: String,
    pub name: String,
    pub knowledge_count: usize,
}

#[derive(Debug, Clone, Serialize)]
pub struct CurrentKnowledge {
    pub path: String,
    pub title: String,
    pub category: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct Selection {
    pub start_line: usize,
    pub end_line: usize,
    pub has_text: bool,
    pub text_length: usize,
    pub selected_text: Option<String>,
}
```

## 与 Tauri 集成

### 1. 在 Tauri 中启动 SSE Server

```rust
// crates/memoforge-tauri/src/main.rs

#[tokio::main]
async fn main() {
    // 创建状态通道
    let (tx, rx) = watch::channel(EditorStateSnapshot::default());

    // 启动 SSE Server（后台任务）
    let server_state = Arc::new(McpServerState {
        config: McpServerConfig::default(),
        editor_state_rx: rx,
    });

    tokio::spawn(async move {
        if let Err(e) = start_sse_server(server_state).await {
            eprintln!("SSE Server error: {}", e);
        }
    });

    // 将 tx 保存到 Tauri 状态中
    tauri::Builder::default()
        .manage(tx)
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

### 2. Tauri 命令更新状态

```rust
#[tauri::command]
async fn update_selection(
    tx: State<watch::Sender<EditorStateSnapshot>>,
    start_line: usize,
    end_line: usize,
    text: Option<String>,
) -> Result<(), String> {
    let mut state = tx.borrow().clone();

    state.selection = Some(Selection {
        start_line,
        end_line,
        has_text: text.is_some(),
        text_length: text.as_ref().map(|t| t.len()).unwrap_or(0),
        selected_text: text,
    });
    state.updated_at = Utc::now().to_rfc3339();

    tx.send(state).map_err(|e| e.to_string())?;
    Ok(())
}
```

### 3. 前端监听选区变化

```typescript
// frontend/src/hooks/useEditorStatePublisher.ts

import { invoke } from '@tauri-apps/api/core'

export function useEditorStatePublisher() {
  const updateSelection = useCallback((
    startLine: number,
    endLine: number,
    text?: string
  ) => {
    invoke('update_selection', {
      startLine,
      endLine,
      text
    })
  }, [])

  return { updateSelection }
}

// frontend/src/components/Editor.tsx

const { updateSelection } = useEditorStatePublisher()

<CodeMirror
  onSelectionChange={(selection) => {
    const selectedText = editor.state.sliceDoc(selection.from, selection.to)
    updateSelection(startLine, endLine, selectedText)
  }}
/>
```

## 错误处理

### 连接错误

```rust
// SSE 连接断开
match rx.changed().await {
    Ok(()) => { /* 正常更新 */ }
    Err(_) => {
        // Channel 关闭，结束 SSE 流
        break;
    }
}
```

### JSON-RPC 错误

```rust
JsonRpcResponse {
    jsonrpc: "2.0".to_string(),
    id: request.id,
    result: None,
    error: Some(JsonRpcError {
        code: -32601,
        message: "Method not found".to_string(),
        data: None,
    }),
}
```

## 性能考虑

1. **状态更新防抖**: 前端选区变化应使用 100ms 防抖
2. **SSE Keep-Alive**: 每 30 秒发送 keepalive 消息
3. **状态序列化**: 使用 `serde_json::to_string` 预先序列化
4. **内存管理**: watch channel 只保留最新状态

## 安全性

1. **本地绑定**: 仅监听 127.0.0.1
2. **CORS 配置**: 允许任意源（仅用于本地开发）
3. **无认证**: 当前实现未添加认证，适合本地使用

## 测试

运行测试脚本：

```bash
./test_sse_server.sh
```

测试覆盖：
- ✅ 健康检查
- ✅ MCP Initialize
- ✅ Tools List
- ✅ Get Editor State
- ✅ SSE 连接

## 后续优化

1. **认证**: 添加 Token 认证支持
2. **加密**: 支持 HTTPS
3. **压缩**: SSE 消息压缩
4. **重连**: 客户端自动重连机制
5. **指标**: 添加 Prometheus 指标

## 参考资料

- [MCP Protocol Specification](https://modelcontextprotocol.io/)
- [Server-Sent Events (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events)
- [Axum SSE Example](https://docs.rs/axum/latest/axum/response/struct.Sse.html)
