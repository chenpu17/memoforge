# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MemoForge is an AI-driven personal knowledge management application. It supports bidirectional editing between humans and AI, with Git-native storage and collaboration.

## Build Commands

```bash
# Build Rust workspace (all crates)
cargo build --release

# Build and run MCP Server
cargo build --release -p memoforge-mcp
./target/release/memoforge serve --kb-path /path/to/kb

# Build Tauri desktop app (requires tauri-cli)
cargo install tauri-cli --version "^2.0"
cargo tauri dev

# Or use the start script
./start.sh

# Frontend only
cd frontend && npm install && npm run dev
```

## Test Commands

```bash
# Rust unit tests
cargo test

# E2E tests (Playwright, Python)
python test_e2e.py
python test_graph_e2e.py
```

## Architecture

### Rust Workspace Structure

```
crates/
├── memoforge-core/    # Core knowledge management engine
│   ├── api.rs         # High-level API (list_knowledge, get_content, etc.)
│   ├── knowledge.rs   # Knowledge file operations
│   ├── frontmatter.rs # YAML frontmatter parsing
│   ├── git.rs         # Git operations (git2-rs)
│   ├── links.rs       # Bidirectional links and knowledge graph
│   ├── lock.rs        # File-level locking for concurrency
│   ├── cache.rs       # Frontmatter index cache
│   ├── events.rs      # Event logging (events.jsonl)
│   ├── import.rs      # Markdown folder import
│   └── registry.rs    # Multi-KB management
│
├── memoforge-mcp/     # MCP Server (SSE + stdio transport)
│   ├── main.rs        # CLI entry, stdio mode
│   ├── sse.rs         # SSE transport, connection tracking, state broadcast
│   └── tools.rs       # 12+ MCP tools for AI agents
│
├── memoforge-tauri/   # Tauri v2 desktop app
│   └── commands.rs    # Tauri IPC commands
│
└── memoforge-http/    # HTTP REST API server (Axum)
```

### Frontend Structure

```
frontend/src/
├── App.tsx            # Main 3-column layout
├── components/
│   ├── Sidebar.tsx        # Category tree navigation
│   ├── Editor.tsx         # CodeMirror + Markdown preview
│   ├── MetadataPanel.tsx  # Title, tags, related editing
│   ├── SearchPanel.tsx    # Full-text search with highlighting
│   ├── GitPanel.tsx       # Git status and operations
│   ├── KbSwitcher.tsx     # Multi-KB management
│   ├── BacklinksPanel.tsx # Reverse links display
│   ├── KnowledgeGraphPanel.tsx # Graph visualization (ReactFlow)
│   └── ToastNotifications.tsx # Event notifications
├── services/
│   ├── tauri.ts       # Tauri IPC layer
│   └── api.ts         # API abstraction
└── stores/
    └── appStore.ts    # Zustand state management
```

### Key Concepts

1. **Knowledge Model**: Each knowledge = one Markdown file with YAML frontmatter
   - Fields: `title`, `tags`, `summary`, `summary_hash`, `related`, `created`, `updated`

2. **L0/L1/L2 Progressive Disclosure**:
   - L0: Directory tree + titles + tags (`list_knowledge`)
   - L1: Summary/metadata (`get_summary`)
   - L2: Full content (`get_content`)

3. **Category System**: Top-level directories are registered in `.memoforge/config.yaml`

4. **Concurrency Control**:
   - File-level `flock` for individual file writes
   - Global lock for Git operations
   - Events logged to `.memoforge/events.jsonl`

5. **MCP + GUI Integration**: SSE MCP Server is embedded in Tauri app, sharing memory state for real-time sync

## MCP Server Usage

**Primary mode is SSE (Streamable HTTP)**, embedded in the Tauri desktop app:

```bash
# Start Tauri desktop app (SSE MCP Server starts automatically on port 31415)
cargo tauri dev
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

**Legacy stdio mode** (for CI/CD or headless environments):
```bash
./target/release/memoforge serve --mode bound --knowledge-path /path/to/kb
```

## Tech Stack

- **Backend**: Rust, Tauri v2, git2-rs, pulldown-cmark
- **Frontend**: React, TypeScript, Tailwind CSS, CodeMirror, Zustand, ReactFlow
- **Protocol**: MCP (SSE transport, stdio for legacy)

## Documentation

- `docs/design/PRD.md` - Product requirements
- `docs/design/技术实现文档.md` - Technical implementation details
- `docs/planning/开发计划文档.md` - Development roadmap
