#!/bin/bash
# MemoForge 端到端测试脚本

set -e

echo "=== MemoForge E2E Test ==="

# 1. 创建临时测试目录
TEST_DIR=$(mktemp -d)
echo "Test directory: $TEST_DIR"

# 2. 测试 Core API
echo ""
echo "Testing Core API..."
cd "$(dirname "$0")/.."
cargo run --bin test-core-api -- "$TEST_DIR"

# 3. 测试 MCP Server
echo ""
echo "Testing MCP Server..."
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}' | \
  cargo run --bin memoforge -- --kb-path "$TEST_DIR" 2>/dev/null | grep -q "result"
echo "✓ MCP Server initialize OK"

# 4. 清理
rm -rf "$TEST_DIR"
echo ""
echo "=== All E2E Tests Passed ==="
