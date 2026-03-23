# MemoForge

AI驱动的个人知识管理应用 — 人与AI双向编辑，Git原生存储与协作。

## 项目状态

当前阶段：**准备开发** (2026-03-23)

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

项目采用 Rust workspace 结构：
- `memoforge-core` - 核心知识管理引擎
- `memoforge-mcp` - MCP Server (CLI)
- `memoforge-tauri` - 桌面应用

详见 [开发计划文档](docs/planning/开发计划文档.md)。

## 技术栈

- 后端: Rust + Tauri v2
- 前端: React + TypeScript + Tailwind + Milkdown
- 版本管理: git2-rs
- 协议: MCP (Model Context Protocol)

## License

TBD
