# ForgeNerve v0.3.0 MCP 契约矩阵

> 目标版本: v0.3.0
> 日期: 2026-04-12
> 文档类型: MCP 契约矩阵
> 状态: 待冻结
> 关联文档:
> - [ForgeNerve-v0.3.0技术方案](./ForgeNerve-v0.3.0-技术方案.md)
> - [ForgeNerve-v0.3.0决策冻结清单](./ForgeNerve-v0.3.0-决策冻结清单.md)
> - [ForgeNerve-v0.3.0 Sprint1任务拆解](./ForgeNerve-v0.3.0-Sprint1任务拆解.md)

---

## 1. 文档目标

本文件用于给 v0.3.0 的 MCP 暴露策略提供单一事实源。

冻结内容：

1. 工具面控制策略
2. profile 暴露边界
3. 最小推荐工具集
4. 新增契约方向
5. 命名与错误返回规则

---

## 2. Tool Surface 冻结

### 2.1 当前现状

当前代码基线中，`memoforge-mcp` 已有约 `50` 个 tool 定义。

这意味着：

- 继续无节制新增 tool，会让 Agent 更难理解该用哪一个
- 同一能力如果拆成过多微操作，会增加工具选择错误与上下文负担
- v0.3.0 必须优先做“减少默认暴露面”，而不是继续扩大接口数

### 2.2 v0.3.0 原则

1. 新 Agent 默认不应看到完整 legacy tool 面
2. 默认 profile 只暴露高频、工作流导向的高层工具
3. 能用一个高层 tool 表达的能力，不再拆成多个微工具
4. 不新增语义重复的别名
5. `legacy-full` 仅用于兼容，不作为推荐接入模式

### 2.3 Tool Budget

建议冻结如下预算：

- `generic-stdio`: `<= 12` 个推荐工具
- `desktop-assisted`: `<= 18` 个推荐工具
- `legacy-full`: 兼容现有全量工具，不设预算，但不推荐新 Agent 默认使用

---

## 3. Profile 冻结

### 3.1 支持的 profile

- `desktop-assisted`
- `generic-stdio`
- `legacy-full`

### 3.2 选择方式

统一逻辑字段为 `profile`。

规划中的选择方式：

- SSE 模式：通过 URL query `?profile=...`
- stdio 模式：通过 CLI 参数 `--profile <name>`

默认值：

- Tauri 内嵌 SSE：`desktop-assisted`
- 通用 CLI / Agent：`generic-stdio`

说明：

- 上述选择方式是 `v0.3.0` 需要实现并冻结的机制
- 当前稳定代码基线尚未完成真正的 profile gate

### 3.3 实现路径冻结

profile gate 在 `v0.3.0` 的实现路径冻结为：

1. 传输层解析 profile
   - SSE 从 query 读取
   - stdio 从 CLI 参数读取
2. `tools.rs` 为每个 tool 声明可见 profile policy
3. tool 列表输出阶段先按 profile 过滤
4. `call_tool` 阶段再次校验 profile 可见性，防止隐藏工具被直接调用
5. 对不可见工具统一返回 `not_found` 或等价的“当前 profile 不可用”错误

说明：

- 不在请求路由外再单独维护第二套工具表
- 真值源在 `tools.rs` 的 per-tool policy

### 3.4 Profile 语义

#### `generic-stdio`

面向：

- 通用 Agent
- 无桌面协同状态的自动化流程

要求：

- 工具数量最少
- 优先暴露工作流级高层抽象
- 默认隐藏 legacy 知识 CRUD、Git 写操作、低频管理工具

#### `desktop-assisted`

面向：

- 与桌面端协同的 Agent
- 需要状态同步和审阅联动的场景

要求：

- 在 `generic-stdio` 基础上，额外暴露与 Review / Reliability / Pack 查看相关的只读或低风险工具

#### `legacy-full`

面向：

- 历史自动化
- 调试
- 向后兼容

要求：

- 保持全量兼容
- 明确标注“不推荐新 Agent 默认使用”

---

## 4. 推荐暴露工具集

## 4.1 `generic-stdio` 推荐集合

这是默认推荐给新 Agent 的最小工具面：

| Tool | 用途 | 备注 |
|---|---|---|
| `read_knowledge` | 结构化读取知识 | 推荐读入口 |
| `start_draft` | 启动 Draft | 推荐写入口 |
| `update_draft` | 增量写 Draft | 推荐 section 级更新 |
| `preview_draft` | 预览 Draft | 写前必走 |
| `commit_draft` | 提交 Draft | 审阅后落库 |
| `discard_draft` | 丢弃 Draft | 失败回退 |
| `start_agent_session` | 启动会话 | 跟踪工作流 |
| `append_agent_session_context` | 追加上下文 | 记录引用来源 |
| `complete_agent_session` | 完成会话 | 收束结果 |
| `create_inbox_item` | 创建候选知识 | 轻量沉淀入口 |
| `promote_inbox_item_to_draft` | 候选转 Draft | 进入审阅流 |
| `list_inbox_items` | 查看候选项 | 可选保留，作为唯一列表入口 |

说明：

- 这是推荐工具集，不是全量兼容列表
- `generic-stdio` 中不建议默认暴露 `create_knowledge` / `update_knowledge` / `git_push` 等 legacy 或高风险工具

