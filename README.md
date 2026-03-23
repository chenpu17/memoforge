# MemoForge

AI驱动的个人知识管理应用 — 人与AI双向编辑，Git原生存储与协作。

## 项目状态

当前阶段：**Day 1 开发完成** (2026-03-23)

- ✅ Core Engine (Rust)
- ✅ MCP Server (12 个工具)
- ✅ Tauri 桌面应用
- ✅ React Frontend UI
- ✅ Git 集成
- ✅ 测试通过 (10/10)

## 文档导航

### 设计文档 (`docs/design/`)
- [PRD.md](docs/design/PRD.md) - 产品需求文档 v1.8
- [技术实现文档.md](docs/design/技术实现文档.md) - 技术实现方案 v1.4

### 规划文档 (`docs/planning/`)
- [开发计划文档.md](docs/planning/开发计划文档.md) - 开发计划与任务拆分 v1.2

### 讨论记录 (`docs/discussion/`)
- [需求.md](docs/discussion/需求.md) - 初始需求
- [讨论.md](docs/discussion/讨论.md) - 产品讨论记录

## 快速开始

### 构建项目

```bash
# 1. 构建 Rust workspace
cargo build --release

# 2. 安装前端依赖并构建
cd frontend && npm install && npm run build && cd ..

# 3. 构建 Tauri 应用
cd crates/memoforge-tauri && cargo tauri build
```

### 使用 MCP Server

```bash
# 启动 MCP Server
./target/release/memoforge serve --kb-path /path/to/kb

# 配置到 Claude Code (.claude/mcp.json)
{
  "mcpServers": {
    "memoforge": {
      "command": "/path/to/memoforge",
      "args": ["serve", "--kb-path", "/path/to/kb"]
    }
  }
}
```

### 项目结构

- `crates/memoforge-core` - 核心知识管理引擎
- `crates/memoforge-mcp` - MCP Server (CLI)
- `crates/memoforge-tauri` - 桌面应用
- `frontend/` - React UI

详见 [开发计划文档](docs/planning/开发计划文档.md)。

## 技术栈

- 后端: Rust + Tauri v2
- 前端: React + TypeScript + Tailwind + Milkdown
- 版本管理: git2-rs
- 协议: MCP (Model Context Protocol)

## 核心功能

- 📝 Markdown 编辑 + YAML frontmatter
- 🤖 MCP 协议 AI Agent 集成
- 🔄 Git 版本控制 (commit/pull/push)
- 🏷️ 分类与标签管理
- 🔍 全文搜索
- 📊 L0/L1/L2 渐进式披露

## License

MIT
