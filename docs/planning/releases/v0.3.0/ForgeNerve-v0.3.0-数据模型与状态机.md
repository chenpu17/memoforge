# ForgeNerve v0.3.0 数据模型与状态机

> 目标版本: v0.3.0
> 日期: 2026-04-12
> 文档类型: 数据模型与状态机
> 状态: 待冻结
> 关联文档:
> - [ForgeNerve-v0.3.0产品需求文档](./ForgeNerve-v0.3.0-产品需求文档.md)
> - [ForgeNerve-v0.3.0技术方案](./ForgeNerve-v0.3.0-技术方案.md)
> - [ForgeNerve-v0.3.0决策冻结清单](./ForgeNerve-v0.3.0-决策冻结清单.md)

---

## 1. 文档目标

本文件用于把 `Workflow / Review / Evidence / Freshness` 的概念层定义收口为可开发的数据模型与状态机，并明确 `Inbox / Session / Draft / Context Pack` 作为支撑层的兼容边界。

本文件是：

- Sprint 1 的模型冻结依据
- MCP 契约定义的上游输入
- 前端 service / state 设计的事实源

---

## 2. 冻结原则

1. Sprint 1 优先冻结 `WorkflowTemplate`、`ReviewItem`、`EvidenceMeta`、`FreshnessPolicy`
2. 现有 `InboxItem`、`AgentSession`、`DraftLink` 作为支撑对象继续兼容，不做破坏性重构
3. `ReviewItem` 优先作为投影层，不新增独立文件存储
4. `ReliabilityIssue` 继续作为治理发现层
5. 所有主实体 ID 均使用字符串型 `ulid` 或稳定路径引用

---

## 3. 实体关系

### 3.1 核心关系

- 一个 `WorkflowTemplate` 可启动一个或多个 `AgentSession`
- 一个 `AgentSession` 可关联多个 `InboxItem` 与 `Draft`
- 多种来源的 Draft / Inbox / Reliability 事件可映射为 `ReviewItem`
- `EvidenceMeta` 绑定到知识条目或待提交变更
- `FreshnessPolicy` 绑定到知识条目，并驱动 `ReliabilityIssue`
- `ContextPack` 可被 `WorkflowTemplate` 和 `AgentSession` 引用

### 3.2 关系边界

- `WorkflowTemplate` 是工作流入口层，不是执行引擎
- `ReviewItem` 是统一审阅投影层，不是新的主内容层
- `EvidenceMeta` 是可信度元数据层，不直接承载正文内容
- `FreshnessPolicy` 是治理规则层，不直接修改知识内容
- `Inbox / Session / ContextPack` 是支撑层，不再单独承担版本 headline

---

## 4. WorkflowTemplate

### 4.1 字段冻结

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `template_id` | `string` | 是 | 稳定模板 ID |
| `name` | `string` | 是 | 模板名称 |
| `goal` | `string` | 是 | 工作流目标 |
| `default_context_refs` | `ContextRef[]` | 是 | 默认上下文来源 |
| `suggested_output_target` | `string \| null` | 否 | 建议输出位置 |
| `review_policy` | `string \| null` | 否 | 审阅规则说明 |
| `success_criteria` | `string[]` | 是 | 完成定义 |
| `enabled` | `boolean` | 是 | 是否可用 |

### 4.2 说明

- 第一版允许内置模板优先
- 不要求复杂编排 DAG
- 第一版模板按“文字驱动 + 固定输入槽位”执行，而不是引入结构化步骤编排器

#### ContextRef 最小结构

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `ref_type` | `knowledge \| pack \| url \| file` | 是 | 上下文类型 |
| `ref_id` | `string` | 是 | 路径 / pack_id / url 等稳定引用 |
| `required` | `boolean` | 是 | 是否必须带入 |
| `reason` | `string \| null` | 否 | 推荐原因 |
| `snapshot_summary` | `string \| null` | 否 | 启动时展示用摘要 |

---

## 5. ReviewItem

### 5.1 字段冻结

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `review_item_id` | `string` | 是 | 投影 ID |
| `source_type` | `agent_draft \| inbox_promotion \| reliability_fix \| import_cleanup` | 是 | 来源类型 |
| `source_ref_id` | `string` | 是 | 来源对象 ID |
| `draft_id` | `string` | 是 | 关联 Draft |
| `title` | `string` | 是 | 展示标题 |
| `risk_flags` | `string[]` | 是 | 风险提示 |
| `status` | `pending \| in_review \| approved \| returned \| discarded` | 是 | 审阅状态 |
| `decided_by` | `string \| null` | 否 | 最近决策人 |
| `decided_at` | `string \| null` | 否 | 最近决策时间 |
| `created_at` | `string` | 是 | ISO 8601 |
| `updated_at` | `string` | 是 | ISO 8601 |

### 5.2 状态机冻结

`pending -> in_review`

允许分支：

- `pending -> approved`
- `pending -> returned`
- `pending -> discarded`
- `in_review -> approved`
- `in_review -> returned`
- `in_review -> discarded`
- `returned -> pending`

说明：

- 第一版不单独持久化为 `review_item.json`
- `ReviewItem` 由 Draft + 来源对象 + 风险提示聚合生成
- `in_review` 仅用于区分“已打开 / 已接手但未决定”

### 5.3 底层对象失效容错

当投影依赖的底层对象变化时，按以下规则处理：

