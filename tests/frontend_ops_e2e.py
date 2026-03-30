#!/usr/bin/env python3

import json
import re
import shutil
import subprocess
import tempfile
import time
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

from frontend_e2e import (
    REPO_ROOT,
    find_free_port,
    get_http_server_command,
    make_test_env,
    seed_knowledge_base,
    start_process,
    terminate_process,
    wait_for_url,
)


def git_output(*args: str) -> str:
    result = subprocess.run(
        ["git", *args],
        check=True,
        capture_output=True,
        text=True,
    )
    return result.stdout.strip()


def run_frontend_ops_e2e(paths: dict[str, str], web_port: int) -> None:
    commit_message = f"frontend ops e2e commit {int(time.time())}"

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1440, "height": 1000})
        page.goto(f"http://127.0.0.1:{web_port}", wait_until="networkidle")
        page.wait_for_timeout(1000)

        def mark(step: str) -> None:
            print(f"OK {step}")

        tree_nav = page.locator(".knowledge-tree-shell")
        browser_shell = page.locator(".directory-browser-shell")
        main_header = page.locator("div.h-12")

        def tree_button(text: str):
            return tree_nav.locator("button").filter(has_text=re.compile(text)).first

        page.get_by_role("button", name="更多").click()
        page.get_by_role("button", name="知识图谱").click()
        expect(page.get_by_text("知识图谱")).to_be_visible()
        page.locator(".react-flow__node").filter(has_text="Alpha Rust Patterns").first.wait_for()
        page.locator(".react-flow__node").filter(has_text="Alpha Rust Patterns").first.click()
        page.wait_for_timeout(800)
        expect(main_header.get_by_text("Alpha Rust Patterns")).to_be_visible()
        mark("graph-select")

        tree_button("全部文档").click()
        page.locator('button[title="导入 Markdown"]').click()
        import_modal = page.locator("div.fixed.inset-0.z-50").filter(has=page.get_by_text("导入 Markdown 文件夹"))
        expect(import_modal).to_be_visible()
        import_modal.get_by_placeholder("例如: ~/Documents/notes 或 /path/to/markdown/files").fill(paths["import_src"])
        import_modal.get_by_role("button", name="预览").click()
        expect(import_modal.get_by_text("预览结果")).to_be_visible()
        expect(import_modal.get_by_text("Imported Note")).to_be_visible()
        import_modal.get_by_role("button", name="开始导入").click()
        expect(import_modal.get_by_text("导入完成")).to_be_visible()
        import_modal.get_by_role("button", name="关闭").click()
        page.wait_for_timeout(1200)
        expect(browser_shell.get_by_text("Imported Note")).to_be_visible()

        imported_path = Path(paths["kb1"]) / "imported-note.md"
        source_path = Path(paths["import_src"]) / "imported-note.md"
        assert imported_path.exists(), f"Imported file missing: {imported_path}"
        assert imported_path.read_text(encoding="utf-8").startswith("---\n")
        assert not source_path.read_text(encoding="utf-8").startswith("---\n")
        mark("import")

        page.get_by_role("button", name="Git").click()
        page.get_by_placeholder("输入提交信息").fill(commit_message)
        page.get_by_role("button", name="提交").click()
        expect(page.get_by_text("无变更")).to_be_visible(timeout=10_000)
        assert git_output("-C", paths["kb1"], "log", "-1", "--pretty=%s") == commit_message

        page.locator(".side-panel-body button").filter(has=page.locator("svg.lucide-arrow-down")).first.click()
        page.wait_for_timeout(1000)
        page.locator(".side-panel-body button").filter(has=page.locator("svg.lucide-upload")).first.click()
        page.wait_for_timeout(1500)
        assert git_output("--git-dir", paths["remote"], "log", "--all", "-1", "--pretty=%s") == commit_message
        mark("git")

        page.locator('button[title="切换知识库"]').click()
        expect(page.get_by_text("知识库管理")).to_be_visible()
        page.get_by_placeholder("输入知识库路径或选择目录...").fill(paths["kb2"])
        page.get_by_role("button", name="打开").click()
        page.wait_for_timeout(1000)
        page.reload(wait_until="networkidle")
        page.wait_for_timeout(1000)
        tree_button("programming").click()
        expect(browser_shell.get_by_text("Gamma Python Tips")).to_be_visible()
        mark("kb-switch")

        browser.close()


def run_readonly_smoke(web_port: int) -> None:
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1440, "height": 1000})
        page.goto(f"http://127.0.0.1:{web_port}", wait_until="networkidle")
        page.wait_for_timeout(1000)

        def mark(step: str) -> None:
            print(f"OK {step}")

        tree_nav = page.locator(".knowledge-tree-shell")
        browser_shell = page.locator(".directory-browser-shell")
        main_header = page.locator("div.h-12")

        def tree_button(text: str):
            return tree_nav.locator("button").filter(has_text=re.compile(text)).first

        expect(page.get_by_text("Web 访问仅限只读")).to_be_visible()
        expect(page.get_by_role("button", name="新建")).to_have_count(0)
        expect(page.get_by_role("button", name="保存")).to_have_count(0)
        expect(page.locator('button[title="导入 Markdown"]')).to_have_count(0)
        expect(page.get_by_text("Git 状态")).to_have_count(0)

        tree_button("programming").click()
        browser_shell.locator("button").filter(has_text="Alpha Rust Patterns").first.click()
        page.wait_for_timeout(600)
        expect(main_header.get_by_text("Alpha Rust Patterns")).to_be_visible()
        expect(page.get_by_role("button", name="阅读")).to_have_count(0)
        expect(page.get_by_role("button", name="Markdown")).to_have_count(0)
        expect(page.get_by_role("button", name="高级编辑")).to_have_count(0)
        mark("readonly")

        browser.close()


def start_http(paths: dict[str, str], env: dict[str, str], http_port: int, web_port: int, readonly: bool = False):
    cmd = get_http_server_command(paths, http_port, web_port)
    if readonly:
        cmd.append("--readonly")

    process = start_process(cmd, cwd=REPO_ROOT, env=env)
    wait_for_url(f"http://127.0.0.1:{http_port}/api/status", timeout=60.0)
    return process


def main() -> None:
    temp_dir = Path(tempfile.mkdtemp(prefix="memoforge-frontend-ops-e2e-"))
    http_process = None
    web_process = None

    try:
        paths = seed_knowledge_base(temp_dir)
        test_env = make_test_env(temp_dir)
        http_port = find_free_port()
        web_port = find_free_port()

        http_process = start_http(paths, test_env, http_port, web_port, readonly=False)

        web_env = test_env.copy()
        web_env["VITE_MEMOFORGE_API_BASE"] = f"http://127.0.0.1:{http_port}"
        web_process = start_process(
            ["npm", "run", "dev", "--", "--host", "127.0.0.1", "--port", str(web_port)],
            cwd=REPO_ROOT / "frontend",
            env=web_env,
        )
        wait_for_url(f"http://127.0.0.1:{web_port}", timeout=60.0)

        run_frontend_ops_e2e(paths, web_port)

        terminate_process(http_process)
        http_process = start_http(paths, test_env, http_port, web_port, readonly=True)
        run_readonly_smoke(web_port)

        print(json.dumps({"status": "ok", "paths": paths}, ensure_ascii=False))
    finally:
        terminate_process(web_process)
        terminate_process(http_process)
        shutil.rmtree(temp_dir, ignore_errors=True)


if __name__ == "__main__":
    main()
