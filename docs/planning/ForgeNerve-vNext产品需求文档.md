# ForgeNerve vNext 产品需求文档

> 版本: v0.1
> 日期: 2026-04-09
> 状态: PRD 草案
> 关联文档:
> - [ForgeNerve-vNext差异化战略](./ForgeNerve-vNext差异化战略.md)
> - [ForgeNerve-vNext技术方案](./ForgeNerve-vNext技术方案.md)
> - [ForgeNerve-vNext开发计划](./ForgeNerve-vNext开发计划.md)

---

## 1. 版本目标

ForgeNerve vNext 的目标不是增加零散功能，而是让产品从“可用的 Agent 知识工作台”进入“具备行业差异化的知识运行系统”阶段。

本轮开发前冻结口径：

- `vNext.1 = 当前准备开工的版本`
- `vNext.1 P0 = Inbox + Session + Verified Draft + Reliability Dashboard + Context Pack Foundation`
- `vNext.2 = Team Publish / Session Templates / 更完整 Review Queue`

本版本聚焦四个结果：

1. Agent 与知识交互更稳定
2. AI 写入从草稿升级为受控变更流
3. 团队能持续运营知识质量
4. 项目知识能被打包、复用并为后续发布做准备

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

### 3.1 现有 Agent 写入过于脆弱

- 一次写入大段 Markdown 容易出错
- 用户不容易看清 Agent 到底改了什么
- Agent 缺少更适合长文档的协作介质

### 3.2 知识入口太单一

- 导入之后很快变成“用户自己整理”
- 没有把“候选知识”与“正式知识”分层

### 3.3 知识质量难长期维持

- 没摘要、没标签、没来源、过期内容会持续累积
- 缺少一个让团队持续经营知识质量的界面

### 3.4 团队复用不够顺滑

- 项目知识很难打包给新的 Agent 或新的项目复用
- 知识分享仍偏文档级，不够 workflow 级

---

## 4. 产品原则

1. `Local-first`
2. `Git-native`
3. `Agent-first but human-approved`
4. `Structured writes over blind overwrites`
5. `Operational knowledge over passive notes`

---

## 5. 版本范围

## 5.1 P0：必须交付

### P0.1 Knowledge Inbox

新增“知识收件箱”层，承接以下来源：

- Agent draft 派生项
- 导入后的待整理项
- 剪贴 / 粘贴 / 外部抓取候选项
- 手动加入的知识候选

核心能力：

- 候选项列表
- 候选项状态：待整理 / 已转知识 / 已忽略 / 待复核
- 从候选项一键生成正式知识或生成草稿

交付说明：

- `vNext.1` 优先保证“候选项 -> Draft”闭环
- 候选项直接进入正式知识在产品范围内保留，但对应 MCP tool `promote_inbox_item_to_knowledge` 计划在 `S2+` 补齐
- 桌面端可先通过 Review / Draft 工作流承接直接落知识的用户需求

### P0.2 Agent Session

新增 Agent 会话视图，记录：

- 会话目标
- Agent 名称 / 来源
- 读取过的知识
- 生成的 draft
- 最终提交结果

核心能力：

- 会话列表
- 会话详情
- 会话中的上下文摘要
- 从会话回到相关 draft / knowledge

### P0.3 Verified Draft Flow

在现有 draft 基础上升级：

- 草稿分组预览
- 草稿验证提示
- 批量确认 / 批量丢弃
- 退回 Agent 修改
- 冲突原因说明

### P0.4 Reliability Dashboard

新增知识可靠性视图，至少包含：

- 无摘要
- 无标签
- 无来源
- 摘要过期
- 长期未更新
- 孤立知识
- 引用失效

### P0.5 Context Pack Foundation

允许把知识库的一部分导出为可复用上下文包：

- 以主题 / 项目 / 文件夹 / 标签为维度打包
- 输出 pack 元信息
- 供 Agent Session 直接引用

说明：

- vNext.1 只交付 Foundation 能力
- 不包含 Team Publish、分享、订阅与托管分发

---

## 5.2 P1：应该交付

### P1.1 Team Publish

- 将选定目录 / pack / handbook 发布为只读共享视图
- 支持本地导出与后续静态托管

### P1.2 Unified Knowledge Review Queue

- 提供“待确认知识变更”统一队列
- 合并来自 Agent、导入、人工批量整理的变更项

说明：

