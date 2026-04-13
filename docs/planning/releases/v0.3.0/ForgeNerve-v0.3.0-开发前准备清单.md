# ForgeNerve v0.3.0 开发前准备清单

> 目标版本: v0.3.0
> 日期: 2026-04-12
> 文档类型: 准备清单
> 状态: 待核对
> 关联文档:
> - [ForgeNerve-v0.3.0差异化战略](./ForgeNerve-v0.3.0-差异化战略.md)
> - [ForgeNerve-v0.3.0产品需求文档](./ForgeNerve-v0.3.0-产品需求文档.md)
> - [ForgeNerve-v0.3.0技术方案](./ForgeNerve-v0.3.0-技术方案.md)
> - [ForgeNerve-v0.3.0开发计划](./ForgeNerve-v0.3.0-开发计划.md)
> - [ForgeNerve-v0.3.0任务清单](./ForgeNerve-v0.3.0-任务清单.md)
> - [ForgeNerve-v0.3.0文档索引](./ForgeNerve-v0.3.0-文档索引.md)
> - [ForgeNerve-v0.3.0桌面接口冻结表](./ForgeNerve-v0.3.0-桌面接口冻结表.md)

---

## 1. 文档目的

本文件是 ForgeNerve v0.3.0 开发正式开工前的总入口。

目标：

1. 明确哪些规划文档已经具备
2. 明确哪些冻结项必须先确认
3. 明确 Sprint 1 应如何校准现状和冻结边界
4. 明确测试与验收标准
5. 明确 Claude Code 主 agent + subagent 如何组织

---

## 2. 当前已具备的核心文档

- [x] 差异化战略：`ForgeNerve-v0.3.0-差异化战略.md`
- [x] 产品需求文档：`ForgeNerve-v0.3.0-产品需求文档.md`
- [x] 技术方案：`ForgeNerve-v0.3.0-技术方案.md`
- [x] 开发计划：`ForgeNerve-v0.3.0-开发计划.md`
- [x] 总任务清单：`ForgeNerve-v0.3.0-任务清单.md`

---

## 3. 本轮新增的开发前文档

- [x] 开发前准备清单：`ForgeNerve-v0.3.0-开发前准备清单.md`
- [x] 决策冻结清单：`ForgeNerve-v0.3.0-决策冻结清单.md`
- [x] Sprint 1 任务拆解：`ForgeNerve-v0.3.0-Sprint1任务拆解.md`
- [x] 测试与验收计划：`ForgeNerve-v0.3.0-测试与验收计划.md`
- [x] Subagent 协作提示词：`ForgeNerve-v0.3.0-Agent Teams提示词.md`
- [x] 数据模型与状态机：`ForgeNerve-v0.3.0-数据模型与状态机.md`
- [x] MCP 契约矩阵：`ForgeNerve-v0.3.0-MCP契约矩阵.md`
- [x] 依赖矩阵：`ForgeNerve-v0.3.0-依赖矩阵.md`
- [x] Sprint 1 验收矩阵：`ForgeNerve-v0.3.0-Sprint1验收矩阵.md`
- [x] 桌面接口冻结表：`ForgeNerve-v0.3.0-桌面接口冻结表.md`

---

## 4. 开发前 TODO List

### 4.1 方案冻结

- [ ] 冻结 v0.3.0 P0 范围：Workflow Templates / Unified Review / Evidence / Freshness / Context Reuse Polish
- [ ] 冻结“当前基线已存在”的版本校准结论
- [ ] 冻结 Workflow / Review / Evidence / Freshness 四层边界
- [ ] 冻结桌面端现有一级入口的升级边界

### 4.2 契约冻结

- [ ] 冻结 core 数据模型
- [ ] 冻结 MCP tool 命名方向
- [ ] 冻结 Tauri command 命名方向
- [ ] 冻结前端 service 层接口

### 4.3 测试准备

- [ ] 冻结 P0 主链路 E2E 场景
- [ ] 明确哪些链路走 Rust 单测
- [ ] 明确哪些链路走前端测试
- [ ] 明确哪些链路走 Tauri E2E

### 4.4 团队准备

- [ ] 建立主 agent / subagent 分工
- [ ] 明确每个 subagent 的专项范围
- [ ] 明确跨线依赖与合并顺序
- [ ] 明确回归责任人

### 4.5 发布准备

- [ ] README 文档入口完整
- [ ] 首版 Release Note 骨架准备
- [ ] Windows / macOS 冒烟检查单准备

---

## 5. 建议开工顺序

1. 先完成 `决策冻结清单`
2. 再冻结 `数据模型与状态机`、`MCP契约矩阵`、`依赖矩阵`
3. 再冻结 `桌面接口冻结表`
4. 再按 `Sprint1任务拆解` 与 `Sprint1验收矩阵`
5. 开工同时执行 `测试与验收计划`
6. 由 `Subagent协作提示词` 驱动主 agent + subagent 协作

---

## 6. 进入开发的门槛

只有当以下条件同时满足，才建议正式开工：

- P0 范围冻结
- 当前基线校准完成
- 数据模型冻结
- MCP 最小新增契约方向冻结
- 桌面接口冻结完成
- 依赖矩阵确认完成
- Sprint 1 拆解完成
- Sprint 1 验收矩阵完成
- 测试矩阵准备完成
- 主 agent / subagent 角色与职责明确

补充说明：

- 本清单中的“已具备核心文档”表示文档集合已存在，不表示这些文档已经全部冻结批准
- 是否可以开工，以本节门槛是否完成为准

---

## 7. 建议评审顺序

建议评审按以下顺序进行：

1. `ForgeNerve-v0.3.0-差异化战略.md`
2. `ForgeNerve-v0.3.0-产品需求文档.md`
3. `ForgeNerve-v0.3.0-决策冻结清单.md`
4. `ForgeNerve-v0.3.0-数据模型与状态机.md`
5. `ForgeNerve-v0.3.0-MCP契约矩阵.md`
6. `ForgeNerve-v0.3.0-桌面接口冻结表.md`
7. `ForgeNerve-v0.3.0-依赖矩阵.md`
8. `ForgeNerve-v0.3.0-技术方案.md`
9. `ForgeNerve-v0.3.0-开发计划.md`
10. `ForgeNerve-v0.3.0-任务清单.md`
11. `ForgeNerve-v0.3.0-Sprint1任务拆解.md`
12. `ForgeNerve-v0.3.0-Sprint1验收矩阵.md`
13. `ForgeNerve-v0.3.0-测试与验收计划.md`
14. `ForgeNerve-v0.3.0-Subagent协作提示词.md`

这样可以先定方向，再定边界，再定执行。
