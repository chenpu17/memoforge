# ForgeNerve v0.3.0 Sprint 1 任务拆解

> 目标版本: v0.3.0
> 日期: 2026-04-12
> 文档类型: Sprint 任务拆解
> 状态: 待派工
> 关联文档:
> - [ForgeNerve-v0.3.0开发计划](./ForgeNerve-v0.3.0-开发计划.md)
> - [ForgeNerve-v0.3.0决策冻结清单](./ForgeNerve-v0.3.0-决策冻结清单.md)

---

## 1. Sprint 1 目标

Sprint 1 的唯一目标是：

`完成现状校准、模型冻结、MCP 收口和回归基线，为后续 Workflow / Review / Evidence / Freshness 实现做准备`

不是直接堆完整功能，也不是重新发明现有 GUI。

---

## 2. 任务拆解

### S1-A：现状校准

负责人建议：

- 主 agent

任务：

1. 盘点当前 `Inbox / Session / Review / Reliability / Packs` 基线
2. 标注“已存在能力”与“v0.3.0 真新增价值”
3. 对齐 README、release 口径与 active 规划文档

验收：

- 现状对齐结论完成
- 不再出现“已有能力被写成未来新增”的口径冲突

### S1-B：冻结核心模型

负责人建议：

- 主 agent

任务：

1. 冻结 `WorkflowTemplate`
2. 冻结 `ReviewItem`
3. 冻结 `EvidenceMeta`
4. 冻结 `FreshnessPolicy`
5. 定义 `ContextRef`
6. 明确 `EvidenceMeta / FreshnessPolicy` 的存储位置与默认继承
7. 明确 `Inbox / Session / DraftLink` 的兼容边界

验收：

- 字段定义文档化
- 新旧对象边界清晰

### S1-C：冻结最小契约

负责人建议：

- 主 agent，必要时配 1 个专项 subagent

任务：

1. 冻结 MCP tool surface 控制策略
2. 冻结 profile 暴露边界
3. 冻结 profile gate 实现路径
4. 冻结 Tauri / frontend 最小新增接口方向
5. 为 Sprint 2+ 高层工具补最小 request / response
6. 明确哪些能力继续复用现有 Draft / Inbox / Session tool

验收：

- 契约文档评审通过
- 明确默认不继续扩大全量 MCP 暴露面

### S1-D：文档同步

负责人建议：

- 主 agent + QA

任务：

1. README 同步 v0.3.0 口径
2. help / 设置页文案同步“工作流 + 审阅 + 证据 + 治理”主线
3. 文档索引、任务清单、验收矩阵口径对齐

验收：

- active 文档口径一致
- 不再出现“模块化清单叙事”和“用户工作流叙事”混写

### S1-E：测试基线

负责人建议：

- QA 或验证 subagent

任务：

1. 现有主干能力回归基线
2. MCP 推荐工具集回归
3. 文档与帮助入口检查

验收：

- 至少覆盖“现有工作台入口不回退 + Draft 主流程不回退 + MCP 推荐工作流不回退”

---

## 3. 依赖顺序

建议顺序：

1. `S1-A 现状校准`
2. `S1-B 核心模型冻结`
3. `S1-C 最小契约冻结`
4. `S1-D 文档同步`
5. `S1-E 测试基线`

---

## 4.1 关键路径

关键路径为：

`S1-A -> S1-B -> S1-C -> S1-D -> S1-E`

说明：

- 如果 `S1-A` 现状校准不做，后续文档与实现会继续建立在错误版本叙事上
- `S1-C` 必须把 MCP tool surface 一起收口，否则 Agent 侧复杂度会继续失控
- `S1-E` 只有在前面口径和契约冻结后才有稳定意义

---

## 4.2 Sprint 1 兜底线

如果 Sprint 1 无法在预期时间内完成全部目标，最低保底为：

1. 当前基线能力与新版本定位已对齐
2. 核心模型已冻结
3. MCP tool surface 控制策略已冻结
4. 桌面接口预留方向已冻结
5. README / help / 文档索引口径已同步

---

## 5. Subagent 分工建议

### 主 agent

- 负责现状校准、契约、评审、合并

### Subagent A：专项核查或实现

- 可承担 Workflow / Review / Evidence / Freshness 中一个清晰子问题
- 或承担 `memoforge-mcp/src/tools.rs` 的 MCP 收口专项

### Subagent B：独立验证

- 回归测试
- E2E
- smoke 验证

---

## 6. Sprint 1 完成定义

Sprint 1 完成不看功能多少，只看边界是否收口：

1. 当前基线已盘点清楚
2. 核心模型已冻结
3. MCP tool surface 已收口
4. 文档口径一致
5. 有自动化回归兜底
