#!/usr/bin/env python3
"""Tauri desktop end-to-end tests.

This suite launches the real MemoForge desktop app through `tauri-driver`
and verifies that the UI exercises the Tauri command path instead of the
HTTP fallback path used by the browser-only E2E tests.

Official Tauri WebDriver support currently exists on Linux and Windows only.
On macOS, this script exits successfully with a skip message.
"""

from __future__ import annotations

import json
import os
import platform
import re
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import traceback
import urllib.request
from pathlib import Path

from frontend_e2e import REPO_ROOT, make_test_env, seed_knowledge_base, terminate_process

try:
    from selenium import webdriver
    from selenium.common.exceptions import TimeoutException
    from selenium.webdriver.common.by import By
    from selenium.webdriver.common.keys import Keys
    from selenium.webdriver.common.options import ArgOptions
    from selenium.webdriver.support import expected_conditions as EC
    from selenium.webdriver.support.ui import WebDriverWait
except ImportError as error:  # pragma: no cover - preflight guard
    raise SystemExit(
        "Missing dependency: selenium. Install it with `python -m pip install selenium`."
    ) from error


TAURI_DRIVER_PORT = 4444
ARTIFACT_ROOT = REPO_ROOT / "test-artifacts" / "tauri-desktop-e2e"


def write(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def normalize_path(value: str | Path) -> Path:
    raw = str(value)
    if raw.startswith("\\\\?\\"):
        raw = raw[4:]
    return Path(raw).resolve()


def find_free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        sock.listen(1)
        return sock.getsockname()[1]


def wait_for_path(path: Path, *, timeout: float = 20.0, expect_dir: bool = False) -> None:
    deadline = time.time() + timeout
    while time.time() < deadline:
        if path.exists() and (not expect_dir or path.is_dir()):
            return
        time.sleep(0.2)
    raise AssertionError(f"Timed out waiting for path: {path}")


def wait_for_http(url: str, timeout: float = 30.0) -> None:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=1) as response:
                if 200 <= response.status < 500:
                    return
        except Exception:
            time.sleep(0.25)
    raise RuntimeError(f"Timed out waiting for {url}")


def http_post_json(url: str, payload: dict, timeout: float = 10.0) -> dict:
    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def wait_for_port(port: int, timeout: float = 15.0) -> None:
    deadline = time.time() + timeout
    while time.time() < deadline:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.settimeout(1)
            if sock.connect_ex(("127.0.0.1", port)) == 0:
                return
        time.sleep(0.25)
    raise RuntimeError(f"Timed out waiting for port {port}")


def run_command(cmd: list[str], cwd: Path, env: dict[str, str]) -> None:
    subprocess.run(cmd, cwd=cwd, env=env, check=True)


def scenario_artifact_dir(name: str) -> Path:
    path = ARTIFACT_ROOT / name
    path.mkdir(parents=True, exist_ok=True)
    return path


def normalize_scenario_name(name: str) -> str:
    sanitized = re.sub(r"[^A-Za-z0-9._-]+", "-", name).strip("-._")
    return sanitized or "scenario"


def build_desktop_binary(env: dict[str, str]) -> Path:
    binary_override = os.environ.get("MEMOFORGE_TAURI_BIN")
    if binary_override:
        binary_path = Path(binary_override)
        if binary_path.exists():
            return binary_path

    frontend_dist = REPO_ROOT / "frontend" / "dist" / "index.html"
    if not frontend_dist.exists():
        run_command(["npm", "run", "build"], cwd=REPO_ROOT / "frontend", env=env)

    run_command(
        ["cargo", "build", "-p", "memoforge-tauri", "--features", "custom-protocol"],
        cwd=REPO_ROOT,
        env=env,
    )
    binary_name = "memoforge-tauri.exe" if os.name == "nt" else "memoforge-tauri"
    return REPO_ROOT / "target" / "debug" / binary_name


def registry_file_path(env: dict[str, str]) -> Path:
    registry_root = env.get("MEMOFORGE_REGISTRY_DIR")
    if not registry_root:
        raise RuntimeError("MEMOFORGE_REGISTRY_DIR must be set for Tauri desktop E2E")
    return Path(registry_root) / "registry.yaml"


def seed_registry(paths: dict[str, str], env: dict[str, str]) -> None:
    kb1 = str(Path(paths["kb1"]).resolve())
    kb2 = str(Path(paths["kb2"]).resolve())
    registry = "\n".join(
        [
            "knowledge_bases:",
            f"  - path: {json.dumps(kb1)}",
            '    name: "kb1"',
            '    last_accessed: "2026-04-09T00:00:00Z"',
            "    is_default: true",
            f"  - path: {json.dumps(kb2)}",
            '    name: "kb2"',
            '    last_accessed: "2026-04-08T23:59:00Z"',
            "    is_default: false",
            f"current: {json.dumps(kb1)}",
            "",
        ]
    )
    write(registry_file_path(env), registry)


