# MemoForge Tauri 桌面应用增强开发计划

> 版本: v0.1
> 日期: 2026-04-08
> 状态: 执行计划草案
> 关联文档:
> - [Tauri桌面应用下阶段特性规划](./Tauri桌面应用下阶段特性规划.md)
> - [Agent协作增强开发计划](./Agent协作增强开发计划.md)

---

## 1. 计划目标

本计划服务于 MemoForge 桌面端下一个阶段的产品增强，核心目标是：

- 让首次使用流程产品化
- 让导入和多知识库管理更强
- 让桌面端从“浏览器 + 编辑器”升级为“知识工作台”
- 让 Git 和 Agent 结果消费都能在 GUI 中自然完成

本计划不替代 Agent/MCP 线，而是桌面端独立的一条执行计划。

跨线依赖说明：

- Agent 结果消费相关能力依赖 `Agent协作增强开发计划` 中的 Sprint 1 最小 Draft 流先落地
- 跨线阻塞关系以 `Agent协作增强开发计划` 中的“跨线依赖矩阵”为准

---

## 2. 核心交付

本阶段建议交付以下四组成果：

1. 欢迎流与知识库入口重构
2. 工作台与知识健康度
3. Git 总览与风险提示
4. Agent 结果消费整合

---

## 3. 里程碑

| 里程碑 | 目标 | 交付 |
|---|---|---|
| D1 | 冷启动重构 | Welcome Flow、模板入口、Clone 流、KB 管理中心升级 |
| D2 | 日常工作台 | Workspace Dashboard、Knowledge Health、Recent Activity |
| D3 | 协作与偏好 | Git Overview、风险提示、设置页升级 |
| D4 | Agent 结果整合 | Draft Panel 接入、活动回显、GUI 确认路径 |

---

## 4. Sprint 规划

### Sprint A: 冷启动与知识库入口

目标：

- 新用户能在首次打开时完成“新建 / 导入 / clone”任一路径

任务：

1. 新增 `WelcomeFlow`
2. 新增 `TemplatePicker`
3. 在 Tauri 中实现 `clone_kb_cmd`
4. 在前端服务层新增 `cloneKb(...)`，不再复用 `initKb(path, mode="clone")`
5. 将 `initKb(path, mode="clone")` 标记为历史占位，Sprint A 完成后禁止新代码继续调用，并在服务层类型中移除
6. 升级 `KbSwitcher` 为知识库管理中心
7. 定义并实现最近知识库健康状态首版，首版仅包含：
   - 路径是否存在
   - 最近一次打开是否成功
   - 是否为 Git 仓库

验收：

- 无当前知识库时默认进入欢迎流
- 欢迎流展示“新建 / 导入 / Clone”三条明确入口
- 新建、导入、Clone 任一路径成功后，自动注册并切换到目标知识库
- Clone 失败时展示错误信息，且用户可返回欢迎流重试
- 最近知识库健康状态至少展示“路径存在性 / 最近打开结果 / Git 仓库状态”三项

### Sprint B: 导入与知识工作台

目标：

- 让“导入完成”自然过渡到“去整理”

任务：

1. 升级 `ImportModal`
2. 新增导入后整理报告
3. 新增 `WorkspaceDashboard`
4. 新增 `KnowledgeHealthPanel`
5. 新增 `RecentActivityPanel`

验收：

- 导入完成后展示至少 4 个统计字段
- 导入完成后展示至少 3 个后续动作按钮
- 工作台能展示最近编辑、最近导入、摘要待更新、待补标签等整理事项

### Sprint C: Git 总览与设置中心

目标：

- 让 Git 和设置页更像产品能力，而不是诊断功能

任务：

1. 新增 `GitOverviewPanel`
2. 增加 ahead / behind / 当前分支信息
3. pull / push 风险提示
4. 设置页分组
5. 新增用户偏好项

验收：

- Git 总览至少展示当前分支、ahead、behind、工作区改动数量
- pull 前若存在本地未提交改动，GUI 会出现风险提示
- 设置页至少支持默认编辑模式、自动保存、导入策略等偏好项，并在刷新后保持

### Sprint D: Agent 结果消费整合

目标：

- 让桌面端成为 Agent 工作结果的主消费面板

前置条件：

- Agent Sprint 1 已完成最小 Draft 流
- Sprint A / B / C 已提供稳定的桌面承载壳和状态入口

