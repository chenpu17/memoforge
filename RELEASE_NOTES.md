# ForgeNerve v0.3.0-beta.2 Release Notes

Release Date: 2026-04-13

ForgeNerve v0.3.0-beta.2 is the current v0.3.0 prerelease for validating the Agent Knowledge OS direction before the next stable release.

GitHub Release:

- https://github.com/chenpu17/memoforge/releases/tag/v0.3.0-beta.2

## Beta highlights

- Added Workflow Templates / Playbooks for high-frequency developer knowledge workflows
- Added Unified Review Queue to consolidate agent draft, inbox, reliability, and imported change review paths
- Added Evidence-backed Knowledge metadata for sources, verification, and traceability
- Added Freshness SLA governance for knowledge review reminders and staleness follow-up
- Added MCP Profile Gate for `generic-stdio`, `desktop-assisted`, and `legacy-full` tool exposure control
- Expanded v0.3.0 planning, implementation, and release-readiness documentation

## Existing baseline

This prerelease builds on the already available ForgeNerve desktop and agent workflow foundation:

- Tauri desktop app with embedded SSE MCP server
- Git-native Markdown knowledge storage
- Draft-based agent write path with preview and review
- Inbox for agent-generated knowledge candidates
- Agent Session tracking with context references
- Reliability Dashboard and fix Draft generation
- Context Pack creation and export
- Standalone MCP binaries for common desktop and server targets

## MCP capabilities

Important v0.3.0-beta.2 MCP capability groups:

- Inbox: `list_inbox_items`, `create_inbox_item`, `promote_inbox_item_to_draft`, `dismiss_inbox_item`
- Session: `start_agent_session`, `append_agent_session_context`, `list_agent_sessions`, `get_agent_session`, `complete_agent_session`
- Review: `list_review_items`, `get_review_item`, `apply_review_decision`
- Workflow Template: `list_workflow_templates`, `start_workflow_run`
- Governance: `get_knowledge_governance`, `update_knowledge_governance`
- Reliability: `list_reliability_issues`, `get_reliability_issue_detail`, `create_fix_draft_from_issue`
- Context Pack: `list_context_packs`, `create_context_pack`, `get_context_pack`, `export_context_pack`
- Draft: `read_knowledge`, `start_draft`, `update_draft`, `preview_draft`, `commit_draft`, `discard_draft`

## Compatibility

This prerelease does not require a destructive migration.

Compatibility notes:

- The public product brand is `ForgeNerve`
- Existing crate names, CLI names, and `.memoforge` runtime paths remain unchanged for compatibility
- Existing MCP and CLI automation based on `memoforge-*` continues to work
- New governance and review metadata are additive

Runtime directories may appear automatically on first use:

- `.memoforge/inbox/`
- `.memoforge/sessions/`
- `.memoforge/reliability/`
- `.memoforge/context_packs/`

## Recommended downloads

Desktop users:

- Windows installer: `ForgeNerve_0.3.0-beta.2_x64-setup.exe`
- Windows portable: `ForgeNerve_x64_portable.exe`
- macOS Apple Silicon: `ForgeNerve_0.3.0-beta.2_aarch64.dmg`
- macOS Intel: `ForgeNerve_0.3.0-beta.2_x64.dmg`
- Linux x64: `ForgeNerve_0.3.0-beta.2_amd64.AppImage`
- Linux arm64: `ForgeNerve_0.3.0-beta.2_aarch64.AppImage`

CLI / MCP users:

- `memoforge-darwin-arm64`
- `memoforge-darwin-x64`
- `memoforge-linux-x64`
- `memoforge-linux-arm64`
- `memoforge-windows-x64.exe`

All official assets are published on the same release page:

- https://github.com/chenpu17/memoforge/releases/tag/v0.3.0-beta.2

## Validation status

This prerelease line is backed by:

- Rust tests
- Frontend unit tests
- Browser E2E
- MCP E2E
- v0.3.0 workflow E2E
- Tauri desktop E2E coverage

## Beta status

`v0.3.0-beta.2` is intended for validation. On Windows, the prerelease line ships NSIS setup + portable executable; MSI remains part of the stable release line. Use `v0.1.2` if you need the previous stable release line.
