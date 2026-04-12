# ForgeNerve v0.3.0 依赖矩阵

> 目标版本: v0.3.0
> 日期: 2026-04-09
> 文档类型: 依赖矩阵
> 状态: 待确认
> 关联文档:
> - [ForgeNerve-v0.3.0开发计划](./ForgeNerve-v0.3.0-开发计划.md)
> - [ForgeNerve-v0.3.0 Sprint1任务拆解](./ForgeNerve-v0.3.0-Sprint1任务拆解.md)
> - [ForgeNerve-v0.3.0测试与验收计划](./ForgeNerve-v0.3.0-测试与验收计划.md)

---

## 1. 文档目标

本文件用于明确：

1. 哪些模块可以并行
2. 哪些任务存在阻塞关系
3. 每个阶段的生产者 / 消费者是谁
4. 哪个测试门槛卡住合并

---

## 2. Sprint 1 依赖矩阵

| 模块 | 主要产出 | 前置依赖 | 生产者 | 消费者 | 并行条件 | 最小测试门槛 |
|---|---|---|---|---|---|---|
| 数据模型冻结 | `InboxItem`,`AgentSession`,`DraftLink` | 无 | Lead + Core | MCP / Desktop / QA | 无 | 字段评审通过 |
| Inbox Store | `inbox.rs`,`inbox_store.rs` | 数据模型冻结 | Core | MCP / QA | 可与 Session Store 并行 | Store 单测 |
| Session Store | `session.rs`,`session_store.rs` | 数据模型冻结 | Core | MCP / Desktop / QA | 可与 Inbox Store 并行 | Store 单测 |
| MCP 最小契约 | S1 tools | 数据模型冻结 + Store 接口 | MCP | Desktop / QA | Store 接口稳定后可并行 | MCP smoke / contract test |
| Desktop 最小接线 | Inbox / Session 只读占位 | MCP 最小契约 | Desktop | QA | 以 mock 或早期 contract 并行 | 最小 UI smoke |
| Review 接线 | Draft 聚合显示 | MCP 最小契约 + 现有 Draft API | Desktop | QA | 与 Inbox / Session 接线并行 | 预览链路 smoke |
| 测试基线 | 单测 / MCP E2E / Desktop smoke | 各模块最小闭环 | QA | Lead | 从首日跟随 | 自动化通过 |
| 文档同步 | README / help / 开发文档 | 契约与范围冻结 | Lead + QA | 全员 | 全程跟随 | 链接与口径检查 |
| CI / 验证流水线 | 测试命令、检查步骤、门禁规则 | 测试基线 + 文档同步 | QA + Lead | 全员 | 可与 UI / MCP 并行 | 本地与 CI 命令一致 |

---

## 3. 阶段阻塞关系

主阻塞链：

`数据模型冻结 -> Store -> MCP 契约 -> Desktop 接线 -> E2E`

补充关系：

- `数据模型冻结 -> 测试基线`
- `MCP 契约 -> README / help`
- `Review 接线` 依赖现有 Draft 接口，不依赖 Reliability

---

## 4. 后续阶段依赖

| 阶段 | 核心能力 | 主要前置 |
|---|---|---|
| Sprint 2 | Review 完整闭环 + Session 可见化 | Sprint 1 最小闭环 |
| Sprint 3 | Reliability Dashboard | Sprint 1 Draft / Session 关联稳定 |
| Sprint 4 | Context Pack Foundation | Sprint 1 Session 模型稳定 |
| Sprint 5 | 发布收口 | 前 4 个 Sprint 验收通过 |

---

## 5. 团队并行规则

1. Lead 先冻结模型与契约，再允许 Worker 开大分支
2. Core 拥有数据模型事实源
3. MCP 不得自行扩展字段
4. Desktop 不得先造新状态机
5. QA 可以在契约草案阶段先写失败测试

---

## 6. 合并门槛

每个模块合并前至少满足：

1. 依赖项已标记完成
2. 对应自动化测试已补
3. 文档口径未偏离冻结清单
4. 未越界到非本 Sprint 范围
