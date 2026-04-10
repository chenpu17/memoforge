# MemoForge Agent 协作增强开发计划

> 版本: v0.1
> 日期: 2026-04-08
> 状态: 执行计划草案
> 关联文档:
> - [Agent协作增强与MCP精简方案](./Agent协作增强与MCP精简方案.md)
> - [开发计划文档](./开发计划文档.md)

---

## 1. 计划摘要

本计划面向 MemoForge 下一个重点迭代：增强 AI Agent 与知识库的协作效率和稳定性。

本阶段核心交付：

- Draft 草稿机制
- section 级写入能力
- 基于 tool profile 的推荐工具集精简
- 桌面端 Agent 草稿预览与确认
- 全链路测试与文档升级

建议按 4 个 Sprint 执行，每个 Sprint 保持“可运行、可验证、可回退”。

---

## 2. 里程碑

| 里程碑 | 目标 | 交付 |
|---|---|---|
| M1 | 协议与 core 落地 | 草稿数据结构 + core 文档操作 + MCP 最小草稿流 |
| M2 | 桌面端可见 | Draft 预览、提交、丢弃在 GUI 中可用 |
| M3 | Tool profile 与推荐工作流切换 | profile 开关、文档迁移、legacy 兼容、兼容期验证 |
| M4 | 发布级稳定性 | 回归测试、冲突处理、性能优化、发布说明 |

## 2.1 跨线依赖矩阵

Agent 线和 Tauri 桌面线存在明确阻塞关系：

| 上游 | 下游 | 依赖关系 |
|---|---|---|
| Agent Sprint 1 | Agent Sprint 2 | 没有最小 Draft 流，就没有桌面预览与确认 |
| Agent Sprint 1 | Tauri Sprint D | 桌面端 Agent 结果消费依赖 Draft 数据源与命令契约 |
| Tauri Sprint A / B / C | Tauri Sprint D | Agent 面板需要先有稳定的桌面壳、侧栏和设置承载位 |
| Agent Sprint 3 | 文档/帮助迁移 | Tool profile 与推荐工作流要等 profile 契约落地后再切文档默认说法 |

推荐执行顺序：

1. Agent Sprint 1
2. Tauri Sprint A / B / C 可并行推进
3. Agent Sprint 2 与 Tauri Sprint D 联动
4. Agent Sprint 3
5. 双线回归与发布

---

## 3. Sprint 规划

### Sprint 1: Core + 协议最小闭环

目标：

- 跑通不依赖前端的 draft 工作流

任务：

1. 新增 `draft.rs`
2. 新增 `document_ops.rs`
3. 在 core 中实现：
   - `start_draft`
   - `update_draft`
   - `preview_draft`
   - `commit_draft`
   - `discard_draft`
4. 在 MCP 中新增：
   - `read_knowledge`
   - `start_draft`
   - `update_draft`
   - `preview_draft`
   - `commit_draft`
   - `discard_draft`
5. 编写 core 单测与 MCP E2E

验收：

- 命令级可完成“创建草稿 -> 追加 section -> 预览 -> 提交”
- 不依赖桌面端即可验证正确性

### Sprint 2: Tauri + 前端预览

目标：

- 让用户在桌面端感知 Agent 草稿

任务：

1. Tauri commands:
   - `list_drafts_cmd`
   - `get_draft_preview_cmd`
   - `commit_draft_cmd`
   - `discard_draft_cmd`
2. SSE snapshot 扩展
3. 前端新增：
   - `AgentDraftPanel`
   - `DraftPreviewModal`
4. Toast 和右侧面板接入

验收：

- GUI 能显示待确认草稿
- GUI 可预览并确认提交

### Sprint 3: MCP Tool Profile 重构

目标：

- 在不破坏现有 MCP 合同的前提下，降低 Agent 选错工具的概率

任务：

1. 定义 `generic-stdio` / `desktop-assisted` / `legacy-full` 三类 tool profile
2. 增加显式 profile 选择入口
3. 保留 legacy/full profile
4. `list_tools()` 文档描述重写
5. README 与 MCP README 更新
6. 设置页与应用帮助补充推荐工作流
7. 更新并通过 tool list 相关回归测试

