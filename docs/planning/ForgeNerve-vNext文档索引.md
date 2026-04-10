# ForgeNerve vNext 文档索引

> 版本: v0.1
> 日期: 2026-04-09
> 状态: 开发前导航总览

---

## 1. 文档使用目标

本文件用于把 ForgeNerve vNext 的开发前文档整理成一套可进入评审、冻结与开工判定的导航图。

适用场景：

1. 新加入的 Lead 需要快速建立全局认知
2. Claude Code Agent Teams 需要明确阅读顺序
3. Sprint 1 开工前需要逐项核对前置条件
4. 评审者需要快速判断哪些文档已经齐备

---

## 2. 文档全景

### 2.1 战略与需求层

1. [ForgeNerve-vNext差异化战略](./ForgeNerve-vNext差异化战略.md)
   - 回答“为什么做这个版本”
   - 用于冻结竞争力方向与版本定位

2. [ForgeNerve-vNext产品需求文档](./ForgeNerve-vNext产品需求文档.md)
   - 回答“这个版本要交付什么”
   - 用于冻结范围、用户价值、验收口径

### 2.2 方案与实施层

3. [ForgeNerve-vNext技术方案](./ForgeNerve-vNext技术方案.md)
   - 回答“怎么做”
   - 用于冻结数据流、模块边界、协议落点

4. [ForgeNerve-vNext开发计划](./ForgeNerve-vNext开发计划.md)
   - 回答“按什么顺序做”
   - 用于冻结 Sprint 路线、并行方式、团队节奏

### 2.3 开工前准备层

5. [ForgeNerve-vNext开发前准备清单](./ForgeNerve-vNext开发前准备清单.md)
   - 开工前最终检查表
   - 用于核对是否具备启动条件

6. [ForgeNerve-vNext决策冻结清单](./ForgeNerve-vNext决策冻结清单.md)
   - 冻结范围、边界、契约
   - 用于避免 Sprint 中途频繁改口

7. [ForgeNerve-vNext数据模型与状态机](./ForgeNerve-vNext%E6%95%B0%E6%8D%AE%E6%A8%A1%E5%9E%8B%E4%B8%8E%E7%8A%B6%E6%80%81%E6%9C%BA.md)
   - 模型字段、关系、状态流转冻结
   - 用于支撑 Core / MCP / Desktop 并行

8. [ForgeNerve-vNext MCP契约矩阵](./ForgeNerve-vNext%20MCP%E5%A5%91%E7%BA%A6%E7%9F%A9%E9%98%B5.md)
   - MCP tools 单一事实源
   - 用于冻结工具名、profile 与最小输入输出

9. [ForgeNerve-vNext依赖矩阵](./ForgeNerve-vNext%E4%BE%9D%E8%B5%96%E7%9F%A9%E9%98%B5.md)
    - 并行顺序与阻塞关系
    - 用于分配 Team Lead / Worker 节奏

10. [ForgeNerve-vNext桌面接口冻结表](./ForgeNerve-vNext%E6%A1%8C%E9%9D%A2%E6%8E%A5%E5%8F%A3%E5%86%BB%E7%BB%93%E8%A1%A8.md)
    - Tauri command 与 frontend service 冻结表
    - 用于支撑 Desktop / Frontend 并行

### 2.4 执行与验收层

11. [ForgeNerve-vNext任务清单](./ForgeNerve-vNext任务清单.md)
   - 回答“有哪些任务要进入任务系统”
   - 用于拆分 Epic / Issue / TODO

12. [ForgeNerve-vNext Sprint1任务拆解](./ForgeNerve-vNext%20Sprint1任务拆解.md)
   - Sprint 1 的 issue 级拆解
   - 用于直接派工

13. [ForgeNerve-vNext Sprint1验收矩阵](./ForgeNerve-vNext%20Sprint1%E9%AA%8C%E6%94%B6%E7%9F%A9%E9%98%B5.md)
    - Sprint 1 的完成定义
    - 用于防止验收越界

