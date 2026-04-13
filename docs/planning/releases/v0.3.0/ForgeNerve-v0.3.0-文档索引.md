# ForgeNerve v0.3.0 文档索引

> 目标版本: v0.3.0
> 日期: 2026-04-09
> 文档类型: 导航索引
> 状态: 可评审
> 目录: `docs/planning/releases/v0.3.0/`
> 命名说明: 本目录已替代旧 `vNext` 命名

---

## 1. 文档使用目标

本文件用于把 ForgeNerve v0.3.0 的开发前文档整理成一套可进入评审、冻结与开工判定的导航图。

适用场景：

1. 新加入的主 agent 需要快速建立全局认知
2. Claude Code subagent 协作需要明确阅读顺序
3. Sprint 1 开工前需要逐项核对前置条件
4. 评审者需要快速判断哪些文档已经齐备

---

## 2. 文档全景

### 2.1 战略与需求层

1. [ForgeNerve-v0.3.0差异化战略](./ForgeNerve-v0.3.0-差异化战略.md)
   - 回答“为什么做这个版本”
   - 用于冻结竞争力方向与版本定位

2. [ForgeNerve-v0.3.0产品需求文档](./ForgeNerve-v0.3.0-产品需求文档.md)
   - 回答“这个版本要交付什么”
   - 用于冻结范围、用户价值、验收口径

### 2.2 方案与实施层

3. [ForgeNerve-v0.3.0技术方案](./ForgeNerve-v0.3.0-技术方案.md)
   - 回答“怎么做”
   - 用于冻结数据流、模块边界、协议落点

4. [ForgeNerve-v0.3.0开发计划](./ForgeNerve-v0.3.0-开发计划.md)
   - 回答“按什么顺序做”
   - 用于冻结 Sprint 路线、并行方式、团队节奏

### 2.3 开工前准备层

5. [ForgeNerve-v0.3.0开发前准备清单](./ForgeNerve-v0.3.0-开发前准备清单.md)
   - 开工前最终检查表
   - 用于核对是否具备启动条件

6. [ForgeNerve-v0.3.0决策冻结清单](./ForgeNerve-v0.3.0-决策冻结清单.md)
   - 冻结范围、边界、契约
   - 用于避免 Sprint 中途频繁改口

7. [ForgeNerve-v0.3.0数据模型与状态机](./ForgeNerve-v0.3.0-数据模型与状态机.md)
   - 模型字段、关系、状态流转冻结
   - 用于支撑 Core / MCP / Desktop 并行

8. [ForgeNerve-v0.3.0 MCP契约矩阵](./ForgeNerve-v0.3.0-MCP契约矩阵.md)
   - MCP tools 单一事实源
   - 用于冻结工具名、profile 与最小输入输出

9. [ForgeNerve-v0.3.0依赖矩阵](./ForgeNerve-v0.3.0-依赖矩阵.md)
    - 并行顺序与阻塞关系
    - 用于分配主 agent / subagent 节奏

10. [ForgeNerve-v0.3.0桌面接口冻结表](./ForgeNerve-v0.3.0-桌面接口冻结表.md)
    - Tauri command 与 frontend service 冻结表
    - 用于支撑 Desktop / Frontend 并行

### 2.4 执行与验收层

11. [ForgeNerve-v0.3.0任务清单](./ForgeNerve-v0.3.0-任务清单.md)
   - 回答“有哪些任务要进入任务系统”
   - 用于拆分 Epic / Issue / TODO

12. [ForgeNerve-v0.3.0 Sprint1任务拆解](./ForgeNerve-v0.3.0-Sprint1任务拆解.md)
   - Sprint 1 的 issue 级拆解
   - 用于直接派工

13. [ForgeNerve-v0.3.0 Sprint1验收矩阵](./ForgeNerve-v0.3.0-Sprint1验收矩阵.md)
    - Sprint 1 的完成定义
    - 用于防止验收越界

14. [ForgeNerve-v0.3.0测试与验收计划](./ForgeNerve-v0.3.0-测试与验收计划.md)
   - 测试矩阵与发布门槛
   - 用于同步 QA 与回归节奏

15. [ForgeNerve-v0.3.0 Subagent协作提示词](./ForgeNerve-v0.3.0-Subagent协作提示词.md)
    - 主 agent + subagent 协作执行模板
    - 用于按需拉起并行审查或专项实现

---

## 3. 推荐阅读顺序

建议严格按下面顺序阅读：

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
15. `ForgeNerve-v0.3.0-开发前准备清单.md`

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
- [ ] 建立主 agent / subagent 分工
- [ ] 明确文件级独占范围
- [ ] 明确跨线依赖与合并顺序

### 4.4 验收项

- [ ] 确认 Rust 单测覆盖范围
- [ ] 确认 MCP E2E 主链路
- [ ] 确认 Tauri E2E 主链路
- [ ] 确认发布前冒烟清单

---

## 5. 开工判定标准

本节描述的是“进入开发”的前置门槛，不等同于“当前文档已经全部冻结完成”。

满足以下条件后，才可视为“具备正式开工条件”：

1. 决策冻结清单完成评审
2. 数据模型与状态机确认通过
3. MCP 契约矩阵确认通过
4. 桌面接口冻结表确认通过
5. Sprint 1 任务拆解进入 issue 状态
6. Sprint 1 验收矩阵确认通过
7. subagent 协作方式明确
8. 测试与验收计划确认通过
9. README 和产品内帮助可指向这套文档

---

## 6. 角色视角入口

### 6.1 产品负责人

优先阅读：

1. `ForgeNerve-v0.3.0-差异化战略.md`
2. `ForgeNerve-v0.3.0-产品需求文档.md`
3. `ForgeNerve-v0.3.0-决策冻结清单.md`

### 6.2 技术负责人

优先阅读：

1. `ForgeNerve-v0.3.0-技术方案.md`
2. `ForgeNerve-v0.3.0-数据模型与状态机.md`
3. `ForgeNerve-v0.3.0-MCP契约矩阵.md`
4. `ForgeNerve-v0.3.0-依赖矩阵.md`
5. `ForgeNerve-v0.3.0-开发计划.md`

### 6.3 QA / Release

优先阅读：

1. `ForgeNerve-v0.3.0-Sprint1验收矩阵.md`
2. `ForgeNerve-v0.3.0-测试与验收计划.md`
3. `ForgeNerve-v0.3.0-开发前准备清单.md`

### 6.4 Claude Code 主 agent

优先阅读：

1. `ForgeNerve-v0.3.0-决策冻结清单.md`
2. `ForgeNerve-v0.3.0-数据模型与状态机.md`
3. `ForgeNerve-v0.3.0-MCP契约矩阵.md`
4. `ForgeNerve-v0.3.0-依赖矩阵.md`
5. `ForgeNerve-v0.3.0-Sprint1任务拆解.md`

---

## 7. 当前结论

截至当前，ForgeNerve v0.3.0 的开发前文档已经形成当前权威评审集，但仍处于“待冻结 / 待确认 / 待派工”状态，不能直接视为已经批准开工：

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
- 有 subagent 协作模板

下一步建议进入：

1. 评审冻结
2. 确认开工门槛
3. 建立 issue
4. 满足门槛后再按需拉起 subagent 协作
