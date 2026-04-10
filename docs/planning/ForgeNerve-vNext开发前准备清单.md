# ForgeNerve vNext 开发前准备清单

> 版本: v0.1
> 日期: 2026-04-09
> 状态: 开发前文档总表
> 关联文档:
> - [ForgeNerve-vNext差异化战略](./ForgeNerve-vNext差异化战略.md)
> - [ForgeNerve-vNext产品需求文档](./ForgeNerve-vNext产品需求文档.md)
> - [ForgeNerve-vNext技术方案](./ForgeNerve-vNext技术方案.md)
> - [ForgeNerve-vNext开发计划](./ForgeNerve-vNext开发计划.md)
> - [ForgeNerve-vNext任务清单](./ForgeNerve-vNext任务清单.md)
> - [ForgeNerve-vNext文档索引](./ForgeNerve-vNext文档索引.md)
> - [ForgeNerve-vNext桌面接口冻结表](./ForgeNerve-vNext%E6%A1%8C%E9%9D%A2%E6%8E%A5%E5%8F%A3%E5%86%BB%E7%BB%93%E8%A1%A8.md)

---

## 1. 文档目的

本文件是 ForgeNerve vNext 开发正式开工前的总入口。

目标：

1. 明确哪些规划文档已经具备
2. 明确哪些冻结项必须先确认
3. 明确 Sprint 1 应如何拆解
4. 明确测试与验收标准
5. 明确 Claude Code Agent Teams 如何组织

---

## 2. 当前已具备的核心文档

- [x] 差异化战略：`ForgeNerve-vNext差异化战略.md`
- [x] 产品需求文档：`ForgeNerve-vNext产品需求文档.md`
- [x] 技术方案：`ForgeNerve-vNext技术方案.md`
- [x] 开发计划：`ForgeNerve-vNext开发计划.md`
- [x] 总任务清单：`ForgeNerve-vNext任务清单.md`

---

## 3. 本轮新增的开发前文档

- [x] 开发前准备清单：`ForgeNerve-vNext开发前准备清单.md`
- [x] 决策冻结清单：`ForgeNerve-vNext决策冻结清单.md`
- [x] Sprint 1 任务拆解：`ForgeNerve-vNext Sprint1任务拆解.md`
- [x] 测试与验收计划：`ForgeNerve-vNext测试与验收计划.md`
- [x] Agent Teams 提示词：`ForgeNerve-vNext Agent Teams提示词.md`
- [x] 数据模型与状态机：`ForgeNerve-vNext数据模型与状态机.md`
- [x] MCP 契约矩阵：`ForgeNerve-vNext MCP契约矩阵.md`
- [x] 依赖矩阵：`ForgeNerve-vNext依赖矩阵.md`
- [x] Sprint 1 验收矩阵：`ForgeNerve-vNext Sprint1验收矩阵.md`
- [x] 桌面接口冻结表：`ForgeNerve-vNext桌面接口冻结表.md`

---

## 4. 开发前 TODO List

### 4.1 方案冻结

- [ ] 冻结 vNext P0 范围：Inbox / Session / Verified Draft / Reliability / Context Pack
- [ ] 冻结 Session / Inbox / Draft 三层边界
- [ ] 冻结 Sprint 1 的 MCP 最小工具集
- [ ] 冻结桌面端一级导航入口

### 4.2 契约冻结

- [ ] 冻结 core 数据模型
- [ ] 冻结 MCP tool 命名
- [ ] 冻结 Tauri command 命名
- [ ] 冻结前端 service 层接口

### 4.3 测试准备

- [ ] 冻结 P0 主链路 E2E 场景
- [ ] 明确哪些链路走 Rust 单测
- [ ] 明确哪些链路走前端测试
- [ ] 明确哪些链路走 Tauri E2E

### 4.4 团队准备

- [ ] 建立 Claude Code Team Lead / Worker 分工
- [ ] 明确每个 Worker 的独占文件范围
- [ ] 明确跨线依赖与合并顺序
- [ ] 明确回归责任人

### 4.5 发布准备

- [ ] README 文档入口完整
- [ ] 首版 Release Note 骨架准备
- [ ] Windows / macOS 冒烟检查单准备

---

## 5. 建议开工顺序

1. 先完成 `决策冻结清单`
2. 再冻结 `数据模型与状态机`、`MCP 契约矩阵`、`依赖矩阵`
3. 再冻结 `桌面接口冻结表`
4. 再按 `Sprint1任务拆解` 与 `Sprint1验收矩阵`
5. 开工同时执行 `测试与验收计划`
6. 由 `Agent Teams提示词` 驱动多 Agent 并行开发

---

## 6. 进入开发的门槛

只有当以下条件同时满足，才建议正式开工：

- P0 范围冻结
- 数据模型冻结
- MCP 最小契约冻结
- 桌面接口冻结完成
- 依赖矩阵确认完成
- Sprint 1 拆解完成
- Sprint 1 验收矩阵完成
- 测试矩阵准备完成
- Agent Teams 角色与职责明确

---

## 7. 建议评审顺序

建议评审按以下顺序进行：

1. `ForgeNerve-vNext差异化战略.md`
2. `ForgeNerve-vNext产品需求文档.md`
3. `ForgeNerve-vNext决策冻结清单.md`
4. `ForgeNerve-vNext数据模型与状态机.md`
5. `ForgeNerve-vNext MCP契约矩阵.md`
6. `ForgeNerve-vNext桌面接口冻结表.md`
7. `ForgeNerve-vNext依赖矩阵.md`
8. `ForgeNerve-vNext技术方案.md`
9. `ForgeNerve-vNext开发计划.md`
10. `ForgeNerve-vNext任务清单.md`
11. `ForgeNerve-vNext Sprint1任务拆解.md`
12. `ForgeNerve-vNext Sprint1验收矩阵.md`
13. `ForgeNerve-vNext测试与验收计划.md`
14. `ForgeNerve-vNext Agent Teams提示词.md`

这样可以先定方向，再定边界，再定执行。
