# MemoForge MCP Server

MCP Server implementation for MemoForge knowledge management system.

## Primary Mode: SSE (Streamable HTTP)

**SSE Mode** is the recommended way to use MemoForge with AI agents. It provides real-time state synchronization between the desktop application and connected AI clients.

### Tool Exposure Strategy

The MCP server uses profile-based tool exposure to match different agent scenarios. Each profile exposes a curated subset of tools optimized for its use case.

**Profiles** (v0.3.0):

| Profile | Use Case | Description |
|---------|----------|-------------|
| `generic-stdio` | CLI / headless agents | Core agent tools (12). Draft + Inbox + Session workflows. |
| `desktop-assisted` | Desktop-collaborating agents | Adds editor state, session detail, draft listing, reliability, review queue, workflow, and governance tools (25 total). |
| `legacy-full` | Debugging / backward compat | Full backward-compatible surface. Not recommended for new agents. |

New agent integrations should **not** conceptually default to the full tool list.

Status:

- Profile gating is active as of `v0.3.0`
- SSE connections default to `desktop-assisted`, stdio connections default to `generic-stdio`
- Override via `MEMOFORGE_MCP_PROFILE` environment variable

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

Agents should prefer using the Draft + Inbox + Session + Review workflow rather than legacy direct-write tools.

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
| `create_knowledge` | Create new knowledge (Legacy) |
| `update_knowledge` | Update knowledge content (Legacy) |
| `update_metadata` | Update knowledge metadata (Legacy) |
| `delete_knowledge` | Delete knowledge |
| `move_knowledge` | Move knowledge to another category |
| `create_category` | Create new category |
| `update_category` | Update category |
| `delete_category` | Delete category |
| `git_commit` | Commit changes |
| `git_pull` | Pull from remote |
| `git_push` | Push to remote |

### Draft Workflow (Recommended for AI Agents)

The Draft workflow provides structured, incremental, previewable writes — replacing whole-document replacement for long content.

**Recommended workflow**:

```
1. read_knowledge(path, level="L1")     — Read target knowledge structure
2. start_draft(path, metadata)          — Create draft
3. update_draft(draft_id, op="append_section", heading="...", content="...")  — Write section by section
4. update_draft(draft_id, op="replace_section", heading="...", content="...") — Modify specific section
5. preview_draft(draft_id)              — Preview changes and diff
6. commit_draft(draft_id)               — Commit to knowledge base
```

| Tool | Description |
|------|-------------|
| `read_knowledge` | Unified read interface with section-level access, metadata, and stale flag |
| `start_draft` | Create draft for new or existing knowledge. Returns `draft_id` |
| `update_draft` | Apply operations to draft: `set_content`, `append_section`, `replace_section`, `remove_section`, `update_metadata` |
| `preview_draft` | Preview diff summary, sections changed, stale warnings |
| `commit_draft` | Commit draft to KB. Detects conflicts if source file changed since draft creation |
| `discard_draft` | Discard draft without writing |

**Why use Draft flow**:
- Incremental writes prevent format errors from generating overly long Markdown
- Preview before commit — desktop users can review and confirm
- Conflict detection: returns error with recovery instructions if source file changed
- Legacy tools (`create_knowledge`, `update_knowledge`) remain available

#### Draft Tool Details

**`read_knowledge`** — Unified read interface for agents

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `path` | string | yes | Knowledge file path |
| `level` | string | no | `L0`/`L1`/`L2` (default: `L1`) |
| `section` | string | no | Read only this section by heading title |
| `include_metadata` | boolean | no | Include full frontmatter (default: true) |
| `include_stale` | boolean | no | Include staleness check (default: true) |

Returns: `{ metadata, content, sections, summary_stale }`

**`start_draft`** — Create a new draft

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `path` | string | no | Target knowledge path. Omit for new knowledge |
| `metadata` | object | no | Initial metadata for new knowledge `{title, tags, summary, category}` |

Returns: `{ draft_id, path, created }`

**`update_draft`** — Apply an operation to a draft

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `draft_id` | string | yes | Draft ID from `start_draft` |
| `op` | string | yes | One of: `set_content`, `append_section`, `replace_section`, `remove_section`, `update_metadata` |
| `heading` | string | no | Section heading (required for append/replace/remove) |
| `level` | integer | no | Heading level for append (default: 2) |
| `content` | string | no | Body content |
| `metadata` | object | no | Metadata patch for `update_metadata` op `{title?, tags?, summary?}` |

