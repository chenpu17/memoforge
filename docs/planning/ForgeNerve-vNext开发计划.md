# ForgeNerve vNext 开发计划

> 版本: v0.1
> 日期: 2026-04-09
> 状态: 执行计划草案
> 关联文档:
> - [ForgeNerve-vNext差异化战略](./ForgeNerve-vNext差异化战略.md)
> - [ForgeNerve-vNext产品需求文档](./ForgeNerve-vNext产品需求文档.md)
> - [ForgeNerve-vNext技术方案](./ForgeNerve-vNext技术方案.md)
> - [ForgeNerve-vNext依赖矩阵](./ForgeNerve-vNext%E4%BE%9D%E8%B5%96%E7%9F%A9%E9%98%B5.md)
> - [ForgeNerve-vNext Sprint1验收矩阵](./ForgeNerve-vNext%20Sprint1%E9%AA%8C%E6%94%B6%E7%9F%A9%E9%98%B5.md)

---

## 1. 计划摘要

vNext 建议拆为 5 个 Sprint，以“先建立壁垒，再扩展团队能力”为顺序推进。

vNext.1 核心交付：

1. Inbox
2. Agent Session
3. Verified Draft Flow
4. Reliability Dashboard
5. Context Pack Foundation

---

## 2. 里程碑

| 里程碑 | 目标 | 交付 |
|---|---|---|
| V1 | 数据层建立 | Inbox / Session / 最小 MCP 契约 |
| V2 | 桌面端闭环 | Inbox / Session / Review 可见 |
| V3 | 质量运营 | Reliability Dashboard + 修复流 |
| V4 | 复用与分发 | Context Pack Foundation + Team Publish 初版 |
| V5 | 发布级稳定 | 文档、测试、帮助、回归与发布准备 |

---

## 3. Sprint 规划

### Sprint 1：Inbox + Session Core

目标：

- 建立 vNext 的核心数据层

任务：

1. 新增 inbox store
2. 新增 session store
3. 补充 core 数据模型
4. 打通最小 MCP 工具
5. 新增基础单元测试

### Sprint 2：桌面端工作流闭环

目标：

- 用户在 GUI 中看到候选项、会话和待确认变更

任务：

1. InboxPanel
2. SessionPanel
3. ReviewPanel
4. 与 draft 预览/提交/退回联动
5. 帮助文档与设置页升级

### Sprint 3：Reliability Dashboard

目标：

- 让知识质量运营成为一等能力

任务：

1. reliability rules 第一版
2. dashboard 列表与聚合
3. issue → draft 修复流
4. 批量处理入口

### Sprint 4：Context Pack Foundation + Team Publish

目标：

- 让知识可以被打包、复用、共享

任务：

1. context pack 数据结构与读取
2. session 绑定 pack
3. pack 生成与导出
4. 初版 publish 视图

说明：

- `Context Pack Foundation` 属于 `vNext.1 P0`
- `Team Publish` 属于后续增强，可在 Sprint 4 内并行评审，但不应阻塞 `Context Pack Foundation` 验收

### Sprint 5：发布收口

目标：

- 让 vNext 成为可对外叙事的版本

任务：

1. 端到端测试补齐
2. README / 官网 / 应用帮助升级
3. 发布说明
4. Windows / macOS 发布检查

---

## 4. Claude Code Agent Teams 建议

建议采用 `1 Lead + 4 Worker`：

### Team Lead

职责：

- 拆任务
- 管依赖
- 控制变更边界
- 合并文档与代码口径

### Worker 1：Core / Data

职责：

- `inbox.rs`
- `session.rs`
- Sprint 1 的模型与状态机
- Sprint 3/4 再接 Reliability / Context Pack

### Worker 2：MCP / Contract

职责：

- 新增 MCP tools
- profile 兼容
- README / MCP help 示例

### Worker 3：Desktop / Frontend

职责：

- Inbox / Session / Review 面板
- 交互联动
- 空状态与帮助文案

### Worker 4：QA / Docs

职责：

- Rust 单测
- 前端测试
- MCP E2E
- Tauri E2E
- README / help / release note

---

## 5. 并行策略

推荐并行顺序：

1. Worker 1 先定义模型与状态机
2. Worker 2 根据模型冻结 MCP 契约
3. Worker 3 在契约冻结后并行做界面
4. Worker 4 从 Sprint 1 开始同步补测试与文档
5. 以 `ForgeNerve-vNext依赖矩阵.md` 为并行依据

---

## 6. 验收门槛

### 6.1 功能验收

- Sprint 1：Inbox 可创建、转草稿、忽略
- Session 可启动、记录上下文、串联 draft
- Review 可提供最小待确认入口
- Sprint 3：Reliability 可列问题并生成修复草稿
- Sprint 4：Context Pack 可生成并被 Session 引用

### 6.2 测试验收

- Core 单测覆盖新增状态机
- MCP E2E 覆盖新增工具
- Tauri E2E 覆盖主流程
- 前端测试覆盖关键交互
- Sprint 1 细则以 `ForgeNerve-vNext Sprint1验收矩阵.md` 为准

### 6.3 产品验收

- README 和帮助文档可解释新工作流
- 用户能在桌面端看见 `Inbox / Sessions / Review / Reliability` 叙事入口

---

## 7. 风险控制

1. 不一次性重构全部导航
2. 不把 Inbox / Session / Draft 混为一个模型
3. 不在同一版本内做底层 crate rename
4. 不让 MCP 新工具数量失控
5. 所有新链路必须先有测试再扩大范围
