#!/usr/bin/env python3

import json
import shutil
import subprocess
import tempfile
from pathlib import Path

from frontend_e2e import REPO_ROOT, make_test_env, seed_knowledge_base


EXPECTED_TOOLS = {
    "get_editor_state",
    "get_status",
    "get_config",
    "list_knowledge",
    "get_summary",
    "get_content",
    "get_knowledge_with_stale",
    "grep",
    "get_tags",
    "get_backlinks",
    "get_related",
    "get_knowledge_graph",
    "create_knowledge",
    "update_knowledge",
    "update_metadata",
    "delete_knowledge",
    "move_knowledge",
    "create_category",
    "list_categories",
    "update_category",
    "delete_category",
    "git_status",
    "git_commit",
    "git_pull",
    "git_push",
    "git_log",
    "read_knowledge",
    "start_draft",
    "update_draft",
    "preview_draft",
    "commit_draft",
    "discard_draft",
}


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
                "clientInfo": {"name": "mcp-e2e", "version": "1.0"},
            },
        )
        assert "error" not in response or response["error"] is None, response
        return response["result"]

    def list_tools(self) -> list[dict]:
        response = self.request("tools/list", {})
        assert "error" not in response or response["error"] is None, response
        return response["result"]["tools"]

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

    def call_tool_expect_error(self, name: str, arguments: dict | None = None) -> dict:
        response = self.call_tool_raw(name, arguments)
        assert response.get("error"), f"Expected error for {name}, got {response}"
        return response["error"]


def latest_remote_subject(remote_path: str) -> str:
    result = subprocess.run(
        ["git", "--git-dir", remote_path, "log", "--all", "-1", "--pretty=%s"],
        check=True,
        capture_output=True,
        text=True,
    )
    return result.stdout.strip()