Returns: `{ draft_id, ops_applied }`

**`preview_draft`** — Preview changes before committing

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `draft_id` | string | yes | Draft ID to preview |

Returns: `{ sections_changed, summary_will_be_stale, warnings, diff_summary: { sections_changed, lines_added, lines_removed } }`

**`commit_draft`** — Commit draft to knowledge base

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `draft_id` | string | yes | Draft ID to commit |

Returns on success: `{ committed: true, path, changed_sections, draft_id }`
Returns on conflict: Error with `ConflictFileLocked` code, includes recovery instructions

**`discard_draft`** — Discard without writing

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `draft_id` | string | yes | Draft ID to discard |

Returns: `{ discarded: true, draft_id }`

### Inbox & Session Workflow (Sprint 1)

Sprint 1 introduces Inbox and Session management for agent-driven knowledge creation:

**Typical Agent Workflow**:

```
1. start_agent_session(agent_name, goal)         — Create session to track work
2. create_inbox_item(title, content, ...)        — Create candidate knowledge
3. promote_inbox_item_to_draft(inbox_id)        — Convert to draft for review
4. append_agent_session_context(session_id, ...)  — Track sources consulted
5. complete_agent_session(session_id, summary)    — Mark session complete
```

#### Inbox Tools

| Tool | Description |
|------|-------------|
| `list_inbox_items` | List inbox items with optional status filter |
| `create_inbox_item` | Create a new inbox item |
| `promote_inbox_item_to_draft` | Promote inbox item to draft |
| `dismiss_inbox_item` | Dismiss an inbox item (soft delete) |

**`list_inbox_items`**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `status` | string | no | Filter by status: `new`, `triaged`, `drafted`, `promoted`, `ignored` |
| `limit` | integer | no | Maximum number of items to return |

Returns: `{ items: [{ id, title, status, source_type, created_at, ... }] }`

**`create_inbox_item`**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `title` | string | yes | Candidate title |
| `source_type` | string | yes | Source: `agent`, `import`, `paste`, `manual`, `reliability` |
| `content_markdown` | string | no | Full markdown content |
| `proposed_path` | string | no | Suggested file path |
| `linked_session_id` | string | no | Associated session ID |

Returns: `{ item: { id, title, status, ... } }`

**`promote_inbox_item_to_draft`**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `inbox_item_id` | string | yes | Inbox item ID to promote |
| `draft_title` | string | no | Optional title override for the draft |

Returns: `{ draft_id: string, inbox_item: { ... } }`

Side effects:
- Creates a new draft
- Updates inbox item status to `drafted`
- Sets `draft_context.review.state = pending`
- Records `draft_context.review.source_inbox_item_id`

**`dismiss_inbox_item`**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `inbox_item_id` | string | yes | Inbox item ID to dismiss |
| `reason` | string | no | Optional reason for dismissal |

Returns: `{ item: { id, title, status: "ignored", ... } }`

#### Session Tools

| Tool | Description |
|------|-------------|
| `start_agent_session` | Create a new agent session |
| `append_agent_session_context` | Add context item to session |
| `list_agent_sessions` | List sessions with optional status filter |
| `get_agent_session` | Get session details |
| `complete_agent_session` | Mark session as complete/failed/cancelled |

**`start_agent_session`**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `agent_name` | string | yes | Agent identifier (e.g., "claude-code") |
| `goal` | string | yes | Session objective |
| `agent_source` | string | no | Optional agent source system |
| `context_pack_ids` | array | no | Context pack IDs for session context (Sprint 4: active) |

Returns: `{ session: { id, agent_name, goal, status: "running", ... } }`

**`append_agent_session_context`**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `session_id` | string | yes | Session ID |
| `context_item` | object | yes | Context item `{ ref_type, ref_id, summary? }` |

Context item types: `{ ref_type: "knowledge" | "pack" | "url" | "file", ref_id: string, summary?: string }`

Returns: `{ session: { id, context_items: [...], ... } }`

**`list_agent_sessions`**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `status` | string | no | Filter by status: `running`, `completed`, `failed`, `cancelled` |
| `limit` | integer | no | Maximum number of sessions to return |

