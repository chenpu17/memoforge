# ForgeNerve vNext 技术方案

> 版本: v0.1
> 日期: 2026-04-09
> 状态: 技术方案草案
> 关联文档:
> - [ForgeNerve-vNext产品需求文档](./ForgeNerve-vNext产品需求文档.md)
> - [ForgeNerve-vNext数据模型与状态机](./ForgeNerve-vNext%E6%95%B0%E6%8D%AE%E6%A8%A1%E5%9E%8B%E4%B8%8E%E7%8A%B6%E6%80%81%E6%9C%BA.md)
> - [ForgeNerve-vNext MCP契约矩阵](./ForgeNerve-vNext%20MCP%E5%A5%91%E7%BA%A6%E7%9F%A9%E9%98%B5.md)
> - [ForgeNerve-vNext桌面接口冻结表](./ForgeNerve-vNext%E6%A1%8C%E9%9D%A2%E6%8E%A5%E5%8F%A3%E5%86%BB%E7%BB%93%E8%A1%A8.md)
> - [Agent协作增强与MCP精简方案](./Agent协作增强与MCP精简方案.md)
> - [Tauri桌面应用增强开发计划](./Tauri桌面应用增强开发计划.md)

---

## 1. 设计原则

vNext 技术实现遵循以下原则：

1. 尽量复用现有 `draft`、`dashboard`、`health`、`MCP SSE` 基础
2. 新能力优先落在 `core` 和 `MCP`，桌面端消费而不重复造逻辑
3. 尽量以“新模块”方式扩展，而不是大规模推翻现有架构
4. 保持 `.memoforge` 兼容策略，不在同一版本重命名底层目录

---

## 2. 架构增量

建议在现有架构上新增四个子系统：

### 2.1 Inbox 子系统

职责：

- 管理候选知识项
- 记录来源、状态、关联 draft / session
- 提供转正式知识或生成 draft 的入口

建议新增：

- `memoforge-core/src/inbox.rs`
- `memoforge-core/src/inbox_store.rs`

存储建议：

- `.memoforge/inbox/*.json`
- 索引文件：`.memoforge/inbox/index.json`

一致性建议：

- 采用临时文件 + rename 的原子写策略
- index 文件允许按需重建，不作为唯一事实源

### 2.2 Session 子系统

职责：

- 记录 Agent 协作过程
- 把“读取上下文 / 产生 draft / 最终结果”串起来

建议新增：

- `memoforge-core/src/session.rs`
- `memoforge-core/src/session_store.rs`

存储建议：

- `.memoforge/sessions/<session_id>.json`

一致性建议：

- session 文件以单文件原子写为主
- context append 失败时不允许写入半条记录

### 2.3 Reliability 子系统

职责：

- 基于规则扫描知识库问题
- 输出 dashboard 可消费的问题列表

建议新增：

- `memoforge-core/src/reliability.rs`
- `memoforge-core/src/reliability_rules.rs`

实现方式：

- 第一版同步扫描 + 轻量缓存
- 后续再做增量索引

### 2.4 Context Pack 子系统

职责：

- 将知识切片打包为 Agent 可复用上下文
- 支持导出 / 引用 / 版本化

建议新增：

- `memoforge-core/src/context_pack.rs`

产物建议：

- `.memoforge/packs/<pack_id>.json`
- 可选导出为 `.zip` 或 `.json`

---

## 3. MCP 扩展建议

vNext 不建议让 Agent 直接面对过多散乱工具，而是新增更高层抽象：

### 3.1 Sprint 1 最小工具集

- `list_inbox_items`
- `create_inbox_item`
- `promote_inbox_item_to_draft`
- `dismiss_inbox_item`

### 3.2 Sprint 1 Session 相关

- `start_agent_session`
- `append_agent_session_context`
- `get_agent_session`
- `complete_agent_session`

### 3.3 后续阶段工具

- `promote_inbox_item_to_knowledge`
- `list_agent_sessions`
- `list_reliability_issues`
- `get_reliability_issue_detail`
- `create_fix_draft_from_issue`
- `list_context_packs`
- `create_context_pack`
- `get_context_pack`
- `export_context_pack`

### 3.4 设计要求

- 所有新增工具都应保持 profile-aware
- 默认 profile 只暴露对 Agent 最友好的工具集合
- legacy profile 继续兼容旧工具名
- 详细冻结以 `ForgeNerve-vNext MCP契约矩阵.md` 为准
- Sprint 1 三种 profile 先保持统一暴露，差异化从后续阶段开始

---

## 4. 桌面端落地建议

### 4.1 新增主视图入口

建议在现有桌面工作台中增加 4 个一级入口：

1. `Inbox`
2. `Sessions`
3. `Review`
4. `Reliability`

### 4.2 视图关系

- Inbox 是知识候选层
- Review 是待确认变更层
- Sessions 是过程层
- Reliability 是运营层

### 4.3 关键组件建议

前端建议新增：

- `InboxPanel`
- `InboxItemPreview`
- `AgentSessionsPanel`
- `AgentSessionDetail`
- `ReviewPanel`
- `ReliabilityDashboardPanel`
- `ContextPackManager`

桌面调用边界以 `ForgeNerve-vNext桌面接口冻结表.md` 为准。

---

## 5. 数据与状态流

### 5.1 Inbox → Draft

- Inbox item 创建后可直接生成 draft
- 生成 draft 时记录双向关联

### 5.2 Session → Draft / Inbox

- 一个 session 可对应多个 draft
- 一个 session 可生成多个 inbox item

### 5.3 Reliability → Draft

- Reliability issue 可以直接触发“生成修复草稿”

### 5.4 Context Pack → Session

- Session 启动时可绑定一个或多个 context pack

---

## 6. 实现顺序建议

### Phase 1

- Inbox store
- Session store
- MCP 最小闭环

### Phase 2

- 桌面端 Inbox / Session / Review

### Phase 3

- Reliability rules
- Context Pack

### Phase 4

- 批量处理
- 更强的验证提示
- 发布与团队共享

---

## 7. 风险

### 7.1 模型与产品边界混乱

风险：

- Inbox / Draft / Session / Knowledge 四层边界不清

应对：

- 在实现前先冻结状态机与字段定义
- 以 `ForgeNerve-vNext数据模型与状态机.md` 为唯一事实源

### 7.2 工具爆炸

风险：

- MCP 新增过多工具，Agent 更难用

应对：

- 以高层工具为主
- 把内部细粒度逻辑收在 core

### 7.3 前端复杂度快速上升

风险：

- 视图入口增加后桌面端变重

应对：

- 先采用面板化、渐进接入
- 不一次重构整套导航

### 7.4 性能

风险：

- Reliability 扫描和 Session 数据增长可能拖慢启动

应对：

- 首版允许按需加载
- 后续引入缓存与增量索引

### 7.5 存储一致性与并发

风险：

- Tauri 与 MCP 并存时可能同时触发 Inbox / Session 写入
- index 与实体文件可能短时不一致

应对：

- 沿用现有文件锁策略
- 实体文件始终优先于索引文件
- 启动时允许对 inbox / session 索引做轻量重建
- 并发测试纳入 Sprint 1 验证范围

---

## 8. 验收建议

技术层面的完成标准：

1. Inbox / Session / Reliability / Context Pack 都有 core 数据层
2. MCP 至少完成最小可用工具集
3. 桌面端可完成核心闭环
4. 前端和 MCP 的 E2E 都覆盖新增主链路
5. README 与帮助文档同步升级
6. Sprint 1 只验收最小闭环，不把 Reliability / Context Pack 完整能力提前算入
