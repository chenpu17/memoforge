# ForgeNerve vNext MCP 契约矩阵

> 版本: v0.1
> 日期: 2026-04-09
> 状态: 开工前冻结草案
> 关联文档:
> - [ForgeNerve-vNext技术方案](./ForgeNerve-vNext技术方案.md)
> - [ForgeNerve-vNext决策冻结清单](./ForgeNerve-vNext决策冻结清单.md)
> - [ForgeNerve-vNext Sprint1任务拆解](./ForgeNerve-vNext%20Sprint1任务拆解.md)

---

## 1. 文档目标

本文件用于给 vNext 新增 MCP tools 提供单一事实源。

冻结内容：

1. 工具名
2. 所属 Sprint
3. 暴露 profile
4. 最小 request / response
5. 主要副作用

---

## 2. Profile 冻结

### 2.1 支持的 profile

- `desktop-assisted`
- `generic-stdio`
- `legacy-full`

### 2.2 选择方式

统一逻辑字段为 `profile`。

- SSE 模式：通过 URL query `?profile=...`
- stdio 模式：通过 CLI 参数 `--profile <name>`

默认值：

- Tauri 内嵌 SSE：`desktop-assisted`
- 通用 CLI / Agent：`generic-stdio`

Sprint 1 说明：

- Sprint 1 中三个 profile 统一暴露同一组最小工具
- profile 差异化控制从 `S2+` 开始逐步引入

---

## 3. Sprint 1 最小工具集

| Tool | Sprint | Profile | Request 最小字段 | Response 最小字段 | 副作用 |
|---|---|---|---|---|---|
| `list_inbox_items` | S1 | `desktop-assisted`,`generic-stdio`,`legacy-full` | `status?`,`limit?` | `items[]` | 无 |
| `create_inbox_item` | S1 | `desktop-assisted`,`generic-stdio`,`legacy-full` | `title`,`source_type`,`content_markdown?`,`proposed_path?`,`linked_session_id?` | `item` | 新建 inbox 文件 |
| `promote_inbox_item_to_draft` | S1 | `desktop-assisted`,`generic-stdio`,`legacy-full` | `inbox_item_id`,`draft_title?` | `draft_id`,`inbox_item` | 创建 Draft，更新 inbox 状态 |
| `dismiss_inbox_item` | S1 | `desktop-assisted`,`generic-stdio`,`legacy-full` | `inbox_item_id`,`reason?` | `item` | 更新 inbox 状态为 ignored |
| `start_agent_session` | S1 | `desktop-assisted`,`generic-stdio`,`legacy-full` | `agent_name`,`goal`,`agent_source?`,`context_pack_ids?` | `session` | 新建 session 文件 |
| `append_agent_session_context` | S1 | `desktop-assisted`,`generic-stdio`,`legacy-full` | `session_id`,`context_item:{ref_type,ref_id,accessed_at,summary?}` | `session` | 追加单条 context item 并更新 session |
| `list_agent_sessions` | S1 | `desktop-assisted`,`generic-stdio`,`legacy-full` | `status?`,`limit?` | `items[]` | 无 |
| `get_agent_session` | S1 | `desktop-assisted`,`generic-stdio`,`legacy-full` | `session_id` | `session` | 无 |
| `complete_agent_session` | S1 | `desktop-assisted`,`generic-stdio`,`legacy-full` | `session_id`,`result_summary?`,`status?` | `session` | 结束 session |

---

## 4. 复用现有 Draft 工具

Sprint 1 继续复用现有 Draft 工具，不新增别名：

| Tool | 用途 | 说明 |
|---|---|---|
| `start_draft` | 创建 Draft | 作为 `promote_inbox_item_to_draft` 的底层能力 |
| `update_draft` | 更新 Draft | 保持兼容 |
| `list_drafts` | 列出 Draft | Sprint 1 Review 通过桌面端复用 `list_drafts_cmd`，且返回值需带 `draft_context.review.state?` |
| `preview_draft` | 预览 Draft | 供桌面端 Review 消费 |
| `commit_draft` | 提交 Draft | Review 最终落库 |
| `discard_draft` | 丢弃 Draft | 与 Review 退回 / 丢弃联动 |

`promote_inbox_item_to_draft` 的冻结副作用补充为：

1. 创建 Draft
2. 更新 Inbox 状态为 `drafted`
3. 在 Draft 文件写入 `draft_context.review.state = pending`
4. 写入 `draft_context.review.source_inbox_item_id`
5. 若 Inbox 已关联 Session，则写入 `draft_context.review.source_session_id`

---

## 5. 后续扩展工具集

以下工具不属于 Sprint 1，进入后续阶段：

| Tool | 计划阶段 | 说明 |
|---|---|---|
| `promote_inbox_item_to_knowledge` | S2+ | 从 Inbox 直接进入正式知识 |
| `list_reliability_issues` | S3 | 问题列表 |
| `get_reliability_issue_detail` | S3 | 问题详情 |
| `create_fix_draft_from_issue` | S3 | 问题转修复草稿 |
| `list_context_packs` | S4 | Pack 列表 |
| `create_context_pack` | S4 | Pack 创建 |
| `get_context_pack` | S4 | Pack 详情 |
| `export_context_pack` | S4 | Pack 导出 |

---

## 6. 命名冻结规则

1. Tool 名统一使用动词开头的 snake_case
2. Session 一律使用 `agent_session`
3. Inbox 一律使用 `inbox_item`
4. 不在 Sprint 1 引入 `review_*` MCP tools
5. `Review` 由桌面端消费 Draft / Inbox / Session 聚合数据实现
6. `append_agent_session_context` 在 Sprint 1 只支持单条追加；批量写入留到后续阶段
7. `start_agent_session.context_pack_ids` 在 Sprint 1 允许字段存在，但为空或被忽略，不要求 Pack 校验

---

## 7. 错误返回冻结

最小错误码语义：

- `not_found`
- `invalid_state`
- `validation_error`
- `conflict`
- `internal_error`

要求：

1. 返回稳定的机器可读 `code`
2. 返回可读 `message`
3. 发生状态机错误时优先返回 `invalid_state`

---

## 8. 开工门槛

以下条件满足后，MCP Worker 才可正式开写：

- 本文件完成评审
- `ForgeNerve-vNext数据模型与状态机.md` 已冻结
- Sprint 1 任务拆解已绑定本文件
