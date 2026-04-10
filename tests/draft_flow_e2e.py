#!/usr/bin/env python3

"""E2E tests for the MCP Draft workflow.

Covers:
1. New knowledge draft full flow: start_draft -> update_draft(append) -> preview -> commit
2. Existing knowledge section update: read_knowledge -> start_draft -> update_draft(replace) -> commit
3. Conflict scenario: start_draft -> external file modification -> commit fails
4. Discard scenario: start_draft -> discard_draft
5. Regression: old create_knowledge / update_knowledge still work
"""

import json
import shutil
import subprocess
import tempfile
from pathlib import Path

from frontend_e2e import REPO_ROOT, make_test_env, seed_knowledge_base
from mcp_e2e import McpClient, build_binary


def test_draft_new_knowledge_full_flow(
    client: McpClient, paths: dict[str, str]
) -> None:
    """Test 1: Create new knowledge via the draft workflow."""
    # Start a draft for new knowledge (no path)
    draft = client.call_tool(
        "start_draft",
        {
            "metadata": {
                "title": "Draft Created Note",
                "tags": ["draft", "e2e"],
                "category": "programming",
                "summary": "Created via draft workflow",
            },
        },
    )
    assert draft["created"] is True
    draft_id = draft["draft_id"]
    assert draft_id.startswith("draft_")
    print("OK draft-new-start")

    # Update: set content
    updated = client.call_tool(
        "update_draft",
        {
            "draft_id": draft_id,
            "op": "set_content",
            "content": "## Introduction\n\nHello from draft.\n",
        },
    )
    assert updated["draft_id"] == draft_id
    assert updated["ops_applied"] == 1
    print("OK draft-new-set-content")

    # Update: append section
    updated = client.call_tool(
        "update_draft",
        {
            "draft_id": draft_id,
            "op": "append_section",
            "heading": "Details",
            "level": 2,
            "content": "Some detail content.",
        },
    )
    assert updated["ops_applied"] == 2
    print("OK draft-new-append")

    # Preview
    preview = client.call_tool("preview_draft", {"draft_id": draft_id})
    assert preview["sections_changed"] >= 1
    assert "diff_summary" in preview
    print("OK draft-new-preview")

    # Commit
    result = client.call_tool("commit_draft", {"draft_id": draft_id})
    assert result["committed"] is True
    assert "draft-created-note" in result["path"]
    print("OK draft-new-commit")

    # Verify the knowledge exists
    knowledge = client.call_tool(
        "get_content", {"path": result["path"]}
    )
    assert "Hello from draft" in knowledge["content"]
    assert "## Details" in knowledge["content"]
    print("OK draft-new-verify")


def test_draft_metadata_merge_and_summary_hash(
    client: McpClient, paths: dict[str, str]
) -> None:
    """Draft metadata should merge across calls and keep summary_stale correct."""
    draft = client.call_tool(
        "start_draft",
        {
            "metadata": {
                "title": "Merged Metadata Note",
                "tags": ["draft", "merge"],
                "category": "programming",
            },
        },
    )
    draft_id = draft["draft_id"]

    client.call_tool(
        "update_draft",
        {
            "draft_id": draft_id,
            "op": "update_metadata",
            "metadata": {
                "summary": "Summary written in a later metadata patch",
            },
        },
    )
    client.call_tool(
        "update_draft",
        {
            "draft_id": draft_id,
            "op": "set_content",
            "content": "## Overview\nMerged metadata content.\n",
        },
    )

    result = client.call_tool("commit_draft", {"draft_id": draft_id})
    assert result["committed"] is True
    assert "merged-metadata-note" in result["path"]
    print("OK draft-merge-commit")

    unified = client.call_tool(
        "read_knowledge",
        {
            "path": result["path"],
            "level": "L2",
        },
    )
    assert unified["metadata"]["title"] == "Merged Metadata Note"
    assert unified["metadata"]["category"] == "programming"
    assert unified["metadata"]["tags"] == ["draft", "merge"]
    assert unified["metadata"]["summary"] == "Summary written in a later metadata patch"
    assert unified["summary_stale"] is False
    print("OK draft-merge-verify")