def run_readwrite_suite(binary: Path, env: dict[str, str], paths: dict[str, str]) -> None:
    client = McpClient(binary, paths["kb1"], env, readonly=False)
    commit_message = "mcp e2e commit"

    try:
        init_result = client.initialize()
        assert init_result["protocolVersion"] == "2024-11-05"

        tools = client.list_tools()
        names = {tool["name"] for tool in tools}
        assert EXPECTED_TOOLS <= names, names
        print("OK tools-list")

        create_knowledge_tool = next(tool for tool in tools if tool["name"] == "create_knowledge")
        create_schema = create_knowledge_tool["inputSchema"]
        assert create_schema["required"] == ["content"]
        assert {"required": ["path"]} in create_schema["oneOf"]
        assert {"required": ["title"]} in create_schema["oneOf"]
        assert "Preferred docs-style call" in create_knowledge_tool["description"]
        print("OK create-knowledge-schema")

        status = client.call_tool("get_status")
        assert status["initialized"] is True
        assert status["mode"] == "readwrite"
        print("OK get-status")

        config = client.call_tool("get_config")
        assert len(config["categories"]) == 2
        print("OK get-config")

        categories = client.call_tool("list_categories")
        category_paths = {category["path"] for category in categories["categories"]}
        assert {"programming", "tools"} <= category_paths
        assert all("label" in category for category in categories["categories"])
        print("OK list-categories")

        knowledge = client.call_tool("list_knowledge", {"level": "L1", "path": "programming"})
        titles = {item["title"] for item in knowledge["knowledge"]}
        assert {"Alpha Rust Patterns", "Beta Async Notes"} <= titles
        print("OK list-knowledge")

        summary = client.call_tool("get_summary", {"path": "programming/alpha.md"})
        assert summary["title"] == "Alpha Rust Patterns"
        assert isinstance(summary["summary_stale"], bool)
        print("OK get-summary")

        content = client.call_tool("get_content", {"path": "programming/alpha.md"})
        assert "参考 [[programming/beta.md]]" in content["content"]
        assert isinstance(content["sections"], list)
        print("OK get-content")

        full_knowledge = client.call_tool("get_knowledge", {"id": "programming/alpha.md", "level": "L2"})
        assert "Rust 并发模式" in full_knowledge["content"]
        print("OK get-knowledge-alias")

        stale = client.call_tool("get_knowledge_with_stale", {"path": "programming/alpha.md"})
        assert stale["id"] == "programming/alpha.md"
        assert isinstance(stale["summary_stale"], bool)
        print("OK get-knowledge-with-stale")

        grep = client.call_tool("grep", {"pattern": "Tokio"})
        assert any(item["title"] == "Beta Async Notes" for item in grep["results"])
        print("OK grep")

        tags = client.call_tool("get_tags", {"prefix": "R"})
        assert any(tag["name"] == "Rust" for tag in tags["tags"])
        print("OK get-tags")

        backlinks = client.call_tool("get_backlinks", {"path": "programming/beta.md"})
        assert any(item["source_title"] == "Alpha Rust Patterns" for item in backlinks["backlinks"])
        print("OK get-backlinks")

        related = client.call_tool("get_related", {"path": "programming/alpha.md"})
        assert any(item["title"] == "Beta Async Notes" for item in related["related"])
        print("OK get-related")

        graph = client.call_tool("get_knowledge_graph")
        assert len(graph["nodes"]) >= 3
        assert len(graph["edges"]) >= 1
        print("OK get-knowledge-graph")

        pull = client.call_tool("git_pull")
        assert pull["pulled"] is True
        print("OK git-pull")

        created_category = client.call_tool(
            "create_category",
            {"path": "devops", "label": "DevOps", "description": "运维测试分类"},
        )
        assert created_category["created"] is True
        print("OK create-category")

        created_by_category_id = client.call_tool(
            "create_knowledge",
            {
                "title": "Category Id Write",
                "content": "# Category Id Write\n\nLegacy write using category id.",
                "category_id": created_category["id"],
            },
        )
        assert created_by_category_id["path"].startswith("devops/"), created_by_category_id
        assert not created_by_category_id["path"].startswith(f'{created_category["id"]}/'), created_by_category_id
        print("OK create-knowledge-category-id")

        missing_target = client.call_tool_expect_error(
            "create_knowledge",
            {"content": "# Missing target"},
        )
        assert "either 'path' or legacy 'title'" in missing_target["message"], missing_target
        print("OK create-knowledge-error-guidance")

        created_main = client.call_tool(
            "create_knowledge",
            {
                "path": "devops/mcp-spec.md",
                "content": "# MCP Spec\n\n## Overview\n\nTest content.\n\n## Details\n\nLinked to [[programming/beta.md]].",
                "metadata": {
                    "title": "MCP Spec",
                    "tags": ["MCP", "Testing"],
                    "summary": "MCP 文档测试条目。",
                },
            },
        )
        assert created_main["created"] is True
        main_path = "devops/mcp-spec.md"
        assert (Path(paths["kb1"]) / main_path).exists()
        print("OK create-knowledge")

        created_referrer = client.call_tool(
            "create_knowledge",
            {
                "path": "programming/mcp-ref.md",
                "content": "# Referrer\n\nSee [[devops/mcp-spec.md]] and [[mcp-spec]].",
                "metadata": {
                    "title": "MCP Referrer",
                    "tags": ["Refs"],
                },
            },
        )
        assert created_referrer["created"] is True
        referrer_path = "programming/mcp-ref.md"
        print("OK create-referrer")

        created_legacy = client.call_tool(
            "create_knowledge",
            {
                "title": "Legacy Delete Note",
                "content": "# Legacy\n\nTemporary delete target.",
                "category_id": "devops",
                "tags": ["Temp"],
            },
        )
        delete_path = created_legacy["path"]
        assert (Path(paths["kb1"]) / delete_path).exists()
        print("OK create-knowledge-legacy")

        section = client.call_tool("get_content", {"path": main_path, "section": 0})
        assert "## Overview" in section["content"]
        print("OK get-content-section")

        updated_metadata = client.call_tool(
            "update_metadata",
            {"path": main_path, "metadata": {"summary": "更新后的摘要", "tags": ["MCP", "Automation"]}},
        )
        assert updated_metadata["updated"] is True
        print("OK update-metadata")

        updated_knowledge = client.call_tool(
            "update_knowledge",
            {
                "path": main_path,
                "content": "# MCP Spec\n\n## Overview\n\nUpdated content.\n\n## Details\n\nLinked to [[programming/beta.md]].",
                "metadata": {"title": "MCP Spec Updated"},
            },
        )
        assert updated_knowledge["updated"] is True
        print("OK update-knowledge")

        delete_preview = client.call_tool("delete_knowledge", {"path": delete_path})
        assert delete_preview["dry_run"] is True
        assert (Path(paths["kb1"]) / delete_path).exists()
        print("OK delete-preview")

        deleted = client.call_tool("delete_knowledge", {"path": delete_path, "dry_run": False})
        assert deleted["deleted"] is True
        assert not (Path(paths["kb1"]) / delete_path).exists()
        print("OK delete-knowledge")

        move_preview = client.call_tool(
            "move_knowledge",
            {"from": main_path, "to": "tools/mcp-spec-renamed.md"},
        )
        assert move_preview["dry_run"] is True
        assert (Path(paths["kb1"]) / main_path).exists()
        print("OK move-preview")

        moved = client.call_tool(
            "move_knowledge",
            {"from": main_path, "to": "tools/mcp-spec-renamed.md", "dry_run": False},
        )
        assert moved["moved"] is True
        assert not (Path(paths["kb1"]) / main_path).exists()
        assert (Path(paths["kb1"]) / "tools" / "mcp-spec-renamed.md").exists()
        print("OK move-knowledge")

        moved_summary = client.call_tool("get_summary", {"path": "tools/mcp-spec-renamed.md"})
        assert moved_summary["title"] == "MCP Spec Updated"
        print("OK moved-summary")

        referrer_content = client.call_tool("get_content", {"path": referrer_path})
        assert "[[tools/mcp-spec-renamed.md]]" in referrer_content["content"]
        assert "[[mcp-spec-renamed]]" in referrer_content["content"]
        assert "[[devops/mcp-spec.md]]" not in referrer_content["content"]
        print("OK move-updates-references")

        updated_category = client.call_tool(
            "update_category",
            {"id": "devops", "label": "Platform Engineering", "description": "空分类，可删除"},
        )
        assert updated_category["updated"] is True
        print("OK update-category")

        deleted_category = client.call_tool("delete_category", {"id": "devops"})
        assert deleted_category["deleted"] is True
        remaining = client.call_tool("list_categories")
        assert all(category["id"] != "devops" for category in remaining["categories"])
        print("OK delete-category")

        git_status = client.call_tool("git_status")
        assert git_status["total"] > 0
        print("OK git-status")

        git_commit = client.call_tool("git_commit", {"message": commit_message})
        assert git_commit["committed"] is True
        assert git_commit["message"] == commit_message
        print("OK git-commit")

        git_log = client.call_tool("git_log", {"limit": 5})
        assert any(commit["message"] == commit_message for commit in git_log["commits"])
        print("OK git-log")

        git_push_preview = client.call_tool("git_push", {})
        assert git_push_preview["dry_run"] is True
        print("OK git-push-preview")

        git_push = client.call_tool("git_push", {"dry_run": False})
        assert git_push["pushed"] is True
        assert latest_remote_subject(paths["remote"]) == commit_message
        print("OK git-push")
    finally:
        client.close()


