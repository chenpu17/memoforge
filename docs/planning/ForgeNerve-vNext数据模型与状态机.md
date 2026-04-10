# ForgeNerve vNext 数据模型与状态机

> 版本: v0.1
> 日期: 2026-04-09
> 状态: 开工前冻结草案
> 关联文档:
> - [ForgeNerve-vNext产品需求文档](./ForgeNerve-vNext产品需求文档.md)
> - [ForgeNerve-vNext技术方案](./ForgeNerve-vNext技术方案.md)
> - [ForgeNerve-vNext决策冻结清单](./ForgeNerve-vNext决策冻结清单.md)

---

## 1. 文档目标

本文件用于把 `Inbox / Session / Draft / Reliability / Context Pack` 的概念层定义收口为可开发的数据模型与状态机。

本文件是：

- Sprint 1 的模型冻结依据
- MCP 契约定义的上游输入
- 前端 service / state 设计的事实源

---

## 2. 冻结原则

1. Sprint 1 只冻结 `InboxItem`、`AgentSession`、`DraftLink`
2. `ReliabilityIssue` 与 `ContextPack` 先冻结最小骨架
3. `Review` 在 vNext.1 中不是独立存储实体，而是对 Draft 的待确认投影视图
4. 所有主实体 ID 均使用字符串型 `ulid`

---

## 3. 实体关系

### 3.1 核心关系

- 一个 `AgentSession` 可关联多个 `InboxItem`
- 一个 `AgentSession` 可关联多个 `Draft`
- 一个 `InboxItem` 最多关联一个主 `Draft`
- 一个 `Draft` 可回指来源 `InboxItem` 与 `AgentSession`
- `ReviewItem` 不单独持久化，由 Draft 状态推导

### 3.2 关系边界

- `Inbox` 是候选层，不是正式知识层
- `Draft` 是受控变更层，不是素材池
- `Session` 是过程记录层，不是聊天层
- `ReliabilityIssue` 是问题层，不直接承载内容编辑
- `ContextPack` 是知识切片层，不直接替代 Session

---

## 4. InboxItem

### 4.1 字段冻结

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `id` | `string` | 是 | `ulid` |
| `source_type` | `agent \| import \| paste \| manual \| reliability` | 是 | 来源类型 |
| `source_agent` | `string \| null` | 否 | 生成来源 Agent |
| `title` | `string` | 是 | 候选标题 |
| `snippet` | `string` | 否 | 候选摘要片段 |
| `content_markdown` | `string \| null` | 否 | 候选正文原文 |
| `proposed_path` | `string \| null` | 否 | 建议知识路径 |
| `status` | `new \| triaged \| drafted \| promoted \| ignored` | 是 | Inbox 状态 |
| `linked_draft_id` | `string \| null` | 否 | 关联 Draft |
| `linked_session_id` | `string \| null` | 否 | 关联 Session |
| `linked_knowledge_path` | `string \| null` | 否 | 已落地知识路径引用 |
| `metadata` | `object` | 否 | 扩展元信息 |
| `created_at` | `string` | 是 | ISO 8601 |
| `updated_at` | `string` | 是 | ISO 8601 |

### 4.2 状态机冻结

`new -> triaged -> drafted -> promoted`

允许分支：

- `new -> ignored`
- `triaged -> ignored`
- `drafted -> ignored`
- `ignored -> triaged`（人工恢复）

规则：

1. `drafted` 表示已生成 Draft，但尚未进入正式知识
2. `promoted` 表示候选项已被提交为正式知识或被现有知识吸收
3. `ignored` 为软终态，但允许后续人工恢复为 `triaged`

---

## 5. AgentSession

### 5.1 字段冻结

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `id` | `string` | 是 | `ulid` |
| `agent_name` | `string` | 是 | Agent 标识 |
| `agent_source` | `string \| null` | 否 | `claude-code` / `opencode` 等 |
| `goal` | `string` | 是 | 会话目标 |
| `status` | `running \| completed \| failed \| cancelled` | 是 | 会话状态 |
| `context_items` | `ContextItem[]` | 是 | 会话读取上下文清单 |
| `draft_ids` | `string[]` | 是 | 会话产生的 Draft 列表 |
| `inbox_item_ids` | `string[]` | 是 | 会话产生的 Inbox 列表 |
| `result_summary` | `string \| null` | 否 | 会话结果摘要 |
| `context_pack_ids` | `string[]` | 是 | 引用的 Context Pack |
| `started_at` | `string` | 是 | ISO 8601 |
| `finished_at` | `string \| null` | 否 | ISO 8601 |
| `metadata` | `object` | 否 | 扩展字段 |

#### ContextItem 最小结构

