#!/usr/bin/env python3
"""
简单测试 MCP Server 的 get_editor_state 工具是否存在
"""

import json
import subprocess
import sys

def test_get_editor_state_tool():
    """测试 get_editor_state 工具是否在工具列表中"""

    # 创建测试请求
    request = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "tools/list",
        "params": None
    }

    # 启动 MCP Server 并发送请求
    process = subprocess.Popen(
        ["./target/release/memoforge", "serve", "--mode", "bound", "--knowledge-path", "/tmp/test"],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True
    )

    try:
        # 发送请求
        stdout, stderr = process.communicate(json.dumps(request) + "\n", timeout=2)

        # 解析响应
        response = json.loads(stdout)

        # 检查工具列表
        tools = response.get("result", {}).get("tools", [])
        tool_names = [tool["name"] for tool in tools]

        print("可用的 MCP 工具:")
        for name in sorted(tool_names):
            print(f"  - {name}")

        if "get_editor_state" in tool_names:
            print("\n✅ get_editor_state 工具已成功添加到 MCP Server")
            return True
        else:
            print("\n❌ get_editor_state 工具未找到")
            return False

    except subprocess.TimeoutExpired:
        process.kill()
        print("❌ MCP Server 响应超时")
        return False
    except json.JSONDecodeError as e:
        print(f"❌ 无法解析 MCP Server 响应: {e}")
        return False
    except Exception as e:
        print(f"❌ 测试失败: {e}")
        return False

def test_cli_parameters():
    """测试新的 CLI 参数是否正确"""

    print("\n测试新的 CLI 参数...")

    # 测试 --help 参数
    result = subprocess.run(
        ["./target/release/memoforge", "serve", "--help"],
        capture_output=True,
        text=True
    )

    help_text = result.stdout

    required_params = [
        "--mode",
        "follow",
        "bound",
        "--knowledge-path",
        "--allow-stale-kb"
    ]

    missing_params = []
    for param in required_params:
        if param not in help_text:
            missing_params.append(param)

    if missing_params:
        print(f"❌ 以下 CLI 参数未找到: {missing_params}")
        return False
    else:
        print("✅ 所有必需的 CLI 参数都已正确实现")
        return True

if __name__ == "__main__":
    print("=" * 60)
    print("MCP Server AI 协作机制集成测试")
    print("=" * 60)

    # 测试 CLI 参数
    cli_test_passed = test_cli_parameters()

    # 测试 get_editor_state 工具
    tool_test_passed = test_get_editor_state_tool()

    print("\n" + "=" * 60)
    print("测试结果:")
    print("=" * 60)
    print(f"CLI 参数测试: {'✅ 通过' if cli_test_passed else '❌ 失败'}")
    print(f"MCP 工具测试: {'✅ 通过' if tool_test_passed else '❌ 失败'}")
    print("=" * 60)

    if cli_test_passed and tool_test_passed:
        print("\n🎉 所有测试通过！")
        sys.exit(0)
    else:
        print("\n❌ 部分测试失败")
        sys.exit(1)
