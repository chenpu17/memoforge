# ForgeNerve 官网完整落地结构稿

> 日期: 2026-04-09
> 状态: 提案
> 适用范围: 官网首页 / 发布页 / 产品介绍页

---

## 1. 页面目标

官网首页要完成 4 件事：

1. 让用户在 5 秒内知道 ForgeNerve 是什么
2. 让开发者理解它与普通笔记工具的差异
3. 让 Agent 用户理解 MCP + Draft + 审阅闭环
4. 让潜在贡献者和早期用户愿意立即试用

---

## 2. 页面结构

### Section 1: Hero

- 标题：`ForgeNerve`
- 副标题：`The Agent Knowledge OS for Developers`
- 描述：`A Git-native workspace where humans and AI agents collaborate on knowledge safely.`
- 主按钮：`Get Started`
- 次按钮：`View on GitHub`
- 辅助入口：`Connect via MCP`
- 信任短句：
  - `Local-first`
  - `Git-native`
  - `MCP-ready`
  - `Reviewable agent writes`

### Section 2: Problem

- 标题：`AI can write code fast. Knowledge is still the hard part.`
- 描述：
  - 传统笔记工具不面向 Agent 设计
  - 大文档写入容易失败
  - 缺少可审阅、可回滚、可确认的 AI 写入路径
  - Git 协作与知识流没有真正打通

### Section 3: Why ForgeNerve

- 标题：`Built for developer workflows, not generic note-taking`
- 四张卡片：
  - `Git-native storage`
  - `MCP access for agents`
  - `Draft-based safe writing`
  - `Desktop review and approval`

### Section 4: Workflow

- 标题：`How it works`
- 三步流程：
  1. `Connect Claude Code or OpenCode through MCP`
  2. `Let the agent read context and prepare draft changes`
  3. `Review, approve, and sync changes in ForgeNerve`

### Section 5: Product Proof

- 标题：`What already exists`
- 建议展示：
  - Tauri desktop app
  - SSE + stdio MCP
  - Draft workflow
  - Knowledge graph
  - Git integration
  - Desktop E2E coverage

### Section 6: Differentiation

- 标题：`Why not just use Notion or Obsidian?`
- 对比维度：
  - Agent safe write
  - Git-native collaboration
  - Local-first control
  - MCP-native integration
  - Review path for AI changes

### Section 7: CTA

- 标题：`Start building your team's agent memory layer`
- 描述：`Use ForgeNerve as the knowledge operating system behind your AI-native workflow.`
- 按钮：
  - `Start with Desktop App`
  - `Read the Docs`
  - `Configure MCP`

---

## 3. 视觉层级建议

### Hero

- Logo / wordmark
- 大标题
- 1 行副标题
- 1 段价值陈述
- 双按钮
- 能力标签

### Problem / Why

- 用“开发者痛点”说话，不要用泛产品话术
- 少讲“知识管理”，多讲“Agent 协作失败成本”

### Proof

- 不要空谈 roadmap
- 直接展示：
  - MCP endpoint
  - 桌面界面截图
  - Draft 预览图
  - 知识图谱图
  - E2E / CI 截图或 badge

---

## 4. 建议的页面语气

- 像开发者产品，不像消费级工具
- 少形容词，多机制描述
- 少“效率革命”，多“安全写入、可审阅、Git 原生”

建议关键词：

- `safe`
- `reviewable`
- `local-first`
- `Git-native`
- `agent-ready`
- `context-aware`

---

## 5. 首页最小 MVP

如果本轮官网资源有限，至少先做：

1. Hero
2. Why ForgeNerve
3. Workflow
4. Product Proof
5. CTA

这 5 块已经足够建立产品心智。