- vNext.1 中已有最小 `Review` 一级入口，用于承接 Draft 审阅
- 此处 `Unified Knowledge Review Queue` 指更完整的统一变更队列，属于后续增强

### P1.3 Session Templates

- 为常见工作流提供 Agent 会话模板：
  - 更新项目周报
  - 补充 runbook
  - 整理会议纪要
  - 提炼 issue / PR 知识

---

## 5.3 P2：可延后

- 组织级指标面板
- 自动复核策略
- 高级权限模型
- 云同步 / 远端服务化

---

## 6. 用户流程

### 6.1 Agent 写入流程

1. 用户在桌面端发起或接收一个 Agent 会话
2. Agent 通过 MCP 读取知识与 context pack
3. Agent 生成 draft / inbox items
4. ForgeNerve 提示校验与风险
5. 用户批量确认、部分退回或丢弃
6. 已确认变更进入知识库并留下 Git 记录

其中第 4 步的“校验与风险”第一版至少包括：

- Draft 是否关联到合法知识路径
- 是否存在明显冲突或目标文件已变化
- 是否缺少摘要 / 标签 / 来源等关键元信息
- 是否属于高风险覆盖写入

### 6.2 导入整理流程

1. 用户导入 Markdown / 外部内容
2. 系统先进入 Inbox
3. 系统生成候选分类、标签、摘要建议
4. 用户将候选项转为正式知识或丢弃

### 6.3 知识运营流程

1. 用户打开 Reliability Dashboard
2. 查看高风险项
3. 批量进入处理流
4. 处理结果形成新的会话、draft 或直接修复

---

## 7. 核心功能细化

## 7.1 Inbox 数据模型

字段建议：

- `id`
- `source_type`
- `source_agent`
- `title`
- `snippet`
- `proposed_path`
- `status`
- `created_at`
- `updated_at`
- `linked_draft_id`
- `linked_session_id`

## 7.2 Session 数据模型

字段建议：

- `session_id`
- `agent_name`
- `goal`
- `status`
- `context_items`
- `draft_ids`
- `result_summary`
- `started_at`
- `finished_at`

## 7.3 Reliability 信号

第一版建议只做规则型信号，不上复杂 AI 判断：

- 无摘要
- 无标签
- 无来源
- 超过阈值未更新
- 引用目标不存在
- 分类不规范

## 7.4 Review 边界冻结

- `Review` 是 vNext.1 的一级导航名称
- `Review Queue` 是对该导航的功能描述
- vNext.1 的 `Review` 仅承接 Draft 待确认变更
- 更完整的统一变更队列留在 `P1.2`

---

## 8. 指标

### 8.1 产品指标

- Draft 提交成功率
- Draft 被丢弃比例
- Inbox 转正式知识比例
- Reliability 问题修复率
- Agent Session 完成率

vNext.1 内部验收基线建议：

- 最小 Agent 写入闭环 E2E 成功率 `>= 90%`
- Draft 提交成功率 `>= 90%`（基于验收脚本集）
- Session 创建与完成成功率 `>= 95%`

### 8.2 体验指标

- 首次 Agent 写入确认时间
- 批量处理知识问题的平均时长
- 用户在桌面端完成确认的比例

vNext.1 内部体验基线建议：

- 首次 Agent 写入确认时间 `<= 3 分钟`
- 桌面端从 Session / Inbox 进入 Review 预览不超过 `3` 次点击

### 8.3 质量指标

- 冲突提交率
- 失效引用占比
- 无摘要知识占比
- 过期知识占比

vNext.1 内部质量基线建议：

- 冲突提交率在验收脚本集中 `<= 10%`
- 不允许出现 Draft / Inbox / Session 关联错绑

---

## 9. 兼容与迁移

### 9.1 兼容策略

- 继续沿用 `.memoforge/`
- 继续兼容现有 `drafts/`、`config.yaml`、知识内容目录
- 不在 `vNext.1` 重命名 crate、目录或底层数据根

### 9.2 新增目录

`vNext.1` 新增：

- `.memoforge/inbox/`
- `.memoforge/sessions/`
- `.memoforge/packs/`

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

---

## 10. 版本验收标准

满足以下条件可认为 vNext 达标：

1. Agent 可以围绕 session + draft + inbox 稳定工作
2. 用户可在桌面端完成完整的审阅与确认闭环
3. 用户能清晰看到知识质量问题并批量处理
4. 用户能生成可复用 context pack
5. 团队能明显感知 ForgeNerve 不再只是“知识编辑器”