def test_draft_existing_section_update(
    client: McpClient, paths: dict[str, str]
) -> None:
    """Test 2: Update existing knowledge via draft with section operations."""
    # First, create a knowledge with sections using old API
    created = client.call_tool(
        "create_knowledge",
        {
            "path": "tools/draft-target.md",
            "content": "# Draft Target\n\n## Section A\nContent A\n\n## Section B\nContent B",
            "metadata": {
                "title": "Draft Target",
                "tags": ["test"],
                "summary": "Target for draft operations",
            },
        },
    )
    assert created["created"] is True
    print("OK draft-existing-create")

    # Start draft targeting existing file
    draft = client.call_tool(
        "start_draft", {"path": "tools/draft-target.md"}
    )
    draft_id = draft["draft_id"]
    assert draft["created"] is True
    print("OK draft-existing-start")

    # Update: replace a section
    updated = client.call_tool(
        "update_draft",
        {
            "draft_id": draft_id,
            "op": "replace_section",
            "heading": "Section A",
            "content": "Updated content A.",
        },
    )
    assert updated["ops_applied"] == 1
    print("OK draft-existing-replace")

    # Update: append a new section
    updated = client.call_tool(
        "update_draft",
        {
            "draft_id": draft_id,
            "op": "append_section",
            "heading": "New Section from E2E",
            "content": "Brand new section added by draft.",
        },
    )
    assert updated["ops_applied"] == 2
    print("OK draft-existing-append")

    # Preview
    preview = client.call_tool("preview_draft", {"draft_id": draft_id})
    assert preview["sections_changed"] >= 1
    print("OK draft-existing-preview")

    # Commit
    result = client.call_tool("commit_draft", {"draft_id": draft_id})
    assert result["committed"] is True
    assert result["path"] == "tools/draft-target.md"
    print("OK draft-existing-commit")

    # Verify the content was updated
    updated_content = client.call_tool(
        "get_content", {"path": "tools/draft-target.md"}
    )
    assert "Updated content A" in updated_content["content"]
    assert "New Section from E2E" in updated_content["content"]
    # Section B should be preserved
    assert "## Section B" in updated_content["content"]
    print("OK draft-existing-verify")


def test_draft_conflict_scenario(
    client: McpClient, paths: dict[str, str]
) -> None:
    """Test 3: Conflict detection when source file is modified externally."""
    # Start draft
    draft = client.call_tool(
        "start_draft", {"path": "programming/beta.md"}
    )
    draft_id = draft["draft_id"]

    # Update the draft
    client.call_tool(
        "update_draft",
        {
            "draft_id": draft_id,
            "op": "append_section",
            "heading": "Extra Section",
            "content": "Extra content",
        },
    )

    # Externally modify the file directly
    client.call_tool(
        "update_knowledge",
        {
            "path": "programming/beta.md",
            "content": "# Externally Modified\n\nThis content was changed outside the draft.",
            "metadata": {"title": "Beta Modified Externally"},
        },
    )
    print("OK draft-conflict-external-modify")

    # Try to commit - should fail with conflict
    response = client.call_tool_raw(
        "commit_draft", {"draft_id": draft_id}
    )
    assert "error" in response, f"Expected conflict error, got: {response}"
    error = response["error"]
    assert "Conflict" in error["message"] or "conflict" in error["message"].lower(), \
        f"Expected conflict message, got: {error['message']}"
    print("OK draft-conflict-detected")

    # Draft should still exist (preserved on conflict)
    # We can preview it
    preview = client.call_tool("preview_draft", {"draft_id": draft_id})
    assert any("modified" in w.lower() for w in preview["warnings"]), \
        f"Expected conflict warning in preview, got: {preview['warnings']}"
    print("OK draft-conflict-preview-warning")

    # Discard the conflicting draft
    discard = client.call_tool(
        "discard_draft", {"draft_id": draft_id}
    )
    assert discard["discarded"] is True
    print("OK draft-conflict-discard")


