# ForgeNerve v0.3.0 产品需求文档

> 目标版本: v0.3.0
> 日期: 2026-04-12
> 文档类型: PRD
> 状态: 草案
> 关联文档:
> - [ForgeNerve-v0.3.0差异化战略](./ForgeNerve-v0.3.0-差异化战略.md)
> - [ForgeNerve-v0.3.0技术方案](./ForgeNerve-v0.3.0-技术方案.md)
> - [ForgeNerve-v0.3.0开发计划](./ForgeNerve-v0.3.0-开发计划.md)

---

## 1. 版本目标

ForgeNerve v0.3.0 的目标不是继续增加零散模块，而是让产品从“可用的 Agent 知识工作台”进入“具备行业差异化的知识运行系统”阶段。

本轮开发前冻结口径：

- `v0.3.0 = 基于当前已存在的 Inbox / Session / Review / Reliability / Context Pack 基线，向工作流型、证据型、治理型产品升级的版本`
- `v0.3.0 P0 = Workflow Templates / Unified Review Queue / Evidence-backed Knowledge / Reliability & Freshness / Agent Context Reuse Polish`
- `v0.4.0 = Session Replay / Pack Recommendation / Approved for Agent Use / 更强 Git 反向关联`

本版本聚焦四个结果：

1. 高频知识工作流可直接起跑
2. AI 写入能统一进入可审阅队列
3. 新沉淀的知识带证据、可追溯
4. 过期知识可以持续发现、提醒、修复

### 1.1 当前主干基线

当前主干和稳定发布线已经具备以下基础：

- Inbox / Session / Review / Reliability / Packs 的一级入口
- Draft 预览、提交、退回、丢弃
- Session 与 Draft / Inbox 的基础关联
- 基础 Reliability 扫描规则
- Context Pack 创建与导出

因此，`v0.3.0` 不再把“这些对象存在”视为版本价值，而是把它们收束成用户工作流和可信知识治理能力。

---

## 2. 目标用户

### 2.1 核心用户

- 正在使用 AI coding agent 的开发者
- 需要长期维护项目知识的技术负责人
- 负责团队 wiki / handbook / ADR / runbook 的工程团队

### 2.2 次级用户

- 需要管理知识质量的研发效能团队
- 需要复用知识上下文的多项目协作团队

---

## 3. 关键问题

### 3.1 当前能力已存在，但版本价值不够聚焦

- 用户已经能看到 Inbox / Session / Review / Reliability / Packs
- 但仍然难以理解“ForgeNerve 相比笔记工具或 Agent 拼装方案到底新在哪”
- 当前叙事更像模块清单，而不是用户承诺

### 3.2 工作流没有被打穿

- 入口已经存在，但缺少真正一键起跑的高频工作流
- 用户仍需自己拼接“读什么、写到哪、怎么审、何时算完成”
- 新用户第一次使用时，价值感知不够强

### 3.3 知识可信度缺少证据层

- 当前知识可以写、可以改、可以审
- 但用户仍缺少“为什么这条知识值得信”的直接证据
- 没有 owner、验证时间、适用版本、关联 PR / commit / issue，会削弱工程团队信任感

### 3.4 知识质量还没有形成持续治理闭环

- 当前 Reliability 更像扫描器
- 缺少 SLA、owner、复查提醒和一键复查 Draft
- 缺少将“发现问题 -> 发起修复 -> 再次验证”串成运营流程的能力

### 3.5 上下文复用仍偏手工

- Context Pack 已有基础能力，但更像高级用户基础设施
- Session 复用和 Pack 使用仍需要用户自己组织
- 如果没有模板默认上下文和推荐机制，复用价值难以被新用户感知

---

## 4. 产品原则

1. `Local-first`
2. `Git-native`
3. `Agent-first but human-approved`
4. `Structured writes over blind overwrites`
5. `Evidence before trust`
6. `Operational knowledge over passive notes`

---

## 5. 版本范围

## 5.1 P0：必须交付

### P0.1 Workflow Templates / Playbooks