任务：

1. 接入 `AgentDraftPanel`
2. 接入 `DraftPreviewModal`
3. 增加文档级来源回显
4. 增加最近 Agent 活动时间线
5. 与 Toast / RightPanel 联动

验收：

- 有待确认草稿时，GUI 中出现待处理计数或列表入口
- 用户点开草稿后可看到 metadata diff 和正文变更摘要
- 用户可提交或丢弃草稿，操作完成后列表和文档内容同步刷新

---

## 5. 模块拆分

### Workstream A: Tauri Backend

负责：

- 新 commands
- 聚合状态接口
- clone / template / workspace health 能力

重点文件：

- `crates/memoforge-tauri/src/main.rs`
- 新的 workspace / health / template 相关模块

### Workstream B: App Shell & Navigation

负责：

- Welcome Flow
- 顶层导航
- 知识库管理中心

重点文件：

- `frontend/src/App.tsx`
- `frontend/src/components/KbSwitcher.tsx`
- 新增欢迎流组件

### Workstream C: Workspace UX

负责：

- Dashboard
- Health Panel
- Recent Activity

重点文件：

- 新增 dashboard / panel 组件
- `frontend/src/stores/appStore.ts`

### Workstream D: Git & Settings UX

负责：

- Git 总览
- 设置分组
- 偏好项持久化

重点文件：

- `frontend/src/components/GitPanel.tsx`
- `frontend/src/components/SettingsModal.tsx`

### Workstream E: QA & Regression

负责：

- 桌面主路径 E2E
- 组件测试
- 发布回归矩阵

重点文件：

- `tests/frontend_ops_e2e.py`
- 前端各组件测试

---

## 6. Claude Code Agent Teams 编组建议

桌面端建议单独一支 team。

### Lead: Desktop Product Integrator

职责：

- 维护桌面端路线图
- 控制页面信息架构
- 评审验收标准
- 协调 Tauri / 前端 / QA

### Worker 1: Tauri Backend

职责：

- commands
- 本地知识库管理
- clone / template / git overview 数据源

### Worker 2: Navigation & Onboarding

职责：

- Welcome Flow
- KB 管理中心
- 首次使用路径

### Worker 3: Workspace Dashboard

职责：

- 工作台
- 健康度
- 最近活动

### Worker 4: Git & Settings

职责：

- Git 总览
- 风险提示
- 设置页升级

### Worker 5: QA

职责：

- E2E 场景
- 组件测试
- 发布验收

---

## 7. 测试计划

### 7.1 E2E 主路径

必须覆盖：

1. 首次进入欢迎流
2. 新建知识库
3. 模板创建
4. Clone Git 仓库
5. 导入 Markdown
6. 工作台展示
7. Git push / pull 风险提示
8. 设置页偏好项生效
9. Agent 草稿可见性

### 7.2 组件测试

建议优先覆盖：

- `KbSwitcher`
- `ImportModal`
- `SettingsModal`
- `WorkspaceDashboard`
- `KnowledgeHealthPanel`
- `GitOverviewPanel`

### 7.3 回归矩阵

必须保底：

- 编辑器三模式正常
- 搜索可用
- 图谱可打开
- 多知识库切换可用
- Git 提交仍可用
- Web 只读模式不受影响

---

## 8. 风险与缓解

### 风险 1: Welcome Flow 过重

缓解：

- 保持首次流只做三件事：新建、导入、clone
- 高级设置放到后续

### 风险 2: Dashboard 信息过载

缓解：

- 第一版只展示最关键 5 类卡片
- 所有复杂操作跳转到已有页面

### 风险 3: Git 状态解释不清

缓解：

- 用自然语言提示 ahead / behind
- 不把 Git 原始术语直接抛给用户

### 风险 4: 桌面线与 Agent 线互相阻塞

缓解：

- 桌面线先做独立能力
- Agent Draft Panel 放在后一个 Sprint 对接

---

## 9. Definition of Done

满足以下条件后，桌面端增强阶段可视为完成：

1. 新用户首次使用不再依赖外部文档理解路径。
2. 导入后用户能通过 GUI 继续整理知识。
3. 工作台能帮助用户发现待处理知识。
4. Git 状态与风险在 GUI 中可理解。
5. Agent 结果在桌面端可见、可确认、可追踪。