Returns: `{ sessions: [{ id, agent_name, goal, status, ... }] }`

**`get_agent_session`**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `session_id` | string | yes | Session ID |

Returns: `{ session: { id, agent_name, goal, status, context_items, draft_ids, inbox_item_ids, ... } }`

**`complete_agent_session`**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `session_id` | string | yes | Session ID |
| `result_summary` | string | no | Summary of results |
| `status` | string | no | Final status: `completed` (default), `failed`, `cancelled` |

Returns: `{ session: { id, status, finished_at, result_summary, ... } }`

### Reliability Workflow (Sprint 3)

Sprint 3 introduces reliability scanning and fix workflow for maintaining knowledge base quality:

**Typical Workflow**:

```
1. list_reliability_issues()                 — Scan KB for issues
2. get_reliability_issue_detail(issue_id)    — View issue details
3. create_fix_draft_from_issue(issue_id)      — Create fix draft
4. [Agent edits draft via update_draft...]   — Apply fixes
5. commit_draft(draft_id)                    — Commit fix
```

#### Reliability Tools

| Tool | Description |
|------|-------------|
| `list_reliability_issues` | List reliability issues with optional filtering |
| `get_reliability_issue_detail` | Get detailed information about a specific issue |
| `create_fix_draft_from_issue` | Create a fix draft from a reliability issue |
| `get_reliability_stats` | Get reliability statistics |

**`list_reliability_issues`**

List all detected reliability issues with optional filtering.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `severity` | string | no | Filter by severity: `low`, `medium`, `high` |
| `status` | string | no | Filter by status: `open`, `ignored`, `resolved` |
| `rule_key` | string | no | Filter by rule type: `no_summary`, `no_tags`, `no_category`, `stale_content`, `broken_link`, `orphaned_knowledge` |
| `knowledge_path_prefix` | string | no | Filter by knowledge path prefix (e.g., `tech/`) |
| `limit` | integer | no | Maximum number of results to return |
| `include_resolved` | boolean | no | Include resolved issues (default: false) |

Returns:
```json
{
  "issues": [
    {
      "id": "01H...",
      "rule_key": "no_summary",
      "knowledge_path": "tech/article.md",
      "severity": "medium",
      "status": "open",
      "summary": "Knowledge 'Article' lacks a summary",
      "linked_draft_id": null,
      "detected_at": "2026-04-10T00:00:00Z",
      "updated_at": "2026-04-10T00:00:00Z"
    }
  ],
  "total": 5
}
```

**`get_reliability_issue_detail`**

Get detailed information about a specific reliability issue.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `issue_id` | string | yes | Issue ID |

Returns:
```json
{
  "issue": {
    "id": "01H...",
    "rule_key": "no_summary",
    "knowledge_path": "tech/article.md",
    "severity": "medium",
    "status": "open",
    "summary": "Knowledge 'Article' lacks a summary",
    "linked_draft_id": "draft-123",
    "detected_at": "2026-04-10T00:00:00Z",
    "updated_at": "2026-04-10T00:00:00Z"
  }
}
```

**`create_fix_draft_from_issue`**

Create a new draft pre-populated with suggestions for fixing a reliability issue.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `issue_id` | string | yes | Issue ID to create fix for |

Returns:
```json
{
  "draft_id": "draft-123",
  "issue": {
    "id": "01H...",
    "rule_key": "no_summary",
    ...
  },
  "suggestions": [
    {
      "type": "add_summary",
      "description": "Add a concise summary to the frontmatter"
    }
  ]
}
```

Side effects:
- Creates a new draft for the knowledge file
- Links the draft to the issue
- Pre-populates draft with AI-generated fix suggestions

**`get_reliability_stats`**

Get aggregate statistics about reliability issues.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| None | — | — |

Returns:
```json
{
  "stats": {
    "total": 15,
    "open": 12,
    "ignored": 2,
    "resolved": 1,
    "high_severity": 3,
    "medium_severity": 8,
    "low_severity": 4
  }
}
```

#### Reliability Rules

The reliability scanner detects the following types of issues:

