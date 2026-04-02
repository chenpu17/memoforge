#!/usr/bin/env python3

import json
import os
import shutil
import subprocess
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_EXE = REPO_ROOT / "target" / "debug" / "memoforge-tauri.exe"
BASE_URL = "http://127.0.0.1:31415"
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
}


def write(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def run(cmd: list[str], cwd: Path | None = None, capture: bool = False) -> str:
    result = subprocess.run(
        cmd,
        cwd=cwd,
        check=True,
        text=True,
        stdout=subprocess.PIPE if capture else subprocess.DEVNULL,
        stderr=subprocess.PIPE if capture else subprocess.DEVNULL,
    )
    return result.stdout if capture else ""


def git(cwd: Path, *args: str, capture: bool = False) -> str:
    return run(["git", "-C", str(cwd), *args], capture=capture)


def normalize_windows_path(path: str) -> Path:
    if path.startswith("\\\\?\\"):
        path = path[4:]
    return Path(path).resolve()


def normalize_rel_path(path: str) -> str:
    return path.replace("\\", "/")


def read_jsonl(path: Path) -> list[dict]:
    if not path.exists():
        return []
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def find_existing_path(candidates: list[Path]) -> Path | None:
    for candidate in candidates:
        if candidate.exists():
            return candidate
    return None


def seed_knowledge_base(base_dir: Path) -> Path:
    kb = base_dir / "kb"
    (kb / ".memoforge").mkdir(parents=True, exist_ok=True)
    (kb / "programming").mkdir(parents=True, exist_ok=True)
    (kb / "tools").mkdir(parents=True, exist_ok=True)
    (kb / "archive").mkdir(parents=True, exist_ok=True)

    write(
        kb / ".memoforge" / "config.yaml",
        """version: "1.0"
metadata:
  name: "Windows E2E KB"
  created_at: "2026-03-20T00:00:00Z"
categories:
  - id: programming
    name: Programming
    path: programming
  - id: tools
    name: Tools
    path: tools
  - id: archive
    name: Archive
    path: archive
""",
    )
    write(kb / ".memoforge" / ".gitignore", "serve.pid\nhttp.token\nevents.jsonl\ngit.lock\n*.lock\n")
    write(kb / ".gitignore", ".DS_Store\n")
    write(
        kb / "programming" / "alpha.md",
        """---
id: alpha
title: Alpha Rust Patterns
tags:
  - Rust
  - async
category: programming
summary: Alpha summary
created_at: 2026-03-20T00:00:00Z
updated_at: 2026-03-20T00:00:00Z
---
# Alpha Rust Patterns

Alpha links to [[programming/beta.md]] and [[programming/movable.md]].
""",
    )
    write(
        kb / "programming" / "beta.md",
        """---
id: beta
title: Beta Async Notes
tags:
  - Rust
  - tokio
category: programming
summary: Beta summary
created_at: 2026-03-20T00:00:00Z
updated_at: 2026-03-20T00:00:00Z
---
# Beta Async Notes

Tokio details live here.
""",
    )
    write(
        kb / "programming" / "gamma.md",
        """---
id: gamma
title: Gamma Shared Tags
tags:
  - Rust
  - patterns
category: programming
summary: Gamma summary
created_at: 2026-03-20T00:00:00Z
updated_at: 2026-03-20T00:00:00Z
---
# Gamma Shared Tags

This note shares Rust tags with others.
""",
    )
    write(
        kb / "programming" / "movable.md",
        """---
id: movable
title: Movable Note
tags:
  - refactor
category: programming
summary: Movable summary
created_at: 2026-03-20T00:00:00Z
updated_at: 2026-03-20T00:00:00Z
---
# Movable Note

This note will be moved during Windows E2E.
""",
    )
    write(
        kb / "programming" / "delete-target.md",
        """---
id: delete-target
title: Delete Target
tags:
  - cleanup
category: programming
summary: Delete me
created_at: 2026-03-20T00:00:00Z
updated_at: 2026-03-20T00:00:00Z
---
# Delete Target

This note will be deleted later.
""",
    )
    write(
        kb / "programming" / "delete-source.md",
        """---
id: delete-source
title: Delete Source
tags:
  - cleanup
category: programming
summary: References the delete target
created_at: 2026-03-20T00:00:00Z
updated_at: 2026-03-20T00:00:00Z
---
# Delete Source

This note references [[programming/delete-target.md]].
""",
    )
    write(
        kb / "tools" / "cli.md",
        """---
id: cli
title: CLI Tooling
tags:
  - tooling
category: tools
summary: CLI notes
created_at: 2026-03-20T00:00:00Z
updated_at: 2026-03-20T00:00:00Z
---
# CLI Tooling

Command-line tooling notes live here.
""",
    )

    git(kb, "init")
    git(kb, "config", "user.email", "e2e@example.com")
    git(kb, "config", "user.name", "E2E")
    git(kb, "add", ".")
    git(kb, "commit", "-m", "Initial knowledge base")
    git(kb, "branch", "-M", "main")
    return kb


def setup_git_remote(base_dir: Path, kb: Path) -> Path:
    remote = base_dir / "remote.git"
    run(["git", "init", "--bare", str(remote)])
    git(kb, "remote", "add", "origin", str(remote))
    git(kb, "push", "-u", "origin", "main")
    run(["git", "-C", str(remote), "symbolic-ref", "HEAD", "refs/heads/main"])
    return remote


def clone_remote(remote: Path, target: Path) -> None:
    run(["git", "clone", str(remote), str(target)])
    git(target, "config", "user.email", "clone@example.com")
    git(target, "config", "user.name", "Remote Clone")


def seed_secondary_kb(base_dir: Path) -> Path:
    kb = base_dir / "kb-secondary"
    (kb / ".memoforge").mkdir(parents=True, exist_ok=True)
    (kb / "notes").mkdir(parents=True, exist_ok=True)

    write(
        kb / ".memoforge" / "config.yaml",
        '''version: "1.0"
metadata:
  name: "Windows Secondary KB"
  created_at: "2026-03-20T00:00:00Z"
categories:
  - id: notes
    name: Notes
    path: notes
''',
    )
    write(kb / ".memoforge" / ".gitignore", "serve.pid\nhttp.token\nevents.jsonl\ngit.lock\n*.lock\n")
    write(
        kb / "notes" / "secondary.md",
        '''---
id: secondary
title: Secondary Note
tags:
  - secondary
category: notes
summary: Secondary summary
created_at: 2026-03-20T00:00:00Z
updated_at: 2026-03-20T00:00:00Z
---
# Secondary Note

This note lives in the secondary knowledge base.
''',
    )
    return kb


def seed_import_source(base_dir: Path) -> Path:
    source = base_dir / "import-source"
    source.mkdir(parents=True, exist_ok=True)
    write(
        source / "imported-note.md",
        "# Imported Note\n\nImported through the Windows desktop automation flow.\n",
    )
    return source


def wait_for_health(timeout: float = 30.0) -> None:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(f"{BASE_URL}/health", timeout=2) as response:
                if response.read().decode("utf-8") == "OK":
                    return
        except Exception:
            time.sleep(0.5)
    raise RuntimeError("Timed out waiting for desktop SSE server")


def wait_for_http_ok(url: str, timeout: float = 30.0) -> None:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=2) as response:
                if response.read().decode("utf-8") == "OK":
                    return
        except Exception:
            time.sleep(0.25)
    raise RuntimeError(f"Timed out waiting for {url}")


