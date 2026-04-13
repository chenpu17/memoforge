# ForgeNerve v0.3.0 技术方案

> 目标版本: v0.3.0
> 日期: 2026-04-12
> 文档类型: 技术方案
> 状态: 草案
> 关联文档:
> - [ForgeNerve-v0.3.0产品需求文档](./ForgeNerve-v0.3.0-产品需求文档.md)
> - [ForgeNerve-v0.3.0数据模型与状态机](./ForgeNerve-v0.3.0-数据模型与状态机.md)
> - [ForgeNerve-v0.3.0 MCP契约矩阵](./ForgeNerve-v0.3.0-MCP契约矩阵.md)
> - [ForgeNerve-v0.3.0桌面接口冻结表](./ForgeNerve-v0.3.0-桌面接口冻结表.md)

---

## 1. 设计原则

v0.3.0 技术实现遵循以下原则：

1. 先承认现有 `Inbox / Session / Review / Reliability / Context Pack` 已存在基线
2. 优先复用现有 `draft`、`dashboard`、`MCP SSE`、桌面入口，而不是从零再造一套
3. 新能力优先落在 `core` 和 `MCP`，桌面端消费而不重复造逻辑
4. 尽量以“增量模型和投影”扩展，而不是大规模推翻现有架构
5. 保持 `.memoforge` 兼容策略，不在同一版本重命名底层目录

---

## 2. 架构增量

建议在现有架构上新增或升级以下 5 个实现层：

### 2.1 Workflow Template 子系统

职责：

- 描述高频知识工作流的模板
- 统一目标、默认上下文、建议输出位置、完成定义

建议新增：

- `memoforge-core/src/workflow_template.rs` 或在现有模板模块中扩展 workflow 语义
- `frontend/src/components` 中的模板启动入口

实现建议：

- 第一版允许内置模板 + JSON / YAML 配置
- 不引入复杂编排引擎

第一版边界冻结：

- 模板负责提供目标、默认上下文、建议输出位置、完成定义
- Agent 仍按文字指令自由执行
- 不做结构化步骤编排、条件分支、回环节点、可视化工作流编辑器

### 2.2 Review Item 投影层

职责：

- 把 Draft / Inbox / Reliability / 导入整理的待确认项映射为统一审阅对象

实现建议：

- 以“投影层”方式实现，不强行把底层对象合并成一个存储模型
- Review Item 允许来自多个 source type
- 若 Draft 被 discard 或删除，则对应 Review 投影自动从待处理队列消失
- 若 Session / Inbox 来源缺失，则保留降级来源信息，不阻塞 Draft 决策

### 2.3 Evidence Meta 扩展层

职责：

- 为知识条目补充来源、owner、验证信息和工程事实关联

建议扩展：

- `Frontmatter`
- draft review 元数据
- 相关 Tauri / frontend types

实现建议：

- 第一版只做最小字段，不做复杂 schema 管理器
- 优先保证读写兼容与旧知识文件不被破坏
- 真值来源冻结为知识 frontmatter；Draft 阶段通过 metadata patch 承接待提交修改

### 2.4 Reliability & Freshness 治理层

职责：

- 在现有 Reliability Rules 之上增加治理语义
- 让扫描结果能关联 owner、SLA、复查动作

实现建议：

- 现有规则继续复用
- 新增 freshness policy、review owner、next_review_at 等字段
- 保持同步扫描 + 轻量缓存路线
- 真值来源冻结为知识 frontmatter；扫描缓存仅作加速，不作真值
- 采用“知识条目覆盖 > 分类默认 > 全局默认 > 90 天缺省”继承链

### 2.5 Context Reuse 收口层

职责：

- 复用现有 Session / Context Pack / Inbox 基线
- 为模板默认上下文、Session 引用和后续推荐做基础层

说明：

- v0.3.0 不要求一次做自动推荐系统
- 重点是把现有上下文对象接入模板和审阅主线

---

## 3. MCP 扩展建议

v0.3.0 不建议继续堆散乱工具，而应优先围绕工作流、审阅和证据三个方向设计更高层抽象。

### 3.1 Sprint 1 目标

- 校准当前 tool 集与代码现状
- 冻结模板、审阅、证据、freshness 的新增契约方向
- 保持现有 Inbox / Session / Draft / Reliability / Context Pack tool 兼容

### 3.2 后续阶段工具方向

- workflow template 读取 / 启动
- review item 列表 / 详情 / 决策
- evidence metadata 读写
- freshness / review reminder 最小查询

实现冻结建议：

- profile gate 真值源放在 `tools.rs`
- tool list 输出和 `call_tool` 都执行同一套 profile 可见性校验

### 3.3 设计要求

- 所有新增工具都应保持 profile-aware
- 默认 profile 只暴露对 Agent 友好的高层抽象
- legacy profile 继续兼容旧工具名
- 详细冻结以 `ForgeNerve-v0.3.0-MCP契约矩阵.md` 为准

---

## 4. 桌面端落地建议

### 4.1 当前基线

当前桌面端已经存在：

1. `Inbox`
2. `Sessions`
3. `Review`
4. `Reliability`
5. `Packs`

### 4.2 v0.3.0 的桌面端目标

- 不是新建这些入口
- 而是把它们升级成模板启动、统一审阅和可信治理的完整工作流

### 4.3 关键组件建议

前端建议新增或升级：

- `WorkflowTemplateLauncher`
- `UnifiedReviewQueue`
- `EvidenceMetaPanel`
- `FreshnessActions`
- 现有 `InboxPanel / AgentSessionPanel / ReviewPanel / ReliabilityDashboardPanel / ContextPackPanel` 的联动升级

补充：

- Sprint 2 前需至少冻结上述组件所需的 Tauri command 预留命名方向

桌面调用边界以 `ForgeNerve-v0.3.0-桌面接口冻结表.md` 为准。

---

## 5. 数据流建议

### 5.1 模板启动链路

`Workflow Template -> Session -> Inbox / Draft -> Review Item -> Commit`

### 5.2 治理修复链路

`Reliability Issue -> Review Action or Draft -> Review Item -> Commit -> Verified Metadata Update`

### 5.3 证据化链路

`Draft / Promote -> Evidence Meta Edit / Validate -> Review Decision -> Knowledge`

### 5.4 存量迁移链路

`Existing Knowledge -> Apply default freshness inheritance -> Evidence empty by default -> Reliability / Review surface missing governance info`

说明：

- 存量知识默认 `evidence = null / 空字段`
- 存量知识默认 `freshness` 通过配置继承链即时计算，不要求批量写回
- 只有用户编辑或治理动作触发时，才将显式治理字段写回 frontmatter

---

## 6. 风险与约束

1. 不要把现有对象硬合并成一个超大模型
2. 不要让 Review 层直接篡改底层对象语义
3. 不要为了证据层破坏旧 frontmatter 兼容性
4. 不要让模板系统演变成重型 workflow engine
5. 不要让 Context Pack 继续停留在“只能手工创建的基础设施”而不接入主线

---

## 7. 版本收口判断

如果技术方案落地成功，应满足：

1. 现有基线能力被保留且不回退
2. v0.3.0 新功能围绕模板、审阅、证据、治理四条线收口
3. 桌面端、MCP、core 三层不会再出现“各说各话”的口径偏差