| Rule Key | Severity | Description |
|----------|-----------|-------------|
| `no_summary` | Medium | Knowledge lacks a summary field |
| `no_tags` | Low | Knowledge has no tags |
| `no_category` | Medium | Knowledge has invalid or missing category |
| `stale_content` | Medium | Knowledge hasn't been updated in >90 days |
| `broken_link` | High | Wiki link references non-existent knowledge |
| `orphaned_knowledge` | Low | Knowledge has no incoming wiki links |

### Context Pack Workflow (Sprint 4)

Sprint 4 introduces Context Packs for grouping knowledge items by various scopes (tag, folder, topic, manual). Context Packs can be referenced by agent sessions to efficiently provide context.

**Typical Workflow**:

```
1. list_context_packs(scope_type="manual")     — List available packs
2. create_context_pack(name, scope_type, ...)   — Create a new context pack
3. get_context_pack(pack_id)                    — Get pack details
4. export_context_pack(pack_id, format)         — Export pack data
5. start_agent_session(..., context_pack_ids)   — Reference pack in session
```

#### Context Pack Tools

| Tool | Description |
|------|-------------|
| `list_context_packs` | List context packs with optional scope_type filter |
| `create_context_pack` | Create a new context pack |
| `get_context_pack` | Get details of a specific context pack |
| `export_context_pack` | Export a context pack in specified format |

**`list_context_packs`**

List all context packs with optional filtering by scope type.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `scope_type` | string | no | Filter by scope: `tag`, `folder`, `topic`, `manual` |

Returns:
```json
{
  "packs": [
    {
      "id": "01H...",
      "name": "Development Pack",
      "scope_type": "manual",
      "scope_value": "",
      "item_paths": ["dev/rust.md", "dev/python.md"],
      "summary": "Core development knowledge",
      "version": "1.0.0",
      "created_at": "2026-04-10T00:00:00Z",
      "updated_at": "2026-04-10T00:00:00Z"
    }
  ]
}
```

**`create_context_pack`**

Create a new context pack with specified scope and items.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `name` | string | yes | Display name for the pack |
| `scope_type` | string | yes | Scope type: `tag`, `folder`, `topic`, `manual` |
| `scope_value` | string | yes | Value for the scope (e.g., tag name, folder path) |
| `item_paths` | array | yes | List of knowledge file paths to include |
| `summary` | string | no | Optional description of the pack |

Returns:
```json
{
  "pack": {
    "id": "01H...",
    "name": "My Pack",
    "scope_type": "manual",
    "scope_value": "",
    "item_paths": ["docs/overview.md"],
    "summary": "A custom pack",
    "version": "1.0.0",
    "created_at": "2026-04-10T00:00:00Z",
    "updated_at": "2026-04-10T00:00:00Z"
  }
}
```

**`get_context_pack`**

Get detailed information about a specific context pack.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `pack_id` | string | yes | ULID of the context pack |

Returns:
```json
{
  "pack": {
    "id": "01H...",
    "name": "Development Pack",
    "scope_type": "manual",
    "scope_value": "",
    "item_paths": ["dev/rust.md", "dev/python.md"],
    "summary": "Core development knowledge",
    "version": "1.0.0",
    "created_at": "2026-04-10T00:00:00Z",
    "updated_at": "2026-04-10T00:00:00Z"
  }
}
```

**`export_context_pack`**

Export a context pack in a specified format.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `pack_id` | string | yes | ULID of the context pack |
| `format` | string | no | Export format, default: `json` |

Returns:
```json
{
  "pack": {
    "id": "01H...",
    "name": "Development Pack",
    ...
  },
  "export_format": "json"
}
```

#### Context Pack Scope Types

| Scope Type | Description | Example Scope Value |
|------------|-------------|-------------------|
| `tag` | Knowledge with specific tags | `"rust"`, `"important"` |
| `folder` | Knowledge in specific folder path | `"dev/"`, `"tech/"` |
| `topic` | Knowledge related to a topic | `"database"`, `"security"` |
| `manual` | Manually curated item list | `""` (empty, items defined by `item_paths`) |

#### Referencing Context Packs in Sessions

Context packs can be referenced when starting an agent session using the `context_pack_ids` parameter:

```json
{
  "agent_name": "research-agent",
  "goal": "Analyze development patterns",
  "context_pack_ids": ["01H...pack-ulid..."]
}
```

The agent session will have access to all knowledge items included in the referenced context packs.

### Workflow Template Workflow (Sprint 2)

