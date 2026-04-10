# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ForgeNerve (formerly MemoForge) is an AI-driven personal knowledge management application. It supports bidirectional editing between humans and AI, with Git-native storage and collaboration. During the transition period, repository and package identifiers still use `memoforge-*`.

## Build & Test Commands

```bash
# Build full workspace (release)
cargo build --release

# Build a single crate
cargo build -p memoforge-core
cargo build -p memoforge-mcp
cargo build -p memoforge-http
cargo build -p memoforge-tauri

# Run all Rust tests
cargo test --workspace

# Run tests for a single crate
cargo test -p memoforge-core

# Run a specific test by name
cargo test -p memoforge-core test_name

# Frontend unit tests (vitest)
cd frontend && npm test
cd frontend && npm run test:watch    # watch mode
cd frontend && npm run test:coverage # with coverage

# E2E tests (browser mode)
pip install playwright && python -m playwright install --with-deps chromium
cargo build -p memoforge-http -p memoforge-mcp   # prebuild binaries
python3 tests/frontend_e2e.py
python3 tests/frontend_ops_e2e.py
python3 tests/mcp_e2e.py
python3 tests/sprint1_user_e2e.py
python3 tests/sprint2_user_e2e.py
python3 tests/sprint3_reliability_e2e.py
python3 tests/sprint3_user_e2e.py
python3 tests/sprint4_context_pack_e2e.py

# Tauri desktop E2E (Linux/Windows; official WebDriver support does not cover macOS)
python -m pip install selenium
cargo install tauri-driver --locked
cd frontend && npm run build && cd ..
cargo build -p memoforge-tauri
xvfb-run -a python3 tests/tauri_desktop_e2e.py   # Linux CI/local
# Covers welcome import/create/clone, workspace graph select, editor selection sync,
# markdown import, git commit/push, KB switch, desktop readonly mode,
# and agent draft commit/discard.

# Start Tauri desktop app (SSE MCP Server starts on port 31415)
cargo tauri dev
# Or use the start script
./start.sh

# Frontend dev server only (port 1420)
cd frontend && npm run dev
```

## Architecture Overview

### Workspace Crates

- **memoforge-core**: Core knowledge management engine. `api.rs` is the high-level entry point for all operations. Key modules: `knowledge` (parsing), `links` (wiki-link graph), `git` (version control), `config` (`.memoforge/config.yaml`), `store` (KB instance registry), `editor_state` (desktop state sync), `agent` (AI agent tracking), `inbox` (candidate knowledge), `session` (agent collaboration), `reliability` (quality rules), `context_pack` (knowledge packaging).
- **memoforge-mcp**: MCP Server. `main.rs` handles stdio transport with follow/bound modes. `sse.rs` handles SSE transport (Streamable HTTP, runs inside Tauri). `tools.rs` implements all MCP tools and manages global state (`KB_PATH`, `MODE`, `AGENT_NAME`). Includes inbox/session/reliability/context_pack tools.
- **memoforge-tauri**: Tauri v2 desktop app. Embeds the SSE MCP server (`McpServerState`). `desktop_state_publisher.rs` syncs editor state to MCP clients. `memory_state.rs` manages in-memory state.
- **memoforge-http**: REST API server (Axum), separate from MCP. Used when running without Tauri (e.g., Docker).

### Key Architectural Patterns

**1. Knowledge Model**: Each knowledge = one Markdown file with YAML frontmatter
- Fields: `id`, `title`, `tags`, `category`, `summary`, `summary_hash`, `created_at`, `updated_at`
- Files stored in category directories (top-level dirs registered in `.memoforge/config.yaml`)
- Knowledge base initialized with `.memoforge/` dir containing `config.yaml`, `events.jsonl`, etc.

**2. L0/L1/L2 Progressive Disclosure** (for AI context efficiency):
- L0: Metadata only (id, path, title, tags)
- L1: Include summary
- L2: Full content

**3. Docs-Style Path API**: Most MCP tools accept either legacy `id`/`category_id` params OR a `path` param using docs-style syntax:
- `path: "category/subdir/file"` - cleaner than using category IDs
- Tools: `get_content`, `get_summary`, `update_knowledge`, `delete_knowledge`, `move_knowledge`

**4. Dry-Run Preview Pattern**: Destructive operations (`delete_knowledge`, `move_knowledge`) default to dry-run mode, returning a preview of what would happen. Set `dry_run=false` to actually execute.

**5. MCP Follow vs Bound Mode**:
- **Follow mode**: MCP server reads the current KB from global editor state. Read-only when state is invalid. Used when AI should follow the user's active context.
- **Bound mode**: MCP server binds to a specific KB path with full read-write. Used for headless/CI scenarios.

**6. Frontend Dual-Backend Service Layer** (`frontend/src/services/`):
- `tauri.ts` auto-detects runtime (`__TAURI__` in window) and dispatches to Tauri commands or HTTP API
- `http.ts` provides the HTTP client (used when running without Tauri)
- `api.ts` is the legacy API service

**7. Concurrency Control**:
- File-level `flock` for individual file writes
- Global lock for Git operations
- Events logged to `.memoforge/events.jsonl`

**8. vNext Five-Layer Model**:
- Inbox: Candidate knowledge items (.memoforge/inbox/)
- Session: Agent collaboration records (.memoforge/sessions/)
- Draft: Controlled change buffer (existing, extended with review projection)
- Reliability: Rule-based quality issues (.memoforge/reliability/)
- Context Pack: Knowledge slice packaging (.memoforge/packs/)

## MCP Server Usage

**SSE mode** (primary, embedded in Tauri desktop app):

```bash
cargo tauri dev   # SSE MCP Server starts automatically on port 31415
```

Configure in `~/.claude/mcp.json`:
```json
{
  "mcpServers": {
    "memoforge": {
      "url": "http://127.0.0.1:31415/mcp"
    }
  }
}
```

Endpoints: `POST /mcp` (JSON-RPC), `GET /mcp` (SSE stream), `GET /health`

Port configurable via `MEMOFORGE_MCP_PORT` env var (default 31415).

**stdio mode** (legacy, for CI/CD or headless):
```bash
# Follow user's active KB (read-only when state invalid)
./target/release/memoforge serve --mode follow

# Bind to specific KB (full read-write)
./target/release/memoforge serve --mode bound --knowledge-path /path/to/kb
```

## Containerized Builds

- `Dockerfile.http` — memoforge-http REST API server
- `Dockerfile.mcp` — memoforge-mcp stdio server
- CI builds both images as smoke tests on push/PR

## Tech Stack

- **Backend**: Rust, Tauri v2, git2-rs, pulldown-cmark
- **Frontend**: React, TypeScript, Tailwind CSS, CodeMirror (markdown), TipTap (rich text), Zustand (state), ReactFlow (graph), react-window (virtualized list)
- **Protocol**: MCP (SSE transport primary, stdio legacy)
- **Build**: Vite (frontend), Cargo workspace (backend), Tauri v2 CLI

## Documentation

- `docs/design/PRD.md` - Product requirements
- `docs/design/技术实现文档.md` - Technical implementation details
- `crates/memoforge-mcp/README.md` - MCP tools reference