将高频知识工作流产品化，不再要求用户自己拼底层对象。

首批模板：

- PR / Issue 沉淀知识
- Runbook 校验与修复
- 会议纪要整理入库
- 版本发布复盘

模板至少包含：

- 工作流目标
- 默认上下文来源
- 建议输出位置
- 审阅标准
- 完成定义

交付说明：

- `v0.3.0` 不要求一次做完整编排引擎
- 第一版优先实现“可选择模板并带默认上下文启动流程”
- 底层复用现有 `Inbox / Session / Review / Context Pack` 能力

### P0.2 Unified Review Queue

把以下来源的待确认知识变更统一收敛到一个审阅中心：

- Agent Draft
- Inbox 转 Draft
- Reliability 修复 Draft
- 导入整理 Draft

核心能力：

- 统一列表
- 来源标识
- 风险提示
- 预览 diff
- 确认 / 退回 / 丢弃

交付说明：

- `v0.3.0` 优先保证统一队列视图和统一决策动作
- 不要求第一版做复杂批处理编排

### P0.3 Evidence-backed Knowledge

给知识条目补上“证据层”。

第一版建议最小字段：

- `source_url`
- `linked_issue_ids`
- `linked_pr_ids`
- `linked_commit_shas`
- `command_output_refs`
- `owner`
- `verified_at`
- `verified_by`
- `valid_for_version`

交付说明：

- 新创建或新提交的关键知识，应能附带证据元信息
- 证据层允许先以最小前后端字段 + 展示能力落地

### P0.4 Reliability & Freshness Operations

在现有 Reliability 基线之上，升级为治理闭环。

第一版至少包含：

- 无摘要
- 无标签
- 缺少证据
- 缺少 owner
- 超过阈值未验证
- 长期未更新
- 引用失效

第一版治理能力：

- 30 / 60 / 90 天复查策略
- owner 视角
- 到期提醒入口
- 一键生成复查 / 修复 Draft

### P0.5 Agent Context Reuse Polish

在现有 `Session + Context Pack + Inbox` 基线之上，提高复用顺手度。

第一版聚焦：

- 模板默认上下文
- Session 与 Pack 的引用收口
- Review / Session / Inbox 之间更短跳转路径

说明：

- 本项是支撑层
- `v0.3.0` 不把 Pack 是否存在当成 headline
- 更强的推荐和自动化放到后续版本

---

## 5.2 P1：应该交付

### P1.1 Inbox 智能整理建议

- 推荐路径
- 推荐标签
- 推荐摘要
- 推荐 owner
- 重复 / 冲突提示

### P1.2 Git / PR / Commit 反向关联

- 知识条目可回链到代码变更
- 代码变更可反查沉淀出的知识

### P1.3 Session Replay / Rerun

- 允许基于过去的 Session 一键复跑高频工作流

---

## 5.3 P2：可延后

- Pack Recommendation
- Knowledge Health Score
- Approved for Agent Use
- Team Publish
- 组织级指标面板
- 高级权限模型
- 云同步 / 远端服务化

---

## 6. 用户流程

### 6.1 高频工作流启动流程

1. 用户选择一个 Workflow Template
2. 系统自动带入默认上下文和建议输出位置
3. Agent 基于模板执行并产出 Inbox / Draft / Session
4. 变更统一进入 Review Queue
5. 用户确认后落入知识库并留下 Git 记录

### 6.2 审阅队列流程

1. 用户打开 Review
2. 系统按来源聚合待处理项
3. 用户查看风险提示与 diff 预览
4. 用户确认、退回或丢弃
5. 系统回写 Draft / Inbox / Session 状态

### 6.3 证据化沉淀流程

1. Agent 或用户产出新知识
2. 系统要求或建议补充证据元信息
3. 用户在审阅时检查来源、owner、验证信息
4. 确认后知识条目带证据进入主库

### 6.4 Freshness 治理流程

