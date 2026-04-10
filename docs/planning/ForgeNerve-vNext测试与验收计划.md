# ForgeNerve vNext 测试与验收计划

> 版本: v0.1
> 日期: 2026-04-09
> 状态: 测试计划草案
> 关联文档:
> - [ForgeNerve-vNext产品需求文档](./ForgeNerve-vNext产品需求文档.md)
> - [ForgeNerve-vNext开发计划](./ForgeNerve-vNext开发计划.md)
> - [ForgeNerve-vNext Sprint1验收矩阵](./ForgeNerve-vNext%20Sprint1%E9%AA%8C%E6%94%B6%E7%9F%A9%E9%98%B5.md)

---

## 1. 测试目标

vNext 的测试重点不是“页面有没有渲染”，而是：

1. Agent 协作链路是否稳定
2. 变更是否可审、可回退、可确认
3. 知识运营能力是否可信
4. 桌面端主流程是否真的可用

---

## 2. 版本级测试分层

### 2.1 Rust 单元测试

覆盖：

- Inbox store
- Session store
- Reliability rules
- Context Pack 生成逻辑
- Draft / Inbox / Session 状态流转

### 2.2 MCP E2E

覆盖：

- 创建 Inbox item
- Inbox 转 Draft
- 创建 Session
- Session 关联上下文
- Draft 预览 / 提交
- Reliability issue 转修复 Draft
- Context Pack 被 Session 引用

### 2.3 前端组件测试

覆盖：

- Inbox 面板
- Session 面板
- Review
- Reliability Dashboard
- Context Pack 管理器

### 2.4 Tauri E2E

覆盖：

- 桌面端查看 Inbox
- 桌面端查看 Session
- 桌面端确认 / 丢弃 Draft
- 桌面端处理 Reliability issue
- 桌面端消费 Context Pack

---

## 3. Sprint 1 测试范围

Sprint 1 只覆盖：

- Inbox store
- Session store
- Draft / Inbox / Session 关联
- MCP 最小闭环
- Desktop 最小可见与 Review 占位

Sprint 1 不覆盖：

- Reliability Dashboard 完整能力
- Reliability issue 转修复 Draft
- Context Pack 创建 / 导出
- Team Publish

---

## 4. 版本级必测主链路

### 场景 A：Agent 写入闭环

1. 启动桌面应用
2. Agent 创建 session
3. Agent 创建 inbox item
4. Agent 将 inbox item 转为 draft
5. 用户在桌面端预览并确认
6. 结果写入知识库

### 场景 B：导入整理闭环

1. 导入外部 Markdown
2. 内容进入 Inbox
3. 用户转正式知识或转 Draft
4. 结果进入知识库

### 场景 C：Reliability 修复闭环

1. 系统识别问题知识
2. 用户打开 Reliability Dashboard
3. 用户从问题生成修复 Draft
4. 用户确认提交

### 场景 D：Context Pack 复用闭环

1. 创建 Context Pack
2. 新建 Session
3. Session 引用 Context Pack
4. Agent 基于 Pack 生成输出

---

## 5. Sprint 1 必测链路

### 场景 S1-A：最小 Agent 写入闭环

1. 启动桌面应用
2. Agent 创建 session
3. Agent 创建 inbox item
4. Agent 将 inbox item 转为 draft
5. Session 关联上下文与结果
6. 桌面端看到最小结果

### 场景 S1-B：最小 Review 可见化

1. 系统已有 Draft
2. 桌面端进入 Review 入口
3. 用户能看到 Draft 预览入口

---

## 6. 验收标准

### 6.1 功能验收

- P0 主功能全部可用
- 不破坏现有 Draft 主流程
- 不破坏欢迎流 / 工作台 / Git 面板现有能力

### 6.2 稳定性验收

- 不出现明显状态错乱
- 不出现 Draft / Inbox / Session 错绑
- 不出现桌面端刷新后状态丢失

### 6.3 回归验收

- 现有 `npm test` 不退化
- 现有 `npm run build` 不退化
- Rust 侧检查不退化

---

## 7. 测试矩阵建议

| 层 | 关键对象 | 建议 |
|---|---|---|
| Rust | store / rules / model | 单测覆盖主状态机 |
| MCP | tool contract | E2E 覆盖主工具链 |
| Frontend | panel / queue / modal | 组件测试覆盖交互 |
| Tauri | end-to-end flow | 覆盖真实桌面链路 |

---

## 8. 性能与并发基线

### 8.1 性能基线

- `list_inbox_items` 在 `100` 条以内列表读取应无明显卡顿
- Session 列表在 `100` 条以内应保持秒级内返回
- 桌面端从 Inbox / Session 进入 Review 预览应保持流畅

### 8.2 并发场景

- 多个 Agent Session 同时写入不同 Inbox item
- Session append 与 Inbox promote 并行发生
- 索引文件重建时不应破坏实体文件读取

说明：

- Sprint 1 并发测试以 store / MCP 层为主
- 复用现有文件锁策略，并对新增 inbox / session store 做回归验证

---

## 9. 发布前检查

- [ ] `npm test`
- [ ] `npm run build`
- [ ] Rust 单测 / 检查
- [ ] MCP E2E
- [ ] Tauri E2E
- [ ] Windows 首次运行检查
- [ ] README / 设置页帮助文档同步
