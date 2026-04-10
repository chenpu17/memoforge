# ForgeNerve v0.1.0 Release Notes

Release Date: 2026-04-10

ForgeNerve v0.1.0 is the first release under the new ForgeNerve brand.

This version turns the project from a Markdown + Git knowledge tool into a more complete Agent Knowledge OS for developers: agents can write through Drafts, humans can review in the desktop app, and teams can keep knowledge changes inside a Git-native workflow.

## Highlights

### Agent Inbox, Session, and Draft workflow

- Inbox for collecting AI-generated knowledge candidates
- Agent Session tracking with context and output history
- Draft-based write path with section-level operations
- Preview, review, approve, reject, and discard flow in desktop UI

### Reliability Dashboard

- Built-in knowledge quality scans
- Issue detail inspection
- Fix Draft generation from detected issues

### Context Pack

- Pack knowledge by tag, folder, topic, or manual selection
- Reuse curated context across agent sessions
- Export packs for external agent workflows

### Desktop app improvements

- Tauri desktop app with embedded SSE MCP server
- Real desktop E2E coverage on Linux and Windows CI
- Desktop state sync verified through `get_editor_state`

## New and important MCP capabilities

Inbox:

- `list_inbox_items`
- `create_inbox_item`
- `promote_inbox_item_to_draft`
- `dismiss_inbox_item`

Session:

- `start_agent_session`
- `append_agent_session_context`
- `list_agent_sessions`
- `get_agent_session`
- `complete_agent_session`

Reliability:

- `list_reliability_issues`
- `get_reliability_issue_detail`
- `create_fix_draft_from_issue`

Context Pack:

- `list_context_packs`
- `create_context_pack`
- `get_context_pack`
- `export_context_pack`

Draft:

- `read_knowledge`
- `start_draft`
- `update_draft`
- `preview_draft`
- `commit_draft`
- `discard_draft`

## Compatibility

This release does not require a destructive migration.

Compatibility notes:

- The public product brand is now `ForgeNerve`
- Existing crate names, CLI names, and `.memoforge` runtime paths remain unchanged for compatibility
- Existing MCP and CLI automation based on `memoforge-*` continues to work

New runtime directories may appear automatically on first use:

- `.memoforge/inbox/`
- `.memoforge/sessions/`
- `.memoforge/reliability/`
- `.memoforge/context_packs/`

## Recommended downloads

Desktop users:

- Windows: installer bundle or `ForgeNerve_x64_portable.exe`
- macOS: platform bundle from the release assets
- Linux: platform bundle from the release assets

CLI / MCP users:

- `memoforge-darwin-arm64`
- `memoforge-darwin-x64`
- `memoforge-linux-x64`
- `memoforge-linux-arm64`
- `memoforge-windows-x64.exe`

## Validation status

This release line is backed by:

- Rust tests
- Frontend unit tests
- Browser E2E
- MCP E2E
- Draft flow E2E
- Sprint regression tests
- Tauri desktop E2E on Linux and Windows CI

## Brand update

`MemoForge` is becoming `ForgeNerve`.

This is a brand transition, not a breaking technical rename. The project is moving toward a clearer positioning:

ForgeNerve is the Agent Knowledge OS for developers.