1. 如果关联 `Draft` 已被 `discard` 或物理删除，则该 `ReviewItem` 不再出现在待处理队列中
2. 如果 `Session` 被清理，`ReviewItem` 保留 `source_type` 和 `source_ref_id`，但来源展示退化为“历史来源不可用”
3. 如果 `InboxItem` 状态已进入终态但 Draft 仍存在，Review 仍以 Draft 为准
4. 第一版不额外持久化“失效 ReviewItem”，由聚合层按容错规则即时计算

---

## 6. EvidenceMeta

### 6.1 字段冻结

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `owner` | `string \| null` | 否 | 责任人 |
| `source_url` | `string \| null` | 否 | 来源 URL |
| `linked_issue_ids` | `string[]` | 是 | 关联 issue |
| `linked_pr_ids` | `string[]` | 是 | 关联 PR |
| `linked_commit_shas` | `string[]` | 是 | 关联 commit |
| `command_output_refs` | `string[]` | 是 | 命令输出引用 |
| `verified_at` | `string \| null` | 否 | 最近验证时间 |
| `verified_by` | `string \| null` | 否 | 验证者 |
| `valid_for_version` | `string \| null` | 否 | 适用版本 |

### 6.2 说明

- 第一版允许部分字段为空
- 新沉淀知识应尽量补齐最小可信字段

### 6.3 存储位置冻结

v0.3.0 冻结如下落点：

1. 已提交知识的 `EvidenceMeta` 写入知识 Markdown 的 `frontmatter.evidence`
2. Draft 阶段待提交的 `EvidenceMeta` 写入 Draft 的 metadata patch，并在 `commit` 时落入目标 frontmatter
3. 不在 `v0.3.0` 为 `EvidenceMeta` 新增独立 `.memoforge/*.json` 真值文件

---

## 7. FreshnessPolicy

### 7.1 字段冻结

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `sla_days` | `number` | 是 | 复查周期 |
| `last_verified_at` | `string \| null` | 否 | 最近验证时间 |
| `next_review_at` | `string \| null` | 否 | 下次复查时间 |
| `review_owner` | `string \| null` | 否 | 复查责任人 |
| `review_status` | `ok \| due \| overdue \| unknown` | 是 | 当前复查状态 |

### 7.2 说明

- `FreshnessPolicy` 与 `ReliabilityIssue` 配合使用
- `ReliabilityIssue` 负责发现问题，`FreshnessPolicy` 负责表达治理语义

### 7.3 存储位置冻结

v0.3.0 冻结如下落点：

1. 已提交知识的 `FreshnessPolicy` 写入知识 Markdown 的 `frontmatter.freshness`
2. Draft 阶段待提交的 `FreshnessPolicy` 写入 Draft 的 metadata patch，并在 `commit` 时落入目标 frontmatter
3. `.memoforge` 下允许存在扫描缓存，但缓存不是 `FreshnessPolicy` 的真值来源

### 7.4 默认值与继承机制

冻结优先级如下：

1. 知识条目 `frontmatter.freshness.sla_days`
2. 分类级默认值 `config.categories[].default_sla_days`
3. 全局默认值 `config.knowledge_policy.default_sla_days`
4. 系统缺省值 `90`

说明：

- 存量知识若没有显式 `freshness`，则按上述继承链计算有效 SLA
- `review_status` 可由扫描时基于 `last_verified_at / next_review_at / effective_sla_days` 计算得出

---

## 8. 支撑对象兼容边界

## 8.1 InboxItem

继续保留：

- `source_type`
- `title`
- `proposed_path`
- `status`
- `linked_draft_id`
- `linked_session_id`

补充说明：

- `InboxItem` 仍是候选层
- 在 v0.3.0 中主要服务于模板结果承接与 Review Queue 来源标识

## 8.2 AgentSession

继续保留：

- `agent_name`
- `goal`
- `context_items`
- `draft_ids`
- `inbox_item_ids`
- `context_pack_ids`

补充说明：

- `AgentSession` 在 v0.3.0 中主要承担工作流过程记录与上下文追踪

## 8.3 DraftLink / Review 投影

继续沿用：

- `draft_context.review.state`
- `draft_context.review.notes`
- `draft_context.review.source_inbox_item_id`
- `draft_context.review.source_session_id`

说明：

- 第一版 `ReviewItem` 由上述 Draft 上下文与来源对象聚合生成

## 8.4 ContextPack

继续保留：

- `id`
- `name`
- `scope_type`
- `scope_value`
- `item_paths`

补充说明：

- v0.3.0 中的 `ContextPack` 主要承担模板默认上下文和 Session 引用
- 推荐能力和自动化选择留到后续 Sprint

---

## 9. Sprint 1 冻结输出

Sprint 1 以本文件为准，只要求：

1. `WorkflowTemplate`、`ReviewItem`、`EvidenceMeta`、`FreshnessPolicy` 形成最小冻结定义
2. 现有 `InboxItem`、`AgentSession`、`DraftLink` 继续保持兼容
3. `Review` 能从 Draft / Inbox / Session / Reliability 聚合出统一投影方向
4. 不引入额外独立存储实体来破坏现有实现
5. `ContextRef`、`EvidenceMeta`、`FreshnessPolicy` 的最小结构、落点和默认继承已冻结

---

## 10. 后续扩展边界

允许在后续 Sprint 扩展：

- `WorkflowTemplate` 的参数化能力
- `ReviewItem.risk_flags`
- `EvidenceMeta` 的更完整工程证据字段
- `FreshnessPolicy` 的提醒与自动复查策略

禁止在 Sprint 1 擅自扩展：

- 新增独立 `ReviewItem` 文件存储
- 引入聊天消息级 Session 模型
- 把 Inbox 与正式知识混存
- 为每种模板单独发明一套状态机