1. 系统识别超过 SLA 或缺少验证信息的知识
2. 用户在 Reliability 中按 owner / 风险查看
3. 用户一键生成复查 / 修复 Draft
4. 处理结果再次进入 Review Queue

---

## 7. 核心功能细化

## 7.1 Workflow Template 最小包

字段建议：

- `template_id`
- `name`
- `goal`
- `default_context_refs`
- `suggested_output_target`
- `review_policy`
- `success_criteria`

## 7.2 Review Item 最小投影

字段建议：

- `review_item_id`
- `source_type`
- `source_ref_id`
- `draft_id`
- `title`
- `risk_flags`
- `status`
- `created_at`
- `updated_at`

## 7.3 Evidence Meta 最小字段

字段建议：

- `owner`
- `source_url`
- `linked_issue_ids`
- `linked_pr_ids`
- `linked_commit_shas`
- `verified_at`
- `verified_by`
- `valid_for_version`

## 7.4 Freshness Policy 最小字段

字段建议：

- `sla_days`
- `last_verified_at`
- `next_review_at`
- `review_owner`
- `review_status`

## 7.5 支撑对象说明

`Inbox / Session / Context Pack` 仍然是本版本的重要支撑层，但它们在 `v0.3.0` 的角色是：

- 支撑模板启动
- 支撑审阅收口
- 支撑上下文复用

而不是继续单独作为版本 headline。

---

## 8. 指标

### 8.1 产品指标

- Playbook 首次完成率
- Review Queue 决策完成率
- 新沉淀知识证据完整率
- Reliability 问题关闭率
- 高频工作流复用率

v0.3.0 内部验收基线建议：

- 高频工作流首次完成率 `>= 80%`
- 统一 Review Queue 决策完成率 `>= 90%`
- 新提交正式知识的证据完整率 `>= 70%`

### 8.2 体验指标

- 首次模板启动到完成确认时间
- 用户从工作流结果进入 Review 预览的点击次数
- Reliability 问题转复查 Draft 的平均时长

v0.3.0 内部体验基线建议：

- 首次模板启动到完成确认时间 `<= 3 分钟`
- 从 Session / Inbox / Reliability 进入 Review 预览不超过 `3` 次点击

### 8.3 质量指标

- 冲突提交率
- 缺少证据知识占比
- 超过 SLA 未复查知识占比
- 失效引用占比

v0.3.0 内部质量基线建议：

- 冲突提交率在验收脚本集中 `<= 10%`
- 不允许出现 Draft / Inbox / Session / Review 关联错绑

### 8.4 竞争力指标

- 用户是否能在一次工作流中完成“生成 -> 审阅 -> 证据化 -> 落库”
- 用户是否能回答“这条知识为什么可信”
- 用户是否能持续看见“哪些知识过期了、该谁处理”

---

## 9. 兼容与迁移

### 9.1 兼容策略

- 继续沿用 `.memoforge/`
- 继续兼容现有 `drafts/`、`config.yaml`、知识内容目录
- 不在 `v0.3.0` 重命名 crate、目录或底层数据根

### 9.2 新增与扩展

`v0.3.0` 优先在现有结构上扩展：

- `.memoforge/inbox/`
- `.memoforge/sessions/`
- `.memoforge/packs/`
- 以及知识 frontmatter / 元数据中的证据与 freshness 字段

策略：

- `open/init` 时只做目录存在性检查与按需创建
- 已有知识库不要求手动迁移
- 已有 Draft 与 Git 工作流保持可用

---

## 10. 非目标

本版本不追求：

- 替代通用项目管理工具
- 替代通用聊天工具
- 做复杂云协作平台
- 一次性做完组织级权限中心
- 为了模板而引入重型编排引擎

---

## 11. 版本验收标准

如果 `v0.3.0` 成功，用户应能明确感知：

1. ForgeNerve 不是又一个 Markdown 工具，而是带工作流的知识运行系统
2. AI 产生的知识变更能统一进入一个可审阅中心
3. 新沉淀的知识带证据、可追溯、可复查
4. 过期知识能被持续发现、提醒和修复
