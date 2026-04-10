# ForgeNerve vNext 任务清单

> 版本: v0.1
> 日期: 2026-04-09
> 状态: 待排期
> 关联文档:
> - [ForgeNerve-vNext开发计划](./ForgeNerve-vNext开发计划.md)
> - [ForgeNerve-vNext依赖矩阵](./ForgeNerve-vNext%E4%BE%9D%E8%B5%96%E7%9F%A9%E9%98%B5.md)

---

## 1. Sprint 1 核心任务

| ID | 任务 | Sprint | Owner | 依赖 | 验收 |
|---|---|---|---|---|---|
| `S1-CORE-01` | 冻结 `InboxItem` / `AgentSession` / `DraftLink` 模型 | S1 | Lead + Core | 无 | 冻结文档完成 |
| `S1-CORE-02` | 实现 inbox store | S1 | Core | `S1-CORE-01` | 单测通过 |
| `S1-CORE-03` | 实现 session store | S1 | Core | `S1-CORE-01` | 单测通过 |
| `S1-MCP-01` | 冻结最小 MCP 契约 | S1 | MCP | `S1-CORE-01` | 契约矩阵评审通过 |
| `S1-MCP-02` | 实现 inbox / session 最小 tools | S1 | MCP | `S1-MCP-01`,`S1-CORE-02`,`S1-CORE-03` | MCP smoke / E2E |
| `S1-UI-01` | 新增 Inbox / Session 读取占位 | S1 | Desktop | `S1-MCP-02` | Desktop smoke |
| `S1-UI-02` | 新增 Review 最小入口 | S1 | Desktop | `S1-MCP-02` | 可看到 Draft 预览入口 |
| `S1-QA-01` | 建立 Rust / MCP / Desktop 测试基线 | S1 | QA | `S1-CORE-02`,`S1-CORE-03`,`S1-MCP-02` | 自动化通过 |
| `S1-DOC-01` | README / help / 文档索引同步 | S1 | QA + Lead | `S1-MCP-01` | 链接与口径检查通过 |

## 2. Sprint 2+ 后续任务

| ID | 任务 | Sprint | Owner | 依赖 | 验收 |
|---|---|---|---|---|---|
| `S2-UI-01` | 完整 Session 详情与 Review 联动 | S2 | Desktop | Sprint 1 完成 | Tauri E2E |
| `S3-CORE-01` | Reliability 数据模型与规则 | S3 | Core | Sprint 1 完成 | 单测 + Dashboard |
| `S3-MCP-01` | Reliability tools | S3 | MCP | `S3-CORE-01` | MCP E2E |
| `S4-CORE-01` | Context Pack Foundation | S4 | Core | Sprint 1 完成 | Pack 单测 |
| `S4-MCP-01` | Context Pack tools | S4 | MCP | `S4-CORE-01` | MCP E2E |
| `S4-TEAM-01` | Team Publish 初版 | S4+ | Desktop + Lead | `S4-CORE-01` | 发布视图可用 |
| `S5-REL-01` | 发布收口与回归 | S5 | QA + Lead | 前序 Sprint 完成 | 发布检查通过 |

---

## 3. 建议优先级

### vNext.1 P0

- Inbox
- Session
- Review
- Reliability Dashboard
- Context Pack Foundation

### P1

- Team Publish
- Unified Review Queue
- 批量处理

### P2

- 高级自动化
- 指标看板
- 更强治理能力
