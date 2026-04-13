# ForgeNerve v0.3.0 测试与验收计划

> 目标版本: v0.3.0
> 日期: 2026-04-12
> 文档类型: 测试与验收计划
> 状态: 草案
> 关联文档:
> - [ForgeNerve-v0.3.0产品需求文档](./ForgeNerve-v0.3.0-产品需求文档.md)
> - [ForgeNerve-v0.3.0开发计划](./ForgeNerve-v0.3.0-开发计划.md)
> - [ForgeNerve-v0.3.0 Sprint1验收矩阵](./ForgeNerve-v0.3.0-Sprint1验收矩阵.md)

---

## 1. 测试目标

v0.3.0 的测试重点不是“页面有没有渲染”，而是：

1. 高频工作流能否稳定起跑
2. 变更是否真正进入统一审阅队列
3. 新知识是否带最小证据层
4. 知识治理是否形成可持续闭环

---

## 2. 版本级测试分层

### 2.1 Rust 单元测试

覆盖：

- Workflow Template 模型
- Review Item 投影
- Evidence Meta 读写
- Reliability / Freshness 规则
- Draft / Inbox / Session / Review 关联

### 2.2 MCP E2E

覆盖：

- 启动 Workflow Template
- 创建 Session / Inbox / Draft
- 统一 Review 决策
- Evidence Meta 回写
- Reliability 问题转复查 / 修复 Draft

### 2.3 前端组件测试

覆盖：

- 模板启动入口
- Unified Review Queue
- Evidence Meta 展示与编辑
- Reliability / Freshness 入口
- 现有 Inbox / Session / Review / Packs 面板回归

### 2.4 Tauri E2E

覆盖：

- 桌面端启动工作流模板
- 桌面端统一审阅并确认变更
- 桌面端查看证据与验证信息
- 桌面端处理 freshness / reliability 问题

---

## 3. Sprint 1 测试范围

Sprint 1 只覆盖：

- 当前主干基线盘点与不回退
- 新增模型与契约冻结后的最小读写检查
- 现有 Inbox / Session / Review / Reliability / Packs 回归
- README / help / 文档口径同步

Sprint 1 不覆盖：

- 完整 Workflow Template 用户体验
- Unified Review Queue 完整交互
- Evidence Meta 完整编辑能力
- Freshness SLA 完整闭环
- Pack Recommendation

---

## 4. 版本级必测主链路

### 场景 A：模板启动闭环

1. 用户选择一个 Workflow Template
2. 系统带入默认上下文与建议输出位置
3. Agent 创建 Session / Inbox / Draft
4. 结果进入 Review Queue
5. 用户确认提交

### 场景 B：统一审阅闭环

1. Agent Draft、Inbox 转 Draft、Reliability 修复 Draft 同时产生
2. 用户在 Review 中看到统一列表
3. 用户按来源查看风险与 diff
4. 用户确认、退回或丢弃

### 场景 C：证据化沉淀闭环

1. 新知识进入待确认状态
2. 用户补充或校验证据元信息
3. 提交后知识条目带 `owner / verified_at / version` 等信息

### 场景 D：Freshness 治理闭环

1. 系统识别超过 SLA 或缺少验证信息的知识
2. 用户进入 Reliability 视图
3. 用户发起复查 / 修复动作
4. 处理结果再次进入 Review Queue

---

## 5. Sprint 1 必测链路

### 场景 S1-A：现状基线回归

1. 启动桌面应用
2. 确认现有 Inbox / Session / Review / Reliability / Packs 入口仍可打开
3. 确认现有 Draft 主流程未退化
4. 确认帮助与 README 叙事同步

### 场景 S1-B：冻结契约最小检查

1. 验证新增模型字段可被前后端类型容纳
2. 验证现有工具与接口不因新口径冻结而破坏兼容

---

## 6. 验收标准

### 6.1 功能验收

- P0 主功能全部可用
- 不破坏现有 Draft 主流程
- 不破坏欢迎流 / 工作台 / Git 面板现有能力

### 6.2 稳定性验收

- 不出现明显状态错乱
- 不出现 Draft / Inbox / Session / Review 错绑
- 不出现桌面端刷新后状态丢失

### 6.3 回归验收

- 现有 `npm test` 不退化
- 现有 `npm run build` 不退化
- Rust 侧检查不退化

---

## 7. 测试矩阵建议

| 层 | 关键对象 | 建议 |
|---|---|---|
| Rust | template / review / evidence / freshness | 单测覆盖主状态机与兼容性 |
| MCP | workflow / review / evidence | E2E 覆盖主工具链 |
| Frontend | launcher / queue / evidence panel | 组件测试覆盖交互 |
| Tauri | end-to-end flow | 覆盖真实桌面链路 |

---

## 8. 性能与并发基线

### 8.1 性能基线

- Review Queue 在 `100` 条以内应无明显卡顿
- Session 列表在 `100` 条以内应保持秒级内返回
- 从模板结果进入 Review 预览应保持流畅

### 8.2 并发场景

- 多个 Agent Session 同时写入不同工作流产物
- Review Queue 同时收敛多个 source type
- 索引文件重建时不应破坏实体文件读取

说明：

- Sprint 1 并发测试以兼容性回归为主
- 后续 Sprint 再扩大到模板和治理链路

---

## 9. 发布前检查

- [ ] `npm test`
- [ ] `npm run build`
- [ ] Rust 单测 / 检查
- [ ] MCP E2E
- [ ] Tauri E2E
- [ ] Windows 首次运行检查
- [ ] README / 设置页帮助文档同步
