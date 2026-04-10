# MemoForge Tauri 桌面应用 Epic 与任务拆解

> 版本: v0.1
> 日期: 2026-04-08
> 状态: 可开工任务拆解
> 关联文档:
> - [Tauri桌面应用下阶段特性规划](./Tauri桌面应用下阶段特性规划.md)
> - [Tauri桌面应用增强开发计划](./Tauri桌面应用增强开发计划.md)
> - [规划与现状对齐说明](./规划与现状对齐说明.md)

---

## 1. 文档目的

这份文档把桌面端下阶段增强从“方向”拆成“可以直接建 issue 的任务包”。

原则:

- 每个 Epic 都要有清晰主路径
- 每个 Epic 都要区分前端、Tauri、测试
- 不把底层能力误写成用户可用能力

---

## 2. Epic 列表

本轮建议只推进 4 个 Epic:

1. EPIC-A: 欢迎流与冷启动重构
2. EPIC-B: 导入后整理与知识工作台
3. EPIC-C: Git 总览与设置中心升级
4. EPIC-D: Agent 结果消费整合

建议顺序:

- 先 A，再 B，再 C，最后 D

原因:

- A 决定新用户能不能顺利用起来
- B 决定导入后有没有持续价值
- C 决定协作和稳定性
- D 依赖 Agent 线 Draft 流成熟后再接入更稳

---

## 3. EPIC-A: 欢迎流与冷启动重构

### 目标

- 用户首次打开应用时，不需要理解底层目录结构，也能完成新建、导入或 clone

### 子任务

#### A-1. Welcome Flow 页面骨架

文件建议:

- `frontend/src/App.tsx`
- 新增 `frontend/src/components/WelcomeFlow.tsx`

验收:

- 未打开知识库时默认进入欢迎流
- 页面提供三种明确入口: 新建、导入、Clone
- 任一入口成功后自动注册并切换知识库
- 失败时展示错误信息且可返回欢迎流

#### A-2. Template Picker

文件建议:

- 新增 `frontend/src/components/TemplatePicker.tsx`
- `crates/memoforge-core/src/init.rs`

验收:

- 新建知识库时可选至少 3 套模板
- 创建后自动进入知识库

#### A-3. Clone GUI 路径

文件建议:

- `crates/memoforge-tauri/src/main.rs`
- `frontend/src/services/tauri.ts`

契约约束:

- 新增独立 `clone_kb_cmd`
- 前端新增独立 `cloneKb(...)`
- `initKb(path, mode)` 只继续承载 `open` / `new`
- `mode='clone'` 仅保留为历史占位；Sprint A 完成后禁止新代码继续调用，并在服务层类型中移除

验收:

- 桌面端新增 `clone_kb_cmd`
- 用户可在 GUI 输入仓库 URL、本地路径并完成 clone
- 成功后自动注册并切换知识库
- clone 失败时保留表单输入并展示可恢复错误

#### A-4. KbSwitcher 升级为知识库管理中心

文件建议:

- `frontend/src/components/KbSwitcher.tsx`

验收:

- 可看到最近知识库
- 可看到当前路径与状态
- 支持移除注册、重新打开

#### A-5. 最近知识库健康状态首版

文件建议:

- `crates/memoforge-tauri/src/main.rs`
- `frontend/src/components/KbSwitcher.tsx`

首版字段定义:

- 路径是否存在
- 最近一次打开是否成功
- 是否为 Git 仓库

验收:

- 最近知识库列表中可看到上述 3 项状态
- 状态值来自明确后端数据源，而不是前端猜测

### 测试

1. 首次打开欢迎流显示正确
2. 新建知识库主路径通过
3. Clone 成功与失败路径都可解释
4. 最近知识库列表正确刷新

---

## 4. EPIC-B: 导入后整理与知识工作台

### 目标

- 导入结束后，用户知道接下来要整理什么，而不是只看到“导入成功”

### 子任务

#### B-1. ImportModal 升级

文件建议:

- `frontend/src/components/ImportModal.tsx`

验收:

- 导入完成后显示结构化统计
- 提供“去补摘要 / 去补标签 / 去看新导入文档”等动作
- 至少展示 4 个统计字段和 3 个后续动作按钮

#### B-2. Workspace Dashboard

文件建议:

- 新增 `frontend/src/components/WorkspaceDashboard.tsx`
- `frontend/src/stores/appStore.ts`

验收:

