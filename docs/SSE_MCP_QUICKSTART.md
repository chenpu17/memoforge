# SSE MCP Server 快速入门

**注意： SSE 模式仅限 Tauri 桌面应用内嵌使用，不支持独立 CLI 启动。**

## 5 分钟快速体验

### 步骤 1: 启动 Tauri 桌面应用

```bash
# 编译项目
cargo build --release

# 启动 Tauri 桌面应用（SSE 服务器会自动启动）
cargo tauri dev
# 或使用启动脚本
./start.sh
```

Tauri 应用启动后，SSE 服务器会自动在端口 31415 启动。

输出：
```
[MCP SSE] Server listening on http://127.0.0.1:31415
```

### 步骤 2: 测试健康检查

打开新终端：

```bash
curl http://127.0.0.1:31415/health
```

输出：
```
OK
```

### 步骤 3: 测试 MCP 协议

```bash
curl -X POST http://127.0.0.1:31415/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize"}'
```

输出:
```json
{
  "jsonrpc": "2.0",
  "result": {
    "protocolVersion": "2024-11-05",
    "capabilities": {
      "tools": {}
    },
    "serverInfo": {
      "name": "memoforge",
      "version": "0.1.0"
    }
  }
}
```

### 步骤 4: 获取工具列表
```bash
curl -X POST http://127.0.0.1:31415/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'
```
输出（工具数量会根据版本不同）。

### 步骤 5: 获取编辑器状态
```bash
curl -X POST http://127.0.0.1:31415/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"get_editor_state"}}'
```
输出示例（状态为空时表示未打开知识库）。

### 步骤 6: 监听 SSE 事件
```bash
curl -N http://127.0.0.1:31415/mcp
```
你会看到初始状态推送，然后每 30 秒收到一次 keepalive 消息。

## 自动化测试

运行 E2E 测试（需要 Tauri 应用运行):

```bash
./tests/sse_e2e.py
```

测试覆盖:
- ✅ 健康检查
- ✅ MCP Initialize
- ✅ Tools List
- ✅ Get Editor State
- ✅ SSE 连接

## 故障排除

### 服务器未运行
确认 Tauri 桌面应用已启动:
```bash
# 检查端口
lsof -i :31415

# 或使用其他端口
MEMOFORGE_MCP_PORT=3030 cargo tauri dev
```

## Claude Code 集成

在 `~/.claude/mcp.json` 中添加:

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

## 下一步
- 查看 `docs/SSE_MCP_IMPLEMENTATION.md` 了解实现细节
- 使用 Python SDK 开发自定义 AI Agent