## 4.2 `desktop-assisted` 推荐集合

在 `generic-stdio` 基础上，增加以下工具：

| Tool | 用途 | 备注 |
|---|---|---|
| `get_editor_state` | 获取桌面状态 | 仅桌面协同时有价值 |
| `get_agent_session` | 查看会话详情 | 配合桌面端跳转 |
| `list_agent_sessions` | 查看会话列表 | 配合桌面端工作台 |
| `list_drafts` | 查看 Draft 列表 | Review 入口底层支撑 |
| `list_reliability_issues` | 查看可靠性问题 | 治理链路读取入口 |
| `get_reliability_issue_detail` | 问题详情 | 修复前查看 |

说明：

- `desktop-assisted` 依然不应默认暴露完整 legacy 工具面
- 桌面端能替用户完成的聚合，不要再让 Agent 通过过多低层 tool 手工拼

## 4.3 `legacy-full`

- 保持当前全量兼容
- 仅用于兼容和调试
- 文档与帮助中应标注“不推荐新 Agent 默认使用”

---

## 5. v0.3.0 新增契约方向

以下新增契约方向允许进入 v0.3.0，但必须满足“高层抽象、少而精”的约束：

| 能力 | 推荐方向 | 不建议做法 |
|---|---|---|
| Workflow Templates | 用 `list_workflow_templates` / `start_workflow_run` 一类高层工具 | 拆成 5 个以上模板微工具 |
| Unified Review Queue | 用 `list_review_items` / `get_review_item` / `apply_review_decision` 一类收口工具 | 暴露大量 `review_*_by_source` 微工具 |
| Evidence-backed Knowledge | 在现有 read / draft / metadata 语义上扩展 evidence 字段 | 单独再造多套 evidence CRUD 工具 |
| Freshness / Reminder | 提供最小读取与触发入口 | 为每个 reminder 动作拆单独工具 |

### 5.1 Sprint 2+ 预冻结最小契约

| Tool | Request 最小字段 | Response 最小字段 | 说明 |
|---|---|---|---|
| `list_workflow_templates` | `enabled_only?` | `templates[]:{template_id,name,goal,enabled}` | 模板列表 |
| `start_workflow_run` | `template_id`,`goal_override?`,`context_refs?`,`suggested_output_target?` | `run_id`,`session_id?`,`draft_id?`,`inbox_item_ids[]` | 启动模板工作流 |
| `list_review_items` | `status?`,`source_type?`,`limit?` | `items[]:{review_item_id,draft_id,title,source_type,status,risk_flags}` | 统一审阅队列 |
| `get_review_item` | `review_item_id` | `item:{review_item_id,draft_id,source_type,source_ref_id,status,risk_flags,decided_by?,decided_at?}` | 审阅详情 |
| `apply_review_decision` | `review_item_id`,`decision`,`notes?` | `item:{review_item_id,status,decided_by?,decided_at?}` | 统一决策入口 |

其中：

- `decision` 冻结为 `approve \| return \| discard \| reopen`
- `reopen` 对应 `returned -> pending`

### 5.2 Evidence / Freshness 契约策略

`EvidenceMeta` 与 `FreshnessPolicy` 第一版优先通过扩展现有读写语义承接：

1. `read_knowledge` 返回 `frontmatter.evidence` 与 `frontmatter.freshness`
2. Draft metadata patch 允许写入 `evidence` 与 `freshness`
3. 如需单独入口，优先冻结为聚合读取而不是多套 CRUD

建议预留但不强制 Sprint 2 即实现的高层工具：

- `get_knowledge_governance`
- `update_knowledge_governance`

---

## 6. 复用现有 Draft 工具

v0.3.0 继续复用现有 Draft 工具，不新增语义重复别名：

| Tool | 用途 | 说明 |
|---|---|---|
| `start_draft` | 创建 Draft | 作为多条工作流的底层写入能力 |
| `update_draft` | 更新 Draft | 保持兼容 |
| `list_drafts` | 列出 Draft | 供桌面端 Review 和调试使用 |
| `preview_draft` | 预览 Draft | 供桌面端 Review 和 Agent 自检 |
| `commit_draft` | 提交 Draft | Review 最终落库 |
| `discard_draft` | 丢弃 Draft | 与 Review 退回 / 丢弃联动 |

---

## 7. 命名冻结规则

1. Tool 名统一使用动词开头的 snake_case
2. 一个版本内不引入语义重复别名
3. Session 一律使用 `agent_session`
4. Inbox 一律使用 `inbox_item`
5. Review 工具按统一队列抽象命名，不按来源各起一套名字
6. 能扩展现有 request / response 字段时，优先扩字段，不优先新造工具
7. 新增工具先判断是否应该只在 `desktop-assisted` 暴露
8. Workflow / Review 新工具优先冻结最小 request / response，再进入实现

---

## 8. 错误返回冻结

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

## 9. 开工门槛

以下条件满足后，相关 MCP subagent 才可正式开写：

- 本文件完成评审
- `ForgeNerve-v0.3.0-数据模型与状态机.md` 已冻结
- profile 暴露边界已确认
- 推荐工具集已确认
- Sprint 1 任务拆解已绑定本文件
