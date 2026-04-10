from __future__ import annotations

import shutil
import tempfile
from pathlib import Path

import pytest

from frontend_e2e import make_test_env, seed_knowledge_base
from mcp_e2e import McpClient, build_binary


@pytest.fixture()
def paths() -> dict[str, str]:
    temp_dir = Path(tempfile.mkdtemp(prefix="memoforge-pytest-paths-"))
    try:
        yield seed_knowledge_base(temp_dir)
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)


@pytest.fixture()
def client(paths: dict[str, str]) -> McpClient:
    kb_path = Path(paths["kb1"]).parent.parent
    env = make_test_env(kb_path)
    binary = build_binary(env)
    instance = McpClient(binary, paths["kb1"], env, readonly=False)
    try:
        instance.initialize()
        yield instance
    finally:
        instance.close()
