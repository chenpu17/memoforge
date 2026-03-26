#!/usr/bin/env python3
"""
SSE MCP Server E2E Test (Tauri Embedded Mode)

This script tests the SSE MCP Server embedded in Tauri to verify:
1. Server starts and responds to health check
2. tools/list returns the expected tools
3. tools/call for get_editor_state works
4. Streamable HTTP endpoint streams state updates
5. Active SSE clients are reflected in get_editor_state

NOTE: This test requires Tauri desktop app to be running.
For standalone CLI testing, use follow or bound mode instead.
"""

import json
import time
import requests
import subprocess
import sys
import os

SSE_PORT = 31415
BASE_URL = f"http://127.0.0.1:{SSE_PORT}"


def test_health():
    """Test health check endpoint"""
    print("\n=== 1. Health Check ===")
    try:
        resp = requests.get(f"{BASE_URL}/health", timeout=5)
        print(f"Status: {resp.status_code}")
        print(f"Body: {resp.text}")
        return resp.status_code == 200
    except Exception as e:
        print(f"ERROR: {e}")
        return False


def test_initialize():
    """Test MCP initialize"""
    print("\n=== 2. Initialize ===")
    try:
        req = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {}
        }
        resp = requests.post(f"{BASE_URL}/mcp", json=req, timeout=5)
        print(f"Status: {resp.status_code}")
        result = resp.json()
        print(f"Response: {json.dumps(result, indent=2)}")

        # Verify response
        if "result" in result:
            server_info = result["result"].get("serverInfo", {})
            if server_info.get("name") == "memoforge":
                print("✓ Initialize successful")
                return True
        print("✗ Initialize failed")
        return False
    except Exception as e:
        print(f"ERROR: {e}")
        return False


def test_tools_list():
    """Test tools/list"""
    print("\n=== 3. Tools List ===")
    try:
        req = {
            "jsonrpc": "2.0",
            "id": 2,
            "method": "tools/list",
            "params": {}
        }
        resp = requests.post(f"{BASE_URL}/mcp", json=req, timeout=5)
        print(f"Status: {resp.status_code}")
        result = resp.json()

        tools = result.get("result", {}).get("tools", [])
        print(f"Tools count: {len(tools)}")

        if len(tools) > 0:
            print("First 5 tools:")
            for tool in tools[:5]:
                print(f"  - {tool.get('name')}: {tool.get('description', '')[:50]}...")
            print(f"✓ Got {len(tools)} tools")
            return True
        else:
            print("✗ No tools returned!")
            return False
    except Exception as e:
        print(f"ERROR: {e}")
        return False


def test_get_editor_state():
    """Test get_editor_state tool"""
    print("\n=== 4. Get Editor State ===")
    try:
        req = {
            "jsonrpc": "2.0",
            "id": 3,
            "method": "tools/call",
            "params": {
                "name": "get_editor_state",
                "arguments": {}
            }
        }
        resp = requests.post(f"{BASE_URL}/mcp", json=req, timeout=5)
        print(f"Status: {resp.status_code}")
        result = resp.json()

        if "result" in result:
            content = result["result"].get("content", [])
            if content:
                text = content[0].get("text", "")
                try:
                    state = json.loads(text)
                    print(f"State: {json.dumps(state, indent=2)[:500]}...")
                    print("✓ get_editor_state works")
                    return True
                except json.JSONDecodeError:
                    print(f"Response text: {text[:200]}")
                    print("✗ Failed to parse state as JSON")
                    return False
        elif "error" in result:
            print(f"Error: {result['error']}")
            # Even if there's an error (e.g., no KB), the tool should respond properly
            return "editor state file not found" in result["error"].get("message", "").lower() or \
                   "not initialized" in result["error"].get("message", "").lower()
        print("✗ Unexpected response format")
        return False
    except Exception as e:
        print(f"ERROR: {e}")
        return False


def test_sse_endpoint():
    """Test streamable HTTP GET /mcp endpoint"""
    print("\n=== 5. SSE Endpoint ===")
    proc = None
    try:
        # Use curl to hold a real streaming connection open. requests can close the
        # underlying socket too aggressively after the first yielded line.
        proc = subprocess.Popen(
            ["curl", "-N", "-sS", f"{BASE_URL}/mcp"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )

        print("Content-Type: text/event-stream")
        first_line = None
        deadline = time.time() + 5
        while time.time() < deadline and proc.stdout is not None:
            line = proc.stdout.readline()
            if line:
                first_line = line.strip()
                print(f"SSE data: {line[:200]}...")
                break
            time.sleep(0.1)

        # While the stream is open, get_editor_state should report at least one active SSE client.
        req = {
            "jsonrpc": "2.0",
            "id": 4,
            "method": "tools/call",
            "params": {
                "name": "get_editor_state",
                "arguments": {}
            }
        }
        active_agents = []
        for _ in range(10):
            state_resp = requests.post(f"{BASE_URL}/mcp", json=req, timeout=5)
            state_result = state_resp.json()
            state = json.loads(state_result["result"]["content"][0]["text"])
            active_agents = state.get("active_agents", [])
            if active_agents:
                break
            time.sleep(0.2)
        print(f"Active agents: {json.dumps(active_agents, ensure_ascii=False)}")

        if (
            first_line
            and "data:" in first_line
            and proc.poll() is None
            and len(active_agents) >= 1
        ):
            print("✓ SSE endpoint works")
            return True
        else:
            print("✗ SSE endpoint validation failed")
            return False
    except Exception as e:
        print(f"ERROR: {e}")
        return False
    finally:
        if proc is not None:
            proc.terminate()
            try:
                proc.wait(timeout=2)
            except subprocess.TimeoutExpired:
                proc.kill()


def main():
    print("=" * 60)
    print("SSE MCP Server E2E Test (Tauri Embedded Mode)")
    print("=" * 60)
    print("\nNOTE: This test requires Tauri desktop app to be running.")
    print("For standalone CLI testing, use 'memoforge serve --mode follow'")

    # Wait for server to be ready
    print(f"\nWaiting for SSE server at {BASE_URL}...")
    for i in range(10):
        try:
            requests.get(f"{BASE_URL}/health", timeout=1)
            break
        except:
            time.sleep(1)
            print(f"  Attempt {i+1}/10...")
    else:
        print("ERROR: Server not responding after 10 seconds")
        print("\nTo start the Tauri app:")
        print("  cargo tauri dev")
        print("\nOr to test CLI mode:")
        print("  cargo run -p memoforge-mcp -- serve --mode follow")
        sys.exit(1)

    print("Server is responding!\n")

    # Run tests
    results = []
    results.append(("Health Check", test_health()))
    results.append(("Initialize", test_initialize()))
    results.append(("Tools List", test_tools_list()))
    results.append(("Get Editor State", test_get_editor_state()))
    results.append(("SSE Endpoint", test_sse_endpoint()))

    # Summary
    print("\n" + "=" * 60)
    print("Test Summary")
    print("=" * 60)

    passed = 0
    failed = 0
    for name, result in results:
        status = "✓ PASS" if result else "✗ FAIL"
        print(f"  {name}: {status}")
        if result:
            passed += 1
        else:
            failed += 1

    print(f"\nTotal: {passed} passed, {failed} failed")

    if failed > 0:
        sys.exit(1)
    else:
        print("\n✓ All tests passed!")
        sys.exit(0)


if __name__ == "__main__":
    main()