Sprint 2 introduces workflow templates for high-frequency knowledge creation tasks. Templates define goals, context sources, output targets, and review policies.

**Typical Workflow**:

```
1. list_workflow_templates()                    — Browse available templates
2. start_workflow_run(template_id, ...)         — Start a workflow from template
3. [Agent works with session, drafts...]        — Execute the workflow
4. complete_agent_session(session_id, ...)      — Mark session complete
```

#### Workflow Template Tools

| Tool | Description |
|------|-------------|
| `list_workflow_templates` | List available workflow templates |
| `start_workflow_run` | Start a workflow run from a template |

**`list_workflow_templates`**

List all available workflow templates (built-in and custom).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| None | -- | -- | -- |

Returns:
```json
{
  "templates": [
    {
      "template_id": "meeting_notes",
      "name": "会议纪要整理入库",
      "goal": "将会议纪要整理为结构化知识并入库",
      "default_context_refs": [],
      "suggested_output_target": "会议",
      "review_policy": "确保关键决策和 action item 被准确记录",
      "success_criteria": ["..."],
      "enabled": true
    }
  ]
}
```

**`start_workflow_run`**

Start a workflow run from a template. Creates an agent session and optionally a draft.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `template_id` | string | yes | Template ID to run |
| `goal_override` | string | no | Override the template's default goal |
| `context_refs` | array | no | Additional context references |
| `suggested_output_target` | string | no | Override the template's output target |

Returns:
```json
{
  "run_id": "01H...",
  "session_id": "01H...",
  "draft_id": "draft-123",
  "inbox_item_ids": [],
  "context_items_with_snapshots": 2
}
```

Side effects:
- Creates an AgentSession with template context
- Populates snapshot summaries for Knowledge-type context refs
- Creates a Draft if the template specifies an output target

#### Built-in Templates

| Template ID | Name | Description |
|-------------|------|-------------|
| `pr_issue_knowledge` | PR/Issue 沉淀知识 | Extract knowledge from PRs and Issues |
| `runbook_verify` | Runbook 校验与修复 | Verify and repair runbook documents |
| `meeting_notes` | 会议纪要整理入库 | Organize meeting notes into knowledge |
| `release_retrospective` | 版本发布复盘 | Post-release retrospective |

### Review Workflow (Sprint 3)

Sprint 3 introduces a unified review queue for managing drafts, inbox items, and knowledge quality through a consistent interface.

**Typical Workflow**:

```
1. list_review_items(status="pending")          — List items awaiting review
2. get_review_item(item_id)                     — View item details
3. apply_review_decision(item_id, decision)     — Approve or return
```

#### Review Tools

| Tool | Description |
|------|-------------|
| `list_review_items` | List review items with optional filtering |
| `get_review_item` | Get details of a specific review item |
| `apply_review_decision` | Apply a review decision (approve/return) |

**`list_review_items`**

List review items with optional filtering. By default only returns active (non-terminal) items: pending, in_review, returned. Set `include_terminal=true` to also see approved/discarded items.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `status` | string | no | Filter by status: `pending`, `in_review`, `approved`, `returned`, `discarded`. Overrides the default non-terminal filter. |
| `source_type` | string | no | Filter by source: `agent_draft`, `inbox_promotion`, `reliability_fix`, `import_cleanup` |
| `include_terminal` | boolean | no | Include terminal states (approved, discarded). Default: false |
| `limit` | integer | no | Maximum number of results |

Returns:
```json
{
  "items": [
    {
      "id": "01H...",
      "source_type": "draft",
      "source_id": "draft-123",
      "status": "pending",
      "title": "...",
      "created_at": "2026-04-10T00:00:00Z"
    }
  ],
  "total": 3
}
```

**`get_review_item`**

Get detailed information about a specific review item.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `item_id` | string | yes | Review item ID |

Returns:
```json
{
  "item": {
    "id": "01H...",
    "source_type": "draft",
    "source_id": "draft-123",
    "status": "pending",
    "title": "...",
    "content_preview": "...",
    "created_at": "2026-04-10T00:00:00Z"
  }
}
```

**`apply_review_decision`**

Apply a review decision to an item.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `item_id` | string | yes | Review item ID |
| `decision` | string | yes | `approved` or `returned` |
| `comment` | string | no | Optional review comment |

Returns:
```json
{
  "item": {
    "id": "01H...",
    "status": "approved",
    ...
  }
}
```

