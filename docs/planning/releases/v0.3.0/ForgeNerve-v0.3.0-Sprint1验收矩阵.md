# ForgeNerve v0.3.0 Sprint 1 验收矩阵

> 目标版本: v0.3.0
> 日期: 2026-04-09
> 文档类型: Sprint 验收矩阵
> 状态: 待确认
> 关联文档:
> - [ForgeNerve-v0.3.0 Sprint1任务拆解](./ForgeNerve-v0.3.0-Sprint1任务拆解.md)
> - [ForgeNerve-v0.3.0测试与验收计划](./ForgeNerve-v0.3.0-测试与验收计划.md)
> - [ForgeNerve-v0.3.0 MCP契约矩阵](./ForgeNerve-v0.3.0-MCP%E5%A5%91%E7%BA%A6%E7%9F%A9%E9%98%B5.md)

---

## 1. Sprint 1 唯一目标

建立 `Inbox + Session + Draft` 的最小闭环，不以完整 GUI、Reliability、Context Pack 为验收对象。

---

## 2. 验收矩阵

| 验收项 | 场景 | 层级 | 通过标准 |
|---|---|---|---|
| A1 数据模型冻结 | `InboxItem` / `AgentSession` / `DraftLink` 字段可落文档 | 文档评审 | Lead 明确认可 |
| A2 Inbox 落库 | 创建、查询、更新、忽略 Inbox item | Rust 单测 | 主状态流转通过 |
| A3 Session 落库 | 创建、追加上下文、结束 Session | Rust 单测 | `running -> completed/failed` 正常 |
| A4 Inbox 转 Draft | 从 Inbox 生成 Draft，并写回关联 | MCP E2E | 返回 `draft_id` 且 inbox 状态变更 |
| A5 Session 关联结果 | Session 关联 context / draft / inbox | MCP E2E | `get_agent_session` 返回完整关联，`list_agent_sessions` 可列出 session |
| A6 Desktop 最小可见 | 桌面端能看到 Inbox / Session 列表 | Tauri smoke | 可成功读取并展示基础列表 |
| A7 Review 最小投影 | 桌面端能基于 Draft 做待确认展示 | Tauri smoke | Review 入口可展示 `status=pending` 的 Draft 列表，点击可查看 diff / 预览 |
| A8 文档同步 | README / help / 文档索引口径一致 | 文档检查 | 无冲突描述 |

---

## 3. 不属于 Sprint 1 的验收项

以下能力不作为 Sprint 1 完成标准：

- Reliability Dashboard
- Reliability issue 转修复 Draft
- Context Pack 创建 / 导出
- Team Publish
- 批量复杂处理流

---

## 4. 必测链路

### 链路 S1-1：最小 Agent 写入闭环

1. 创建 Session
2. 创建 Inbox item
3. Inbox 转 Draft
4. Session 关联上下文与结果
5. 桌面端读取最小结果

### 链路 S1-2：最小 Review 可见化

1. 基于现有 Draft 创建待确认变更
2. 桌面端进入 Review 占位入口
3. 能看到 Draft 预览入口

---

## 5. 发布门槛

Sprint 1 可宣布完成，至少满足：

1. Rust 单测通过
2. MCP 最小 E2E 通过
3. Desktop smoke 通过
4. 文档口径已更新
5. 未引入非 Sprint 1 范围代码
