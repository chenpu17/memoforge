# MemoForge 开发指南

## 快速开始

### 环境要求
- Rust 1.75+
- Node.js 18+
- Git

### 编译项目
```bash
# 编译所有 crates
cargo build --workspace

# 运行 MCP Server
cargo run -p memoforge-mcp -- serve --knowledge-path ./test-kb

# 运行测试
cargo test --workspace
```

### 开发流程

按照 [开发计划文档](./开发计划文档.md) 的 Sprint 顺序进行：

**Sprint 1: 项目骨架 + 核心数据模型** ✅ 已完成基础骨架
- 任务 1.1-1.2: Rust workspace 和前端项目已初始化
- 下一步: 实现 Frontmatter 解析模块 (任务 1.3)

### 目录结构
```
memoforge/
├── crates/
│   ├── memoforge-core/      # 核心引擎 (library)
│   ├── memoforge-mcp/        # MCP Server (binary)
│   └── memoforge-tauri/      # 桌面应用 (binary)
├── frontend/                 # React 前端
├── docs/
│   ├── design/              # PRD + 技术实现文档
│   ├── planning/            # 开发计划
│   └── discussion/          # 需求讨论记录
└── README.md
```

### 参考文档
- [PRD v1.8](../design/PRD.md) - 产品需求
- [技术实现文档 v1.4](../design/技术实现文档.md) - 技术方案
- [开发计划 v1.2](./开发计划文档.md) - 任务拆分

### 开发规范
- 遵循 Rust 标准代码风格 (`cargo fmt`)
- 所有公开 API 必须有文档注释
- 关键模块参考技术实现文档对应章节
- 错误处理使用统一的 `MemoError` 类型

### 下一步
开始 Sprint 1 任务 1.3: 实现 Frontmatter 解析模块
参考: 技术实现文档 §2.1.2
