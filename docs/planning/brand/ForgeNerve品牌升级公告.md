# ForgeNerve 品牌升级公告

> 日期: 2026-04-09
> 状态: 草案
> 用途: 发布说明 / 官网公告 / 社媒长文 / GitHub Release

---

## 1. 长版公告

今天，我们决定将 `MemoForge` 升级为新品牌：`ForgeNerve`。

这不是一次方向调整，而是一次更清晰的定位升级。

随着产品逐步从“AI 驱动的知识管理工具”演进到“面向开发者与 AI Agent 的知识操作系统”，原有名称已经越来越难完整承载我们的产品形态。一方面，`MemoForge` 已出现公开重名风险；另一方面，我们正在构建的也早已不只是一个 memo 工具，而是一个：

- 本地优先的知识工作台
- Git 原生的知识协作层
- 支持 MCP 接入的 Agent 工作环境
- 可审阅、可确认、可回滚的 AI 写入系统

`ForgeNerve` 更准确地表达了这条路线：

- `Forge` 代表构建、工程化、开发者工具气质
- `Nerve` 代表上下文流、知识连接和人与 Agent 的协作神经系统

从今天起，对外品牌叙事将逐步切换到 `ForgeNerve`。

需要特别说明的是，这一轮是**品牌迁移**，不是**技术栈重命名**。在兼容期内，仓库中的 crate 名、CLI 名、环境变量前缀以及 `.memoforge` 运行时目录仍将继续保留，以避免影响现有脚本、CI、MCP 客户端配置和用户知识库。

这意味着：

- 你的现有使用方式不会被破坏
- 现有 `memoforge` CLI 与 MCP 接入方式保持不变
- 现有知识库目录结构保持不变
- 文档、欢迎页、标题栏和对外介绍会逐步切换到 `ForgeNerve`

我们的目标没有改变，反而变得更明确了：

> 把 ForgeNerve 打造成开发者团队与 AI Agent 的知识操作系统。

接下来几个版本，我们将重点推进：

- 更稳的 Agent Draft 工作流
- 更好的上下文检索与知识消费体验
- 更完整的桌面工作台与审阅路径
- 更强的 Git 协作与对外分享能力

感谢你一路以来对项目的关注和反馈。这个新名字不是重新开始，而是让我们更准确地命名已经在发生的事情。

欢迎来到 `ForgeNerve`。

---

## 2. 短版公告

`MemoForge` 正式进入品牌升级阶段，新品牌为 `ForgeNerve`。

这是一次品牌与定位升级，不影响现有 CLI、MCP 配置和知识库目录。我们会继续保留 `memoforge-*` 与 `.memoforge` 作为兼容层，同时逐步将对外品牌切换为：

`ForgeNerve — The Agent Knowledge OS for Developers`

---

## 3. GitHub Release 版本

### 标题

`Brand Update: MemoForge is becoming ForgeNerve`

### 正文

`MemoForge` is entering a brand transition and will gradually become `ForgeNerve`.

Why this change:

- the old name has public naming conflict risk
- the product has evolved beyond a memo tool
- the new brand better represents our direction: a Git-native knowledge OS for developers and AI agents

What does not change:

- existing `memoforge` CLI and MCP workflows
- existing `.memoforge` runtime paths
- existing knowledge base structure and compatibility

What changes now:

- README and user-facing copy
- desktop welcome and titlebar branding
- product positioning and release narrative

ForgeNerve is the next step in making this product the knowledge operating system for AI-native development workflows.

---

## 4. 社媒短帖

### 中文

我们将 `MemoForge` 升级为新品牌：`ForgeNerve`。

新名字，更准确的方向：
面向开发者与 AI Agent 的知识操作系统。

品牌升级不影响现有 CLI、MCP 配置和知识库结构。

`ForgeNerve`
`The Agent Knowledge OS for Developers`

### 英文

`MemoForge` is becoming `ForgeNerve`.

Same product direction, clearer positioning:
the Agent Knowledge OS for developers.

No breaking change to existing CLI, MCP config, or knowledge base structure.

---

## 5. FAQ

### Q1：这是改产品方向了吗？

不是。方向没有变，只是品牌表达更清晰。

### Q2：会影响现有知识库吗？

不会。知识库结构和 `.memoforge` 目录在兼容期内保持不变。

### Q3：CLI 会改成 `forgenerve` 吗？

这一轮不会。当前只做对外品牌迁移，技术标识是否迁移会在后续单独评估。

### Q4：MCP 配置要改吗？

这一轮不需要。现有 `memoforge` 的接入方式继续有效。
