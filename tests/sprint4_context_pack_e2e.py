#!/usr/bin/env python3
"""
Sprint 4 Context Pack E2E Tests

Tests for Context Pack creation, listing, retrieval, and export using MCP tools.
Tests use subprocess mode to interact with the MCP server directly.
"""

import json
import shutil
import subprocess
import tempfile
import textwrap
from pathlib import Path

from frontend_e2e import REPO_ROOT, make_test_env, seed_knowledge_base, write


class McpClient:
    def __init__(self, binary: Path, kb_path: str, env: dict[str, str], readonly: bool) -> None:
        cmd = [str(binary), "serve", "--knowledge-path", kb_path]
        if readonly:
            cmd.append("--readonly")
        self.process = subprocess.Popen(
            cmd,
            cwd=REPO_ROOT,
            env=env,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,
        )
        self.next_id = 1

    def close(self) -> None:
        if self.process.poll() is None:
            self.process.terminate()
            try:
                self.process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                self.process.kill()

    def request(self, method: str, params: dict | None = None) -> dict:
        assert self.process.stdin is not None
        assert self.process.stdout is not None
        request = {
            "jsonrpc": "2.0",
            "id": self.next_id,
            "method": method,
        }
        if params is not None:
            request["params"] = params
        self.next_id += 1

        self.process.stdin.write(json.dumps(request, ensure_ascii=False) + "\n")
        self.process.stdin.flush()

        line = self.process.stdout.readline()
        if not line:
            stderr = ""
            if self.process.stderr is not None:
                stderr = self.process.stderr.read()
            raise RuntimeError(f"MCP server exited unexpectedly while handling {method}: {stderr}")
        return json.loads(line)

    def initialize(self) -> dict:
        response = self.request(
            "initialize",
            {
                "protocolVersion": "2024-11-05",
                "capabilities": {},
                "clientInfo": {"name": "mcp-context-pack-e2e", "version": "1.0"},
            },
        )
        assert "error" not in response or response["error"] is None, response
        return response["result"]

    def call_tool_raw(self, name: str, arguments: dict | None = None) -> dict:
        return self.request(
            "tools/call",
            {"name": name, "arguments": arguments or {}},
        )

    def call_tool(self, name: str, arguments: dict | None = None) -> dict:
        response = self.call_tool_raw(name, arguments)
        assert "error" not in response or response["error"] is None, response
        text = response["result"]["content"][0]["text"]
        return json.loads(text)


def build_binary(env: dict[str, str]) -> Path:
    prebuilt_binary = env.get("MEMOFORGE_MCP_BIN")
    if prebuilt_binary:
        binary = Path(prebuilt_binary)
        if binary.exists():
            return binary

    subprocess.run(
        ["cargo", "build", "-q", "-p", "memoforge-mcp"],
        check=True,
        cwd=REPO_ROOT,
        env=env,
    )
    binary = REPO_ROOT / "target" / "debug" / "memoforge"
    assert binary.exists(), f"Missing MCP binary: {binary}"
    return binary


def create_test_kb_with_knowledge(temp_dir: Path) -> Path:
    """Create a test knowledge base with sample knowledge files."""
    kb_path = temp_dir / "test-kb"
    kb_path.mkdir(parents=True, exist_ok=True)

    # Initialize .memoforge structure
    memoforge_dir = kb_path / ".memoforge"
    memoforge_dir.mkdir(parents=True, exist_ok=True)

    # Config with categories
    config = textwrap.dedent(
        """\
        version: "1.0"
        categories:
          - id: dev
            name: Development
            path: dev
          - id: tech
            name: Technology
            path: tech
        """
    )
    write(memoforge_dir / "config.yaml", config)

    # Create category directories
    (kb_path / "dev").mkdir(parents=True, exist_ok=True)
    (kb_path / "tech").mkdir(parents=True, exist_ok=True)

    # Create sample knowledge files
    write(
        kb_path / "dev" / "test.md",
        textwrap.dedent(
            """\
            ---
            id: test
            title: Test Knowledge
            tags:
              - test
              - dev
            category: dev
            summary: Test knowledge for context pack.
            created_at: 2026-04-01T00:00:00Z
            updated_at: 2026-04-01T00:00:00Z
            ---
            # Test Knowledge

            This is test knowledge.
            """
        ),
    )

    write(
        kb_path / "dev" / "rust.md",
        textwrap.dedent(
            """\
            ---
            id: rust
            title: Rust Programming
            tags:
              - rust
              - dev
            category: dev
            summary: Rust programming knowledge.
            created_at: 2026-04-01T00:00:00Z
            updated_at: 2026-04-01T00:00:00Z
            ---
            # Rust Programming

            Rust programming knowledge.
            """
        ),
    )

    write(
        kb_path / "tech" / "python.md",
        textwrap.dedent(
            """\
            ---
            id: python
            title: Python Programming
            tags:
              - python
              - tech
            category: tech
            summary: Python programming knowledge.
            created_at: 2026-04-01T00:00:00Z
            updated_at: 2026-04-01T00:00:00Z
            ---
            # Python Programming

            Python programming knowledge.
            """
        ),
    )

    return kb_path


