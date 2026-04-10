# ForgeNerve vNext Agent Teams 提示词

> 版本: v0.1
> 日期: 2026-04-09
> 状态: 执行提示词草案
> 关联文档:
> - [ForgeNerve-vNext开发计划](./ForgeNerve-vNext开发计划.md)
> - [ForgeNerve-vNext Sprint1任务拆解](./ForgeNerve-vNext%20Sprint1任务拆解.md)
> - [ForgeNerve-vNext测试与验收计划](./ForgeNerve-vNext测试与验收计划.md)
> - [ForgeNerve-vNext依赖矩阵](./ForgeNerve-vNext%E4%BE%9D%E8%B5%96%E7%9F%A9%E9%98%B5.md)

---

## 1. 团队结构建议

建议使用：

- `1 Lead`
- `4 Worker`

### Lead

职责：

- 先读核心冻结文档，再按需读扩展文档
- 定义任务与接口
- 管依赖、合并与验收

### Worker 1：Core / Data

负责：

- `crates/memoforge-core`
- Sprint 1 仅做 `Inbox / Session / DraftLink`

### Worker 2：MCP / Contract

负责：

- `crates/memoforge-mcp`
- tool contract
- profile 兼容

### Worker 3：Desktop / Frontend

负责：

- `crates/memoforge-tauri`
- `frontend/src`
- Inbox / Session / Review 最小 UI 接线

### Worker 4：QA / Docs

负责：

- 单测
- E2E
- README / help / release note

---

## 1.1 文件所有权建议

- Worker 1：`crates/memoforge-core/src/*inbox*`、`crates/memoforge-core/src/*session*`
- Worker 2：`crates/memoforge-mcp/src/tools.rs`、MCP 相关 schema / help
- Worker 3：`crates/memoforge-tauri`、`frontend/src/services`、最小入口 UI
- Worker 4：`tests/`、README / help / release note

规则：

1. 未经 Lead 明确指派，不跨 Worker 改核心文件
2. 共享契约改动必须先更新文档再改代码

---

## 2. Lead 启动前必读

Lead 核心必读：

1. `docs/planning/ForgeNerve-vNext差异化战略.md`
2. `docs/planning/ForgeNerve-vNext产品需求文档.md`
3. `docs/planning/ForgeNerve-vNext决策冻结清单.md`
4. `docs/planning/ForgeNerve-vNext数据模型与状态机.md`
5. `docs/planning/ForgeNerve-vNext MCP契约矩阵.md`
6. `docs/planning/ForgeNerve-vNext依赖矩阵.md`
7. `docs/planning/ForgeNerve-vNext Sprint1任务拆解.md`
8. `docs/planning/ForgeNerve-vNext Sprint1验收矩阵.md`

按需扩展阅读：

9. `docs/planning/ForgeNerve-vNext技术方案.md`
10. `docs/planning/ForgeNerve-vNext开发计划.md`
11. `docs/planning/ForgeNerve-vNext任务清单.md`
12. `docs/planning/ForgeNerve-vNext测试与验收计划.md`
13. `docs/planning/ForgeNerve-vNext开发前准备清单.md`
14. `docs/planning/ForgeNerve-vNext桌面接口冻结表.md`

---

## 3. 提示词模板

复制以下内容给 Claude Code：

```text
创建一个 agent team 来实现 ForgeNerve vNext 的第一阶段能力，目标是建立 Inbox + Session + Verified Draft 的最小闭环，并为后续 Reliability 与 Context Pack 打基础。

你自己先优先阅读以下核心冻结文档，不要先把上下文窗口浪费在全部规划文档上：
1. docs/planning/ForgeNerve-vNext决策冻结清单.md
2. docs/planning/ForgeNerve-vNext数据模型与状态机.md
3. docs/planning/ForgeNerve-vNext MCP契约矩阵.md
4. docs/planning/ForgeNerve-vNext依赖矩阵.md
5. docs/planning/ForgeNerve-vNext Sprint1任务拆解.md
6. docs/planning/ForgeNerve-vNext Sprint1验收矩阵.md

如果某个 Worker 需要补上下文，再按需阅读：
7. docs/planning/ForgeNerve-vNext差异化战略.md
8. docs/planning/ForgeNerve-vNext产品需求文档.md
9. docs/planning/ForgeNerve-vNext技术方案.md
10. docs/planning/ForgeNerve-vNext开发计划.md
11. docs/planning/ForgeNerve-vNext任务清单.md
12. docs/planning/ForgeNerve-vNext测试与验收计划.md
13. docs/planning/ForgeNerve-vNext桌面接口冻结表.md

然后创建 1 Lead + 4 Worker 的团队：

- Worker 1：Core / Data
- Worker 2：MCP / Contract
- Worker 3：Desktop / Frontend
- Worker 4：QA / Docs

要求：
1. Lead 负责冻结接口和任务边界，不直接写大量实现代码
2. 每个 Worker 都必须有独占文件范围
3. 先做 Sprint 1，不要越界到完整 vNext
4. 每个 Worker 提交结果时必须列出改动文件、完成项、未完成项、风险点
5. QA Worker 从第一天开始并行，不等最后补测试
6. 如果要改共享契约，先更新以下文档：
   - docs/planning/ForgeNerve-vNext数据模型与状态机.md
   - docs/planning/ForgeNerve-vNext MCP契约矩阵.md
   - docs/planning/ForgeNerve-vNext依赖矩阵.md
   - docs/planning/ForgeNerve-vNext桌面接口冻结表.md

执行顺序：
- 先冻结数据模型
- 再落 core store
- 再落 MCP 契约
- 再落桌面端最小接线
- 最后跑测试与回归

完成定义：
- Inbox 可落库
- Session 可落库
- Inbox 可转 Draft
- Session 可关联上下文与结果
- MCP 能走通最小链路
- 桌面端能看到最小结果
- 自动化测试通过
```

---

## 4. 使用建议

- 开工前先把 `决策冻结清单` 过一遍
- 先只做 Sprint 1，不要一口气把 vNext 全部摊开
- 如果出现“工具过多 / 模型边界混乱 / UI 先行”迹象，Lead 应立即收敛
- Sprint 1 不实现 Reliability / Context Pack 完整功能

---

## 5. 成功标准

这套 Team 组织成功的标准不是“看起来很忙”，而是：

1. 并行但不冲突
2. 契约先行
3. 测试同步
4. 每一轮都能收口
