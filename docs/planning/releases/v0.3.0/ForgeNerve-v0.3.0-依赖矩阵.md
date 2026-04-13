# ForgeNerve v0.3.0 依赖矩阵

> 目标版本: v0.3.0
> 日期: 2026-04-12
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
| 现状校准 | 当前能力盘点、差异清单 | 无 | 主 agent | 全员 | 无 | 对齐结论完成 |
| 模型冻结 | `WorkflowTemplate`,`ReviewItem`,`EvidenceMeta`,`FreshnessPolicy` | 现状校准 | 主 agent | subagent / QA | 无 | 字段评审通过 |
| 契约冻结 | MCP / Tauri / frontend 最小新增边界 | 模型冻结 | 主 agent | subagent / QA | 模型稳定后可并行 | 契约评审通过 |
| 回归基线 | 现有工作流回归用例 | 现状校准 | QA 或验证 subagent | 主 agent | 从首日跟随 | 自动化通过 |
| 文档同步 | README / help / active docs | 模型冻结 + 契约冻结 | 主 agent | 全员 | 全程跟随 | 链接与口径检查 |
| CI / 验证流水线 | 测试命令、检查步骤、门禁规则 | 回归基线 + 文档同步 | 主 agent + QA | 全员 | 可与契约冻结并行 | 本地与 CI 命令一致 |

---

## 3. 阶段阻塞关系

主阻塞链：

`现状校准 -> 模型冻结 -> 契约冻结 -> 文档同步 -> 回归 / E2E`

补充关系：

- `现状校准 -> 回归基线`
- `模型冻结 -> MCP / Desktop 契约`
- `契约冻结 -> README / help`

---

## 4. 后续阶段依赖

| 阶段 | 核心能力 | 主要前置 |
|---|---|---|
| Sprint 2 | Workflow Templates / Playbooks | Sprint 1 校准与契约冻结完成 |
| Sprint 3 | Unified Review Queue | Sprint 2 模板结果可回写 Draft / Session / Inbox |
| Sprint 4 | Evidence-backed Knowledge + Freshness | Sprint 3 Review 收口稳定 |
| Sprint 5 | Context Reuse Polish + 发布收口 | 前 4 个 Sprint 验收通过 |

---

## 5. 团队并行规则

1. 主 agent 先冻结模型与契约，再决定是否拉起 subagent
2. 数据模型以主 agent 最终冻结版本为准
3. MCP 不得自行扩展字段或继续堆低层 tool
4. Desktop 不得先造新状态机
5. QA 或验证 subagent 可以在契约草案阶段先写失败测试

---

## 6. 合并门槛

每个模块合并前至少满足：

1. 依赖项已标记完成
2. 对应自动化测试已补
3. 文档口径未偏离冻结清单
4. 未越界到非本 Sprint 范围