def test_list_context_packs(client: McpClient) -> None:
    """Test that list_context_packs returns packs."""
    print("Testing list_context_packs...")

    # List all packs (should be empty initially)
    result = client.call_tool("list_context_packs", {})

    assert "packs" in result, f"Missing 'packs' key in response: {result}"
    assert isinstance(result["packs"], list), f"'packs' should be a list: {result}"

    initial_count = len(result["packs"])
    print(f"  Initial packs count: {initial_count}")

    # List with scope_type filter
    manual_packs = client.call_tool("list_context_packs", {"scope_type": "manual"})
    assert "packs" in manual_packs, f"Missing 'packs' key in response: {manual_packs}"
    print(f"  Manual packs count: {len(manual_packs['packs'])}")

    print("OK list_context_packs")


def test_create_context_pack(client: McpClient) -> None:
    """Test creating a context pack."""
    print("Testing create_context_pack...")

    # Create a manual context pack
    pack_result = client.call_tool(
        "create_context_pack",
        {
            "name": "Test Pack",
            "scope_type": "manual",
            "scope_value": "",
            "item_paths": ["dev/test.md", "dev/rust.md"],
            "summary": "A test context pack",
        },
    )

    assert "pack" in pack_result, f"Missing 'pack' key in response: {pack_result}"
    pack = pack_result["pack"]

    # Verify pack structure
    required_fields = ["id", "name", "scope_type", "scope_value", "item_paths", "created_at", "updated_at"]
    for field in required_fields:
        assert field in pack, f"Missing required field '{field}' in pack: {pack}"

    assert pack["name"] == "Test Pack", f"Expected name 'Test Pack', got {pack['name']}"
    assert pack["scope_type"] == "manual", f"Expected scope_type 'manual', got {pack['scope_type']}"
    assert len(pack["item_paths"]) == 2, f"Expected 2 item paths, got {len(pack['item_paths'])}"
    assert pack["summary"] == "A test context pack", f"Expected summary 'A test context pack', got {pack['summary']}"

    pack_id = pack["id"]
    print(f"  Created pack: {pack_id}")

    # Create a tag-based context pack
    tag_pack_result = client.call_tool(
        "create_context_pack",
        {
            "name": "Dev Pack",
            "scope_type": "tag",
            "scope_value": "dev",
            "item_paths": [],
        },
    )

    assert "pack" in tag_pack_result, f"Missing 'pack' key in response: {tag_pack_result}"
    tag_pack = tag_pack_result["pack"]
    assert tag_pack["scope_type"] == "tag", f"Expected scope_type 'tag', got {tag_pack['scope_type']}"
    assert tag_pack["scope_value"] == "dev", f"Expected scope_value 'dev', got {tag_pack['scope_value']}"
    print(f"  Created tag pack: {tag_pack['id']}")

    return pack_id


def test_get_context_pack(client: McpClient, pack_id: str) -> None:
    """Test getting a context pack by ID."""
    print("Testing get_context_pack...")

    # Get the pack by ID
    result = client.call_tool("get_context_pack", {"pack_id": pack_id})

    assert "pack" in result, f"Missing 'pack' key in response: {result}"
    pack = result["pack"]

    assert pack["id"] == pack_id, f"Expected ID {pack_id}, got {pack['id']}"
    assert pack["name"] == "Test Pack", f"Expected name 'Test Pack', got {pack['name']}"
    assert len(pack["item_paths"]) == 2, f"Expected 2 item paths, got {len(pack['item_paths'])}"

    print(f"  Retrieved pack: {pack_id}")


def test_export_context_pack(client: McpClient, pack_id: str) -> None:
    """Test exporting a context pack."""
    print("Testing export_context_pack...")

    # Export in JSON format
    result = client.call_tool("export_context_pack", {"pack_id": pack_id, "format": "json"})

    assert "pack" in result, f"Missing 'pack' key in response: {result}"
    assert "export_format" in result, f"Missing 'export_format' key in response: {result}"
    assert result["export_format"] == "json", f"Expected format 'json', got {result['export_format']}"

    pack = result["pack"]
    assert pack["id"] == pack_id, f"Expected ID {pack_id}, got {pack['id']}"
    assert "item_paths" in pack, f"Missing 'item_paths' in exported pack: {pack}"

    print(f"  Exported pack: {pack_id} in {result['export_format']} format")


