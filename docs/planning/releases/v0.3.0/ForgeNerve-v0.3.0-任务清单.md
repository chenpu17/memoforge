# ForgeNerve v0.3.0 任务清单

> 目标版本: v0.3.0
> 日期: 2026-04-12
> 文档类型: 任务清单
> 状态: 待排期
> 关联文档:
> - [ForgeNerve-v0.3.0开发计划](./ForgeNerve-v0.3.0-开发计划.md)
> - [ForgeNerve-v0.3.0依赖矩阵](./ForgeNerve-v0.3.0-依赖矩阵.md)

---

## 1. Sprint 1 核心任务

| ID | 任务 | Sprint | Owner | 依赖 | 验收 |
|---|---|---|---|---|---|
| `S1-LEAD-01` | 盘点现有 Inbox / Session / Review / Reliability / Packs 基线 | S1 | 主 agent | 无 | 现状对齐结论产出 |
| `S1-CORE-01` | 冻结 `WorkflowTemplate` / `ReviewItem` / `EvidenceMeta` / `FreshnessPolicy` 模型 | S1 | 主 agent | `S1-LEAD-01` | 冻结文档完成 |
| `S1-API-01` | 冻结最小 MCP / Tauri / frontend 契约方向 | S1 | MCP + Desktop | `S1-CORE-01` | 契约评审通过 |
| `S1-QA-01` | 建立现有工作流回归基线 | S1 | QA | `S1-LEAD-01` | 自动化通过 |
| `S1-DOC-01` | README / help / active docs 同步 | S1 | 主 agent + QA | `S1-CORE-01`,`S1-API-01` | 链接与口径检查通过 |

## 2. Sprint 2+ 后续任务

| ID | 任务 | Sprint | Owner | 依赖 | 验收 |
|---|---|---|---|---|---|
| `S2-WF-01` | Workflow Templates 首版 | S2 | Core + Desktop | Sprint 1 完成 | 至少 1 个模板闭环 |
| `S2-WF-02` | 模板默认上下文与建议输出位置 | S2 | Core + Desktop | `S2-WF-01` | Tauri E2E |
| `S3-REV-01` | Unified Review Queue 投影与列表 | S3 | Desktop + Core | Sprint 1 完成 | 可见多来源待确认项 |
| `S3-REV-02` | 统一确认 / 退回 / 丢弃动作 | S3 | Desktop + MCP | `S3-REV-01` | Review E2E |
| `S4-EVD-01` | Evidence Meta 最小字段落地 | S4 | Core | Sprint 1 完成 | 单测 + UI 展示 |
| `S4-EVD-02` | Git / PR / Commit / URL 关联基础能力 | S4 | Core + MCP | `S4-EVD-01` | MCP E2E |
| `S4-REL-01` | Freshness SLA 与 Reliability 升级 | S4 | Core + Desktop | `S4-EVD-01` | 复查入口可用 |
| `S5-CTX-01` | 模板上下文复用与跳转 polish | S5 | Desktop | Sprint 2-4 完成 | 主路径点击数下降 |
| `S5-REL-01` | 发布收口与回归 | S5 | 主 agent + QA | 前序 Sprint 完成 | 发布检查通过 |

---

## 3. 建议优先级

### v0.3.0 P0

- Workflow Templates / Playbooks
- Unified Review Queue
- Evidence-backed Knowledge
- Reliability & Freshness
- Agent Context Reuse Polish

### P1

- Inbox 智能整理建议
- Git / PR / Commit 反向关联
- Session Replay / Rerun

### P2

- Pack Recommendation
- Knowledge Health Score
- Approved for Agent Use
- Team Publish