验收：

- profile 可显式选择，且未开启新 profile 时不破坏现有客户端
- `generic-stdio` 推荐工具集不超过 10 个主工具
- 新文档明确推荐 Draft 工作流

### Sprint 4: 稳定性与发布

目标：

- 达到可以发布和推广给真实 Agent 用户的质量

任务：

1. 冲突检测
2. 预览 diff 质量优化
3. 大文档性能测试
4. 回归测试
5. 发布文档和迁移说明

验收：

- 新旧接口均通过测试
- 大文档草稿写入稳定
- 冲突场景可解释、可恢复

---

## 4. 跨线依赖矩阵

Agent 线与 Tauri 线并行推进时存在以下显式依赖：

```
Agent S1 ──blocks──→ Agent S2 ──blocks──→ Agent S3 ──blocks──→ Agent S4
    │                                              ↑
    │                                              │
    └──────────── blocks ──────────────────────────┘
                       ↓
Tauri Sprint A → B → C ───────────────────→ Sprint D
                                              ↑
                                              └── Agent S1 必须完成
```

| 依赖关系 | 说明 |
|---------|------|
| Agent S1 → Agent S2 | S2 的桌面端 Draft Panel 依赖 S1 的 core Draft API 和 MCP Draft 工具 |
| Agent S1 → Tauri Sprint D | Sprint D 的 Agent Draft Panel 接入依赖 S1 的 Draft 最小闭环 |
| Agent S1 → Agent S3 | S3 的 tool profile 需要在 S1 新工具稳定后再切换默认值 |
| Tauri Sprint A-C → Sprint D | Sprint D 需要稳定的桌面壳和右侧面板扩展点 |

两条线可完全并行的区间：

- Agent S1 + Tauri Sprint A/B/C 互不依赖，可同时推进
- Agent S3（profile 重构）与 Tauri Sprint C 可并行

---

## 5. 工作流拆分

### Workstream A: Product & Protocol

负责：

- 产品行为定义
- MCP schema 定义
- 兼容策略
- 评审验收标准

输出：

- 协议草案
- tool profile 定义
- 用户路径说明

### Workstream B: Core Engine

负责：

- Draft 存储
- section 级文档操作
- 提交与冲突检测
- diff summary

输出：

- core API
- 单元测试

### Workstream C: MCP Server

负责：

- 新工具实现
- tool profile
- legacy 兼容
- MCP E2E

输出：

- 新 MCP handlers
- MCP schema 与文档

### Workstream D: Desktop Integration

负责：

- Tauri commands
- SSE 状态扩展
- 应用日志与诊断

输出：

- Desktop/MCP 联动

### Workstream E: Frontend UX

负责：

- Agent Draft Panel
- Preview Modal
- Toast/右栏改造
- 可视反馈

输出：

- 可交互的 Agent 草稿体验

### Workstream F: QA & Release

负责：

- 测试矩阵
- 回归验证
- 发布清单
- 文档一致性校验

输出：

- 回归报告
- 发布验收

---

## 5. Claude Code Agent Teams 建议编组

建议团队规模：1 个主控 Agent + 5 个执行 Agent。

### Team Lead: Planner / Integrator

职责：

- 维护总方案
- 控制接口契约
- 拆分任务
- 集成各 workstream 结果
- 决策兼容边界

### Worker 1: Core Storage

负责文件：

- `crates/memoforge-core/src/api.rs`
- `crates/memoforge-core/src/draft.rs`
- `crates/memoforge-core/src/document_ops.rs`

职责：

- Draft 数据结构
- 文档 section 操作
- 提交与冲突处理

### Worker 2: MCP Protocol

负责文件：

- `crates/memoforge-mcp/src/tools.rs`
- `crates/memoforge-mcp/src/main.rs`

职责：

- 新工具集
- default/full profile
- legacy 接口兼容

### Worker 3: Desktop Bridge

负责文件：