Sprint 1 冻结为：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `ref_type` | `knowledge \| pack \| url \| file` | 是 | 引用对象类型 |
| `ref_id` | `string` | 是 | 路径 / pack_id / url 等稳定引用 |
| `accessed_at` | `string` | 是 | ISO 8601 |
| `summary` | `string \| null` | 否 | 可选摘要 |

### 5.2 状态机冻结

`running -> completed`

允许分支：

- `running -> failed`
- `running -> cancelled`

规则：

1. `completed`、`failed`、`cancelled` 均为终态
2. 终态后不可继续追加上下文，只允许追加审计备注
3. Sprint 1 不做嵌套 Session

---

## 6. DraftLink / Review 投影

### 6.1 DraftLink 冻结

为避免在 vNext.1 引入额外持久化对象，冻结一层轻量关联定义：

| 字段 | 类型 | 说明 |
|---|---|---|
| `draft_id` | `string` | 现有 Draft ID |
| `source_inbox_item_id` | `string \| null` | 来源 Inbox |
| `source_session_id` | `string \| null` | 来源 Session |
| `review_state` | `pending \| approved \| rejected \| returned` | Review 投影状态 |
| `review_notes` | `string \| null` | 审阅备注 |

### 6.2 Review 边界冻结

vNext.1 的 `Review` 定义为：

- 桌面端对待确认 Draft 的聚合视图
- 底层对象仍是现有 Draft
- 不单独创建 `ReviewItem` 存储文件

持久化策略：

- `DraftLink.review_state`
- `DraftLink.review_notes`
- `DraftLink.source_inbox_item_id`
- `DraftLink.source_session_id`

在 `vNext.1` 中统一作为 Draft 文件顶层扩展对象持久化，冻结 key path 为：

`draft_context.review`

最小序列化形状：

```json
{
  "draft_context": {
    "review": {
      "state": "pending",
      "notes": null,
      "source_inbox_item_id": "inbox_xxx",
      "source_session_id": "session_xxx"
    }
  }
}
```

说明：

- 现有 `DraftFile.metadata` 继续保留给知识 frontmatter patch 使用，不承载 Review 状态
- `Session` 只记录 `draft_ids` 与来源关联，不承载 Review 状态事实源
- `Review` 页面通过读取 `draft_context.review` + Inbox / Session 关联信息生成投影

统一口径：

- `Review` 是一级导航名称
- `Review Queue` 是界面描述别名

---

## 7. ReliabilityIssue

### 7.1 最小骨架冻结

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `id` | `string` | 是 | `ulid` |
| `rule_key` | `string` | 是 | 规则标识 |
| `knowledge_path` | `string` | 是 | 知识文件路径 |
| `severity` | `low \| medium \| high` | 是 | 严重级别 |
| `status` | `open \| ignored \| resolved` | 是 | 问题状态 |
| `summary` | `string` | 是 | 问题摘要 |
| `linked_draft_id` | `string \| null` | 否 | 修复 Draft |
| `detected_at` | `string` | 是 | ISO 8601 |

### 7.2 说明

- Sprint 1 不实现完整 `ReliabilityIssue`
- 仅冻结字段，供 Sprint 3 使用

---

## 8. ContextPack

### 8.1 最小骨架冻结

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `id` | `string` | 是 | `ulid` |
| `name` | `string` | 是 | Pack 名称 |
| `scope_type` | `tag \| folder \| topic \| manual` | 是 | 打包范围 |
| `scope_value` | `string` | 是 | 范围值 |
| `item_paths` | `string[]` | 是 | 包含知识路径 |
| `summary` | `string \| null` | 否 | Pack 摘要 |
| `version` | `string` | 是 | 版本号 |
| `created_at` | `string` | 是 | ISO 8601 |
| `updated_at` | `string` | 是 | ISO 8601 |

### 8.2 说明

- vNext.1 只交付 `Context Pack Foundation`
- 先支持创建、查看、被 Session 引用
- `分享 / 发布 / 订阅` 留到后续阶段

---

## 9. Sprint 1 冻结输出

Sprint 1 以本文件为准，只要求：

1. `InboxItem` 可序列化与落库
2. `AgentSession` 可序列化与落库
3. `DraftLink` 作为 Draft metadata 扩展字段可被 MCP 与桌面端正确消费
4. `Review` 作为 Draft 聚合视图被前端识别

---

## 10. 后续扩展边界

允许在后续 Sprint 扩展：

- `InboxItem.metadata`
- `ReliabilityIssue` 更多规则字段
- `ContextPack` 导出与发布元信息

禁止在 Sprint 1 擅自扩展：

- 新增独立 `ReviewItem` 文件存储
- 引入聊天消息级 Session 模型
- 把 Inbox 与正式知识混存
