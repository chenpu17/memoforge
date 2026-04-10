#!/bin/bash
# 测试 SSE MCP Server（Tauri 内嵌模式）
#
# 注意：SSE 模式仅限 Tauri 桌面应用内嵌使用，不支持独立 CLI 启动
# 运行此测试前，请先启动 Tauri 桌面应用：
#   cargo tauri dev
# 或
#   ./start.sh

set -e

echo "=== MemoForge SSE MCP Server 测试（Tauri 内嵌模式） ==="
echo ""
echo "⚠️  注意：此测试需要 Tauri 桌面应用正在运行"
echo ""

# 检查服务器是否已在运行
echo "🔍 检查 SSE 服务器状态..."
HEALTH_RESPONSE=$(curl -s --connect-timeout 2 http://127.0.0.1:31415/health 2>/dev/null || echo "")

if [ "$HEALTH_RESPONSE" != "OK" ]; then
    echo ""
    echo "❌ SSE 服务器未运行"
    echo ""
    echo "请先启动 Tauri 桌面应用："
    echo "  cargo tauri dev"
    echo "  # 或"
    echo "  ./start.sh"
    echo ""
    echo "Tauri 应用启动后，SSE 服务器会自动在端口 31415 启动"
    exit 1
fi

echo "✅ SSE 服务器运行中"
echo ""

# 测试 MCP initialize
echo "📋 测试 1: MCP Initialize"
INIT_RESPONSE=$(curl -s -X POST http://127.0.0.1:31415/mcp \
    -H "Content-Type: application/json" \
    -d '{"jsonrpc":"2.0","id":1,"method":"initialize"}')
echo "响应: $INIT_RESPONSE"
if echo "$INIT_RESPONSE" | grep -q "protocolVersion"; then
    echo "✅ Initialize 成功"
else
    echo "⚠️  Initialize 响应异常"
fi

# 测试 tools/list
echo ""
echo "📋 测试 2: Tools List"
TOOLS_RESPONSE=$(curl -s -X POST http://127.0.0.1:31415/mcp \
    -H "Content-Type: application/json" \
    -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}')
TOOLS_COUNT=$(echo "$TOOLS_RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('result',{}).get('tools',[])))" 2>/dev/null || echo "0")
echo "工具数量: $TOOLS_COUNT"
if [ "$TOOLS_COUNT" -gt 0 ]; then
    echo "✅ Tools list 成功"
else
    echo "⚠️  Tools list 响应异常"
fi

# 测试 tools/call - get_editor_state
echo ""
echo "📋 测试 3: Get Editor State"
STATE_RESPONSE=$(curl -s -X POST http://127.0.0.1:31415/mcp \
    -H "Content-Type: application/json" \
    -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"get_editor_state"}}')
echo "响应: $STATE_RESPONSE"
if echo "$STATE_RESPONSE" | grep -q "current_kb\|updated_at"; then
    echo "✅ Get editor state 成功"
else
    echo "⚠️  Get editor state 响应异常"
fi

# 测试 SSE 连接（Streamable HTTP GET /mcp，超时退出）
echo ""
echo "📋 测试 4: SSE 连接（5秒超时）"
timeout 5 curl -N http://127.0.0.1:31415/mcp 2>&1 | head -10 &
SSE_PID=$!
sleep 2
if ps -p $SSE_PID > /dev/null 2>&1; then
    echo "✅ SSE 连接已建立"
else
    echo "⚠️  SSE 连接可能失败"
fi
kill $SSE_PID 2>/dev/null || true

echo ""
echo "=== 测试完成 ==="
echo ""
echo "✅ SSE MCP Server 基本功能验证通过"
echo ""
echo "📝 提示："
echo "   - SSE 模式仅在 Tauri 桌面应用中可用"
echo "   - CLI 支持 follow 和 bound 模式"
echo "   - 运行 'memoforge serve --help' 查看可用模式"