def run_readonly_suite(binary: Path, env: dict[str, str], paths: dict[str, str]) -> None:
    client = McpClient(binary, paths["kb1"], env, readonly=True)

    try:
        init_result = client.initialize()
        assert init_result["protocolVersion"] == "2024-11-05"

        tools = client.list_tools()
        names = {tool["name"] for tool in tools}
        assert EXPECTED_TOOLS <= names, names

        status = client.call_tool("get_status")
        assert status["readonly"] is True

        summary = client.call_tool("get_summary", {"path": "programming/alpha.md"})
        assert summary["title"] == "Alpha Rust Patterns"
        print("OK readonly-read")

        write_cases = {
            "create_knowledge": {"title": "Readonly", "content": "# no"},
            "update_knowledge": {"path": "programming/alpha.md", "content": "# blocked"},
            "update_metadata": {"path": "programming/alpha.md", "summary": "blocked"},
            "delete_knowledge": {"path": "programming/alpha.md", "dry_run": False},
            "move_knowledge": {"from": "programming/alpha.md", "to": "tools/alpha.md", "dry_run": False},
            "create_category": {"path": "ops", "label": "Ops"},
            "update_category": {"id": "programming", "label": "Programming"},
            "delete_category": {"id": "tools"},
            "git_commit": {"message": "blocked"},
            "git_pull": {},
            "git_push": {"dry_run": False},
            "start_draft": {"path": "programming/alpha.md"},
            "update_draft": {"draft_id": "draft_test", "op": "set_content", "content": "blocked"},
            "commit_draft": {"draft_id": "draft_test"},
            "discard_draft": {"draft_id": "draft_test"},
        }

        for tool_name, arguments in write_cases.items():
            error = client.call_tool_expect_error(tool_name, arguments)
            assert error["message"] == "Write operations not allowed in readonly mode", error
        print("OK readonly-write-blocks")
    finally:
        client.close()


def main() -> None:
    temp_dir = Path(tempfile.mkdtemp(prefix="memoforge-mcp-e2e-"))

    try:
        paths = seed_knowledge_base(temp_dir)
        env = make_test_env(temp_dir)
        binary = build_binary(env)

        run_readwrite_suite(binary, env, paths)

        readonly_dir = Path(tempfile.mkdtemp(prefix="memoforge-mcp-e2e-readonly-"))
        try:
            readonly_paths = seed_knowledge_base(readonly_dir)
            readonly_env = make_test_env(readonly_dir)
            run_readonly_suite(binary, readonly_env, readonly_paths)
        finally:
            shutil.rmtree(readonly_dir, ignore_errors=True)

        print(json.dumps({"status": "ok", "paths": paths}, ensure_ascii=False))
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)


if __name__ == "__main__":
    main()
