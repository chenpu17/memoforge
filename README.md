# ForgeNerve

> 品牌升级中：`ForgeNerve`（原 `MemoForge`）。当前仓库内的 crate 名、CLI 名和运行时目录仍暂时保留 `memoforge-*` / `.memoforge` 以保证兼容。

The Agent Knowledge OS for Developers.

AI 驱动的开发者知识工作台 —— 人与 AI 双向编辑，Git 原生存储与协作。

ForgeNerve 是一个面向开发者和 AI Agent 的知识操作系统：它把 `Markdown + Git + MCP + Draft 审阅流` 组合成一个可读、可写、可审、可回滚的知识工作台。

- `Local-first`：知识保存在你自己的目录和仓库里
- `Git-native`：提交、拉取、推送和团队协作都走 Git
- `MCP-ready`：可直接接入 Claude Code、OpenCode 等 Agent
- `Reviewable writes`：Agent 先写 Draft，再由用户在桌面端审阅确认

## 项目状态

当前规划主线：**v0.3.0** (2026-04-12，处于设计整理与评审冻结阶段)

最新正式版：[`ForgeNerve v0.1.2`](https://github.com/chenpu17/memoforge/releases/tag/v0.1.2)

- ✅ Core Engine (Rust)
- ✅ MCP Server (SSE + stdio transport, 47+ 个工具)
- ✅ Draft 草稿流 (section 级写入、预览、冲突检测)
- ✅ Tauri 桌面应用
- ✅ React Frontend UI (3 列布局)
- ✅ Git 集成
- ✅ 知识图谱可视化
- ✅ 实时刷新 (MCP 创建自动同步到 GUI)
- ✅ 前端单元测试 + E2E 测试
- ✅ Tauri 桌面端到端测试（CI 覆盖）

### v0.3.0 规划范围

`v0.3.0` 当前仍处于设计与冻结阶段，规划聚焦以下核心概念：

- **Inbox** — 待审阅的知识候选池，支持状态流转（new → triaged → drafted → promoted）
- **Session** — Agent 工作会话追踪，记录上下文、草稿和生成的 Inbox items
- **Review** — 桌面审阅面板，支持预览 diff、确认提交、退回修改、丢弃变更
- **Reliability Dashboard** — 知识质量规则扫描（6 条规则），支持生成修复 Draft
- **Context Pack** — 知识切片打包（按 tag/folder/topic/manual），可被 Session 引用

相关 MCP 工具：

| 类别 | 工具 |
|------|------|
| Inbox | `list_inbox_items`, `create_inbox_item`, `promote_inbox_item_to_draft`, `dismiss_inbox_item` |
| Session | `start_agent_session`, `append_agent_session_context`, `list_agent_sessions`, `get_agent_session`, `complete_agent_session` |
| Reliability | `list_reliability_issues`, `get_reliability_issue_detail`, `create_fix_draft_from_issue` |
| Context Pack | `list_context_packs`, `create_context_pack`, `get_context_pack`, `export_context_pack` |

## 下载与发布说明

如果你是第一次接触 ForgeNerve，最直接的入口就是 GitHub Release：

- 正式版下载页：[`ForgeNerve v0.1.2`](https://github.com/chenpu17/memoforge/releases/tag/v0.1.2)
- 发布说明：[`RELEASE_NOTES.md`](RELEASE_NOTES.md)

常用下载入口：

| 平台 / 用途 | 推荐产物 | 链接 |
|------|------|------|
| Windows 安装版 | `ForgeNerve_0.1.2_x64-setup.exe` | [下载](https://github.com/chenpu17/memoforge/releases/download/v0.1.2/ForgeNerve_0.1.2_x64-setup.exe) |
| Windows MSI | `ForgeNerve_0.1.2_x64_en-US.msi` | [下载](https://github.com/chenpu17/memoforge/releases/download/v0.1.2/ForgeNerve_0.1.2_x64_en-US.msi) |
| Windows 便携版 | `ForgeNerve_x64_portable.exe` | [下载](https://github.com/chenpu17/memoforge/releases/download/v0.1.2/ForgeNerve_x64_portable.exe) |
| macOS Apple Silicon | `ForgeNerve_0.1.2_aarch64.dmg` | [下载](https://github.com/chenpu17/memoforge/releases/download/v0.1.2/ForgeNerve_0.1.2_aarch64.dmg) |
| macOS Intel | `ForgeNerve_0.1.2_x64.dmg` | [下载](https://github.com/chenpu17/memoforge/releases/download/v0.1.2/ForgeNerve_0.1.2_x64.dmg) |
| Linux x64 | `ForgeNerve_0.1.2_amd64.AppImage` | [下载](https://github.com/chenpu17/memoforge/releases/download/v0.1.2/ForgeNerve_0.1.2_amd64.AppImage) |
| Linux arm64 | `ForgeNerve_0.1.2_aarch64.AppImage` | [下载](https://github.com/chenpu17/memoforge/releases/download/v0.1.2/ForgeNerve_0.1.2_aarch64.AppImage) |
| MCP / CLI 二进制 | `memoforge-*` 系列 | [查看全部 release 资产](https://github.com/chenpu17/memoforge/releases/tag/v0.1.2) |

如果你想在首页或 release 页面快速找到二进制，可以直接按下面口径理解：

- 桌面用户：优先下载 `ForgeNerve_*` 资产
- Windows 用户：优先下载 `setup.exe`，不想安装则下载 `portable.exe`
- Agent / MCP 用户：优先下载 `memoforge-*` 单文件二进制
- 想看全部产物：直接进入 release 页面右侧资产列表

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

### 2. 快速接入 AI Agent

启动桌面应用后，ForgeNerve 会自动在 `http://127.0.0.1:31415/mcp` 暴露 MCP 服务。

如果端口冲突，可以改用其他端口启动：

```bash
MEMOFORGE_MCP_PORT=31416 cargo tauri dev
```

然后把下面配置里的 URL 一并改成新端口。

#### OpenCode

编辑全局配置 `~/.config/opencode/opencode.json`，或在项目目录创建 `opencode.json`：

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "memoforge": {
      "type": "remote",
      "url": "http://127.0.0.1:31415/mcp",
      "enabled": true
    }
  }
}
```

#### Claude Code

编辑 `~/.claude/mcp.json`:

```json
{
  "mcpServers": {
    "memoforge": {
      "type": "sse",
      "url": "http://127.0.0.1:31415/mcp"
    }
  }
}
```

#### 无桌面应用时的本地 stdio 模式

适用于 CI、远程主机或你只想把某个知识库直接绑定给 Agent：

```bash
./target/release/memoforge serve --mode bound --knowledge-path /absolute/path/to/your/kb
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

应用内也可以直接点击 `设置`，在 `MCP 快速配置` 区块里复制现成配置。

品牌迁移说明见 `docs/planning/brand/ForgeNerve品牌迁移方案.md`。
官网首页文案见 `docs/planning/brand/ForgeNerve官网首页文案.md`。
官网完整结构稿见 `docs/planning/brand/ForgeNerve官网完整落地结构稿.md`。
发布公告草案见 `docs/planning/brand/ForgeNerve品牌升级公告.md`。
应用启动页文案层级见 `docs/planning/brand/ForgeNerve应用启动页文案层级.md`。
发布准备清单见 `docs/tech_notes/release-checklist.md`。
CI 触发策略见 `docs/tech_notes/release-ci-strategy.md`。
发布文案包见 `docs/tech_notes/release-launch-pack.md`。
发版当天操作单见 `docs/tech_notes/release-day-runbook.md`。
Landing React 页面入口见 `frontend/landing.html`。
Landing 静态预览页见 `frontend/public/forgenerve-landing-preview.html`。

### 4. 运行测试

浏览器态 E2E 继续覆盖 HTTP fallback 路径：

```bash
python -m pip install playwright
python -m playwright install --with-deps chromium
cargo build -p memoforge-http -p memoforge-mcp
python3 tests/frontend_e2e.py
python3 tests/frontend_ops_e2e.py
python3 tests/mcp_e2e.py
```

桌面态 E2E 会实际启动 Tauri 应用，覆盖 `tauri.ts` 的桌面命令分支与内嵌 SSE：

```bash
python -m pip install selenium
cargo install tauri-driver --locked
cd frontend && npm run build && cd ..
cargo build -p memoforge-tauri
xvfb-run -a python3 tests/tauri_desktop_e2e.py
```

说明：
- 官方 Tauri WebDriver 目前只支持 Linux 和 Windows；macOS 没有可用的 WKWebView driver，因此本仓库把桌面 E2E 放在 Linux 与 Windows CI 上执行。
- `tests/tauri_desktop_e2e.py` 当前覆盖 Welcome Flow 的导入/模板创建/clone、工作台里的知识图谱打开与节点选择、编辑保存、设置页、Markdown 导入、Git commit/push、知识库切换、桌面 readonly 模式，以及 Agent draft 的提交/丢弃路径。
- 这条桌面 E2E 还会校验 GUI 与内嵌 MCP `get_editor_state` 的状态同步，包括当前知识库、当前知识、文本选区与清空选区；CI 失败时会上传 `test-artifacts/tauri-desktop-e2e/` 下的截图、DOM 和日志。
- GitHub Actions 手动触发时支持 `ci_scope` 输入：`full` 跑完整流水线，`desktop-e2e-only` 只跑 Linux/Windows 桌面 E2E。
- CI 与桌面 E2E 的运行/排障说明见 `docs/tech_notes/ci-desktop-e2e.md`。

如果你只想排查桌面链路，直接在 GitHub 页面按下面路径操作：

1. 打开仓库的 `Actions` 页面，选择 `CI` workflow。
2. 点击右上角 `Run workflow`。
3. 在 `ci_scope` 里选择 `desktop-e2e-only`。
4. 触发后只会跑 `desktop-e2e-linux` 和 `desktop-e2e-windows` 两个 job。

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
| `list_inbox_items` | 列出 Inbox 候选项 |
| `create_inbox_item` | 创建 Inbox 候选项 |
| `promote_inbox_item_to_draft` | 将 Inbox item 转为 Draft |
| `dismiss_inbox_item` | 忽略 Inbox item |
| `start_agent_session` | 启动 Agent 会话 |
| `append_agent_session_context` | 向会话追加上下文 |
| `list_agent_sessions` | 列出会话 |
| `get_agent_session` | 获取会话详情 |
| `complete_agent_session` | 完成会话 |
| `list_reliability_issues` | 列出可靠性问题 |
| `get_reliability_issue_detail` | 获取可靠性问题详情 |
| `create_fix_draft_from_issue` | 从可靠性问题创建修复 Draft |
| `list_context_packs` | 列出 Context Pack |
| `create_context_pack` | 创建 Context Pack |
| `get_context_pack` | 获取 Context Pack 详情 |
| `export_context_pack` | 导出 Context Pack |

### 写入操作
| 工具 | 说明 |
|------|------|
| `create_knowledge` | 创建知识 (Legacy) |
| `update_knowledge` | 更新知识内容 (Legacy) |
| `update_metadata` | 更新元数据 (Legacy) |
| `delete_knowledge` | 删除知识 |
| `move_knowledge` | 移动知识到其他分类 |
| `git_commit` | 提交更改 |
| `git_pull` / `git_push` | 同步远程 |

### Draft 草稿流（推荐 Agent 写入方式）

Draft 流让 Agent 以小步、结构化、可预览的方式写入知识，替代整篇替换模式。

**推荐工作流**：

```
1. read_knowledge(path, level="L1")     — 先读取目标知识（了解现有结构）
2. start_draft(path, metadata)          — 创建草稿
3. update_draft(draft_id, op="append_section", heading="...", content="...")  — 逐段写入
4. update_draft(draft_id, op="replace_section", heading="...", content="...") — 修改指定 section
5. preview_draft(draft_id)              — 预览变更摘要
6. commit_draft(draft_id)               — 提交到知识库
```

| 工具 | 说明 |
|------|------|
| `read_knowledge` | 统一读取接口，支持 section 级读取 |
| `start_draft` | 创建草稿（新知识或已有知识） |
| `update_draft` | 对草稿应用操作（append/replace/remove section, update metadata） |
| `preview_draft` | 预览变更 diff 和风险提示 |
| `commit_draft` | 提交草稿到知识库（带冲突检测） |
| `discard_draft` | 丢弃草稿 |

**审阅流程**：

当 Agent 通过 Draft 创建或修改知识时，变更会进入 Review 队列等待审阅：

1. Agent 创建 Draft
2. 变更出现在 **Review 待审阅** 面板
3. 用户在桌面端预览 diff、检查变更
4. 用户选择：
   - **确认提交**：变更写入知识库
   - **退回修改**：返回 Agent 修改建议（需后端支持）
   - **丢弃变更**：忽略此次 Draft

**Inbox 流程**：

Agent 也可以先创建候选项进入 Inbox：

1. Agent 创建 Inbox item（`create_inbox_item`）
2. 候选项出现在 **Inbox 收件箱** 面板
3. 用户选择：
   - **转为 Draft**：进入审阅流程
   - **忽略**：丢弃候选项

**为什么用 Draft 流**：
- 大文档分段写入，不会一次生成过长 Markdown 导致格式错误
- 提交前可预览，用户可在桌面端确认
- 冲突检测：如果源文件在草稿期间被修改，提交会返回冲突提示而非覆盖
- 审阅机制：Agent 的写入先进入 Review 队列，确保用户掌握最终确认权
- 旧工具（`create_knowledge` / `update_knowledge`）继续可用，但推荐长内容用 Draft 流

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
│   ├── InboxPanel.tsx      # Inbox 面板
│   ├── AgentSessionPanel.tsx  # 会话面板
│   ├── ReviewPanel.tsx     # 审阅面板
│   ├── ReliabilityDashboardPanel.tsx  # 可靠性面板
│   ├── ContextPackPanel.tsx  # Context Pack 面板
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
- 📥 **Inbox 收件箱** - Agent 创建的候选项审阅
- 💬 **Sessions 会话** - Agent 工作会话追踪
- ✅ **Review 审阅** - Draft 变更预览与确认
- 🔍 **Reliability Dashboard** — 知识质量规则扫描与修复
- 📦 **Context Packs** — 知识切片打包与 Agent 会话复用

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
- [规划文档目录](docs/planning/README.md) - 当前版本、历史归档、品牌文案的总导航

### 当前权威版本：v0.3.0

- [ForgeNerve v0.3.0 文档索引](docs/planning/releases/v0.3.0/ForgeNerve-v0.3.0-文档索引.md) - 当前版本开发前文档总导航
- [ForgeNerve v0.3.0 差异化战略](docs/planning/releases/v0.3.0/ForgeNerve-v0.3.0-差异化战略.md) - 新版本竞争力与品类战略
- [ForgeNerve v0.3.0 产品需求文档](docs/planning/releases/v0.3.0/ForgeNerve-v0.3.0-产品需求文档.md) - 新版本核心功能范围与验收目标
- [ForgeNerve v0.3.0 技术方案](docs/planning/releases/v0.3.0/ForgeNerve-v0.3.0-技术方案.md) - Inbox / Session / Reliability / Context Pack 技术落地
- [ForgeNerve v0.3.0 开发计划](docs/planning/releases/v0.3.0/ForgeNerve-v0.3.0-开发计划.md) - Sprint 规划与 Claude Code Agent Teams 分工
- [ForgeNerve v0.3.0 任务清单](docs/planning/releases/v0.3.0/ForgeNerve-v0.3.0-任务清单.md) - 可直接进入 issue / 任务系统的待办清单
- [ForgeNerve v0.3.0 开发前准备清单](docs/planning/releases/v0.3.0/ForgeNerve-v0.3.0-开发前准备清单.md) - 开工前总入口与 TODO List
- [ForgeNerve v0.3.0 决策冻结清单](docs/planning/releases/v0.3.0/ForgeNerve-v0.3.0-决策冻结清单.md) - 范围、模型边界、MCP 契约冻结项
- [ForgeNerve v0.3.0 数据模型与状态机](docs/planning/releases/v0.3.0/ForgeNerve-v0.3.0-数据模型与状态机.md) - Core / MCP / Desktop 共用的数据模型与状态机事实源
- [ForgeNerve v0.3.0 MCP 契约矩阵](docs/planning/releases/v0.3.0/ForgeNerve-v0.3.0-MCP契约矩阵.md) - MCP 工具、profile 与 request/response 冻结表
- [ForgeNerve v0.3.0 依赖矩阵](docs/planning/releases/v0.3.0/ForgeNerve-v0.3.0-依赖矩阵.md) - Sprint 1 并行依赖、阻塞关系与合并门槛
- [ForgeNerve v0.3.0 桌面接口冻结表](docs/planning/releases/v0.3.0/ForgeNerve-v0.3.0-桌面接口冻结表.md) - Tauri command 与前端 service 的冻结接口表
- [ForgeNerve v0.3.0 Sprint 1 任务拆解](docs/planning/releases/v0.3.0/ForgeNerve-v0.3.0-Sprint1任务拆解.md) - 第一阶段 issue 级任务拆解
- [ForgeNerve v0.3.0 Sprint 1 验收矩阵](docs/planning/releases/v0.3.0/ForgeNerve-v0.3.0-Sprint1验收矩阵.md) - Sprint 1 最小闭环的完成定义
- [ForgeNerve v0.3.0 测试与验收计划](docs/planning/releases/v0.3.0/ForgeNerve-v0.3.0-测试与验收计划.md) - 测试矩阵与发布前验收标准
- [ForgeNerve v0.3.0 Agent Teams 提示词](docs/planning/releases/v0.3.0/ForgeNerve-v0.3.0-Agent%20Teams提示词.md) - Claude Code 多 Agent 执行提示词

### 历史归档

- [Agent协作增强与MCP精简方案](docs/planning/archive/Agent协作增强与MCP精简方案.md) - 早期 Agent 交互增强方案
- [Agent协作增强开发计划](docs/planning/archive/Agent协作增强开发计划.md) - 早期 Agent Sprint 规划
- [Agent协作增强 Sprint1 任务拆解](docs/planning/archive/Agent协作增强Sprint1任务拆解.md) - 早期 Agent issue 级拆解
- [Tauri 桌面应用下阶段特性规划](docs/planning/archive/Tauri桌面应用下阶段特性规划.md) - 早期桌面端增强规划
- [Tauri 桌面应用增强开发计划](docs/planning/archive/Tauri桌面应用增强开发计划.md) - 早期桌面端开发计划
- [Tauri 桌面应用 Epic 与任务拆解](docs/planning/archive/Tauri桌面应用Epic与任务拆解.md) - 早期桌面端任务拆解
- [规划与现状对齐说明](docs/planning/archive/规划与现状对齐说明.md) - 规划目标与代码现状差异说明

### 品牌与对外文案

- [ForgeNerve 品牌迁移方案](docs/planning/brand/ForgeNerve品牌迁移方案.md) - 品牌升级原则与迁移策略
- [ForgeNerve 品牌升级公告](docs/planning/brand/ForgeNerve品牌升级公告.md) - 对外公告草稿
- [ForgeNerve 官网首页文案](docs/planning/brand/ForgeNerve官网首页文案.md) - 官网 Hero 与主体文案
- [ForgeNerve 官网完整落地结构稿](docs/planning/brand/ForgeNerve官网完整落地结构稿.md) - 官网结构与内容编排
- [ForgeNerve 应用启动页文案层级](docs/planning/brand/ForgeNerve应用启动页文案层级.md) - 应用启动页层级与文案

## License

MIT
