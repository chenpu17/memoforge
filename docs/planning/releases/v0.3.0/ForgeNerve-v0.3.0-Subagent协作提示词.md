# ForgeNerve v0.3.0 Subagent 协作提示词

> 目标版本: v0.3.0
> 日期: 2026-04-12
> 文档类型: Subagent 协作提示词
> 状态: 待定稿
> 关联文档:
> - [ForgeNerve-v0.3.0开发计划](./ForgeNerve-v0.3.0-开发计划.md)
> - [ForgeNerve-v0.3.0 Sprint1任务拆解](./ForgeNerve-v0.3.0-Sprint1任务拆解.md)
> - [ForgeNerve-v0.3.0测试与验收计划](./ForgeNerve-v0.3.0-测试与验收计划.md)
> - [ForgeNerve-v0.3.0依赖矩阵](./ForgeNerve-v0.3.0-依赖矩阵.md)

---

## 1. 协作结构建议

建议使用：

- `1` 个主 agent
- `1~2` 个按需 subagent

### 主 agent

职责：

- 先读核心冻结文档，再按需读扩展文档
- 先做现状校准，再定义任务与接口
- 管依赖、合并与验收

### Subagent A：专项核查或实现

负责：

- `crates/memoforge-core`、`crates/memoforge-mcp`、`crates/memoforge-tauri`、`frontend/src` 中一个清晰子问题
- Sprint 1 优先承担模型冻结、MCP 收口或现有入口升级边界核查

### Subagent B：独立验证

负责：

- 单测
- E2E
- README / help / release note 二次核查

---

## 1.1 文件范围建议

- 主 agent：冻结文档、集成改动、共享契约文件
- Subagent A：一次只拿一个明确文件范围，例如 `crates/memoforge-mcp/src/tools.rs` 或 `frontend/src/services/*`
- Subagent B：`tests/`、README / help / release note 核查，或独立事实验证

规则：

1. 未经主 agent 明确指派，不跨 subagent 改核心文件
2. 共享契约改动必须先更新文档再改代码

---

## 2. 主 agent 启动前必读

主 agent 核心必读：

1. `docs/planning/releases/v0.3.0/ForgeNerve-v0.3.0-决策冻结清单.md`
2. `docs/planning/releases/v0.3.0/ForgeNerve-v0.3.0-数据模型与状态机.md`
3. `docs/planning/releases/v0.3.0/ForgeNerve-v0.3.0-MCP契约矩阵.md`
4. `docs/planning/releases/v0.3.0/ForgeNerve-v0.3.0-依赖矩阵.md`
5. `docs/planning/releases/v0.3.0/ForgeNerve-v0.3.0-Sprint1任务拆解.md`
6. `docs/planning/releases/v0.3.0/ForgeNerve-v0.3.0-Sprint1验收矩阵.md`

按需扩展阅读：

7. `docs/planning/releases/v0.3.0/ForgeNerve-v0.3.0-差异化战略.md`
8. `docs/planning/releases/v0.3.0/ForgeNerve-v0.3.0-产品需求文档.md`
9. `docs/planning/releases/v0.3.0/ForgeNerve-v0.3.0-技术方案.md`
10. `docs/planning/releases/v0.3.0/ForgeNerve-v0.3.0-开发计划.md`
11. `docs/planning/releases/v0.3.0/ForgeNerve-v0.3.0-任务清单.md`
12. `docs/planning/releases/v0.3.0/ForgeNerve-v0.3.0-测试与验收计划.md`
13. `docs/planning/releases/v0.3.0/ForgeNerve-v0.3.0-开发前准备清单.md`
14. `docs/planning/releases/v0.3.0/ForgeNerve-v0.3.0-桌面接口冻结表.md`

---

## 3. 提示词模板

复制以下内容给 Claude Code：

