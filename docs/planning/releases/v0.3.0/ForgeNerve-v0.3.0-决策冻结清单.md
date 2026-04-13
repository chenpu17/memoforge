# ForgeNerve v0.3.0 决策冻结清单

> 目标版本: v0.3.0
> 日期: 2026-04-12
> 文档类型: 决策冻结清单
> 状态: 待评审
> 关联文档:
> - [ForgeNerve-v0.3.0产品需求文档](./ForgeNerve-v0.3.0-产品需求文档.md)
> - [ForgeNerve-v0.3.0技术方案](./ForgeNerve-v0.3.0-技术方案.md)
> - [ForgeNerve-v0.3.0数据模型与状态机](./ForgeNerve-v0.3.0-数据模型与状态机.md)
> - [ForgeNerve-v0.3.0 MCP契约矩阵](./ForgeNerve-v0.3.0-MCP契约矩阵.md)

---

## 1. 文档目的

本文件用于在正式开发前冻结关键决策，避免 Sprint 中途反复改口径。

---

## 2. 版本范围冻结

### 2.1 P0 冻结项

本版本 P0 范围冻结为：

1. `Workflow Templates / Playbooks`
2. `Unified Review Queue`
3. `Evidence-backed Knowledge`
4. `Reliability & Freshness Operations`
5. `Agent Context Reuse Polish`

### 2.2 现状校准冻结

以下结论在本轮评审中同步冻结：

- 当前代码基线已存在 `Inbox / Session / Review / Reliability / Context Pack` 入口与基础能力
- `v0.3.0` 成功与否，不再以“这些模块是否存在”作为判定
- `Inbox / Session / Context Pack` 在 `v0.3.0` 中是支撑层，不是版本 headline

### 2.3 本版本明确不做

- 复杂权限系统
- 完整云端协作
- crate / 目录 / `.memoforge` 全量重命名
- 通用页面数据库路线
- 通用聊天产品路线
- 为了模板而引入重型编排引擎

---

## 3. 模型边界冻结

### 3.1 Workflow Template

定义：

- 高频知识工作流的可执行模板
- 负责携带目标、默认上下文、建议输出位置、审阅标准

### 3.2 Review Item

定义：

- 面向用户的统一审阅投影
- 负责承接来自 Draft / Inbox / Reliability / 导入整理的待确认项

### 3.3 Evidence Meta

定义：

- 知识可信度的最小证据层
- 负责记录来源、owner、验证者、验证时间、适用版本等信息

### 3.4 Freshness Policy

定义：

- 知识复查与治理规则
- 负责 SLA、owner、复查状态和提醒入口

### 3.5 支撑对象

`Inbox / Session / Context Pack` 的冻结角色为：

- Workflow Template 的上下文与产出承载层
- Review Queue 的来源对象层
- 后续复用推荐能力的基础层

---

## 4. 存储策略冻结

兼容期内继续使用 `.memoforge`：

- `.memoforge/inbox/`
- `.memoforge/sessions/`
- `.memoforge/drafts/`
- `.memoforge/packs/`

同时允许在知识 frontmatter 或关联元数据中扩展：

- `owner`
- `verified_at`
- `verified_by`
- `valid_for_version`
- 关联 URL / issue / PR / commit 的证据字段

不在本版本内进行底层目录迁移。

---

## 5. 契约冻结

### 5.1 当前基线契约

现有 Inbox / Session / Draft / Reliability / Context Pack 相关 tool 与桌面接口保持兼容，不做破坏性更名。

### 5.2 v0.3.0 新增契约方向

在正式实现前，需要冻结以下新增契约方向：

1. 模板启动与模板配置
2. 统一 Review Item 读取与决策
3. Evidence Meta 的读写边界
4. Freshness / SLA 的最小输入输出

详细命名与 request / response 以 `ForgeNerve-v0.3.0-MCP契约矩阵.md` 和 `ForgeNerve-v0.3.0-桌面接口冻结表.md` 后续冻结结果为准。

---

## 6. 桌面端入口冻结

当前桌面端的稳定入口基线为：

1. `Inbox`
2. `Sessions`
3. `Review`
4. `Reliability`
5. `Packs`

其中：

- `Review` 是统一变更中心的承载入口
- `Draft` 是 Review 的底层对象，不单独作为版本叙事核心
- `v0.3.0` 的桌面端重点是升级现有入口，而不是重新发明一级导航

---

## 7. Sprint 1 冻结范围

Sprint 1 只做以下内容：

1. 盘点当前基线与文档口径差异
2. 冻结 `WorkflowTemplate / ReviewItem / EvidenceMeta / FreshnessPolicy` 最小模型
3. 冻结新增 MCP / Tauri / frontend 契约方向
4. 建立回归测试基线
5. 文档口径同步

Sprint 1 不做：

- 从零新建新的 Inbox / Session / Review 面板
- 完整 Workflow 引擎
- 完整 Pack Recommendation
- Team Publish
- 大规模导航重构

---

## 8. 验收冻结

如果出现以下任一情况，视为偏离冻结范围：

- 继续把对象模型清单当成版本卖点
- 把 Session 做成聊天产品
- 把 Review 做成只承接单一 Draft 的旧视角
- 没有证据层却宣称“知识可信”
- 没有治理闭环却宣称“知识可持续运营”

---

## 9. 评审后必须确认的事项

- [ ] P0 范围是否认可
- [ ] “现有基线已存在”这一校准结论是否认可
- [ ] Workflow / Review / Evidence / Freshness 四层边界是否认可
- [ ] `.memoforge` 兼容策略是否认可
- [ ] 新增契约方向是否认可
- [ ] Sprint 1 范围是否认可
- [ ] 数据模型与状态机是否认可
- [ ] 依赖矩阵是否认可
