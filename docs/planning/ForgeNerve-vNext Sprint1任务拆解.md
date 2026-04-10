# ForgeNerve vNext Sprint 1 任务拆解

> 版本: v0.1
> 日期: 2026-04-09
> 状态: Issue 级拆解草案
> 关联文档:
> - [ForgeNerve-vNext开发计划](./ForgeNerve-vNext开发计划.md)
> - [ForgeNerve-vNext决策冻结清单](./ForgeNerve-vNext决策冻结清单.md)

---

## 1. Sprint 1 目标

Sprint 1 的唯一目标是：

`建立 Inbox + Session + Draft 最小闭环的数据层与协议层`

不是做完整 GUI，也不是做全部运营能力。

---

## 2. 任务拆解

### S1-A：冻结数据模型

负责人建议：

- Core / Lead

任务：

1. 定义 `InboxItem`
2. 定义 `AgentSession`
3. 定义 `InboxStatus`
4. 定义 `SessionStatus`
5. 定义与 Draft 的关联字段

验收：

- 字段定义文档化
- 有最小序列化测试

### S1-B：实现 Inbox Store

负责人建议：

- Core Worker

任务：

1. 新增 `inbox.rs`
2. 新增持久化与索引逻辑
3. 实现 CRUD
4. 实现状态流转

验收：

- 可创建 / 查询 / 更新 / 删除
- 状态流转正确

### S1-C：实现 Session Store

负责人建议：

- Core Worker

任务：

1. 新增 `session.rs`
2. 实现 session 创建、追加上下文、结束
3. 记录 draft / inbox 关联

验收：

- 一个 session 可挂多个 draft / inbox item
- 状态可从 running → completed / failed

### S1-D：最小 MCP 契约

负责人建议：

- MCP Worker

任务：

1. `list_inbox_items`
2. `create_inbox_item`
3. `promote_inbox_item_to_draft`
4. `start_agent_session`
5. `append_agent_session_context`
6. `list_agent_sessions`
7. `get_agent_session`
8. `complete_agent_session`

验收：

- 工具描述面向 Agent 清晰
- 与现有 Draft 工具不冲突

### S1-E：桌面端最小接线

负责人建议：

- Desktop / Frontend Worker

任务：

1. 设置页或调试入口增加 Inbox / Session 数据查看占位
2. 前端 service 层增加对应调用
3. 冻结 Session 列表读取链路
4. 不追求完整正式 UI，只验证链路打通

验收：

- 桌面端可读取 inbox / session 列表

### S1-G：Review 占位与文档同步

负责人建议：

- Desktop / QA / Lead

任务：

1. 提供最小 Review 入口
2. 复用 `listDrafts()` 筛出 `review_state=pending` 的 Draft
3. 复用 `getDraftPreview()` 进入 Draft 预览入口
4. README / help / 文档索引同步 Sprint 1 口径

验收：

- Review 入口能展示 `pending` Draft 列表
- 点击可进入 Draft diff / 预览入口
- 文档口径与验收矩阵一致

### S1-F：测试基线

负责人建议：

- QA Worker

任务：

1. Inbox store 单测
2. Session store 单测
3. MCP E2E 最小闭环
4. 桌面端接口 smoke test

验收：

- 至少覆盖“创建 Inbox → 转 Draft → 创建 Session → 关联结果”

---

## 3. 依赖顺序

建议顺序：

1. `S1-A 数据模型`
2. `S1-B Inbox Store` 与 `S1-C Session Store`
3. `S1-D MCP 契约`
4. `S1-E 桌面端最小接线`
5. `S1-G Review 占位与文档同步`
6. `S1-F 测试基线`

---

## 4.1 关键路径

关键路径为：

`S1-A -> (S1-B + S1-C) -> S1-D -> S1-E/S1-G -> S1-F`

说明：

- `Inbox Store` 与 `Session Store` 超期会直接阻塞 MCP 与桌面端
- `S1-F` 只有在前面最小闭环打通后才有意义

---

## 4.2 Sprint 1 兜底线

如果 Sprint 1 无法在预期时间内完成全部目标，最低保底为：

1. Inbox 可落库
2. Session 可落库
3. MCP 最小链路可调用
4. Review / 桌面端接线可顺延到 Sprint 2 初

---

## 5. Worker 分工建议

### Lead

- 只管契约、评审、合并

### Worker 1：Core

- `memoforge-core/src/inbox.rs`
- `memoforge-core/src/session.rs`
- 模型与状态机

### Worker 2：MCP

- `memoforge-mcp/src/tools.rs`
- 相关 profile / 契约适配

### Worker 3：Desktop / Frontend

- `memoforge-tauri`
- `frontend/src/services/tauri.ts`
- 最小 UI 接线

### Worker 4：QA

- 单测
- E2E
- smoke 验证

---

## 6. Sprint 1 完成定义

Sprint 1 完成不看 UI 丰富度，只看闭环是否成立：

1. Inbox 可落库
2. Session 可落库
3. Inbox 可转 Draft
4. Session 可关联上下文与结果
5. MCP 可调用这些能力
6. 有自动化测试兜底
