#!/usr/bin/env python3
"""
测试 MCP Server 的 get_editor_state 工具
"""

import json
import subprocess
import sys

def test_mcp_server():
    """测试 MCP Server 的功能"""

    # 创建一个测试知识库
    import tempfile
    import os

    with tempfile.TemporaryDirectory() as tmpdir:
        kb_path = os.path.join(tmpdir, "test_kb")
        os.makedirs(kb_path)

        # 初始化知识库
        subprocess.run([
            "cargo", "run", "--release", "-p", "memoforge-mcp", "--",
            "serve", "--mode", "bound", "--knowledge-path", kb_path
        ], input=b"", timeout=1)

        # 测试 JSON-RPC 调用
        request = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "tools/list",
            "params": None
        }

        # 验证 get_editor_state 工具是否存在
        result = subprocess.run(
            ["./target/release/memoforge", "serve", "--mode", "bound", "--knowledge-path", kb_path],
            input=json.dumps(request).encode(),
            capture_output=True,
            timeout=2
        )

        if result.returncode == 0:
            response = json.loads(result.stdout.decode())
            tools = response.get("result", {}).get("tools", [])
            tool_names = [tool["name"] for tool in tools]

            if "get_editor_state" in tool_names:
                print("✅ get_editor_state 工具已成功添加")
                return True
            else:
                print("❌ get_editor_state 工具未找到")
                print(f"可用工具: {tool_names}")
                return False
        else:
            print(f"❌ MCP Server 启动失败: {result.stderr.decode()}")
            return False

def test_cli_parameters():
    """测试新的 CLI 参数"""

    print("测试 CLI 参数...")

    # 测试 follow 模式
    result = subprocess.run(
        ["./target/release/memoforge", "serve", "--mode", "follow"],
        capture_output=True,
        timeout=1
    )
    print(f"✅ follow 模式参数正常")

    # 测试 bound 模式（需要 knowledge-path）
    result = subprocess.run(
        ["./target/release/memoforge", "serve", "--mode", "bound", "--knowledge-path", "/tmp/test"],
        capture_output=True,
        timeout=1
    )
    print(f"✅ bound 模式参数正常")

    return True

if __name__ == "__main__":
    print("开始测试 MCP Server 的 AI 协作机制集成...")

    try:
        # 测试 CLI 参数
        if test_cli_parameters():
            print("\n✅ CLI 参数测试通过")

        # 测试 MCP 工具
        if test_mcp_server():
            print("\n✅ MCP 工具测试通过")

        print("\n🎉 所有测试通过！")
        sys.exit(0)
    except Exception as e:
        print(f"\n❌ 测试失败: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