def find_free_port() -> int:
    import socket

    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def post_json(url: str, payload: dict) -> dict:
    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        body = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"POST {url} failed with {error.code}: {body}") from error


def tool_call(name: str, arguments: dict | None = None) -> dict:
    response = post_json(
        f"{BASE_URL}/mcp",
        {
            "jsonrpc": "2.0",
            "id": int(time.time() * 1000),
            "method": "tools/call",
            "params": {"name": name, "arguments": arguments or {}},
        },
    )
    if response.get("error"):
        raise RuntimeError(f"{name} failed: {response['error']}")
    return json.loads(response["result"]["content"][0]["text"])


def automation_call(port: int, command: str, args: dict | None = None):
    response = post_json(
        f"http://127.0.0.1:{port}/invoke",
        {"command": command, "args": args or {}},
    )
    assert_true(response.get("ok") is True, f"automation command failed: {response}")
    return response["result"]


def initialize() -> None:
    response = post_json(
        f"{BASE_URL}/mcp",
        {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {}},
    )
    assert response["result"]["serverInfo"]["name"] == "memoforge"


def wait_for_editor_state(timeout: float = 15.0) -> dict:
    deadline = time.time() + timeout
    last_state: dict = {}
    while time.time() < deadline:
        last_state = tool_call("get_editor_state")
        if last_state.get("state_valid") and last_state.get("current_kb"):
            return last_state
        time.sleep(0.25)
    raise AssertionError(f"editor state did not become valid: {last_state}")


