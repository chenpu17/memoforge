# ForgeNerve v0.3.0 开发计划

> 目标版本: v0.3.0
> 日期: 2026-04-12
> 文档类型: 开发计划
> 状态: 草案
> 关联文档:
> - [ForgeNerve-v0.3.0差异化战略](./ForgeNerve-v0.3.0-差异化战略.md)
> - [ForgeNerve-v0.3.0产品需求文档](./ForgeNerve-v0.3.0-产品需求文档.md)
> - [ForgeNerve-v0.3.0技术方案](./ForgeNerve-v0.3.0-技术方案.md)
> - [ForgeNerve-v0.3.0依赖矩阵](./ForgeNerve-v0.3.0-依赖矩阵.md)
> - [ForgeNerve-v0.3.0 Sprint1验收矩阵](./ForgeNerve-v0.3.0-Sprint1验收矩阵.md)

---

## 1. 计划摘要

v0.3.0 建议拆为 5 个 Sprint，以“先校准现状和数据契约，再打穿用户工作流，再补可信治理闭环”为顺序推进。

v0.3.0 核心交付：

1. Workflow Templates / Playbooks
2. Unified Review Queue
3. Evidence-backed Knowledge
4. Reliability & Freshness Operations
5. Agent Context Reuse Polish

说明：

- `Inbox / Session / Review / Reliability / Context Pack` 已是现有基线
- v0.3.0 的目标不是从零新建这些模块，而是把它们升级成统一工作流体验

---

## 2. 里程碑

| 里程碑 | 目标 | 交付 |
|---|---|---|
| V1 | 基线校准 | 现状盘点、模型冻结、回归基线 |
| V2 | 工作流起跑 | Workflow Templates + 当前入口接线升级 |
| V3 | 审阅收口 | Unified Review Queue + 来源聚合 |
| V4 | 可信治理 | Evidence Meta + Freshness SLA + Reliability 升级 |
| V5 | 发布收口 | Context Reuse polish、文档、测试、帮助、发布准备 |

---

## 3. Sprint 规划

### Sprint 1：基线校准与冻结

目标：

- 把当前代码现状、文档口径和 v0.3.0 新叙事对齐

任务：

1. 盘点现有 Inbox / Session / Review / Reliability / Packs 基线
2. 冻结 `WorkflowTemplate` / `ReviewItem` / `EvidenceMeta` / `FreshnessPolicy` 最小模型
3. 冻结现有 GUI 入口与升级边界
4. 冻结最小新增 MCP / Tauri / frontend 契约方向
5. 建立回归测试基线
6. 同步 README / help / 文档口径

说明：

- Sprint 1 的关账目标不是“再做一个新面板”，而是把现有能力与 v0.3.0 新版本定位对齐
- Sprint 1 要明确哪些是已有能力，哪些是 v0.3.0 真正新增价值

### Sprint 2：Workflow Templates / Playbooks

目标：

- 用户可以通过模板启动高频知识工作流

任务：

1. 模板数据结构与内置模板首版
2. 模板默认上下文与建议输出位置
3. 当前 Inbox / Session / Review 入口联动升级
4. 模板启动后的状态回写
5. 帮助文档与设置页升级

说明：

- Sprint 2 是对现有 GUI 和服务层做升级，不是从零建设 `InboxPanel` 或 `ReviewPanel`

### Sprint 3：Unified Review Queue

目标：

- 用户在一个入口中处理所有待确认知识变更

任务：

1. Review Item 投影模型
2. 多来源聚合列表
3. 风险提示与来源标识
4. 统一确认 / 退回 / 丢弃动作
5. 与 Session / Inbox / Reliability 状态联动

说明：

- Sprint 3 的 Review 投影与动作层可与 Sprint 4 的 Core evidence / freshness 字段扩展部分并行
- 前提是 Sprint 1 已冻结 `ReviewItem` 与治理字段边界

### Sprint 4：Evidence-backed Knowledge + Freshness

目标：

- 新沉淀的知识变得可追溯、可验证、可治理

任务：

1. Evidence 元字段与最小 UI 展示
2. Git / PR / Commit / URL 关联基础能力
3. owner / verified_at / valid_for_version 支撑
4. Freshness SLA 与复查入口
5. Reliability 从扫描升级为治理入口

说明：

- Sprint 4 不必等 Sprint 3 全部前端交互完成后再开始
- Core 层的 `EvidenceMeta / FreshnessPolicy / migration defaults` 可提前并行推进
- 但 Sprint 4 的 UI 接线仍依赖 Sprint 3 的统一 Review 入口稳定

### Sprint 5：Context Reuse Polish + 发布收口

目标：

- 让模板、上下文和治理闭环足够顺手，并形成可对外叙事的版本

任务：

1. 模板默认上下文 polish
2. Session / Pack / Review 跳转路径优化
3. 端到端测试补齐
4. README / 官网 / 应用帮助升级
5. 发布说明与多平台检查
6. 存量知识迁移展示收口与默认值验证

---

## 4. Claude Code Subagent 协作建议

建议采用：

- `1` 个主 agent
- `1~2` 个按需 subagent

### 主 agent

职责：

- 盘点当前现状
- 拆任务
- 管依赖
- 控制变更边界
- 集成代码与文档口径

### Subagent A：专项核查或实现

职责：

- 按需承担 `Core / MCP / Desktop` 中一个清晰子问题
- 输出明确结论或小范围实现
- 不扩张任务边界

### Subagent B：独立验证

职责：

- 做二次审查
- 做事实核对或回归验证
- 只在主 agent 需要并行验证时启用

---

## 5. 并行策略

推荐并行顺序：

1. 主 agent 先完成现状校准与边界冻结
2. 如需并行，先派一个 subagent 做专项核查或小范围实现
3. 主 agent 负责冻结 MCP / Tauri / frontend 契约
4. 主 agent 集成代码、文档与验证结果
5. 如需二次确认，再派第二个 subagent 做独立验证
6. 以 `ForgeNerve-v0.3.0-依赖矩阵.md` 为并行依据

---

## 6. 验收门槛

### 6.1 功能验收

- Sprint 1：完成现状校准、模型冻结、回归基线和文档同步
- Sprint 2：至少一个 Workflow Template 能打通完整链路
- Sprint 3：Review 可统一看到多来源待确认项
- Sprint 4：知识条目具备最小证据层与 freshness 入口
- Sprint 5：模板、审阅、治理与上下文复用形成完整版本叙事

### 6.2 测试验收

- Core 单测覆盖新增模型与状态机
- MCP E2E 覆盖模板启动、审阅动作、证据元字段
- Tauri E2E 覆盖主流程
- 前端测试覆盖关键交互
- Sprint 1 细则以 `ForgeNerve-v0.3.0-Sprint1验收矩阵.md` 为准

### 6.3 产品验收

- README 和帮助文档能清楚解释三个用户承诺
- 用户能在桌面端理解“模板启动、统一审阅、证据化治理”主线
- 版本叙事不再依赖“某个面板是否存在”

---

## 7. 风险控制

1. 不把现有入口是否存在误当成版本价值
2. 不继续按对象模型拆散用户工作流
3. 不在同一版本内做底层 crate rename
4. 不让 MCP 新工具数量失控
5. 所有新链路必须先有测试再扩大范围