- 展示最近编辑、最近打开、最近导入、待整理事项
- Dashboard 数据刷新后与当前知识库状态一致

#### B-3. Knowledge Health Panel

文件建议:

- 新增 `frontend/src/components/KnowledgeHealthPanel.tsx`
- `crates/memoforge-tauri/src/main.rs`

验收:

- 能列出无摘要、摘要过期、无标签、孤立知识等问题

#### B-4. Recent Activity Panel

文件建议:

- 新增 `frontend/src/components/RecentActivityPanel.tsx`
- 后端聚合最近事件接口

验收:

- GUI 中可以看到最近导入、编辑、移动等基础事件
- Agent 相关活动时间线延后到 `EPIC-D`

### 测试

1. 导入完成后显示整理报告
2. Dashboard 数据与实际状态一致
3. Health 列表能跳转到对应知识
4. Recent Activity 时间线顺序正确

---

## 5. EPIC-C: Git 总览与设置中心升级

### 目标

- 用户在 GUI 中能理解当前 Git 状态，并能管理自己的使用偏好

### 子任务

#### C-1. Git Overview Panel

文件建议:

- `frontend/src/components/GitPanel.tsx`
- 新增 `frontend/src/components/GitOverviewPanel.tsx`

验收:

- 显示当前分支、ahead、behind、工作区状态
- 不要求本 Epic 内同时引入“默认知识库”“重新索引 / 修复”等 registry 扩展能力

#### C-2. Pull / Push 风险提示

文件建议:

- `frontend/src/components/GitPanel.tsx`
- `crates/memoforge-tauri/src/main.rs`

验收:

- pull 前能提示本地未提交修改
- push 失败时给出恢复建议

#### C-3. 设置中心升级

文件建议:

- `frontend/src/components/SettingsModal.tsx`

验收:

- 设置页按分组展示
- 至少支持默认编辑模式、自动保存、导入策略等偏好项

### 测试

1. ahead / behind 显示正确
2. pull 风险提示触发正确
3. 设置项刷新后仍持久化

---

## 6. EPIC-D: Agent 结果消费整合

### 目标

- 桌面端成为 Agent 结果的确认和消费中心

前置条件:

- Agent 线 Sprint 1 已完成最小 Draft 流

### 子任务

#### D-1. Agent Draft Panel

文件建议:

- 新增 `frontend/src/components/AgentDraftPanel.tsx`
- `crates/memoforge-tauri/src/main.rs`

验收:

- 待确认草稿列表可见
- 草稿显示目标知识、更新时间、变更摘要
- 右侧面板或入口处可见待处理计数

#### D-2. Draft Preview Modal

文件建议:

- 新增 `frontend/src/components/DraftPreviewModal.tsx`

验收:

- 可以预览正文变更与 metadata 变化
- 可提交和丢弃
- 提交或丢弃后列表与当前文档内容同步刷新

#### D-3. 文档级来源回显

文件建议:

- `frontend/src/components/MetadataPanel.tsx`
- 后端事件聚合接口

验收:

- 可显示最近更新来源: GUI / MCP / Claude Code / OpenCode

### 测试

1. 有新草稿时面板自动刷新
2. 提交草稿后文档内容更新
3. 丢弃草稿后列表消失
4. 来源回显与事件记录一致

---

## 7. 开发编组建议

适合按 1 Lead + 5 Worker 推进。

### Lead

负责:

- 页面信息架构
- Epic 节奏
- 跨模块集成

### Worker 1: Tauri Backend

负责:

- clone、workspace health、activity 聚合接口

### Worker 2: Onboarding

负责:

- Welcome Flow
- Template Picker
- KB 管理中心

### Worker 3: Workspace

负责:

- Dashboard
- Health Panel
- Recent Activity

### Worker 4: Git & Settings

负责:

- Git 总览
- 风险提示
- 设置中心

### Worker 5: Agent UX & QA

负责:

- Agent Draft Panel
- Draft Preview
- 桌面 E2E

---

## 8. 推荐开工顺序

如果只能先做一半，推荐这样排:

1. `clone_kb_cmd` + Welcome Flow
2. `KbSwitcher` 管理中心化
3. 导入后整理报告
4. Workspace Dashboard
5. Git Overview
6. Agent Draft Panel

原因:

- 前三项直接解决首次使用和导入后的落差
- 中间两项提升长期使用黏性
- Agent 消费面板应建立在 Draft 协议稳定后接入