def open_sse_stream() -> subprocess.Popen[str]:
    return subprocess.Popen(
        ["curl", "-N", "-sS", f"{BASE_URL}/mcp"],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )


def assert_true(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def assert_has_path(items: list[dict], key: str, expected_path: str) -> None:
    normalized = {normalize_rel_path(str(item[key])) for item in items if key in item}
    assert_true(expected_path in normalized, f"missing path {expected_path}: {normalized}")


def run_suite(exe_path: Path) -> None:
    temp_dir = Path(tempfile.mkdtemp(prefix="memoforge-windows-tauri-e2e-"))
    app_process: subprocess.Popen[str] | None = None
    sse_process: subprocess.Popen[str] | None = None

    try:
        kb_path = seed_knowledge_base(temp_dir)
        secondary_kb_path = seed_secondary_kb(temp_dir)
        import_source_path = seed_import_source(temp_dir)
        empty_kb_path = temp_dir / "empty-kb"
        empty_kb_path.mkdir(parents=True, exist_ok=True)
        remote_path = setup_git_remote(temp_dir, kb_path)
        automation_port = find_free_port()
        home = temp_dir / "home"
        home.mkdir(parents=True, exist_ok=True)

        env = os.environ.copy()
        env["MEMOFORGE_TEST_KB_PATH"] = str(kb_path)
        env["MEMOFORGE_TAURI_AUTOMATION_PORT"] = str(automation_port)
        env["HOME"] = str(home)
        env["USERPROFILE"] = str(home)
        env["XDG_CONFIG_HOME"] = str(home / ".config")
        env["APPDATA"] = str(home / "AppData" / "Roaming")
        env["LOCALAPPDATA"] = str(home / "AppData" / "Local")

        app_process = subprocess.Popen([str(exe_path)], cwd=REPO_ROOT, env=env)
        wait_for_health()
        wait_for_http_ok(f"http://127.0.0.1:{automation_port}/health")
        initialize()

        tools = post_json(
            f"{BASE_URL}/mcp",
            {"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}},
        )["result"]["tools"]
        tool_names = {tool["name"] for tool in tools}
        missing = EXPECTED_TOOLS - tool_names
        assert_true(not missing, f"missing tools: {sorted(missing)}")
        print("OK tools-list")

        editor_state = wait_for_editor_state()
        assert_true(editor_state["state_valid"] is True, f"invalid editor state: {editor_state}")
        assert_true(
            normalize_windows_path(editor_state["current_kb"]["path"]) == kb_path.resolve(),
            f"current_kb path mismatch: {editor_state['current_kb']['path']}",
        )
        print("OK editor-state")

        status = tool_call("get_status")
        assert_true(status["initialized"] is True, "knowledge base not initialized")
        assert_true(status["git_initialized"] is True, "git not initialized")
        assert_true(status["knowledge_count"] >= 6, f"unexpected knowledge count: {status}")
        print("OK get-status")

        config = tool_call("get_config")
        assert_true(config["name"] == "Windows E2E KB", f"unexpected config: {config}")
        category_paths = {category["path"] for category in config["categories"]}
        assert_true({"programming", "tools", "archive"} <= category_paths, f"bad config: {config}")
        print("OK get-config")

        categories = tool_call("list_categories")["categories"]
        assert_true(any(item["path"] == "programming" for item in categories), f"bad categories: {categories}")
        print("OK list-categories")

        knowledge = tool_call("list_knowledge", {"level": "L1", "path": "programming", "tags": ["Rust"]})
        titles = {item["title"] for item in knowledge["knowledge"]}
        assert_true(
            {"Alpha Rust Patterns", "Beta Async Notes", "Gamma Shared Tags"} <= titles,
            f"unexpected titles: {titles}",
        )
        print("OK list-knowledge")

        summary = tool_call("get_summary", {"path": "programming/alpha.md"})
        assert_true(summary["title"] == "Alpha Rust Patterns", f"bad summary: {summary}")
        assert_true(summary["summary"] == "Alpha summary", f"bad summary content: {summary}")
        print("OK get-summary")

        content = tool_call("get_content", {"path": "programming/alpha.md"})
        assert_true("programming/beta.md" in content["content"], "missing beta wiki link")
        assert_true("programming/movable.md" in content["content"], "missing movable wiki link")
        print("OK get-content")

        tags = tool_call("get_tags", {"prefix": "R"})
        rust_tag = next((item for item in tags["tags"] if item["name"] == "Rust"), None)
        assert_true(rust_tag is not None and rust_tag["count"] >= 3, f"bad tags: {tags}")
        print("OK get-tags")

        backlinks = tool_call("get_backlinks", {"path": "programming/beta.md"})
        assert_has_path(backlinks["backlinks"], "source_id", "programming/alpha.md")
        print("OK get-backlinks")

        related = tool_call("get_related", {"path": "programming/alpha.md"})
        normalized_related = {
            normalize_rel_path(item["id"]): item["relation_type"] for item in related["related"]
        }
        assert_true(
            normalized_related.get("programming/beta.md") == "Outgoing",
            f"bad related entries: {related}",
        )
        print("OK get-related")

        graph = tool_call("get_knowledge_graph")
        graph_nodes = {normalize_rel_path(node["id"]) for node in graph["nodes"]}
        graph_edges = {
            (normalize_rel_path(edge["source"]), normalize_rel_path(edge["target"]), edge["relation"])
            for edge in graph["edges"]
        }
        assert_true("programming/alpha.md" in graph_nodes, f"missing graph node: {graph}")
        assert_true(
            ("programming/alpha.md", "programming/beta.md", "WikiLink") in graph_edges,
            f"missing graph edge: {graph_edges}",
        )
        print("OK get-knowledge-graph")

        created_category = tool_call(
            "create_category",
            {
                "path": "projects/windows",
                "label": "Windows Projects",
                "description": "Desktop Windows verification flows",
            },
        )
        assert_true(created_category["created"] is True, f"failed create_category: {created_category}")
        categories = tool_call("list_categories")["categories"]
        windows_category = next((item for item in categories if item["path"] == "projects/windows"), None)
        assert_true(windows_category is not None, f"missing created category: {categories}")
        print("OK create-category")

        updated_category = tool_call(
            "update_category",
            {
                "path": "projects/windows",
                "label": "Windows Projects Updated",
                "description": "Updated desktop Windows verification flows",
            },
        )
        assert_true(updated_category["updated"] is True, f"failed update_category: {updated_category}")
        categories = tool_call("list_categories")["categories"]
        windows_category = next((item for item in categories if item["path"] == "projects/windows"), None)
        assert_true(
            windows_category is not None and windows_category["label"] == "Windows Projects Updated",
            f"category update mismatch: {categories}",
        )
        print("OK update-category")

        created = tool_call(
            "create_knowledge",
            {
                "path": "programming/windows-e2e.md",
                "content": "# Windows E2E\n\nCreated from embedded MCP.",
                "metadata": {
                    "title": "Windows E2E",
                    "tags": ["windows", "e2e"],
                    "summary": "Windows E2E note",
                },
            },
        )
        assert_true(created["path"] == "programming/windows-e2e.md", f"unexpected create result: {created}")
        print("OK create-knowledge")

        tool_call(
            "update_knowledge",
            {
                "path": "programming/windows-e2e.md",
                "content": "# Windows E2E\n\n## Marker\n\nUpdated via embedded MCP with desktop smoke marker.",
            },
        )
        grep = tool_call("grep", {"pattern": "desktop smoke marker"})
        assert_true(any(item["title"] == "Windows E2E" for item in grep["results"]), f"grep miss: {grep}")
        print("OK update-knowledge")

        stale = tool_call("get_knowledge_with_stale", {"path": "programming/windows-e2e.md"})
        assert_true(stale["summary_stale"] is True, f"expected stale summary: {stale}")
        print("OK get-knowledge-with-stale")

        metadata_update = tool_call(
            "update_metadata",
            {
                "path": "programming/windows-e2e.md",
                "metadata": {
                    "title": "Windows E2E Updated",
                    "tags": ["windows", "desktop", "e2e"],
                    "summary": "Updated desktop summary",
                },
            },
        )
        assert_true(metadata_update["updated"] is True, f"metadata update failed: {metadata_update}")
        summary = tool_call("get_summary", {"path": "programming/windows-e2e.md"})
        assert_true(summary["title"] == "Windows E2E Updated", f"bad updated summary: {summary}")
        assert_true(summary["summary_stale"] is False, f"summary should be fresh: {summary}")
        print("OK update-metadata")

        move_preview = tool_call(
            "move_knowledge",
            {
                "from": "programming/movable.md",
                "to": "projects/windows/moved-note.md",
            },
        )
        assert_true(move_preview["dry_run"] is True, f"move preview failed: {move_preview}")
        assert_true(
            any("alpha.md" in item["path"] for item in move_preview["affected_files"]),
            f"move preview missing references: {move_preview}",
        )
        moved = tool_call(
            "move_knowledge",
            {
                "from": "programming/movable.md",
                "to": "projects/windows/moved-note.md",
                "dry_run": False,
            },
        )
        assert_true(moved["moved"] is True, f"move failed: {moved}")
        alpha_after_move = tool_call("get_content", {"path": "programming/alpha.md"})
        assert_true(
            "projects/windows/moved-note.md" in alpha_after_move["content"],
            f"wiki link not updated after move: {alpha_after_move}",
        )
        print("OK move-knowledge")

        delete_preview = tool_call("delete_knowledge", {"path": "programming/delete-target.md"})
        assert_true(delete_preview["dry_run"] is True, f"delete preview failed: {delete_preview}")
        assert_true(
            any("delete-source.md" in item["path"] for item in delete_preview["affected_files"]),
            f"delete preview missing references: {delete_preview}",
        )
        deleted = tool_call(
            "delete_knowledge",
            {"path": "programming/delete-target.md", "dry_run": False},
        )
        assert_true(deleted["deleted"] is True, f"delete failed: {deleted}")
        assert_true(not (kb_path / "programming" / "delete-target.md").exists(), "delete target still exists")
        print("OK delete-knowledge")

        git_status_before_commit = tool_call("git_status")
        changed_files = {normalize_rel_path(path) for path in git_status_before_commit["files"]}
        assert_true("programming/windows-e2e.md" in changed_files, f"git status miss: {changed_files}")
        assert_true("projects/windows/moved-note.md" in changed_files, f"git status miss moved note: {changed_files}")
        print("OK git-status")

        commit = tool_call("git_commit", {"message": "Windows MCP full coverage commit"})
        assert_true(commit["committed"] is True, f"git commit failed: {commit}")
        assert_true(commit["commit"]["message"] == "Windows MCP full coverage commit", f"bad commit: {commit}")
        print("OK git-commit")

        log = tool_call("git_log", {"limit": 2})
        assert_true(
            any(item["message"] == "Windows MCP full coverage commit" for item in log["commits"]),
            f"git log missing commit: {log}",
        )
        print("OK git-log")

        push_preview = tool_call("git_push")
        assert_true(push_preview["dry_run"] is True, f"git push preview failed: {push_preview}")
        pushed = tool_call("git_push", {"dry_run": False})
        assert_true(pushed["pushed"] is True, f"git push failed: {pushed}")
        remote_verify = temp_dir / "remote-verify"
        clone_remote(remote_path, remote_verify)
        remote_log = git(remote_verify, "log", "--format=%s", "-n", "3", capture=True)
        assert_true(
            "Windows MCP full coverage commit" in remote_log,
            f"remote missing pushed commit: {remote_log}",
        )
        print("OK git-push")

        remote_writer = temp_dir / "remote-writer"
        clone_remote(remote_path, remote_writer)
        write(
            remote_writer / "tools" / "remote-added.md",
            """---
id: remote-added
title: Remote Added
tags:
  - remote
category: tools
summary: Added from remote clone
created_at: 2026-03-20T00:00:00Z
updated_at: 2026-03-20T00:00:00Z
---
# Remote Added

This note arrived through git pull.
""",
        )
        git(remote_writer, "add", ".")
        git(remote_writer, "commit", "-m", "Remote clone adds note")
        git(remote_writer, "push", "origin", "main")

        pulled = tool_call("git_pull")
        assert_true(pulled["pulled"] is True, f"git pull failed: {pulled}")
        remote_content = tool_call("get_content", {"path": "tools/remote-added.md"})
        assert_true("git pull" in remote_content["content"], f"remote note missing after pull: {remote_content}")
        print("OK git-pull")

        events_path = kb_path / ".memoforge" / "events.jsonl"
        events = read_jsonl(events_path)
        actions = {event["action"] for event in events}
        assert_true(
            {"create", "update", "update_metadata", "move", "delete", "git_commit", "git_push", "git_pull"} <= actions,
            f"missing event actions: {actions}",
        )
        print("OK event-log")

        registry_candidates = [
            home / "AppData" / "Roaming" / "com.memoforge.app" / "registry.yaml",
            home / "AppData" / "Local" / "com.memoforge.app" / "registry.yaml",
            home / ".memoforge" / "registry.yaml",
        ]
        for env_name in ("APPDATA", "LOCALAPPDATA", "USERPROFILE", "HOME"):
            env_value = os.environ.get(env_name)
            if env_value:
                base = Path(env_value)
                registry_candidates.append(base / "com.memoforge.app" / "registry.yaml")
                registry_candidates.append(base / ".memoforge" / "registry.yaml")

        registry_path = find_existing_path(registry_candidates)
        assert_true(registry_path is not None, f"missing registry file in candidates: {registry_candidates}")
        registry_text = registry_path.read_text(encoding="utf-8")
        assert_true(str(kb_path.resolve()) in registry_text, f"registry missing kb path: {registry_text}")
        print("OK kb-registry")

        deleted_category = tool_call("delete_category", {"path": "projects/windows"})
        assert_true(deleted_category["deleted"] is True, f"delete category failed: {deleted_category}")
        categories = tool_call("list_categories")["categories"]
        assert_true(
            all(item["path"] != "projects/windows" for item in categories),
            f"category still present after delete: {categories}",
        )
        print("OK delete-category")

        sse_process = open_sse_stream()
        first_line = ""
        deadline = time.time() + 10
        while time.time() < deadline and sse_process.stdout is not None:
            line = sse_process.stdout.readline()
            if line:
                first_line = line.strip()
                break
            time.sleep(0.1)
        assert_true(first_line.startswith("data:"), f"missing SSE data line: {first_line!r}")

        active_agents = []
        for _ in range(20):
            active_agents = tool_call("get_editor_state").get("active_agents", [])
            if active_agents:
                break
            time.sleep(0.2)
        assert_true(len(active_agents) >= 1, "SSE client was not reflected in editor state")
        print("OK sse-stream")

        mcp_connections = automation_call(automation_port, "get_mcp_connection_count")
        assert_true(mcp_connections >= 1, f"unexpected MCP connection count: {mcp_connections}")
        print("OK tauri-mcp-connection-count")

        outgoing_links = automation_call(automation_port, "get_outgoing_links", {"path": "programming/alpha.md"})
        assert_has_path(outgoing_links, "source_id", "programming/alpha.md")
        assert_true(any(normalize_rel_path(item["source_id"]) == "programming/alpha.md" for item in outgoing_links), outgoing_links)
        print("OK tauri-outgoing-links")

        diagnostics = automation_call(automation_port, "get_app_diagnostics")
        assert_true(normalize_windows_path(diagnostics["current_kb"]) == kb_path.resolve(), diagnostics)
        assert_true(Path(diagnostics["log_file"]).exists(), f"missing log file: {diagnostics}")
        assert_true(len(diagnostics["recent_logs"]) >= 1, f"missing recent logs: {diagnostics}")
        print("OK tauri-diagnostics")

        preview_import = automation_call(
            automation_port,
            "preview_import",
            {"source_path": str(import_source_path)},
        )
        assert_true(preview_import["total_files"] == 1, f"bad import preview: {preview_import}")
        assert_true(not (kb_path / "imported-note.md").exists(), "preview import wrote files")
        print("OK tauri-preview-import")

        import_result = automation_call(
            automation_port,
            "import_folder",
            {
                "source_path": str(import_source_path),
                "generate_frontmatter": True,
                "auto_categories": True,
                "dry_run": False,
            },
        )
        assert_true(import_result["files_imported"] == 1, f"bad import result: {import_result}")
        imported_note_path = kb_path / "imported-note.md"
        assert_true(imported_note_path.exists(), f"missing imported note: {imported_note_path}")
        assert_true(imported_note_path.read_text(encoding="utf-8").startswith("---\n"), "import did not add frontmatter")
        print("OK tauri-import-folder")

        imported_assets = automation_call(
            automation_port,
            "import_assets",
            {
                "knowledge_id": "programming/alpha.md",
                "assets": [
                    {
                        "file_name": "diagram.png",
                        "mime_type": "image/png",
                        "bytes": [137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3, 4],
                    }
                ],
            },
        )
        assert_true(imported_assets[0]["reused"] is False, f"first asset import should write file: {imported_assets}")
        assert_true(imported_assets[0]["markdown"].startswith("![diagram]"), imported_assets)
        assets_dir = kb_path / "programming" / "assets"
        first_asset_path = assets_dir / imported_assets[0]["file_name"]
        assert_true(first_asset_path.exists(), f"missing imported asset: {first_asset_path}")
        reused_assets = automation_call(
            automation_port,
            "import_assets",
            {
                "knowledge_id": "programming/alpha.md",
                "assets": [
                    {
                        "file_name": "diagram-copy.png",
                        "mime_type": "image/png",
                        "bytes": [137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3, 4],
                    }
                ],
            },
        )
        assert_true(reused_assets[0]["reused"] is True, f"expected asset dedupe reuse: {reused_assets}")
        print("OK tauri-import-assets")

        assert_true(automation_call(automation_port, "is_git_repo") is True, "Tauri git repo detection failed")
        print("OK tauri-is-git-repo")

        cli_path = kb_path / "tools" / "cli.md"
        cli_path.write_text(cli_path.read_text(encoding="utf-8") + "\nTracked diff marker.\n", encoding="utf-8")
        git_diff = automation_call(automation_port, "git_diff")
        assert_true("Tracked diff marker." in git_diff, f"git diff missing tracked change: {git_diff}")
        print("OK tauri-git-diff")

        recent_events = automation_call(automation_port, "read_events", {"limit": 5})
        assert_true(len(recent_events) >= 1, f"expected recent events: {recent_events}")
        assert_true(any(event["action"] in {"git_pull", "create", "update", "move"} for event in recent_events), recent_events)
        print("OK tauri-read-events")

        automation_call(
            automation_port,
            "select_knowledge",
            {"path": "programming/alpha.md", "title": "Alpha Rust Patterns", "category": "programming"},
        )
        memory_state = automation_call(automation_port, "get_memory_state")
        assert_true(memory_state["current_knowledge"]["path"] == "programming/alpha.md", memory_state)
        print("OK tauri-select-knowledge")

        automation_call(
            automation_port,
            "update_selection",
            {"start_line": 1, "end_line": 2, "text_length": 5, "text": "Alpha"},
        )
        memory_state = automation_call(automation_port, "get_memory_state")
        assert_true(memory_state["selection"]["text_length"] == 5, memory_state)
        assert_true(memory_state["selection"]["selected_text"] == "Alpha", memory_state)
        print("OK tauri-update-selection")

        automation_call(automation_port, "clear_selection")
        memory_state = automation_call(automation_port, "get_memory_state")
        assert_true(memory_state["selection"] is None, memory_state)
        print("OK tauri-clear-selection")

        automation_call(automation_port, "clear_knowledge")
        memory_state = automation_call(automation_port, "get_memory_state")
        assert_true(memory_state["current_knowledge"] is None, memory_state)
        print("OK tauri-clear-knowledge")

        automation_call(
            automation_port,
            "update_memory_kb",
            {"path": str(secondary_kb_path), "name": "Manual KB", "count": 7},
        )
        automation_call(
            automation_port,
            "update_memory_knowledge",
            {"path": "manual/note.md", "title": "Manual Note", "category": "manual"},
        )
        automation_call(
            automation_port,
            "update_memory_selection",
            {"start_line": 3, "end_line": 4, "text_length": 6, "text": "manual"},
        )
        memory_state = automation_call(automation_port, "get_memory_state")
        assert_true(memory_state["current_kb"]["name"] == "Manual KB", memory_state)
        assert_true(memory_state["current_knowledge"]["title"] == "Manual Note", memory_state)
        assert_true(memory_state["selection"]["selected_text"] == "manual", memory_state)
        print("OK tauri-update-memory-state")

        automation_call(automation_port, "clear_memory_knowledge")
        memory_state = automation_call(automation_port, "get_memory_state")
        assert_true(memory_state["current_knowledge"] is None, memory_state)
        assert_true(memory_state["selection"] is None, memory_state)
        print("OK tauri-clear-memory-knowledge")

        automation_call(
            automation_port,
            "set_kb",
            {"path": str(kb_path), "name": "Manual Primary", "count": 999},
        )
        memory_state = automation_call(automation_port, "get_memory_state")
        assert_true(memory_state["current_kb"]["name"] == "Manual Primary", memory_state)
        automation_call(automation_port, "refresh_kb_state")
        memory_state = automation_call(automation_port, "get_memory_state")
        assert_true(memory_state["current_kb"]["name"] == "Windows E2E KB", memory_state)
        assert_true(memory_state["current_kb"]["knowledge_count"] >= 7, memory_state)
        print("OK tauri-refresh-kb-state")

        automation_call(automation_port, "init_kb", {"path": str(empty_kb_path), "mode": "open"})
        current_kb = automation_call(automation_port, "get_current_kb")
        assert_true(normalize_windows_path(current_kb) == empty_kb_path.resolve(), current_kb)
        assert_true((empty_kb_path / ".memoforge" / "config.yaml").exists(), "empty dir was not auto-initialized")
        print("OK tauri-init-kb")

        kb_list = automation_call(automation_port, "list_kb")
        kb_paths = {normalize_windows_path(item["path"]) for item in kb_list}
        assert_true(kb_path.resolve() in kb_paths and empty_kb_path.resolve() in kb_paths, kb_list)
        print("OK tauri-list-kb")

        automation_call(automation_port, "init_kb", {"path": str(secondary_kb_path), "mode": "open"})
        current_kb = automation_call(automation_port, "get_current_kb")
        assert_true(normalize_windows_path(current_kb) == secondary_kb_path.resolve(), current_kb)
        recent_kbs = automation_call(automation_port, "get_recent_kbs", {"limit": 10})
        recent_paths = {normalize_windows_path(item["path"]) for item in recent_kbs}
        assert_true(kb_path.resolve() in recent_paths and secondary_kb_path.resolve() in recent_paths, recent_kbs)
        last_kb = automation_call(automation_port, "get_last_kb")
        assert_true(normalize_windows_path(last_kb) == secondary_kb_path.resolve(), last_kb)
        automation_call(automation_port, "switch_kb", {"path": str(kb_path)})
        current_kb = automation_call(automation_port, "get_current_kb")
        assert_true(normalize_windows_path(current_kb) == kb_path.resolve(), current_kb)
        print("OK tauri-switch-kb")

        automation_call(automation_port, "unregister_kb", {"path": str(secondary_kb_path)})
        kb_list = automation_call(automation_port, "list_kb")
        kb_paths = {normalize_windows_path(item["path"]) for item in kb_list}
        assert_true(secondary_kb_path.resolve() not in kb_paths, kb_list)
        print("OK tauri-unregister-kb")

        automation_call(automation_port, "close_kb")
        direct_status = automation_call(automation_port, "get_status")
        assert_true(direct_status["initialized"] is False, direct_status)
        automation_call(automation_port, "init_kb", {"path": str(kb_path), "mode": "open"})
        direct_status = automation_call(automation_port, "get_status")
        assert_true(direct_status["initialized"] is True, direct_status)
        assert_true(normalize_windows_path(direct_status["kb_path"]) == kb_path.resolve(), direct_status)
        print("OK tauri-close-kb")

        print(json.dumps({"status": "ok", "kb_path": str(kb_path)}, ensure_ascii=False))
    finally:
        if sse_process and sse_process.poll() is None:
            sse_process.terminate()
            try:
                sse_process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                sse_process.kill()
        if app_process and app_process.poll() is None:
            app_process.terminate()
            try:
                app_process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                app_process.kill()
        shutil.rmtree(temp_dir, ignore_errors=True)


def main() -> None:
    exe_path = Path(os.environ.get("MEMOFORGE_TAURI_BIN", DEFAULT_EXE))
    if not exe_path.exists():
        raise FileNotFoundError(f"Missing Tauri executable: {exe_path}")
    run_suite(exe_path)


if __name__ == "__main__":
    main()