```text
推进 ForgeNerve v0.3.0 的第一阶段工作，默认采用主 agent + subagent 协作，而不是复杂 team 编排。目标不是立刻堆功能，而是先完成现状校准、模型冻结、MCP 收口和回归基线，为后续 Workflow Templates / Unified Review Queue / Evidence-backed Knowledge / Freshness 治理打基础。

你自己先优先阅读以下核心冻结文档，不要先把上下文窗口浪费在全部规划文档上：
1. docs/planning/releases/v0.3.0/ForgeNerve-v0.3.0-决策冻结清单.md
2. docs/planning/releases/v0.3.0/ForgeNerve-v0.3.0-数据模型与状态机.md
3. docs/planning/releases/v0.3.0/ForgeNerve-v0.3.0-MCP契约矩阵.md
4. docs/planning/releases/v0.3.0/ForgeNerve-v0.3.0-依赖矩阵.md
5. docs/planning/releases/v0.3.0/ForgeNerve-v0.3.0-Sprint1任务拆解.md
6. docs/planning/releases/v0.3.0/ForgeNerve-v0.3.0-Sprint1验收矩阵.md

如果某个 subagent 需要补上下文，再按需阅读：
7. docs/planning/releases/v0.3.0/ForgeNerve-v0.3.0-差异化战略.md
8. docs/planning/releases/v0.3.0/ForgeNerve-v0.3.0-产品需求文档.md
9. docs/planning/releases/v0.3.0/ForgeNerve-v0.3.0-技术方案.md
10. docs/planning/releases/v0.3.0/ForgeNerve-v0.3.0-开发计划.md
11. docs/planning/releases/v0.3.0/ForgeNerve-v0.3.0-任务清单.md
12. docs/planning/releases/v0.3.0/ForgeNerve-v0.3.0-测试与验收计划.md
13. docs/planning/releases/v0.3.0/ForgeNerve-v0.3.0-桌面接口冻结表.md

协作方式：

- 主 agent 负责现状校准、接口冻结、集成与最终验收
- 必要时拉起 1 个专项 subagent
- 需要二次确认时再拉第 2 个验证 subagent

要求：
1. 主 agent 负责现状校准、接口冻结和任务边界，不直接把任务拆成复杂 team 编排
2. 每个 subagent 都必须有独占文件范围或独立核查主题
3. 先做 Sprint 1，不要越界到完整 v0.3.0 范围外
4. 每个 subagent 提交结果时必须列出改动文件、完成项、未完成项、风险点
5. 验证型 subagent 可以从第一天开始并行，不等最后补测试
6. 如果要改共享契约，先更新以下文档：
   - docs/planning/releases/v0.3.0/ForgeNerve-v0.3.0-数据模型与状态机.md
   - docs/planning/releases/v0.3.0/ForgeNerve-v0.3.0-MCP契约矩阵.md
   - docs/planning/releases/v0.3.0/ForgeNerve-v0.3.0-依赖矩阵.md
   - docs/planning/releases/v0.3.0/ForgeNerve-v0.3.0-桌面接口冻结表.md
7. 负责 MCP 的 subagent 需要优先控制 tool surface，不允许继续默认扩大全量暴露面

执行顺序：
- 先做现状校准
- 再冻结数据模型
- 再冻结 MCP / Tauri / frontend 契约
- 再跑测试与回归
- Sprint 2 才进入模板启动、统一审阅和治理功能实现

完成定义：
- 当前基线能力已盘点清楚
- 新模型与契约已冻结
- MCP 收口策略已明确
- 自动化测试通过
- 文档口径一致
```

---

## 4. 使用建议

- 开工前先把 `决策冻结清单` 过一遍
- 先只做 Sprint 1，不要一口气把 v0.3.0 全部摊开
- 如果出现“工具过多 / 模型边界混乱 / UI 先行”迹象，主 agent 应立即收敛
- Sprint 1 不实现完整模板体验、统一审阅闭环和治理闭环

---

## 5. 成功标准

这套 subagent 协作成功的标准不是“看起来很忙”，而是：

1. 并行但不冲突
2. 契约先行
3. Tool surface 可控
4. 测试同步
5. 每一轮都能收口
