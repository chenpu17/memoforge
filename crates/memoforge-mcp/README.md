# MemoForge MCP Server

MCP Server implementation for MemoForge knowledge management system.

## Usage

```bash
# Start in read-write mode (default)
memoforge serve --knowledge-path /path/to/kb

# Start in read-only mode
memoforge serve --knowledge-path /path/to/kb --mode readonly
```

## Implemented Tools

1. `list_knowledge` - List knowledge entries
2. `get_knowledge` - Get single knowledge entry
3. `create_knowledge` - Create new knowledge
4. `update_knowledge` - Update knowledge
5. `delete_knowledge` - Delete knowledge
6. `move_knowledge` - Move knowledge to category
7. `search_knowledge` - Search knowledge
8. `list_categories` - List category tree
9. `create_category` - Create category
10. `update_category` - Update category
11. `delete_category` - Delete category
12. `get_status` - Get knowledge base status

## Status

Sprint 3 complete - MCP protocol integration with stub implementations. Tool handlers will be connected to memoforge-core in Sprint 4.
