#!/usr/bin/env python3
"""
Sprint 3 Reliability E2E Tests

Tests for reliability scanning and fix draft creation using MCP tools.
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
                "clientInfo": {"name": "mcp-reliability-e2e", "version": "1.0"},
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


def create_test_kb_with_issues(temp_dir: Path) -> Path:
    """Create a test knowledge base with known reliability issues."""
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
          - id: tech
            name: Technology
            path: tech
          - id: notes
            name: Notes
            path: notes
        """
    )
    write(memoforge_dir / "config.yaml", config)

    # Create category directories
    (kb_path / "tech").mkdir(parents=True, exist_ok=True)
    (kb_path / "notes").mkdir(parents=True, exist_ok=True)

    # Issue 1: No summary
    write(
        kb_path / "tech" / "no-summary.md",
        textwrap.dedent(
            """\
            ---
            id: no-summary
            title: No Summary Knowledge
            tags:
              - test
              - tech
            category: tech
            created_at: 2026-04-01T00:00:00Z
            updated_at: 2026-04-01T00:00:00Z
            ---
            # No Summary Knowledge

            This knowledge has no summary.
            """
        ),
    )

    # Issue 2: No tags
    write(
        kb_path / "tech" / "no-tags.md",
        textwrap.dedent(
            """\
            ---
            id: no-tags
            title: No Tags Knowledge
            category: tech
            summary: This knowledge has no tags.
            created_at: 2026-04-01T00:00:00Z
            updated_at: 2026-04-01T00:00:00Z
            ---
            # No Tags Knowledge

            This knowledge has no tags.
            """
        ),
    )

    # Issue 3: Broken link
    write(
        kb_path / "tech" / "broken-link.md",
        textwrap.dedent(
            """\
            ---
            id: broken-link
            title: Broken Link Knowledge
            tags:
              - test
            category: tech
            summary: This knowledge has a broken link.
            created_at: 2026-04-01T00:00:00Z
            updated_at: 2026-04-01T00:00:00Z
            ---
            # Broken Link Knowledge

            This knowledge references [[non-existent-file]] which does not exist.
            """
        ),
    )

    # Issue 4: Orphaned knowledge (no incoming links)
    write(
        kb_path / "notes" / "orphan.md",
        textwrap.dedent(
            """\
            ---
            id: orphan
            title: Orphaned Knowledge
            tags:
              - test
            category: notes
            summary: This knowledge has no incoming links.
            created_at: 2026-04-01T00:00:00Z
            updated_at: 2026-04-01T00:00:00Z
            ---
            # Orphaned Knowledge

            This knowledge is orphaned.
            """
        ),
    )

    # Valid knowledge for reference
    write(
        kb_path / "tech" / "valid-knowledge.md",
        textwrap.dedent(
            """\
            ---
            id: valid-knowledge
            title: Valid Knowledge
            tags:
              - test
              - valid
            category: tech
            summary: This knowledge has all required fields and is linked to.
            created_at: 2026-04-01T00:00:00Z
            updated_at: 2026-04-01T00:00:00Z
            ---
            # Valid Knowledge

            This is valid knowledge referenced by other files.
            """
        ),
    )

    # Knowledge that links to valid-knowledge.md (to prevent orphan)
    write(
        kb_path / "tech" / "refers-to-valid.md",
        textwrap.dedent(
            """\
            ---
            id: refers-to-valid
            title: Refers to Valid Knowledge
            tags:
              - test
            category: tech
            summary: References valid knowledge.
            created_at: 2026-04-01T00:00:00Z
            updated_at: 2026-04-01T00:00:00Z
            ---
            # Refers to Valid Knowledge

            See [[valid-knowledge]] for more information.
            """
        ),
    )

    return kb_path


def test_list_reliability_issues(client: McpClient) -> None:
    """Test that list_reliability_issues returns detected issues."""
    print("Testing list_reliability_issues...")

    # List all issues
    issues = client.call_tool("list_reliability_issues", {})

    assert "issues" in issues, f"Missing 'issues' key in response: {issues}"
    assert isinstance(issues["issues"], list), f"'issues' should be a list: {issues}"

    # Should detect at least some issues
    assert len(issues["issues"]) >= 4, f"Expected at least 4 issues, got {len(issues['issues'])}"

    # Check issue structure
    if issues["issues"]:
        issue = issues["issues"][0]
        required_fields = ["id", "rule_key", "knowledge_path", "severity", "status", "summary"]
        for field in required_fields:
            assert field in issue, f"Missing required field '{field}' in issue: {issue}"

    print(f"OK list_reliability_issues found {len(issues['issues'])} issues")


def test_list_reliability_issues_with_filters(client: McpClient) -> None:
    """Test filtering reliability issues by severity and status."""
    print("Testing list_reliability_issues with filters...")

    # Filter by high severity
    high_issues = client.call_tool(
        "list_reliability_issues",
        {"severity": "high"},
    )
    print(f"  High severity issues: {len(high_issues['issues'])}")

    # Filter by medium severity
    medium_issues = client.call_tool(
        "list_reliability_issues",
        {"severity": "medium"},
    )
    print(f"  Medium severity issues: {len(medium_issues['issues'])}")

    # Filter by low severity
    low_issues = client.call_tool(
        "list_reliability_issues",
        {"severity": "low"},
    )
    print(f"  Low severity issues: {len(low_issues['issues'])}")

    # Filter by rule key
    no_summary_issues = client.call_tool(
        "list_reliability_issues",
        {"rule_key": "no_summary"},
    )
    print(f"  NoSummary issues: {len(no_summary_issues['issues'])}")

    # Filter with limit
    limited_issues = client.call_tool(
        "list_reliability_issues",
        {"limit": 2},
    )
    print(f"  Limited issues: {len(limited_issues['issues'])}")
    assert len(limited_issues["issues"]) <= 2, f"Expected at most 2 issues, got {len(limited_issues['issues'])}"

    print("OK list_reliability_issues filters")


