# ForgeNerve v0.3.0 Sprint 1 验收矩阵

> 目标版本: v0.3.0
> 日期: 2026-04-12
> 文档类型: Sprint 验收矩阵
> 状态: 待确认
> 关联文档:
> - [ForgeNerve-v0.3.0 Sprint1任务拆解](./ForgeNerve-v0.3.0-Sprint1任务拆解.md)
> - [ForgeNerve-v0.3.0测试与验收计划](./ForgeNerve-v0.3.0-测试与验收计划.md)
> - [ForgeNerve-v0.3.0 MCP契约矩阵](./ForgeNerve-v0.3.0-MCP契约矩阵.md)

---

## 1. Sprint 1 唯一目标

完成 `现状校准 + 模型冻结 + MCP 收口 + 回归基线`，为后续实现阶段提供稳定起点。

---

## 2. Sprint 1 硬验收矩阵

| 验收项 | 场景 | 层级 | 通过标准 |
|---|---|---|---|
| A1 现状校准 | 当前主干能力与文档口径完成对齐 | 文档评审 | 主 agent 明确认可 |
| A2 模型冻结 | `WorkflowTemplate` / `ReviewItem` / `EvidenceMeta` / `FreshnessPolicy` / `ContextRef` 字段可落文档 | 文档评审 | 冻结文档通过 |
| A3 存储与默认值 | `EvidenceMeta / FreshnessPolicy` 存储位置、迁移默认值与 SLA 继承链明确 | 文档评审 | Core / MCP / Frontend 路径清晰 |
| A4 兼容边界 | `Inbox / Session / DraftLink / ContextPack` 的兼容角色明确 | 文档评审 | 无角色冲突 |
| A5 MCP 收口 | 推荐工具集、profile 边界、tool budget 与 gate 实现路径明确 | 契约评审 | 新 Agent 默认不走全量 tool 面 |
| A6 桌面接口预留 | Workflow / Governance 相关 command 方向已预留 | 接口评审 | Sprint 2 无需再补一轮命名争议 |
| A7 文档同步 | README / help / 文档索引 / active planning 口径一致 | 文档检查 | 无冲突描述 |
| A8 回归基线 | 现有主流程回归方案明确 | QA 评审 | 测试入口清晰可执行 |

---

## 3. 不属于 Sprint 1 的验收项

以下能力不作为 Sprint 1 完成标准：

- 完整 Workflow Template 启动体验
- Unified Review Queue 完整交互
- Evidence Meta 完整编辑能力
- Freshness SLA 完整闭环
- Pack Recommendation
- Team Publish

---

## 4. 必测链路

### 链路 S1-1：当前基线不回退

1. 现有工作台入口仍可打开
2. Draft 主流程仍可用
3. 现有 MCP 工作流仍可走通

### 链路 S1-2：收口结论可执行

1. 新模型字段可被前后端类型承接
2. MCP 推荐工具集明确
3. 文档与帮助能解释新版本主线

---

## 5. 发布门槛

Sprint 1 可宣布完成，至少满足：

1. 核心冻结文档通过评审
2. MCP 收口策略明确
3. 文档口径已更新
4. 回归基线已确认
5. 未引入非 Sprint 1 范围的实现漂移
