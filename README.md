# MemoForge

AI 驱动的个人知识管理应用 — 人与 AI 双向编辑，Git 原生存储与协作。

## 项目状态

当前阶段：**Day 2 开发完成** (2026-03-26)

- ✅ Core Engine (Rust)
- ✅ MCP Server (SSE + stdio transport, 24 个工具)
- ✅ Tauri 桌面应用
- ✅ React Frontend UI (3 列布局)
- ✅ Git 集成
- ✅ 知识图谱可视化
- ✅ 实时刷新 (MCP 创建自动同步到 GUI)
- ✅ 前端单元测试 + E2E 测试

## 架构

```
┌─────────────────────────────────────────────────────────────┐
│                    Tauri Desktop App                        │
│                                                              │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │   Sidebar    │    │    Editor    │    │  RightPanel  │  │
│  │  分类导航    │    │  CodeMirror  │    │  元数据/Git  │  │
│  └──────────────┘    └──────────────┘    └──────────────┘  │
│         │                   │                   │           │
│         └───────────────────┼───────────────────┘           │
│                             │                                │
│                             ▼                                │
│                 ┌──────────────────────┐                    │
│                 │  SSE MCP Server      │                    │
│                 │  localhost:31415     │                    │
│                 └──────────┬───────────┘                    │
│                            │                                 │
└────────────────────────────┼────────────────────────────────┘
                             │
                             │ MCP over SSE
                             ▼
                 ┌──────────────────────┐
                 │     AI Agent         │
                 │   (Claude Code)      │
                 └──────────────────────┘
```

## 快速开始

### 1. 构建项目

```bash
# 构建 Rust workspace
cargo build --release

# 安装前端依赖
cd frontend && npm install && cd ..

# 启动 Tauri 桌面应用 (SSE MCP Server 自动启动)
cargo tauri dev
```

### 2. 配置 Claude Code

编辑 `~/.claude/mcp.json`:

```json
{
  "mcpServers": {
    "memoforge": {
      "url": "http://127.0.0.1:31415/mcp"
    }
  }
}
```

### 3. 验证连接

```bash
# 健康检查
curl http://127.0.0.1:31415/health

# MCP 初始化
curl -X POST http://127.0.0.1:31415/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize"}'
```

## MCP 工具列表

### 读取操作
| 工具 | 说明 |
|------|------|
| `get_editor_state` | 获取编辑器实时状态 (SSE 独有) |
| `list_knowledge` | 列出知识 (支持分类/标签筛选) |
| `get_content` | 获取知识全文 |
| `get_summary` | 获取知识摘要 |
| `grep` | 全文搜索 |
| `get_tags` | 获取所有标签 |
| `get_backlinks` | 获取反向链接 |
| `get_knowledge_graph` | 获取知识图谱 |
| `git_status` | Git 状态 |

### 写入操作
| 工具 | 说明 |
|------|------|
| `create_knowledge` | 创建知识 |
| `update_knowledge` | 更新知识内容 |
| `update_metadata` | 更新元数据 |
| `delete_knowledge` | 删除知识 |
| `move_knowledge` | 移动知识到其他分类 |
| `git_commit` | 提交更改 |
| `git_pull` / `git_push` | 同步远程 |

## 项目结构

```
crates/
├── memoforge-core/     # 核心引擎 (知识管理、Git、链接)
├── memoforge-mcp/      # MCP Server (SSE + stdio)
└── memoforge-tauri/    # Tauri 桌面应用

frontend/src/
├── App.tsx             # 主布局
├── components/
│   ├── Sidebar.tsx         # 分类导航
│   ├── Editor.tsx          # Markdown 编辑器
│   ├── RightPanel.tsx      # 可折叠右侧面板
│   ├── KnowledgeGraphPanel.tsx  # 知识图谱
│   └── ToastNotifications.tsx   # 实时通知
└── stores/
    └── appStore.ts     # Zustand 状态管理
```

## 核心功能

- 📝 **Markdown 编辑** - CodeMirror + 实时预览
- 🤖 **MCP 协议集成** - SSE 实时状态同步
- 🔄 **Git 版本控制** - commit/pull/push
- 🏷️ **分类与标签** - 多维度组织
- 🔍 **全文搜索** - 高亮匹配
- 📊 **知识图谱** - ReactFlow 可视化
- 🔗 **双向链接** - `[[wiki-style]]` 链接
- ⚡ **实时刷新** - MCP 创建自动同步到 GUI

## 技术栈

| 层 | 技术 |
|---|------|
| 后端 | Rust, Tauri v2, git2-rs, pulldown-cmark |
| 前端 | React, TypeScript, Tailwind CSS, CodeMirror, Zustand, ReactFlow |
| 协议 | MCP (SSE transport) |

## 文档

- [PRD.md](docs/design/PRD.md) - 产品需求文档
- [技术实现文档.md](docs/design/技术实现文档.md) - 技术实现方案
- [MCP Server README](crates/memoforge-mcp/README.md) - MCP 详细文档

## License

MIT