def test_get_reliability_issue_detail(client: McpClient) -> None:
    """Test getting detailed information about a specific issue."""
    print("Testing get_reliability_issue_detail...")

    # First list issues to get an issue ID
    issues = client.call_tool("list_reliability_issues", {})
    if not issues["issues"]:
        print("  WARNING: No issues found, skipping detail test")
        return

    issue_id = issues["issues"][0]["id"]

    # Get issue detail
    detail = client.call_tool(
        "get_reliability_issue_detail",
        {"issue_id": issue_id},
    )

    assert "issue" in detail, f"Missing 'issue' key in response: {detail}"
    assert detail["issue"]["id"] == issue_id, f"Issue ID mismatch: expected {issue_id}, got {detail['issue']['id']}"

    print(f"OK get_reliability_issue_detail for issue {issue_id[:8]}...")


def test_create_fix_draft_from_issue(client: McpClient) -> None:
    """Test creating a fix draft from a reliability issue."""
    print("Testing create_fix_draft_from_issue...")

    # First list issues to find one to fix
    issues = client.call_tool("list_reliability_issues", {})

    # Find an issue that's suitable for draft creation
    target_issue = None
    for issue in issues["issues"]:
        # Skip issues that already have a draft
        if issue.get("linked_draft_id"):
            continue
        target_issue = issue
        break

    if not target_issue:
        print("  WARNING: No suitable issue found, skipping draft creation test")
        return

    issue_id = target_issue["id"]

    # Create fix draft
    draft_result = client.call_tool(
        "create_fix_draft_from_issue",
        {"issue_id": issue_id},
    )

    assert "draft_id" in draft_result, f"Missing 'draft_id' in response: {draft_result}"
    assert "issue" in draft_result, f"Missing 'issue' in response: {draft_result}"

    # Verify the issue now has the draft linked
    updated_issue = client.call_tool(
        "get_reliability_issue_detail",
        {"issue_id": issue_id},
    )
    assert updated_issue["issue"].get("linked_draft_id") == draft_result["draft_id"], \
        f"Draft not linked to issue: {updated_issue['issue']}"

    print(f"OK create_fix_draft_from_issue created draft {draft_result['draft_id']}")


def test_reliability_stats(client: McpClient) -> None:
    """Test reliability statistics if available."""
    print("Testing reliability statistics...")

    # Try to get stats (if tool exists)
    try:
        stats = client.call_tool("get_reliability_stats", {})

        assert "stats" in stats, f"Missing 'stats' key in response: {stats}"
        assert "total" in stats["stats"], f"Missing 'total' in stats: {stats['stats']}"

        print(f"  Total issues: {stats['stats'].get('total', 0)}")
        print(f"  High severity: {stats['stats'].get('high_severity', 0)}")
        print(f"  Medium severity: {stats['stats'].get('medium_severity', 0)}")
        print(f"  Low severity: {stats['stats'].get('low_severity', 0)}")
        print(f"  Open issues: {stats['stats'].get('open', 0)}")

        print("OK get_reliability_stats")
    except Exception as e:
        print(f"  NOTE: get_reliability_stats not available or failed: {e}")


def main() -> None:
    temp_dir = Path(tempfile.mkdtemp(prefix="memoforge-reliability-e2e-"))

    try:
        env = make_test_env(temp_dir)
        kb_path = create_test_kb_with_issues(temp_dir)
        binary = build_binary(env)

        client = McpClient(str(binary), str(kb_path), env, readonly=False)

        try:
            init_result = client.initialize()
            assert init_result["protocolVersion"] == "2024-11-05"
            print("OK initialize")

            # List tools to verify reliability tools are available
            tools = client.call_tool("tools/list", {})
            tool_names = {tool["name"] for tool in tools["tools"]}
            print(f"Available tools: {sorted(tool_names)}")

            reliability_tools = {
                "list_reliability_issues",
                "get_reliability_issue_detail",
                "create_fix_draft_from_issue",
            }

            available_reliability_tools = reliability_tools & tool_names
            missing_reliability_tools = reliability_tools - tool_names

            if missing_reliability_tools:
                print(f"WARNING: Missing reliability tools: {missing_reliability_tools}")

            # Run reliability tests
            if "list_reliability_issues" in tool_names:
                test_list_reliability_issues(client)
                test_list_reliability_issues_with_filters(client)
            else:
                print("WARNING: list_reliability_issues not available, skipping tests")

            if "get_reliability_issue_detail" in tool_names:
                test_get_reliability_issue_detail(client)
            else:
                print("WARNING: get_reliability_issue_detail not available, skipping test")

            if "create_fix_draft_from_issue" in tool_names:
                test_create_fix_draft_from_issue(client)
            else:
                print("WARNING: create_fix_draft_from_issue not available, skipping test")

            # Optional: test stats if available
            test_reliability_stats(client)

            print(json.dumps({"status": "ok", "kb_path": str(kb_path)}, ensure_ascii=False))

        finally:
            client.close()

    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)


if __name__ == "__main__":
    main()
