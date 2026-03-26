#!/usr/bin/env python3

import json
import os
import shutil
import socket
import subprocess
import tempfile
import textwrap
import time
import urllib.request
from pathlib import Path

from playwright.sync_api import expect, sync_playwright


REPO_ROOT = Path(__file__).resolve().parents[1]


def write(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def init_git_repo(kb_path: Path, remote_path: Path) -> None:
    subprocess.run(["git", "init", "--bare", str(remote_path)], check=True, stdout=subprocess.DEVNULL)
    subprocess.run(["git", "-C", str(kb_path), "init"], check=True, stdout=subprocess.DEVNULL)
    subprocess.run(["git", "-C", str(kb_path), "config", "user.email", "e2e@example.com"], check=True)
    subprocess.run(["git", "-C", str(kb_path), "config", "user.name", "E2E"], check=True)
    subprocess.run(["git", "-C", str(kb_path), "add", "."], check=True, stdout=subprocess.DEVNULL)
    subprocess.run(["git", "-C", str(kb_path), "commit", "-m", "Initial knowledge base"], check=True, stdout=subprocess.DEVNULL)
    subprocess.run(["git", "-C", str(kb_path), "branch", "-M", "main"], check=True, stdout=subprocess.DEVNULL)
    subprocess.run(["git", "-C", str(kb_path), "remote", "add", "origin", str(remote_path)], check=True)
    subprocess.run(["git", "-C", str(kb_path), "push", "-u", "origin", "main"], check=True, stdout=subprocess.DEVNULL)


def seed_knowledge_base(base_dir: Path) -> dict[str, str]:
    kb1 = base_dir / "kb1"
    kb2 = base_dir / "kb2"
    remote = base_dir / "remote.git"
    import_src = base_dir / "import-src"
    import_src.mkdir(parents=True, exist_ok=True)

    config = textwrap.dedent(
        """\
        version: "1.0"
        categories:
          - id: programming
            name: 编程技术
            path: programming
          - id: tools
            name: 工具使用
            path: tools
        """
    )
    memoforge_gitignore = "serve.pid\nhttp.token\nevents.jsonl\ngit.lock\n*.lock\n"

    for kb in [kb1, kb2]:
        (kb / ".memoforge").mkdir(parents=True, exist_ok=True)
        write(kb / ".memoforge" / "config.yaml", config)
        write(kb / ".memoforge" / ".gitignore", memoforge_gitignore)
        write(kb / ".gitignore", ".DS_Store\n")
        (kb / "programming").mkdir(parents=True, exist_ok=True)
        (kb / "tools").mkdir(parents=True, exist_ok=True)

    write(
        kb1 / "programming" / "alpha.md",
        textwrap.dedent(
            """\
            ---
            id: alpha
            title: Alpha Rust Patterns
            tags:
              - Rust
              - 并发
            category: programming
            summary: Alpha 文档，链接到 Beta。
            created_at: 2026-03-20T00:00:00Z
            updated_at: 2026-03-20T00:00:00Z
            ---
            # Alpha Rust Patterns

            这里记录 Rust 并发模式。

            参考 [[programming/beta.md]]。
            """
        ),
    )
    write(
        kb1 / "programming" / "beta.md",
        textwrap.dedent(
            """\
            ---
            id: beta
            title: Beta Async Notes
            tags:
              - Rust
              - async
            category: programming
            summary: Beta 文档，被 Alpha 引用。
            created_at: 2026-03-20T00:00:00Z
            updated_at: 2026-03-20T00:00:00Z
            ---
            # Beta Async Notes

            Tokio async best practices.
            """
        ),
    )
    write(
        kb1 / "tools" / "docker.md",
        textwrap.dedent(
            """\
            ---
            id: docker
            title: Docker Deploy Guide
            tags:
              - Docker
              - DevOps
            category: tools
            summary: Docker 部署说明。
            created_at: 2026-03-20T00:00:00Z
            updated_at: 2026-03-20T00:00:00Z
            ---
            # Docker Deploy Guide

            docker build and docker run.
            """
        ),
    )
    write(
        kb2 / "programming" / "gamma.md",
        textwrap.dedent(
            """\
            ---
            id: gamma
            title: Gamma Python Tips
            tags:
              - Python
            category: programming
            summary: 第二知识库中的 Python 文档。
            created_at: 2026-03-20T00:00:00Z
            updated_at: 2026-03-20T00:00:00Z
            ---
            # Gamma Python Tips

            asyncio and tooling.
            """
        ),
    )
    write(import_src / "imported-note.md", "# Imported Note\n\n这是导入的 Markdown 文件。\n")

    init_git_repo(kb1, remote)

    return {
        "kb1": str(kb1),
        "kb2": str(kb2),
        "import_src": str(import_src),
        "remote": str(remote),
    }


def wait_for_url(url: str, timeout: float = 30.0) -> None:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=1):
                return
        except Exception:
            time.sleep(0.25)
    raise RuntimeError(f"Timed out waiting for {url}")