- `crates/memoforge-tauri/src/main.rs`
- 相关 desktop state / diagnostics 模块

职责：

- Draft commands
- SSE snapshot 扩展
- 桌面日志与联动

### Worker 4: Frontend Experience

负责文件：

- `frontend/src/components/RightPanel.tsx`
- `frontend/src/components/ToastNotifications.tsx`
- 新增 `AgentDraftPanel.tsx`
- 新增 `DraftPreviewModal.tsx`

职责：

- GUI 交互
- 草稿预览
- 用户确认流程

### Worker 5: QA / Test Automation

负责文件：

- `tests/mcp_e2e.py`
- `tests/frontend_ops_e2e.py`
- 前端组件测试
- core 单测

职责：

- 测试先行补齐
- 回归与发布验证

---

## 6. 并行开发策略

### 第一阶段可并行

- Worker 1: Core draft 能力
- Worker 2: MCP schema 草案与 handlers 骨架
- Worker 5: 测试夹具与 E2E 场景骨架

### 第二阶段可并行

- Worker 3: Tauri command 对接
- Worker 4: 前端面板与预览界面
- Worker 5: 桌面端 E2E 补齐

### 集成顺序

1. core API 定稿
2. MCP handlers 接 core
3. Tauri commands 接 core/MCP
4. 前端接 Tauri
5. QA 跑回归

---

## 7. 测试方案

### 7.1 Core 单测

必须覆盖：

- 创建草稿
- 追加 section
- 替换 section
- 删除 section
- 更新 metadata
- 预览 diff summary
- 提交草稿
- 冲突检测

### 7.2 MCP E2E

基于现有 `tests/mcp_e2e.py` 扩展：

- `start_draft -> update_draft -> preview_draft -> commit_draft`
- 非法 section
- 重复 heading
- 大文档多次 append
- 提交时文件已变更

### 7.3 前端测试

需要补：

- Agent Draft Panel 渲染
- Preview Modal 提交 / 丢弃
- Toast 触发与关闭
- 右栏 Agent tab 切换

### 7.4 前端 E2E

扩展现有 `tests/frontend_ops_e2e.py`：

- Agent 草稿出现在 GUI 中
- 用户预览草稿
- 用户确认提交
- 用户丢弃草稿
- 冲突提示出现

### 7.5 回归矩阵

必须保底回归：

- 旧 `create_knowledge`
- 旧 `update_knowledge`
- 旧 `update_metadata`
- 删除 / 移动 dry run
- Git commit / pull / push
- 多知识库切换

---

## 8. 风险与缓解

### 风险: Sprint 2 前端阻塞协议

缓解：

- Sprint 1 先把 core + MCP 跑通
- 前端只依赖稳定 command shape

### 风险: 旧 Agent 客户端仍使用旧工具

缓解：

- legacy handler 保留
- 文档先迁移，接口后迁移

### 风险: section 解析对非规范 Markdown 不稳

缓解：

- 第一阶段只围绕 heading section
- preview 阶段返回 warnings

### 风险: 大文档 draft 文件膨胀

缓解：

- 草稿只存当前稿和必要元信息
- 避免无界历史堆积

---

## 9. Definition of Done

### 9.1 协议线发布完成

满足以下条件才视为 Agent 协议线可独立发布：

1. Agent 能在不整篇重写的情况下完成长文档录入。
2. MCP tool profile 与推荐工作流完成收口，并文档化兼容策略。
3. 现有 MCP 调用方未被破坏。
4. 自动化测试覆盖 core、MCP 两层主路径。

### 9.2 桌面整合完成

满足以下条件才视为 Agent 桌面整合完成：

1. 用户能在桌面应用中看到、预览、确认或丢弃 Agent 草稿。
2. 自动化测试覆盖 GUI 主路径。

---

## 10. 建议下一步

建议按以下顺序启动：

1. 先完成 `MCP v2 schema 草案`
2. 然后拆 Sprint 1 的 core / mcp / test 三个并行子任务
3. Sprint 1 合并后再开始 GUI 接入
