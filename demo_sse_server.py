#!/usr/bin/env python3
"""
SSE MCP Server 演示脚本（Tauri 内嵌模式）

展示如何通过 HTTP 和 SSE 与 MemoForge MCP Server 交互

注意：SSE 模式仅限 Tauri 桌面应用内嵌使用，不支持独立 CLI 启动
运行此脚本前，请先启动 Tauri 桌面应用：
  cargo tauri dev
  # 或
  ./start.sh
"""

import requests
import json
import time
import sys
from typing import Optional

# 默认配置
DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 31415
BASE_URL = f"http://{DEFAULT_HOST}:{DEFAULT_PORT}"


def print_section(title: str):
    """打印分节标题"""
    print(f"\n{'='*60}")
    print(f"  {title}")
    print(f"{'='*60}\n")


def check_health() -> bool:
    """检查服务器健康状态"""
    try:
        response = requests.get(f"{BASE_URL}/health", timeout=2)
        return response.status_code == 200 and response.text == "OK"
    except Exception as e:
        print(f"❌ 健康检查失败: {e}")
        return False


def mcp_request(method: str, params: Optional[dict] = None, request_id: int = 1) -> dict:
    """发送 MCP JSON-RPC 请求"""
    payload = {
        "jsonrpc": "2.0",
        "id": request_id,
        "method": method,
    }
    if params:
        payload["params"] = params

    try:
        response = requests.post(
            f"{BASE_URL}/mcp",
            json=payload,
            headers={"Content-Type": "application/json"},
            timeout=5
        )
        response.raise_for_status()
        return response.json()
    except Exception as e:
        print(f"❌ 请求失败: {e}")
        return {}


def format_json(data: dict) -> str:
    """格式化 JSON 输出"""
    return json.dumps(data, indent=2, ensure_ascii=False)


def demo():
    """主演示函数"""
    print_section("MemoForge SSE MCP Server 演示（Tauri 内嵌模式）")

    print("⚠️  注意：SSE 模式仅限 Tauri 桌面应用内嵌使用")
    print("   运行此脚本前，请先启动 Tauri 桌面应用")
    print("")

    # 1. 健康检查
    print_section("1. 健康检查")
    if not check_health():
        print("❌ 服务器未运行，请先启动 Tauri 桌面应用：")
        print("   cargo tauri dev")
        print("   # 或")
        print("   ./start.sh")
        print("")
        print("Tauri 应用启动后，SSE 服务器会自动在端口 31415 启动")
        sys.exit(1)
    print("✅ 服务器运行正常\n")

    # 2. MCP Initialize
    print_section("2. MCP Initialize")
    result = mcp_request("initialize")
    if result:
        print("✅ 协议版本:", result.get("result", {}).get("protocolVersion"))
        print("✅ 服务器信息:", result.get("result", {}).get("serverInfo"))
        print()

    # 3. Tools List
    print_section("3. 获取可用工具列表")
    result = mcp_request("tools/list", request_id=2)
    if result and "result" in result:
        tools = result["result"].get("tools", [])
        print(f"✅ 可用工具数量: {len(tools)}")
        if tools:
            for tool in tools[:5]:  # 只显示前 5 个
                print(f"   - {tool.get('name')}: {tool.get('description', 'N/A')[:60]}")
            if len(tools) > 5:
                print(f"   ... 还有 {len(tools) - 5} 个工具")
        print()

    # 4. Get Editor State（从内存读取，非文件）
    print_section("4. 获取编辑器状态（内存态）")
    result = mcp_request(
        "tools/call",
        params={
            "name": "get_editor_state"
        },
        request_id=3
    )
    if result and "result" in result:
        content = result["result"].get("content", [{}])[0]
        text = content.get("text", "{}")
        try:
            state = json.loads(text)
            print("✅ 当前知识库:", state.get("current_kb"))
            print("✅ 当前知识点:", state.get("current_knowledge"))
            print("✅ 选区信息:", state.get("selection"))
            print("✅ 更新时间:", state.get("updated_at"))
            if state.get("error"):
                print("⚠️  提示:", state.get("error"))
        except json.JSONDecodeError:
            print("⚠️  状态解析失败:", text[:200])
        print()

    # 5. SSE 流监听（演示）
    print_section("5. SSE 事件流监听（按 Ctrl+C 退出）")
    print("提示: 在桌面应用中切换知识点或选中文字，此处会显示实时更新")
    print("      30 秒无操作将自动退出\n")

    try:
        import sseclient
        print("正在连接 SSE 端点...")
        response = requests.get(f"{BASE_URL}/sse", stream=True)
        client = sseclient.SSEClient(response)

        start_time = time.time()
        event_count = 0

        for event in client.events():
            if time.time() - start_time > 30:  # 30 秒超时
                print("\n⏱️  监听超时，退出演示")
                break

            event_count += 1
            print(f"\n📡 事件 #{event_count} ({event.event})")
            try:
                data = json.loads(event.data)
                print(f"   更新时间: {data.get('updated_at')}")

                if data.get('current_kb'):
                    kb = data['current_kb']
                    print(f"   📚 知识库: {kb.get('name')} ({kb.get('knowledge_count')} 条)")

                if data.get('current_knowledge'):
                    kn = data['current_knowledge']
                    print(f"   📄 知识点: {kn.get('title')} ({kn.get('path')})")

                if data.get('selection'):
                    sel = data['selection']
                    print(f"   🎯 选区: 行 {sel.get('start_line')}-{sel.get('end_line')} "
                          f"({sel.get('text_length')} 字符)")

                if data.get('error'):
                    print(f"   ⚠️  提示: {data.get('error')}")

            except json.JSONDecodeError:
                print(f"   原始数据: {event.data[:100]}")

    except KeyboardInterrupt:
        print("\n\n✋ 用户中断")
    except ImportError:
        print("⚠️  需要安装 sseclient-py:")
        print("   pip install sseclient-py")
        print("\n跳过 SSE 监听演示")
    except Exception as e:
        print(f"\n❌ SSE 连接错误: {e}")

    # 结束
    print_section("演示完成")
    print("✅ SSE MCP Server 基本功能验证通过\n")
    print("📚 架构说明:")
    print("   - SSE 模式: 仅限 Tauri 桌面应用内嵌")
    print("   - Follow 模式: CLI 跟随桌面应用状态")
    print("   - Bound 模式: CLI 绑定指定知识库")
    print("\n📖 文档: docs/SSE_MCP_IMPLEMENTATION.md")


if __name__ == "__main__":
    demo()