def start_tauri_driver(env: dict[str, str]) -> subprocess.Popen[str]:
    tauri_driver = shutil.which("tauri-driver")
    if tauri_driver is None:
        raise RuntimeError("`tauri-driver` not found in PATH. Run `cargo install tauri-driver --locked`.")

    cmd = [tauri_driver]
    if sys.platform.startswith("linux"):
        native_driver = shutil.which("WebKitWebDriver")
        if native_driver:
            cmd.extend(["--native-driver", native_driver])

    process = subprocess.Popen(
        cmd,
        cwd=REPO_ROOT,
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    wait_for_port(TAURI_DRIVER_PORT, timeout=20.0)
    return process


def start_webdriver(application: Path, timeout: float = 20.0) -> webdriver.Remote:
    options = ArgOptions()
    options.set_capability("browserName", "wry")
    options.set_capability("tauri:options", {"application": str(application)})
    deadline = time.time() + timeout
    last_error: Exception | None = None
    while time.time() < deadline:
        try:
            return webdriver.Remote(
                command_executor=f"http://127.0.0.1:{TAURI_DRIVER_PORT}",
                options=options,
            )
        except Exception as error:
            last_error = error
            time.sleep(1.0)
    raise RuntimeError(
        f"Timed out establishing Tauri WebDriver session for {application}"
    ) from last_error


def run_app_session(
    application: Path,
    env: dict[str, str],
    scenario,
    scenario_name: str | None = None,
) -> None:
    driver_process = None
    driver = None
    resolved_scenario_name = scenario_name or getattr(scenario, "__name__", "scenario")
    artifact_dir = scenario_artifact_dir(normalize_scenario_name(resolved_scenario_name))
    try:
        driver_process = start_tauri_driver(env)
        driver = start_webdriver(application)
        scenario(driver)
    except Exception:
        capture_failure_artifacts(driver, driver_process, env, artifact_dir)
        raise
    finally:
        if driver is not None:
            try:
                driver.quit()
            except Exception:
                pass
        terminate_process(driver_process)


def wait_for_body_text(driver: webdriver.Remote, text: str, timeout: float = 30.0) -> None:
    WebDriverWait(driver, timeout).until(
        lambda current: text in current.find_element(By.TAG_NAME, "body").text
    )


def wait_for_any_body_text(
    driver: webdriver.Remote,
    texts: list[str],
    timeout: float = 30.0,
) -> str:
    def has_any(current: webdriver.Remote) -> str | bool:
        body_text = current.find_element(By.TAG_NAME, "body").text
        for text in texts:
            if text in body_text:
                return text
        return False

    return WebDriverWait(driver, timeout).until(has_any)


def assert_body_contains_all(driver: webdriver.Remote, texts: list[str], timeout: float = 20.0) -> None:
    def has_all(current: webdriver.Remote) -> bool:
        body_text = current.find_element(By.TAG_NAME, "body").text
        return all(text in body_text for text in texts)

    WebDriverWait(driver, timeout).until(has_all)


def xpath_literal(text: str) -> str:
    if "'" not in text:
        return f"'{text}'"
    if '"' not in text:
        return f'"{text}"'
    parts = text.split("'")
    concat_parts: list[str] = []
    for index, part in enumerate(parts):
        if part:
            concat_parts.append(f"'{part}'")
        if index != len(parts) - 1:
            concat_parts.append('"\'"')
    return f"concat({', '.join(concat_parts)})"


def wait_for_button(driver: webdriver.Remote, text: str, timeout: float = 20.0):
    xpath = f"//button[contains(normalize-space(.), {xpath_literal(text)})]"
    return WebDriverWait(driver, timeout).until(
        EC.element_to_be_clickable((By.XPATH, xpath))
    )


def wait_for_css(driver: webdriver.Remote, selector: str, timeout: float = 20.0):
    return WebDriverWait(driver, timeout).until(
        EC.presence_of_element_located((By.CSS_SELECTOR, selector))
    )


def wait_for_xpath(driver: webdriver.Remote, xpath: str, timeout: float = 20.0):
    return WebDriverWait(driver, timeout).until(
        EC.presence_of_element_located((By.XPATH, xpath))
    )


def wait_clickable_xpath(driver: webdriver.Remote, xpath: str, timeout: float = 20.0):
    return WebDriverWait(driver, timeout).until(
        EC.element_to_be_clickable((By.XPATH, xpath))
    )


def accept_dialog(driver: webdriver.Remote, timeout: float = 10.0) -> None:
    alert = WebDriverWait(driver, timeout).until(EC.alert_is_present())
    alert.accept()


def click_tree_button(driver: webdriver.Remote, label: str) -> None:
    xpath = (
        "//div[contains(@class,'knowledge-tree-shell')]"
        f"//button[contains(normalize-space(.), {xpath_literal(label)})]"
    )
    element = WebDriverWait(driver, 20.0).until(
        EC.element_to_be_clickable((By.XPATH, xpath))
    )
    element.click()


def click_browser_card(driver: webdriver.Remote, label: str) -> None:
    xpath = (
        "//div[contains(@class,'directory-browser-shell')]"
        f"//button[contains(normalize-space(.), {xpath_literal(label)})]"
    )
    element = WebDriverWait(driver, 20.0).until(
        EC.element_to_be_clickable((By.XPATH, xpath))
    )
    element.click()


def open_note_from_landing(
    driver: webdriver.Remote,
    *,
    category_label: str,
    note_title: str,
    timeout: float = 40.0,
) -> None:
    landing_text = wait_for_any_body_text(driver, [note_title, "全部文档"], timeout=timeout)
    if landing_text != note_title:
        click_tree_button(driver, category_label)
        click_browser_card(driver, note_title)
        wait_for_body_text(driver, note_title, timeout=40.0)


def assert_release_entrypoints_visible(driver: webdriver.Remote) -> None:
    assert_body_contains_all(
        driver,
        [
            "下载与发布入口",
            "下载 v0.3.0-beta.2",
            "Release Notes",
            "安装与配置说明",
            "Windows",
            "MCP CLI",
        ],
        timeout=20.0,
    )


def assert_settings_release_section(driver: webdriver.Remote) -> None:
    assert_body_contains_all(
        driver,
        [
            "MCP 快速配置",
            "下载与发布",
            "下载 v0.3.0-beta.2",
            "Release Notes",
            "安装与配置说明",
            "Standalone MCP",
            "memoforge-*",
        ],
        timeout=20.0,
    )


def assert_search_empty_guidance(driver: webdriver.Remote) -> None:
    assert_body_contains_all(
        driver,
        [
            "没有找到匹配结果",
            "下载 v0.3.0-beta.2",
            "Release Notes",
            "MCP 配置说明",
        ],
        timeout=20.0,
    )


def poll_note_file(root: str, note_title: str, expected_snippet: str, timeout: float = 12.0) -> Path:
    deadline = time.time() + timeout
    search_root = Path(root)
    while time.time() < deadline:
        for candidate in search_root.rglob("*.md"):
            content = candidate.read_text(encoding="utf-8")
            if note_title in content and expected_snippet in content:
                return candidate
        time.sleep(0.25)
    raise AssertionError(f"Failed to find saved note for {note_title}")


def mark(step: str) -> None:
    print(f"OK {step}")


def capture_failure_artifacts(
    driver: webdriver.Remote | None,
    driver_process: subprocess.Popen[str] | None,
    env: dict[str, str],
    artifact_dir: Path,
) -> None:
    artifact_dir.mkdir(parents=True, exist_ok=True)

    if driver is not None:
        try:
            driver.save_screenshot(str(artifact_dir / "failure.png"))
        except Exception:
            pass

        try:
            (artifact_dir / "page.html").write_text(driver.page_source, encoding="utf-8")
        except Exception:
            pass

        try:
            browser_log = driver.get_log("browser")
            (artifact_dir / "browser.log").write_text(
                json.dumps(browser_log, ensure_ascii=False, indent=2),
                encoding="utf-8",
            )
        except Exception:
            pass

    if driver_process is not None and driver_process.poll() is None:
        try:
            driver_process.terminate()
            driver_process.wait(timeout=5)
        except Exception:
            try:
                driver_process.kill()
            except Exception:
                pass

    if driver_process is not None and driver_process.stdout is not None:
        try:
            output = driver_process.stdout.read()
            (artifact_dir / "tauri-driver.log").write_text(output, encoding="utf-8")
        except Exception:
            pass

    log_candidates = []
    home = env.get("HOME")
    if home:
        try:
            log_candidates.extend(Path(home).rglob("memoforge-desktop.log"))
        except Exception:
            pass

    for index, log_path in enumerate(log_candidates[:5], start=1):
        try:
            shutil.copy2(log_path, artifact_dir / f"desktop-{index}.log")
        except Exception:
            continue

    try:
        (artifact_dir / "traceback.txt").write_text(traceback.format_exc(), encoding="utf-8")
    except Exception:
        pass


def assert_tauri_runtime(driver: webdriver.Remote) -> None:
    assert driver.execute_script("return Boolean(window.__TAURI__ || window.__TAURI_INTERNALS__)"), (
        "Expected Tauri runtime globals to be present"
    )


def git_output(*args: str) -> str:
    result = subprocess.run(
        ["git", *args],
        check=True,
        capture_output=True,
        text=True,
    )
    return result.stdout.strip()


def call_embedded_mcp_tool(mcp_port: int, tool_name: str, arguments: dict | None = None) -> dict:
    response = http_post_json(
        f"http://127.0.0.1:{mcp_port}/mcp",
        {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "tools/call",
            "params": {
                "name": tool_name,
                "arguments": arguments or {},
            },
        },
    )
    result = response.get("result", {})
    content = result.get("content", [])
    if not content:
        raise AssertionError(f"Unexpected MCP response: {response}")
    text = content[0].get("text", "{}")
    return json.loads(text)


def call_embedded_mcp_jsonrpc(mcp_port: int, method: str, params: dict | None = None) -> dict:
    return http_post_json(
        f"http://127.0.0.1:{mcp_port}/mcp",
        {
            "jsonrpc": "2.0",
            "id": 1,
            "method": method,
            "params": params or {},
        },
    )


def assert_embedded_mcp_error(
    mcp_port: int,
    tool_name: str,
    arguments: dict | None,
    expected_message: str,
) -> None:
    response = call_embedded_mcp_jsonrpc(
        mcp_port,
        "tools/call",
        {
            "name": tool_name,
            "arguments": arguments or {},
        },
    )
    error = response.get("error")
    if not error:
        raise AssertionError(f"Expected MCP error for {tool_name}, got: {response}")
    assert error.get("message") == expected_message, response


def assert_editor_state(
    mcp_port: int,
    *,
    expected_kb_path: Path | None = None,
    expected_knowledge_title: str | None = None,
    timeout: float = 10.0,
) -> dict:
    deadline = time.time() + timeout
    last_state: dict | None = None
    while time.time() < deadline:
        state = call_embedded_mcp_tool(mcp_port, "get_editor_state")
        last_state = state
        kb_ok = True
        knowledge_ok = True

        if expected_kb_path is not None:
            current_kb = state.get("current_kb")
            kb_ok = current_kb is not None and normalize_path(current_kb["path"]) == normalize_path(expected_kb_path)

        if expected_knowledge_title is not None:
            current_knowledge = state.get("current_knowledge")
            knowledge_ok = current_knowledge is not None and current_knowledge.get("title") == expected_knowledge_title

        if kb_ok and knowledge_ok and state.get("state_valid") is True:
            return state
        time.sleep(0.2)

    raise AssertionError(f"Embedded editor state did not match expectation: {last_state}")


def assert_editor_selection(
    mcp_port: int,
    *,
    expected_start_line: int | None = None,
    expected_end_line: int | None = None,
    min_text_length: int | None = None,
    expected_focused: bool | None = None,
    timeout: float = 10.0,
) -> dict:
    deadline = time.time() + timeout
    last_state: dict | None = None
    while time.time() < deadline:
        state = call_embedded_mcp_tool(mcp_port, "get_editor_state")
        last_state = state
        selection = state.get("selection")
        desktop = state.get("desktop") or {}
        if selection is None:
            time.sleep(0.2)
            continue

        start_ok = expected_start_line is None or selection.get("start_line") == expected_start_line
        end_ok = expected_end_line is None or selection.get("end_line") == expected_end_line
        length_ok = min_text_length is None or selection.get("text_length", 0) >= min_text_length
        focus_ok = expected_focused is None or desktop.get("focused") is expected_focused

        if start_ok and end_ok and length_ok and focus_ok and state.get("state_valid") is True:
            return state
        time.sleep(0.2)

    raise AssertionError(f"Embedded editor selection did not match expectation: {last_state}")


def assert_editor_selection_cleared(
    mcp_port: int,
    *,
    expected_focused: bool | None = None,
    timeout: float = 10.0,
) -> dict:
    deadline = time.time() + timeout
    last_state: dict | None = None
    while time.time() < deadline:
        state = call_embedded_mcp_tool(mcp_port, "get_editor_state")
        last_state = state
        desktop = state.get("desktop") or {}
        focus_ok = expected_focused is None or desktop.get("focused") is expected_focused
        if state.get("selection") is None and focus_ok and state.get("state_valid") is True:
            return state
        time.sleep(0.2)

    raise AssertionError(f"Embedded editor selection was not cleared: {last_state}")


def create_agent_draft_for_existing_note(
    mcp_port: int,
    note_path: str,
    *,
    heading: str = "Agent Draft Section",
    content: str = "Created from embedded MCP during desktop E2E.",
) -> str:
    start = call_embedded_mcp_tool(
        mcp_port,
        "start_draft",
        {
            "path": note_path,
            "metadata": {
                "summary": "Agent draft preview summary",
            },
        },
    )
    draft_id = start["draft_id"]
    call_embedded_mcp_tool(
        mcp_port,
        "update_draft",
        {
            "draft_id": draft_id,
            "op": "append_section",
            "heading": heading,
            "level": 2,
            "content": content,
        },
    )
    preview = call_embedded_mcp_tool(mcp_port, "preview_draft", {"draft_id": draft_id})
    assert preview["sections_changed"] >= 1
    return draft_id


def run_welcome_import_flow(driver: webdriver.Remote, paths: dict[str, str], mcp_port: int) -> None:
    wait_for_body_text(driver, "欢迎使用", timeout=40.0)
    assert_tauri_runtime(driver)
    wait_for_http(f"http://127.0.0.1:{mcp_port}/health", timeout=20.0)
    assert_release_entrypoints_visible(driver)
    mark("welcome-release-entrypoints")

    wait_for_button(driver, "导入已有目录").click()
    import_path = wait_for_css(driver, 'input[placeholder="输入或选择已有目录路径"]')
    import_path.clear()
    import_path.send_keys(str(Path(paths["kb1"]).resolve()))
    wait_for_button(driver, "导入").click()
    landing_text = wait_for_any_body_text(driver, ["Alpha Rust Patterns", "全部文档"], timeout=40.0)
    if landing_text != "Alpha Rust Patterns":
        click_tree_button(driver, "programming")
        click_browser_card(driver, "Alpha Rust Patterns")
        wait_for_body_text(driver, "Alpha Rust Patterns", timeout=40.0)
    assert_editor_state(mcp_port, expected_kb_path=Path(paths["kb1"]))
    mark("welcome-import")


def run_welcome_create_flow(driver: webdriver.Remote, target_path: Path, mcp_port: int) -> None:
    wait_for_body_text(driver, "欢迎使用", timeout=40.0)
    assert_tauri_runtime(driver)
    wait_for_http(f"http://127.0.0.1:{mcp_port}/health", timeout=20.0)
    assert_release_entrypoints_visible(driver)
    mark("welcome-release-entrypoints")

    wait_for_button(driver, "新建知识库").click()
    name_input = wait_for_css(driver, 'input[placeholder="可选，用于显示知识库名称"]')
    path_input = wait_for_css(driver, 'input[placeholder="选择或输入知识库存储路径"]')
    name_input.send_keys("Desktop Template KB")
    path_input.send_keys(str(target_path))

    wait_for_button(driver, "项目复盘").click()
    wait_for_button(driver, "使用此模板").click()
    wait_for_body_text(driver, "全部文档", timeout=40.0)
    assert_editor_state(mcp_port, expected_kb_path=target_path, timeout=40.0)
    wait_for_path(target_path / ".memoforge" / "config.yaml", timeout=10.0)
    wait_for_path(target_path / "复盘", timeout=10.0, expect_dir=True)
    wait_for_path(target_path / "问题", timeout=10.0, expect_dir=True)
    wait_for_path(target_path / "决策", timeout=10.0, expect_dir=True)
    mark("welcome-create-template")


def run_welcome_clone_flow(driver: webdriver.Remote, repo_url: str, clone_target: Path, mcp_port: int) -> None:
    wait_for_body_text(driver, "欢迎使用", timeout=40.0)
    assert_tauri_runtime(driver)
    wait_for_http(f"http://127.0.0.1:{mcp_port}/health", timeout=20.0)
    assert_release_entrypoints_visible(driver)
    mark("welcome-release-entrypoints")

    wait_for_button(driver, "Clone Git 仓库").click()
    repo_input = wait_for_css(driver, 'input[placeholder="https://github.com/user/repo.git"]')
    path_input = wait_for_css(driver, 'input[placeholder="选择本地存储路径"]')
    repo_input.send_keys(repo_url)
    path_input.send_keys(str(clone_target))
    wait_for_button(driver, "开始克隆").click()
    landing_text = wait_for_any_body_text(driver, ["Alpha Rust Patterns", "全部文档"], timeout=90.0)
    if landing_text != "Alpha Rust Patterns":
        click_tree_button(driver, "programming")
        click_browser_card(driver, "Alpha Rust Patterns")
        wait_for_body_text(driver, "Alpha Rust Patterns", timeout=40.0)

    assert (clone_target / ".git").exists()
    assert (clone_target / "programming" / "alpha.md").exists()
    assert_editor_state(mcp_port, expected_kb_path=clone_target)
    mark("welcome-clone")


def run_workspace_flow(driver: webdriver.Remote, paths: dict[str, str], mcp_port: int) -> None:
    note_title = f"Tauri Desktop E2E {int(time.time())}"
    note_body = f"# {note_title}\n\nsaved through tauri desktop e2e"
    commit_message = f"tauri desktop e2e commit {int(time.time())}"

    open_note_from_landing(
        driver,
        category_label="programming",
        note_title="Alpha Rust Patterns",
        timeout=40.0,
    )
    assert_tauri_runtime(driver)
    mark("tauri-runtime")

    wait_for_http(f"http://127.0.0.1:{mcp_port}/health", timeout=20.0)
    mark("embedded-sse")
    tools_list = call_embedded_mcp_jsonrpc(mcp_port, "tools/list")
    tool_names = [tool["name"] for tool in tools_list.get("result", {}).get("tools", [])]
    assert "get_editor_state" in tool_names
    assert "start_draft" in tool_names
    mark("embedded-tools-list")
    assert_editor_state(mcp_port, expected_kb_path=Path(paths["kb1"]))
    mark("embedded-state-kb")

    click_tree_button(driver, "programming")
    click_browser_card(driver, "Alpha Rust Patterns")
    wait_for_body_text(driver, "Beta Async Notes")
    assert_editor_state(
        mcp_port,
        expected_kb_path=Path(paths["kb1"]),
        expected_knowledge_title="Alpha Rust Patterns",
    )
    mark("embedded-state-knowledge")
    mark("open-existing-note")

    wait_for_button(driver, "Markdown").click()
    existing_editor = wait_for_css(driver, ".cm-content")
    existing_editor.click()
    existing_editor.send_keys(Keys.CONTROL, "a")
    assert_editor_selection(
        mcp_port,
        expected_start_line=1,
        min_text_length=60,
        expected_focused=True,
    )
    WebDriverWait(driver, 15.0).until(
        lambda current: re.search(r"选区\s+\d+\s+行", current.find_element(By.TAG_NAME, "body").text)
    )
    existing_editor.send_keys(Keys.ARROW_RIGHT)
    assert_editor_selection_cleared(mcp_port, expected_focused=True)
    WebDriverWait(driver, 15.0).until(
        lambda current: re.search(r"选区\s+\d+\s+行", current.find_element(By.TAG_NAME, "body").text) is None
    )
    mark("workspace-selection-sync")

    wait_for_button(driver, "更多").click()
    wait_for_button(driver, "知识图谱").click()
    wait_for_body_text(driver, "知识图谱", timeout=20.0)
    graph_node = wait_for_css(driver, ".react-flow__node", timeout=25.0)
    assert graph_node is not None
    beta_node = wait_clickable_xpath(
        driver,
        f"//div[contains(@class,'react-flow__node')][contains(., {xpath_literal('Beta Async Notes')})]",
        timeout=25.0,
    )
    beta_node.click()
    assert_editor_state(
        mcp_port,
        expected_kb_path=Path(paths["kb1"]),
        expected_knowledge_title="Beta Async Notes",
    )
    mark("workspace-graph-select")

    wait_for_button(driver, "新建").click()
    wait_for_css(driver, 'input[placeholder="输入知识标题"]').send_keys(note_title)
    wait_for_button(driver, "下一步").click()
    category_input = wait_for_css(driver, 'input[placeholder="输入分类名称"]')
    category_input.clear()
    category_input.send_keys("programming")
    wait_for_button(driver, "创建").click()
    wait_for_body_text(driver, note_title)
    mark("create-note")

    wait_for_button(driver, "Markdown").click()
    editor = wait_for_css(driver, ".cm-content")
    editor.click()
    editor.send_keys(Keys.CONTROL, "a")
    editor.send_keys(note_body)
    wait_for_button(driver, "保存").click()
    saved_path = poll_note_file(paths["kb1"], note_title, "saved through tauri desktop e2e")
    assert saved_path.exists(), "Saved note file should exist on disk"
    mark("save-note")

    wait_for_css(driver, 'button[title="设置"]').click()
    assert_settings_release_section(driver)
    wait_for_body_text(driver, f"http://127.0.0.1:{mcp_port}/mcp")
    wait_for_xpath(driver, "//h2[normalize-space(.)='设置']/following::button[1]").click()
    mark("settings-modal")

    wait_for_css(driver, 'button[title="搜索"]').click()
    search_input = wait_for_css(driver, "div.fixed.inset-0.z-50 input")
    search_input.send_keys("zzzz-no-match-release-e2e")
    assert_search_empty_guidance(driver)
    search_input.send_keys(Keys.ESCAPE)
    WebDriverWait(driver, 10.0).until_not(
        EC.presence_of_element_located((By.CSS_SELECTOR, "div.fixed.inset-0.z-50"))
    )
    mark("search-empty-guidance")

    draft_id = create_agent_draft_for_existing_note(mcp_port, "programming/alpha.md")
    wait_for_css(driver, 'button[aria-label="AI 草稿"]').click()
    wait_for_body_text(driver, draft_id)
    wait_for_body_text(driver, "programming/alpha.md")
    wait_for_xpath(driver, f"//button[contains(., {xpath_literal(draft_id)})]").click()
    wait_for_body_text(driver, "草稿预览")
    wait_for_body_text(driver, "Agent Draft Section")
    wait_for_button(driver, "确认提交").click()
    alpha_path = Path(paths["kb1"]) / "programming" / "alpha.md"
    WebDriverWait(driver, 20.0).until(
        lambda current: "Created from embedded MCP during desktop E2E." in alpha_path.read_text(encoding="utf-8")
    )
    wait_for_css(driver, 'button[aria-label="元数据"]').click()
    wait_for_css(driver, 'button[aria-label="AI 草稿"]').click()
    wait_for_body_text(driver, "暂无待确认的草稿")
    mark("workspace-agent-draft")

    beta_path = Path(paths["kb1"]) / "programming" / "beta.md"
    beta_before_discard = beta_path.read_text(encoding="utf-8")
    discard_draft_id = create_agent_draft_for_existing_note(
        mcp_port,
        "programming/beta.md",
        heading="Discarded Draft Section",
        content="This draft should be discarded in desktop E2E.",
    )
    wait_for_css(driver, 'button[aria-label="元数据"]').click()
    wait_for_css(driver, 'button[aria-label="AI 草稿"]').click()
    wait_for_body_text(driver, discard_draft_id)
    wait_for_xpath(driver, f"//button[contains(., {xpath_literal(discard_draft_id)})]").click()
    wait_for_body_text(driver, "Discarded Draft Section")
    wait_for_button(driver, "丢弃").click()
    accept_dialog(driver)
    wait_for_css(driver, 'button[aria-label="元数据"]').click()
    wait_for_css(driver, 'button[aria-label="AI 草稿"]').click()
    wait_for_body_text(driver, "暂无待确认的草稿")
    assert beta_path.read_text(encoding="utf-8") == beta_before_discard
    mark("workspace-agent-draft-discard")

    wait_for_css(driver, 'button[title="导入 Markdown"]').click()
    import_input = wait_for_css(driver, 'input[placeholder="例如: ~/Documents/notes 或 /path/to/markdown/files"]')
    import_input.send_keys(str(Path(paths["import_src"]).resolve()))
    wait_for_button(driver, "预览").click()
    wait_for_body_text(driver, "预览结果")
    wait_for_body_text(driver, "Imported Note")
    wait_for_button(driver, "开始导入").click()
    wait_for_body_text(driver, "导入完成")
    wait_for_button(driver, "关闭").click()
    wait_for_body_text(driver, "Imported Note")
    imported_path = Path(paths["kb1"]) / "imported-note.md"
    assert imported_path.exists(), f"Imported file missing: {imported_path}"
    assert imported_path.read_text(encoding="utf-8").startswith("---\n")
    mark("workspace-import")

    wait_for_css(driver, 'button[aria-label="Git"]').click()
    commit_input = wait_for_css(driver, 'input[placeholder="输入提交信息"]')
    commit_input.send_keys(commit_message)
    wait_for_button(driver, "提交").click()
    wait_for_body_text(driver, "无变更", timeout=20.0)
    assert git_output("-C", paths["kb1"], "log", "-1", "--pretty=%s") == commit_message
    push_button = wait_clickable_xpath(
        driver,
        "//div[contains(@class,'side-panel-body')]//button[.//*[contains(@class,'lucide-upload')]]",
        timeout=20.0,
    )
    push_button.click()
    WebDriverWait(driver, 20.0).until(
        lambda current: git_output("--git-dir", paths["remote"], "log", "--all", "-1", "--pretty=%s") == commit_message
    )
    mark("workspace-git")

    wait_for_css(driver, 'button[title="切换知识库"]').click()
    path_input = wait_for_css(driver, 'input[placeholder="输入知识库路径或选择目录..."]')
    path_input.clear()
    path_input.send_keys(str(Path(paths["kb2"]).resolve()))
    wait_for_button(driver, "打开").click()
    open_note_from_landing(
        driver,
        category_label="programming",
        note_title="Gamma Python Tips",
        timeout=25.0,
    )
    assert_editor_state(mcp_port, expected_kb_path=Path(paths["kb2"]))
    mark("embedded-state-switch-kb")
    mark("switch-kb")


def run_readonly_workspace_flow(driver: webdriver.Remote, paths: dict[str, str], mcp_port: int) -> None:
    open_note_from_landing(
        driver,
        category_label="programming",
        note_title="Alpha Rust Patterns",
        timeout=40.0,
    )
    assert_tauri_runtime(driver)
    wait_for_http(f"http://127.0.0.1:{mcp_port}/health", timeout=20.0)

    wait_for_body_text(driver, "当前为只读模式", timeout=20.0)
    assert_editor_state(mcp_port, expected_kb_path=Path(paths["kb1"]))

    click_tree_button(driver, "programming")
    click_browser_card(driver, "Alpha Rust Patterns")
    assert_editor_state(
        mcp_port,
        expected_kb_path=Path(paths["kb1"]),
        expected_knowledge_title="Alpha Rust Patterns",
    )
    wait_for_body_text(driver, "只读", timeout=20.0)
    assert not driver.find_elements(By.XPATH, "//button[normalize-space(.)='Markdown']")
    assert not driver.find_elements(By.XPATH, "//button[normalize-space(.)='新建']")
    mark("readonly-ui")

    status = call_embedded_mcp_tool(mcp_port, "get_status")
    assert status["readonly"] is True
    assert status["mode"] == "readonly"

    assert_embedded_mcp_error(
        mcp_port,
        "start_draft",
        {"path": "programming/alpha.md"},
        "Write operations not allowed in readonly mode",
    )
    assert_embedded_mcp_error(
        mcp_port,
        "create_knowledge",
        {
            "title": "Should Fail",
            "content": "# blocked",
            "tags": [],
        },
        "Write operations not allowed in readonly mode",
    )
    mark("readonly-mcp")


def main() -> None:
    if platform.system() == "Darwin":
        print(
            "SKIP tauri-desktop-e2e: official Tauri WebDriver desktop support currently covers "
            "Linux and Windows only; macOS has no WKWebView driver."
        )
        return

    temp_dir = Path(tempfile.mkdtemp(prefix="memoforge-tauri-e2e-"))

    try:
        build_env = make_test_env(temp_dir / "build-env")
        application = build_desktop_binary(build_env)
        if not application.exists():
            raise RuntimeError(f"Tauri desktop binary not found: {application}")

        welcome_import_root = temp_dir / "welcome-import"
        welcome_import_paths = seed_knowledge_base(welcome_import_root)
        welcome_import_env = make_test_env(temp_dir / "env-welcome-import")
        welcome_import_env["MEMOFORGE_REGISTRY_DIR"] = str(temp_dir / "registry-welcome-import")
        welcome_import_env["MEMOFORGE_MCP_PORT"] = str(find_free_port())
        run_app_session(
            application,
            welcome_import_env,
            lambda driver: run_welcome_import_flow(driver, welcome_import_paths, int(welcome_import_env["MEMOFORGE_MCP_PORT"])),
            scenario_name="welcome-import",
        )

        welcome_create_env = make_test_env(temp_dir / "env-welcome-create")
        welcome_create_env["MEMOFORGE_REGISTRY_DIR"] = str(temp_dir / "registry-welcome-create")
        welcome_create_env["MEMOFORGE_MCP_PORT"] = str(find_free_port())
        welcome_create_target = temp_dir / "template-kb"
        run_app_session(
            application,
            welcome_create_env,
            lambda driver: run_welcome_create_flow(driver, welcome_create_target, int(welcome_create_env["MEMOFORGE_MCP_PORT"])),
            scenario_name="welcome-create-template",
        )

        welcome_clone_root = temp_dir / "welcome-clone"
        welcome_clone_paths = seed_knowledge_base(welcome_clone_root)
        welcome_clone_env = make_test_env(temp_dir / "env-welcome-clone")
        welcome_clone_env["MEMOFORGE_REGISTRY_DIR"] = str(temp_dir / "registry-welcome-clone")
        welcome_clone_env["MEMOFORGE_MCP_PORT"] = str(find_free_port())
        welcome_clone_target = temp_dir / "cloned-kb"
        run_app_session(
            application,
            welcome_clone_env,
            lambda driver: run_welcome_clone_flow(
                driver,
                welcome_clone_paths["remote"],
                welcome_clone_target,
                int(welcome_clone_env["MEMOFORGE_MCP_PORT"]),
            ),
            scenario_name="welcome-clone",
        )

        workspace_root = temp_dir / "workspace-flow"
        workspace_paths = seed_knowledge_base(workspace_root)
        workspace_env = make_test_env(temp_dir / "env-workspace")
        workspace_env["MEMOFORGE_REGISTRY_DIR"] = str(temp_dir / "registry-workspace")
        workspace_env["MEMOFORGE_MCP_PORT"] = str(find_free_port())
        seed_registry(workspace_paths, workspace_env)
        run_app_session(
            application,
            workspace_env,
            lambda driver: run_workspace_flow(driver, workspace_paths, int(workspace_env["MEMOFORGE_MCP_PORT"])),
            scenario_name="workspace-flow",
        )

        readonly_root = temp_dir / "readonly-workspace"
        readonly_paths = seed_knowledge_base(readonly_root)
        readonly_env = make_test_env(temp_dir / "env-readonly-workspace")
        readonly_env["MEMOFORGE_REGISTRY_DIR"] = str(temp_dir / "registry-readonly-workspace")
        readonly_env["MEMOFORGE_MCP_PORT"] = str(find_free_port())
        readonly_env["MEMOFORGE_READONLY"] = "1"
        seed_registry(readonly_paths, readonly_env)
        run_app_session(
            application,
            readonly_env,
            lambda driver: run_readonly_workspace_flow(
                driver,
                readonly_paths,
                int(readonly_env["MEMOFORGE_MCP_PORT"]),
            ),
            scenario_name="readonly-workspace-flow",
        )

        print(json.dumps({
            "status": "ok",
            "application": str(application),
            "scenarios": [
                "welcome-import",
                "welcome-create-template",
                "welcome-clone",
                "workspace-flow",
                "readonly-workspace-flow",
            ],
        }, ensure_ascii=False))
    except TimeoutException as error:
        raise SystemExit(f"Tauri desktop E2E timed out: {error}") from error
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)


if __name__ == "__main__":
    main()
