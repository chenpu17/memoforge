# ForgeNerve v0.1.2 Release Notes

Release Date: 2026-04-12

ForgeNerve v0.1.2 is the current stable release line under the ForgeNerve brand.

This release turns the project from a Markdown + Git knowledge tool into a more complete Agent Knowledge OS for developers:

- AI agents can create Inbox items, sessions, and reviewable Draft changes
- humans can inspect, approve, reject, or discard those changes in the desktop app
- teams can keep knowledge work inside a Git-native workflow instead of moving it into another silo
- desktop bundles, portable executables, and standalone MCP binaries are now all published together from the same release line

GitHub Release:

- https://github.com/chenpu17/memoforge/releases/tag/v0.1.2

## Patch highlights

- aligned Tauri bundle version metadata with the Git tag based release line
- corrected desktop asset filenames so installers and DMG / AppImage packages match the published release version
- updated in-app release entrypoints, landing page download links, and MCP binary links to the latest stable release

## Highlights

### Agent Inbox, Session, and Draft workflow

- Inbox for collecting AI-generated knowledge candidates before they become accepted knowledge
- Agent Session tracking with context references, output history, and review linkage
- Draft-based write path with section-level operations instead of brittle full-file replacement
- Preview, review, approve, reject, and discard flow in the desktop UI

### Reliability Dashboard

- Built-in knowledge quality scans
- Issue detail inspection
- Fix Draft generation from detected issues
- Safer remediation path through the same Draft review workflow

### Context Pack

- Pack knowledge by tag, folder, topic, or manual selection
- Reuse curated context across agent sessions
- Export packs for external agent workflows
- Establish a reusable context layer for future agent orchestration

### Desktop app improvements

- Tauri desktop app with embedded SSE MCP server
- Real desktop E2E coverage on Linux and Windows CI
- Desktop state sync verified through `get_editor_state`
- Windows installer, MSI, and portable executable are all shipped in the official release assets

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

- Windows installer: `ForgeNerve_0.1.2_x64-setup.exe`
- Windows MSI: `ForgeNerve_0.1.2_x64_en-US.msi`
- Windows portable: `ForgeNerve_x64_portable.exe`
- macOS Apple Silicon: `ForgeNerve_0.1.2_aarch64.dmg`
- macOS Intel: `ForgeNerve_0.1.2_x64.dmg`
- Linux x64: `ForgeNerve_0.1.2_amd64.AppImage`
- Linux arm64: `ForgeNerve_0.1.2_aarch64.AppImage`

CLI / MCP users:

- `memoforge-darwin-arm64`
- `memoforge-darwin-x64`
- `memoforge-linux-x64`
- `memoforge-linux-arm64`
- `memoforge-windows-x64.exe`

All official assets are published on the same release page:

- https://github.com/chenpu17/memoforge/releases/tag/v0.1.2

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