def test_draft_discard_scenario(
    client: McpClient, paths: dict[str, str]
) -> None:
    """Test 4: Discard a draft without committing."""
    # Create a fresh knowledge file for discard test
    created = client.call_tool(
        "create_knowledge",
        {
            "path": "tools/discard-target.md",
            "content": "# Discard Target\n\n## Original\nOriginal content.",
            "metadata": {"title": "Discard Target"},
        },
    )
    assert created["created"] is True

    # Start draft
    draft = client.call_tool(
        "start_draft", {"path": "tools/discard-target.md"}
    )
    draft_id = draft["draft_id"]

    # Make some changes
    client.call_tool(
        "update_draft",
        {
            "draft_id": draft_id,
            "op": "append_section",
            "heading": "Temporary",
            "content": "This should be discarded.",
        },
    )
    print("OK draft-discard-update")

    # Discard
    discard = client.call_tool(
        "discard_draft", {"draft_id": draft_id}
    )
    assert discard["discarded"] is True
    print("OK draft-discard")

    # Verify the original file was NOT modified
    content = client.call_tool(
        "get_content", {"path": "tools/discard-target.md"}
    )
    assert "Temporary" not in content["content"], \
        "Original file should not have discarded draft changes"
    assert "should be discarded" not in content["content"]
    assert "Original content" in content["content"]
    print("OK draft-discard-verify")


def test_regression_old_tools_still_work(
    client: McpClient, paths: dict[str, str]
) -> None:
    """Test 5: Regression - old create_knowledge/update_knowledge still work."""
    # Create knowledge using old API
    created = client.call_tool(
        "create_knowledge",
        {
            "path": "tools/regression-test.md",
            "content": "# Regression Test\n\nCreated via old API.\n\n## Section A\nContent A",
            "metadata": {
                "title": "Regression Test",
                "tags": ["regression"],
                "summary": "Old API test",
            },
        },
    )
    assert created["created"] is True
    print("OK regression-create")

    # Update using old API
    updated = client.call_tool(
        "update_knowledge",
        {
            "path": "tools/regression-test.md",
            "content": "# Regression Test Updated\n\nUpdated via old API.\n\n## Section B\nContent B",
            "metadata": {"title": "Regression Test Updated"},
        },
    )
    assert updated["updated"] is True
    print("OK regression-update")

    # Verify
    content = client.call_tool(
        "get_content", {"path": "tools/regression-test.md"}
    )
    assert "Updated via old API" in content["content"]
    print("OK regression-verify")


def main() -> None:
    temp_dir = Path(tempfile.mkdtemp(prefix="memoforge-draft-e2e-"))

    try:
        paths = seed_knowledge_base(temp_dir)
        env = make_test_env(temp_dir)
        binary = build_binary(env)

        client = McpClient(binary, paths["kb1"], env, readonly=False)

        try:
            init_result = client.initialize()
            assert init_result["protocolVersion"] == "2024-11-05"

            # Verify draft tools are registered
            tools = client.list_tools()
            names = {tool["name"] for tool in tools}
            draft_tools = {"start_draft", "update_draft", "preview_draft", "commit_draft", "discard_draft"}
            assert draft_tools <= names, f"Missing draft tools: {draft_tools - names}"
            print("OK draft-tools-registered")

            test_regression_old_tools_still_work(client, paths)
            test_draft_new_knowledge_full_flow(client, paths)
            test_draft_metadata_merge_and_summary_hash(client, paths)
            test_draft_existing_section_update(client, paths)
            test_draft_discard_scenario(client, paths)
            test_draft_conflict_scenario(client, paths)

            print("ALL DRAFT E2E TESTS PASSED")
        finally:
            client.close()
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)


if __name__ == "__main__":
    main()