def make_test_env(base_dir: Path) -> dict[str, str]:
    env = os.environ.copy()
    original_home = Path(os.environ.get("HOME", str(base_dir)))
    home = base_dir / "home"
    home.mkdir(parents=True, exist_ok=True)
    env["HOME"] = str(home)
    env["USERPROFILE"] = str(home)
    env["XDG_CONFIG_HOME"] = str(home / ".config")
    env.setdefault("CARGO_HOME", str(original_home / ".cargo"))
    env.setdefault("RUSTUP_HOME", str(original_home / ".rustup"))
    env.setdefault("npm_config_cache", str(original_home / ".npm"))
    return env


def find_free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        sock.listen(1)
        return sock.getsockname()[1]


def start_process(cmd: list[str], cwd: Path, env: dict[str, str] | None = None) -> subprocess.Popen[str]:
    return subprocess.Popen(
        cmd,
        cwd=cwd,
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )


def terminate_process(process: subprocess.Popen[str] | None) -> None:
    if process is None or process.poll() is not None:
        return
    process.terminate()
    try:
        process.wait(timeout=10)
    except subprocess.TimeoutExpired:
        process.kill()


def run_frontend_e2e(paths: dict[str, str], web_port: int) -> None:
    note_title = f"Frontend E2E {int(time.time())}"
    delete_title = f"Delete E2E {int(time.time())}"

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1440, "height": 1000})
        update_requests: list[dict[str, object]] = []
        dialogs: list[str] = []
        failed_requests: list[dict[str, str]] = []

        def capture_request(request) -> None:
            is_update = request.method == "PUT" and "/api/knowledge/item?" in request.url
            is_move = request.method == "POST" and "/api/knowledge/move?" in request.url
            if not is_update and not is_move:
                return
            payload = request.post_data or "{}"
            try:
                request_data = json.loads(payload)
            except json.JSONDecodeError:
                request_data = {"raw": payload}
            request_data["_url"] = request.url
            request_data["_method"] = request.method
            update_requests.append(request_data)

        def handle_dialog(dialog) -> None:
            dialogs.append(dialog.message)
            dialog.dismiss()

        def handle_request_failed(request) -> None:
            failure = request.failure
            failed_requests.append({
                "url": request.url,
                "method": request.method,
                "error": failure if isinstance(failure, str) else str(failure),
            })

        page.on("request", capture_request)
        page.on("dialog", handle_dialog)
        page.on("requestfailed", handle_request_failed)
        page.goto(f"http://127.0.0.1:{web_port}", wait_until="networkidle")
        page.wait_for_timeout(1000)

        def mark(step: str) -> None:
            print(f"OK {step}")

        def sidebar_text(text: str):
            return page.locator("div.w-\\[240px\\]").get_by_text(text).first

        middle_list = page.locator("div.w-\\[300px\\]")
        save_button = page.locator("button").filter(has=page.locator("svg.lucide-save")).first

        page.get_by_text("搜索知识...").click()
        expect(page.locator('input[placeholder*="搜索知识"]')).to_be_visible()
        page.keyboard.press("Escape")
        page.wait_for_timeout(300)
        mark("sidebar-search")

        sort_button = page.get_by_text("最近")
        sort_button.click()
        expect(page.get_by_text("标题")).to_be_visible()
        page.get_by_text("标题").click()
        expect(page.get_by_text("最近")).to_be_visible()
        mark("sort-toggle")

        sidebar_text("工具使用").click()
        expect(middle_list.get_by_text("Docker Deploy Guide")).to_be_visible()
        sidebar_text("工具使用").click()
        mark("category-filter")

        middle_list.get_by_text("Alpha Rust Patterns").click()
        expect(page.get_by_text("链接到")).to_be_visible()
        expect(page.get_by_text("Beta Async Notes")).to_be_visible()
        mark("backlinks")

        page.locator('button[title="搜索"]').click()
        search_panel = page.locator("div.fixed.inset-0.z-50")
        search_input = search_panel.locator('input[placeholder*="搜索知识"]').first
        search_input.fill("tag:Rust")
        search_input.press("Enter")
        page.wait_for_timeout(800)
        assert search_panel.locator("span.font-semibold").count() >= 2
        page.keyboard.press("Escape")
        page.wait_for_timeout(300)
        mark("tag-search")

        page.get_by_role("button", name="新建").click()
        page.get_by_placeholder("输入知识标题").fill(delete_title)
        page.get_by_role("button", name="下一步").click()
        page.get_by_placeholder("输入分类名称").fill("programming")
        page.get_by_role("button", name="创建").click()
        page.wait_for_timeout(1000)
        expect(middle_list.get_by_text(delete_title)).to_be_visible()
        middle_list.get_by_text(delete_title).click()
        page.wait_for_timeout(600)
        page.locator("button").filter(has=page.locator("svg.lucide-more-horizontal")).first.click()
        page.wait_for_timeout(300)
        page.get_by_role("button", name="删除知识").click()
        expect(page.get_by_text("确认删除知识")).to_be_visible()
        page.get_by_role("button", name="删除").click()
        page.wait_for_timeout(1000)
        expect(middle_list.get_by_text(delete_title)).to_have_count(0)
        mark("delete")

        page.get_by_role("button", name="新建").click()
        page.get_by_placeholder("输入知识标题").fill(note_title)
        page.get_by_role("button", name="下一步").click()
        page.get_by_placeholder("输入分类名称").fill("programming")
        tag_input = page.get_by_placeholder("输入标签")
        tag_input.fill("Testing")
        tag_input.press("Enter")
        page.get_by_role("button", name="创建").click()
        page.wait_for_timeout(1000)
        expect(middle_list.get_by_text(note_title)).to_be_visible()
        mark("new-knowledge")

        editor = page.locator(".cm-content").first
        editor.click()
        page.keyboard.press("Meta+A")
        page.keyboard.type(f"# {note_title}\n\ncontent updated for e2e")
        page.get_by_role("button", name="保存").click()
        page.wait_for_timeout(100)
        expect(save_button).to_be_enabled(timeout=10_000)
        page.get_by_role("button", name="阅读").click()
        expect(page.get_by_text("content updated for e2e")).to_be_visible()
        page.get_by_role("button", name="编辑").click()
        mark("save-edit")

        page.locator('input[placeholder="输入分类"]').fill("tools")
        expect(page.locator('input[placeholder="输入分类"]')).to_have_value("tools")
        page.wait_for_timeout(300)
        save_button.click()
        page.wait_for_timeout(100)
        expect(save_button).to_be_enabled(timeout=10_000)
        assert not dialogs, f"Unexpected dialogs after category save: {dialogs}; failed requests: {failed_requests}"
        expect(page.locator("div.h-12").get_by_text("tools")).to_be_visible()
        deadline = time.time() + 10
        moved_files: list[Path] = []
        while time.time() < deadline:
          moved_files = [
              path
              for path in Path(paths["kb1"]).rglob("*.md")
              if note_title in path.read_text(encoding="utf-8")
          ]
          if len(moved_files) == 1 and moved_files[0].parent.name == "tools":
              break
          time.sleep(0.25)
        all_files = sorted(str(path.relative_to(paths["kb1"])) for path in Path(paths["kb1"]).rglob("*.md"))
        assert len(moved_files) == 1, f"Expected one moved note, got: {moved_files}; all files: {all_files}"
        assert moved_files[0].parent.name == "tools", f"Expected note under tools/, got: {moved_files[0]}; all files: {all_files}; requests: {update_requests}; dialogs: {dialogs}; failed requests: {failed_requests}"
        mark("move-category")

        browser.close()


