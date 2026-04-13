# ForgeNerve v0.3.0 桌面接口冻结表

> 目标版本: v0.3.0
> 日期: 2026-04-12
> 文档类型: 桌面接口冻结表
> 状态: 待冻结
> 关联文档:
> - [ForgeNerve-v0.3.0技术方案](./ForgeNerve-v0.3.0-技术方案.md)
> - [ForgeNerve-v0.3.0依赖矩阵](./ForgeNerve-v0.3.0-依赖矩阵.md)
> - [ForgeNerve-v0.3.0 Sprint1任务拆解](./ForgeNerve-v0.3.0-Sprint1任务拆解.md)

---

## 1. 文档目标

本文件用于冻结 `Tauri command` 命名与 `frontend service` 对应关系，避免主 agent 与 subagent 并行时接口漂移。

---

## 2. 命名规则

### 2.1 Tauri command

- 统一使用 snake_case + `_cmd`
- 与现有桌面接口保持一致

### 2.2 Frontend service

- 统一挂在 `frontend/src/services/tauri.ts`
- 统一使用 camelCase
- service 名与 command 含义一一对应

---

## 3. Sprint 1 冻结接口

说明：

- 其中 Review 相关接口属于 Sprint 2 首批优先接线对象
- 若 Sprint 1 有余量可提前打通，但不作为 Sprint 1 关账前置

| 能力 | Tauri command | Frontend service | 说明 |
|---|---|---|---|
| 列出 Inbox | `list_inbox_items_cmd` | `listInboxItems()` | 最小只读列表 |
| 创建 Inbox | `create_inbox_item_cmd` | `createInboxItem()` | 供调试入口或后续 UI 使用 |
| Inbox 转 Draft | `promote_inbox_item_to_draft_cmd` | `promoteInboxItemToDraft()` | 生成 Draft 并回写关联 |
| 忽略 Inbox | `dismiss_inbox_item_cmd` | `dismissInboxItem()` | 更新状态 |
| 创建 Session | `start_agent_session_cmd` | `startAgentSession()` | 启动最小会话 |
| 追加 Session 上下文 | `append_agent_session_context_cmd` | `appendAgentSessionContext()` | 单条追加 |
| 列出 Session | `list_agent_sessions_cmd` | `listAgentSessions()` | 供 Sprint 1 Session 列表占位使用 |
| 查询 Session | `get_agent_session_cmd` | `getAgentSession()` | 返回详情 |
| 完成 Session | `complete_agent_session_cmd` | `completeAgentSession()` | 结束会话 |
| 列出 Review Draft | `list_drafts_cmd` | `listDrafts()` | 复用现有 Draft 列表，返回值需带 `review_state?` |
| 预览 Review Draft | `get_draft_preview_cmd` | `getDraftPreview()` | 复用现有 Draft 预览 |
| 确认 Review Draft | `commit_draft_cmd` | `commitDraft()` | 复用现有 Draft 提交 |
| 丢弃 Review Draft | `discard_draft_cmd` | `discardDraft()` | 复用现有 Draft 丢弃 |

---

## 4. Sprint 1 非目标

以下接口不属于 Sprint 1 冻结范围：

- `list_reliability_issues_cmd`
- `create_fix_draft_from_issue_cmd`
- `create_context_pack_cmd`
- `export_context_pack_cmd`

---

## 5. Sprint 2+ 预留接口方向

以下接口虽不要求 Sprint 1 实现，但需在本轮先冻结命名方向，避免 Sprint 2 再补一轮接口争议：

| 能力 | Tauri command | Frontend service | 说明 |
|---|---|---|---|
| 模板列表 | `list_workflow_templates_cmd` | `listWorkflowTemplates()` | 读取模板定义 |
| 启动模板工作流 | `start_workflow_run_cmd` | `startWorkflowRun()` | 启动模板并返回最小运行结果 |
| 审阅队列列表 | `list_review_items_cmd` | `listReviewItems()` | 聚合待确认项 |
| 审阅决策 | `apply_review_decision_cmd` | `applyReviewDecision()` | 统一 approve / return / discard / reopen |
| 读取知识治理信息 | `get_knowledge_governance_cmd` | `getKnowledgeGovernance()` | 聚合返回 evidence + freshness |
| 更新知识治理信息 | `update_knowledge_governance_cmd` | `updateKnowledgeGovernance()` | 聚合写入 evidence + freshness |

说明：

1. `EvidenceMeta` 与 `FreshnessPolicy` 第一版优先走聚合治理接口，不先拆成多套 command
2. 以上为 Sprint 2+ 预留命名方向，详细 request / response 以 MCP 契约矩阵和后续桌面接口补充冻结为准

---

## 6. Service 返回约束

1. Frontend service 只负责 invoke / transport，不复制状态机逻辑
2. 错误信息原样向上抛给 store / UI 层
3. `Review` 相关展示复用现有 Draft 接口，不新增 `review_*` command
4. Sprint 1 的 Review 列表通过 `listDrafts()` + `draft_context.review.state == pending` 过滤得到
5. Sprint 1 的 Review 预览通过 `getDraftPreview()` 获取

---

## 7. 开工门槛

以下条件满足后，相关 desktop / frontend subagent 才可正式开写：

1. `ForgeNerve-v0.3.0-数据模型与状态机.md` 已冻结
2. `ForgeNerve-v0.3.0-MCP契约矩阵.md` 已冻结
3. 本文件评审通过