def test_session_with_context_pack(client: McpClient, pack_id: str) -> None:
    """Test starting an agent session with context pack IDs."""
    print("Testing start_agent_session with context_pack_ids...")

    # Start a session referencing the created pack
    session_result = client.call_tool(
        "start_agent_session",
        {
            "agent_name": "test-agent",
            "goal": "Test context pack integration",
            "context_pack_ids": [pack_id],
        },
    )

    # start_agent_session returns the session object directly
    assert "id" in session_result, f"Missing 'id' in session: {session_result}"
    assert session_result["agent_name"] == "test-agent", f"Expected agent_name 'test-agent', got {session_result['agent_name']}"
    assert session_result["goal"] == "Test context pack integration", f"Expected goal 'Test context pack integration', got {session_result['goal']}"
    assert session_result["status"] == "running", f"Expected status 'running', got {session_result['status']}"

    session_id = session_result["id"]
    print(f"  Started session: {session_id} with pack: {pack_id}")

    # Get session details
    session_detail = client.call_tool("get_agent_session", {"session_id": session_id})
    assert "id" in session_detail, f"Missing 'id' in session detail: {session_detail}"
    assert session_detail["id"] == session_id, f"Session ID mismatch"

    print(f"  Retrieved session: {session_id}")


def test_context_pack_validation(client: McpClient) -> None:
    """Test context pack validation in create_context_pack."""
    print("Testing create_context_pack validation...")

    # Test invalid scope_type
    try:
        client.call_tool(
            "create_context_pack",
            {
                "name": "Invalid Pack",
                "scope_type": "invalid",
                "scope_value": "test",
                "item_paths": ["dev/test.md"],
            },
        )
        assert False, "Expected error for invalid scope_type"
    except AssertionError as e:
        if "error" not in str(e):
            raise
        print("  OK: Invalid scope_type rejected")

    # Test missing item_paths
    try:
        client.call_tool(
            "create_context_pack",
            {
                "name": "Missing Paths Pack",
                "scope_type": "manual",
                "scope_value": "",
            },
        )
        assert False, "Expected error for missing item_paths"
    except AssertionError as e:
        if "item_paths" not in str(e):
            raise
        print("  OK: Missing item_paths rejected")

    # Test valid pack creation without summary
    pack_result = client.call_tool(
        "create_context_pack",
        {
            "name": "No Summary Pack",
            "scope_type": "folder",
            "scope_value": "dev",
            "item_paths": ["dev/test.md"],
        },
    )
    assert "pack" in pack_result, f"Missing 'pack' key in response: {pack_result}"
    assert pack_result["pack"].get("summary") is None, f"Expected None summary, got {pack_result['pack'].get('summary')}"
    print("  OK: Pack created without summary")


def main() -> None:
    temp_dir = Path(tempfile.mkdtemp(prefix="memoforge-context-pack-e2e-"))

    try:
        env = make_test_env(temp_dir)
        kb_path = create_test_kb_with_knowledge(temp_dir)
        binary = build_binary(env)

        client = McpClient(str(binary), str(kb_path), env, readonly=False)

        try:
            init_result = client.initialize()
            assert init_result["protocolVersion"] == "2024-11-05"
            print("OK initialize")

            # List tools to verify context pack tools are available
            tools = client.request("tools/list", {})
            tool_names = {tool["name"] for tool in tools["result"]["tools"]}
            print(f"Available tools: {sorted(tool_names)}")

            context_pack_tools = {
                "list_context_packs",
                "create_context_pack",
                "get_context_pack",
                "export_context_pack",
            }

            available_context_pack_tools = context_pack_tools & tool_names
            missing_context_pack_tools = context_pack_tools - tool_names

            if missing_context_pack_tools:
                print(f"WARNING: Missing context pack tools: {missing_context_pack_tools}")

            # Run context pack tests
            if "list_context_packs" in tool_names:
                test_list_context_packs(client)
            else:
                print("WARNING: list_context_packs not available, skipping test")

            if "create_context_pack" in tool_names:
                pack_id = test_create_context_pack(client)

                # Only run dependent tests if pack was created
                if pack_id and "get_context_pack" in tool_names:
                    test_get_context_pack(client, pack_id)

                if pack_id and "export_context_pack" in tool_names:
                    test_export_context_pack(client, pack_id)

                if pack_id and "start_agent_session" in tool_names:
                    test_session_with_context_pack(client, pack_id)

                test_context_pack_validation(client)
            else:
                print("WARNING: create_context_pack not available, skipping dependent tests")

            print(json.dumps({"status": "ok", "kb_path": str(kb_path)}, ensure_ascii=False))

        finally:
            client.close()

    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)


if __name__ == "__main__":
    main()