### Knowledge Governance Workflow (Sprint 4)

Sprint 4 introduces knowledge governance tools for managing freshness policies, SLA tracking, and evidence-based verification.

**Typical Workflow**:

```
1. get_knowledge_governance(path)              — View governance state
2. update_knowledge_governance(path, ...)      — Set freshness policy
3. verify_knowledge(path, ...)                 — Record verification evidence
```

#### Governance Tools

| Tool | Description |
|------|-------------|
| `get_knowledge_governance` | Get governance state for a knowledge item |
| `update_knowledge_governance` | Update governance settings for a knowledge item |

**`get_knowledge_governance`**

Get the current governance state for a knowledge item, including freshness status and review history.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `path` | string | yes | Knowledge file path |

Returns:
```json
{
  "path": "dev/rust-guide.md",
  "freshness": {
    "status": "fresh",
    "sla_days": 90,
    "last_verified_at": "2026-04-01T00:00:00Z",
    "due_for_review_at": "2026-07-01T00:00:00Z"
  },
  "evidence": []
}
```

**`update_knowledge_governance`**

Update governance settings for a knowledge item.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `path` | string | yes | Knowledge file path |
| `sla_days` | integer | no | SLA in days for freshness review |
| `verified` | boolean | no | Mark as verified with current timestamp |

Returns:
```json
{
  "path": "dev/rust-guide.md",
  "freshness": {
    "status": "fresh",
    "sla_days": 30,
    "last_verified_at": "2026-04-12T00:00:00Z",
    "due_for_review_at": "2026-05-12T00:00:00Z"
  }
}
```

---

## Profile Gate (v0.3.0)

The MCP server uses profile-based tool exposure to match different agent scenarios. Each profile exposes a curated subset of tools optimized for its use case.

### Profiles

| Profile | Use Case | Tool Count | Description |
|---------|----------|------------|-------------|
| `generic-stdio` | CLI / headless agents | 12 | Core agent tools: Draft workflow, Session tracking, Inbox flow. |
| `desktop-assisted` | Desktop-collaborating agents | 25 | Adds session detail, reliability, review queue, draft listing, workflow, governance, and editor state tools. |
| `legacy-full` | Debugging / backward compat | All | Full tool surface including legacy read/write, git, context packs, categories. Not recommended for new agents. |

### Profile Assignment

The profile is determined at connection time. SSE connections default to `desktop-assisted`. Stdio connections default to `generic-stdio`. Override via `MEMOFORGE_MCP_PROFILE` environment variable:

```bash
export MEMOFORGE_MCP_PROFILE=generic-stdio
```

### Tool Surface by Profile

**`generic-stdio`** (12 tools -- core agent workflow):
- Read & Draft flow (6): `read_knowledge`, `start_draft`, `update_draft`, `preview_draft`, `commit_draft`, `discard_draft`
- Session tracking (3): `start_agent_session`, `append_agent_session_context`, `complete_agent_session`
- Inbox flow (3): `create_inbox_item`, `promote_inbox_item_to_draft`, `list_inbox_items`

**`desktop-assisted`** (generic-stdio + 13 additional tools):
- Editor state (1): `get_editor_state`
- Session detail (2): `get_agent_session`, `list_agent_sessions`
- Draft management (1): `list_drafts`
- Reliability (2): `list_reliability_issues`, `get_reliability_issue_detail`
- Workflow templates (2): `list_workflow_templates`, `start_workflow_run`
- Review queue (3): `list_review_items`, `get_review_item`, `apply_review_decision`
- Governance (2): `get_knowledge_governance`, `update_knowledge_governance`

**`legacy-full`** (all tools, includes):
- Legacy read tools: `list_knowledge`, `get_summary`, `get_content`, `get_knowledge_with_stale`, `grep`, `get_tags`, `get_backlinks`, `get_related`, `get_knowledge_graph`
- Legacy write tools: `create_knowledge`, `update_knowledge`, `update_metadata`, `delete_knowledge`, `move_knowledge`
- Git tools: `git_status`, `git_commit`, `git_pull`, `git_push`, `git_log`
- Reliability fix: `create_fix_draft_from_issue`
- Context packs: `create_context_pack`, `get_context_pack`, `export_context_pack`, `list_context_packs`

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