14. [ForgeNerve-vNext测试与验收计划](./ForgeNerve-vNext测试与验收计划.md)
   - 测试矩阵与发布门槛
   - 用于同步 QA 与回归节奏

15. [ForgeNerve-vNext Agent Teams提示词](./ForgeNerve-vNext%20Agent%20Teams提示词.md)
    - 多 Agent 协作执行模板
    - 用于 Lead 拉起团队并行开发

---

## 3. 推荐阅读顺序

建议严格按下面顺序阅读：

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
15. `ForgeNerve-vNext开发前准备清单.md`

原则：

- 先定方向
- 再定范围
- 再定边界
- 再定实现
- 最后定执行与验收

---

## 4. 开工前 TODO 总览

### 4.1 冻结项

- [ ] 冻结 P0 范围
- [ ] 冻结 Inbox / Session / Draft 边界
- [ ] 冻结 Sprint 1 最小 MCP Tool 集
- [ ] 冻结桌面端一级导航入口

### 4.2 契约项

- [ ] 冻结 `memoforge-core` 数据模型
- [ ] 冻结 `memoforge-mcp` tool 名称与输入输出
- [ ] 冻结 `memoforge-tauri` command / event 命名
- [ ] 冻结 `frontend/src` service / store 接口

### 4.3 执行项

- [ ] 把 Sprint 1 拆解写入任务系统
- [ ] 建立 Lead / Worker 分工
- [ ] 明确文件级独占范围
- [ ] 明确跨线依赖与合并顺序

### 4.4 验收项

- [ ] 确认 Rust 单测覆盖范围
- [ ] 确认 MCP E2E 主链路
- [ ] 确认 Tauri E2E 主链路
- [ ] 确认发布前冒烟清单

---

## 5. 开工判定标准

满足以下条件后，视为“可正式开工”：

1. 决策冻结清单完成评审
2. 数据模型与状态机确认通过
3. MCP 契约矩阵确认通过
4. 桌面接口冻结表确认通过
5. Sprint 1 任务拆解进入 issue 状态
6. Sprint 1 验收矩阵确认通过
7. Agent Teams 分工明确
8. 测试与验收计划确认通过
9. README 和产品内帮助可指向这套文档

---

## 6. 角色视角入口

### 6.1 产品负责人

优先阅读：

1. `ForgeNerve-vNext差异化战略.md`
2. `ForgeNerve-vNext产品需求文档.md`
3. `ForgeNerve-vNext决策冻结清单.md`

### 6.2 技术负责人

优先阅读：

1. `ForgeNerve-vNext技术方案.md`
2. `ForgeNerve-vNext数据模型与状态机.md`
3. `ForgeNerve-vNext MCP契约矩阵.md`
4. `ForgeNerve-vNext依赖矩阵.md`
5. `ForgeNerve-vNext开发计划.md`

### 6.3 QA / Release

优先阅读：

1. `ForgeNerve-vNext Sprint1验收矩阵.md`
2. `ForgeNerve-vNext测试与验收计划.md`
3. `ForgeNerve-vNext开发前准备清单.md`

### 6.4 Claude Code Team Lead

优先阅读：

1. `ForgeNerve-vNext决策冻结清单.md`
2. `ForgeNerve-vNext数据模型与状态机.md`
3. `ForgeNerve-vNext MCP契约矩阵.md`
4. `ForgeNerve-vNext依赖矩阵.md`
5. `ForgeNerve-vNext Sprint1任务拆解.md`

---

## 7. 当前结论

截至当前，ForgeNerve vNext 的开发前文档已经形成完整闭环，但仍需完成冻结后才能正式开工：

- 有战略
- 有需求
- 有技术方案
- 有开发计划
- 有任务清单
- 有冻结清单
- 有数据模型与状态机
- 有 MCP 契约矩阵
- 有依赖矩阵
- 有桌面接口冻结表
- 有 Sprint 1 拆解
- 有 Sprint 1 验收矩阵
- 有测试与验收计划
- 有 Agent Teams 执行模板

下一步建议进入：

1. 评审冻结
2. 确认开工门槛
3. 建立 issue
4. 拉起 Agent Teams 开发