def main() -> None:
    temp_dir = Path(tempfile.mkdtemp(prefix="memoforge-frontend-e2e-"))
    http_process = None
    web_process = None

    try:
        paths = seed_knowledge_base(temp_dir)
        test_env = make_test_env(temp_dir)
        http_port = find_free_port()
        web_port = find_free_port()

        http_process = start_process(
            [
                "cargo",
                "run",
                "-p",
                "memoforge-http",
                "--",
                "--kb-path",
                paths["kb1"],
                "--bind",
                "127.0.0.1",
                "--port",
                str(http_port),
                "--cors-origin",
                f"http://127.0.0.1:{web_port}",
            ],
            cwd=REPO_ROOT,
            env=test_env,
        )
        wait_for_url(f"http://127.0.0.1:{http_port}/api/status")

        web_env = test_env.copy()
        web_env["VITE_MEMOFORGE_API_BASE"] = f"http://127.0.0.1:{http_port}"
        web_process = start_process(
            ["npm", "run", "dev", "--", "--host", "127.0.0.1", "--port", str(web_port)],
            cwd=REPO_ROOT / "frontend",
            env=web_env,
        )
        wait_for_url(f"http://127.0.0.1:{web_port}")

        run_frontend_e2e(paths, web_port)
        print(json.dumps({"status": "ok", "paths": paths}, ensure_ascii=False))
    finally:
        terminate_process(web_process)
        terminate_process(http_process)
        shutil.rmtree(temp_dir, ignore_errors=True)


if __name__ == "__main__":
    main()
