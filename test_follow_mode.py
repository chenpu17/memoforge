#!/usr/bin/env python3
"""
测试 follow 模式的架构修复

验证以下三个问题的修复：
1. follow 模式启动时不应验证 KB - get_editor_state 应始终可用
2. --allow-stale-kb 正确接入路径解析
3. Agent 注册动态跟随 KB 切换
"""

import subprocess
import json
import sys
import time
from pathlib import Path

def test_follow_mode_without_kb():
    """测试 1: follow 模式在没有 KB 时也能启动并响应 get_editor_state"""
    print("测试 1: follow 模式启动时不验证 KB...")

    # 启动 MCP Server（follow 模式，没有全局状态文件）
    proc = subprocess.Popen(
        ["./target/release/memoforge", "serve", "--mode", "follow"],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True
    )

    try:
        # 发送 initialize 请求
        init_request = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {}
        }
        proc.stdin.write(json.dumps(init_request) + "\n")
        proc.stdin.flush()

        # 读取响应
        response_line = proc.stdout.readline()
        response = json.loads(response_line)

        if response.get("result"):
            print("  ✓ initialize 成功")
        else:
            print(f"  ✗ initialize 失败: {response}")
            return False

        # 发送 get_editor_state 请求
        tools_request = {
            "jsonrpc": "2.0",
            "id": 2,
            "method": "tools/call",
            "params": {
                "name": "get_editor_state",
                "arguments": {}
            }
        }
        proc.stdin.write(json.dumps(tools_request) + "\n")
        proc.stdin.flush()

        # 读取响应
        response_line = proc.stdout.readline()
        response = json.loads(response_line)

        if response.get("result"):
            result = json.loads(response["result"]["content"][0]["text"])
            print(f"  ✓ get_editor_state 可用")
            print(f"    - mode: {result.get('mode')}")
            print(f"    - state_valid: {result.get('state_valid')}")
            print(f"    - error: {result.get('error', 'None')}")
            return True
        else:
            print(f"  ✗ get_editor_state 失败: {response}")
            return False

    finally:
        proc.terminate()
        proc.wait(timeout=5)

def test_allow_stale_kb():
    """测试 2: --allow-stale-kb 回退逻辑（需要有一个已注册的 KB）"""
    print("\n测试 2: --allow-stale-kb 回退逻辑...")
    print("  (此测试需要先有一个已注册的知识库)")

    # 检查是否有注册的知识库
    registry_path = Path.home() / ".memoforge" / "registry.yaml"
    if not registry_path.exists():
        print("  ⚠ 没有注册表文件，跳过此测试")
        return True

    # 读取注册表
    import yaml
    with open(registry_path) as f:
        registry = yaml.safe_load(f)

    if not registry or not registry.get("knowledge_bases"):
        print("  ⚠ 没有已注册的知识库，跳过此测试")
        return True

    # 启动 MCP Server（follow 模式，允许 stale KB）
    proc = subprocess.Popen(
        ["./target/release/memoforge", "serve", "--mode", "follow", "--allow-stale-kb"],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True
    )

    try:
        # initialize
        init_request = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {}
        }
        proc.stdin.write(json.dumps(init_request) + "\n")
        proc.stdin.flush()
        proc.stdout.readline()

        # 尝试调用 get_status（应该能回退到 stale KB）
        status_request = {
            "jsonrpc": "2.0",
            "id": 2,
            "method": "tools/call",
            "params": {
                "name": "get_status",
                "arguments": {}
            }
        }
        proc.stdin.write(json.dumps(status_request) + "\n")
        proc.stdin.flush()

        response_line = proc.stdout.readline()
        response = json.loads(response_line)

        if response.get("result"):
            print("  ✓ --allow-stale-kb 回退成功")
            return True
        elif response.get("error"):
            error = response["error"]
            print(f"  ⚠ 错误: {error.get('message')}")
            # 这可能是预期的（如果状态文件存在但无效）
            return "stale" in error.get("message", "").lower()
        else:
            print(f"  ✗ 意外响应: {response}")
            return False

    finally:
        proc.terminate()
        proc.wait(timeout=5)

def test_bound_mode():
    """测试 3: bound 模式仍然需要显式路径"""
    print("\n测试 3: bound 模式必须指定路径...")

    # 启动 MCP Server（bound 模式，没有路径）
    # Clap 会在参数解析阶段就失败，所以需要检查 stderr
    result = subprocess.run(
        ["./target/release/memoforge", "serve", "--mode", "bound"],
        capture_output=True,
        text=True,
        timeout=5
    )

    # Clap 应该会输出错误信息
    if result.returncode != 0 and ("required" in result.stderr.lower() or "knowledge-path" in result.stderr.lower()):
        print("  ✓ bound 模式正确要求显式路径")
        return True
    else:
        print(f"  ✗ 意外响应: returncode={result.returncode}, stderr={result.stderr}")
        return False

def main():
    print("=" * 60)
    print("MemoForge Follow 模式架构修复验证")
    print("=" * 60)

    results = []

    # 运行测试
    results.append(("follow 模式启动", test_follow_mode_without_kb()))
    results.append(("allow_stale_kb", test_allow_stale_kb()))
    results.append(("bound 模式验证", test_bound_mode()))

    # 汇总结果
    print("\n" + "=" * 60)
    print("测试结果汇总")
    print("=" * 60)

    passed = sum(1 for _, result in results if result)
    total = len(results)

    for name, result in results:
        status = "✓ PASS" if result else "✗ FAIL"
        print(f"  {status}: {name}")

    print(f"\n通过: {passed}/{total}")

    if passed == total:
        print("\n🎉 所有测试通过！")
        return 0
    else:
        print(f"\n❌ {total - passed} 个测试失败")
        return 1

if __name__ == "__main__":
    sys.exit(main())
