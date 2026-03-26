# MemoForge MCP Server

MCP Server implementation for MemoForge knowledge management system.

## Primary Mode: SSE (Streamable HTTP)

**SSE Mode** is the recommended way to use MemoForge with AI agents. It provides real-time state synchronization between the desktop application and connected AI clients.

### How It Works

The SSE MCP Server is embedded in the Tauri desktop application and starts automatically when the app launches:

```
┌─────────────────────────────────────────────────────────┐
│                    Tauri Desktop App                    │
│                                                          │
│  ┌──────────────┐          ┌────────────────────────┐  │
│  │  React UI    │          │  SSE MCP Server        │  │
│  │              │──────────│  (localhost:31415)     │  │
│  │  - Editor    │  State   │  - /mcp endpoint       │  │
│  │  - Sidebar   │  Update  │  - /sse stream         │  │
│  └──────────────┘          └────────────────────────┘  │
│                                      │                   │
│                                      │ MCP/SSE           │
│                                      ▼                   │
│                          ┌──────────────────────┐       │
│                          │  AI Agent            │       │
│                          │  (Claude Code)       │       │
│                          └──────────────────────┘       │
└─────────────────────────────────────────────────────────┘
```

### Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/mcp` | POST | MCP JSON-RPC requests |
| `/mcp` | GET | SSE event stream (Streamable HTTP) |
| `/health` | GET | Health check |

### Claude Code Configuration

Add to `~/.claude/mcp.json`:

```json
{
  "mcpServers": {
    "memoforge": {
      "url": "http://127.0.0.1:31415/mcp"
    }
  }
}
```

### Testing

```bash
# Health check
curl http://127.0.0.1:31415/health

# MCP initialize
curl -X POST http://127.0.0.1:31415/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize"}'

# SSE event stream
curl -N http://127.0.0.1:31415/mcp
```

### Features

- **Real-time State Sync**: AI agents see the current editor state instantly
- **Connection Tracking**: Desktop app shows number of connected AI clients
- **Bidirectional**: AI can read and write knowledge, create content
- **Zero-conf**: Starts automatically with the desktop app

---

## Alternative Mode: stdio (Legacy)

For scenarios without the desktop application, stdio mode is available:

### Follow Mode
```bash
memoforge serve --mode follow
```
Follows the last used knowledge base. Read-only when state is invalid.

### Bound Mode
```bash
memoforge serve --mode bound --knowledge-path /path/to/kb
```
Binds to a specific knowledge base with full read-write access.

> **Note**: stdio mode does not provide real-time editor state. Use SSE mode for the best experience.

---

## Implemented Tools

### Read Operations
| Tool | Description |
|------|-------------|
| `get_status` | Get MCP server status |
| `get_config` | Get knowledge base configuration |
| `get_editor_state` | Get current editor state (SSE only, real-time) |
| `list_knowledge` | List knowledge with pagination |
| `get_summary` | Get knowledge summary |
| `get_content` | Get full knowledge content |
| `get_knowledge_with_stale` | Get knowledge with stale flag |
| `grep` | Search in knowledge content |
| `get_tags` | Get all tags |
| `get_backlinks` | Get backlinks for knowledge |
| `get_related` | Get related knowledge |
| `get_knowledge_graph` | Get full knowledge graph |
| `list_categories` | List all categories |
| `git_status` | Get git status |
| `git_log` | Get git commit history |

### Write Operations
| Tool | Description |
|------|-------------|
| `create_knowledge` | Create new knowledge |
| `update_knowledge` | Update knowledge content |
| `update_metadata` | Update knowledge metadata |
| `delete_knowledge` | Delete knowledge |
| `move_knowledge` | Move knowledge to another category |
| `create_category` | Create new category |
| `update_category` | Update category |
| `delete_category` | Delete category |
| `git_commit` | Commit changes |
| `git_pull` | Pull from remote |
| `git_push` | Push to remote |

---

## Technical Details

### Editor State Structure

```rust
pub struct EditorStateSnapshot {
    pub mode: String,                    // "sse"
    pub desktop: Option<DesktopInfo>,    // Desktop app status
    pub current_kb: Option<CurrentKb>,   // Current knowledge base
    pub current_knowledge: Option<CurrentKnowledge>, // Selected knowledge
    pub selection: Option<Selection>,    // Text selection
    pub active_agents: Vec<ActiveAgent>, // Connected AI agents
    pub state_valid: bool,               // State validity
    pub updated_at: String,              // Last update time
}
```

### Connection Management

- Each SSE connection is tracked with a unique ID
- Connection count is reflected in `active_agents`
- Automatic cleanup when connection closes
- Keep-alive messages every 30 seconds

### Port Configuration

Default port is `31415`. Can be changed via environment variable:
```bash
export MEMOFORGE_MCP_PORT=31416
```

---

## Documentation

- [SSE MCP Implementation](../../docs/SSE_MCP_IMPLEMENTATION.md)
- [Technical Implementation](../../docs/design/技术实现文档.md)
- [PRD](../../docs/design/PRD.md)
