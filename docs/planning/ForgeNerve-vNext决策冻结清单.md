# ForgeNerve vNext 决策冻结清单

> 版本: v0.1
> 日期: 2026-04-09
> 状态: 待评审冻结
> 关联文档:
> - [ForgeNerve-vNext产品需求文档](./ForgeNerve-vNext产品需求文档.md)
> - [ForgeNerve-vNext技术方案](./ForgeNerve-vNext技术方案.md)
> - [ForgeNerve-vNext数据模型与状态机](./ForgeNerve-vNext%E6%95%B0%E6%8D%AE%E6%A8%A1%E5%9E%8B%E4%B8%8E%E7%8A%B6%E6%80%81%E6%9C%BA.md)
> - [ForgeNerve-vNext MCP契约矩阵](./ForgeNerve-vNext%20MCP%E5%A5%91%E7%BA%A6%E7%9F%A9%E9%98%B5.md)

---

## 1. 文档目的

本文件用于在正式开发前冻结关键决策，避免 Sprint 中途反复改口径。

---

## 2. 版本范围冻结

### 2.1 P0 冻结项

本版本 P0 范围冻结为：

1. `Knowledge Inbox`
2. `Agent Session`
3. `Verified Draft Flow`
4. `Reliability Dashboard`
5. `Context Pack Foundation`

### 2.2 本版本明确不做

- 复杂权限系统
- 完整云端协作
- crate / 目录 / `.memoforge` 全量重命名
- 通用页面数据库路线
- 通用聊天产品路线

---

## 3. 模型边界冻结

### 3.1 Inbox

定义：

- 候选知识项
- 尚未进入正式知识库主内容层
- 可来源于 Agent、导入、外部粘贴、人工采集

### 3.2 Draft

定义：

- 针对正式知识或拟落地知识的受控变更缓冲层
- Draft 是“要提交的改动”，不是“候选素材池”

### 3.3 Session

定义：

- 一次 Agent 协作过程记录
- Session 负责串联上下文、目标、Inbox、Draft、结果

### 3.4 Reliability Issue

定义：

- 对现有知识质量问题的规则化发现
- 问题本身不修改内容，但可生成修复 Draft

### 3.5 Context Pack

定义：

- 面向 Agent / 项目复用的知识切片包
- 可被 Session 引用

---

## 4. 存储策略冻结

兼容期内继续使用 `.memoforge`：

- `.memoforge/inbox/`
- `.memoforge/sessions/`
- `.memoforge/drafts/`
- `.memoforge/packs/`

不在本版本内进行底层目录迁移。

---

## 5. MCP 契约冻结

建议冻结以下最小工具集，详细 request / response 以 `ForgeNerve-vNext MCP契约矩阵.md` 为准：

### 5.1 Inbox

- `list_inbox_items`
- `create_inbox_item`
- `promote_inbox_item_to_draft`
- `dismiss_inbox_item`

### 5.2 Session

- `start_agent_session`
- `append_agent_session_context`
- `list_agent_sessions`
- `get_agent_session`
- `complete_agent_session`

### 5.3 Draft

- `start_draft`
- `update_draft`
- `preview_draft`
- `commit_draft`
- `discard_draft`

### 5.4 Reliability

- `list_reliability_issues`
- `create_fix_draft_from_issue`

### 5.5 Context Pack

- `list_context_packs`
- `create_context_pack`
- `get_context_pack`

---

## 6. 桌面端入口冻结

建议在桌面端增加四个稳定入口：

1. `Inbox`
2. `Sessions`
3. `Review`
4. `Reliability`

其中：

- `Review` 是待确认变更中心
- `Draft` 是 Review 的底层对象，不一定单独做一级导航
- `Review Queue` 仅作为功能描述别名，不作为单独一级导航命名

---

## 7. Sprint 1 冻结范围

Sprint 1 只做以下内容：

1. Inbox 核心模型与存储
2. Session 核心模型与存储
3. Draft / Inbox / Session 的最小 MCP 契约
4. 最小桌面端可见入口占位
5. 测试基线

Sprint 1 不做：

- Reliability 全规则
- Team Publish
- 批量复杂流程
- 大规模导航重构

---

## 8. 验收冻结

如果出现以下任一情况，视为偏离冻结范围：

- 把 Inbox 做成正式知识列表的替代品
- 把 Session 做成聊天产品
- 把 Draft 做成通用编辑器缓存
- MCP 新工具数量失控且无 profile 策略
- 桌面端入口一轮新增过多并破坏现有主流程

---

## 9. 评审后必须确认的事项

- [ ] P0 范围是否认可
- [ ] 五层模型边界是否认可
- [ ] `.memoforge` 兼容策略是否认可
- [ ] MCP 最小契约是否认可
- [ ] Sprint 1 范围是否认可
- [ ] 数据模型与状态机是否认可
- [ ] 依赖矩阵是否认可
