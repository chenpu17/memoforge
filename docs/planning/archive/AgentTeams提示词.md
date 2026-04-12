# MemoForge 下版本开发 Agent Teams 提示词

## 使用方式

一个 Claude Code 会话只能管理一个 Team。本次开发用一个团队覆盖全部特性，按代码层级分工：

- **Lead**（你自己，opus）：任务拆分、接口契约、依赖排序、合并验收。只改跨模块类型/文档，不改实现文件。
- **Core+MCP Agent**（sonnet）：`crates/memoforge-core` + `crates/memoforge-mcp`
- **Tauri Desktop Agent**（sonnet）：`crates/memoforge-tauri`
- **Frontend Agent**（sonnet）：`frontend/src`
- **QA Agent**（sonnet）：测试、回归、文档验证。不改实现文件。

每个 Worker 不会看到方案文档内容。Lead 在创建任务时必须把接口契约、数据结构、代码风格、文件路径等关键上下文写进任务描述。

---

## 提示词

复制以下全部内容发送给 Claude Code：

```
创建一个 agent team 来实现 MemoForge 下版本全部特性增强，包括 Agent Draft 流和 Tauri 桌面端增强。

先阅读以下文档理解完整方案（你自己先读，不要让 teammate 读）：
1. docs/planning/archive/规划与现状对齐说明.md — 理解现状与差距
2. docs/planning/archive/Agent协作增强与MCP精简方案.md — 理解 Draft 流和 MCP 设计
3. docs/planning/archive/Agent协作增强开发计划.md — 理解 Agent 线 Sprint 规划和跨线依赖
4. docs/planning/archive/Agent协作增强Sprint1任务拆解.md — 理解 Sprint 1 具体任务
5. docs/planning/archive/Tauri桌面应用下阶段特性规划.md — 理解桌面端特性方向
6. docs/planning/archive/Tauri桌面应用增强开发计划.md — 理解桌面端 Sprint 规划
7. docs/planning/archive/Tauri桌面应用Epic与任务拆解.md — 理解桌面端具体任务
8. crates/memoforge-core/src/api.rs — 理解现有 API 风格
9. crates/memoforge-core/src/knowledge.rs — 理解 split_sections
10. crates/memoforge-core/src/models.rs — 理解数据模型
11. crates/memoforge-mcp/src/tools.rs — 理解现有 MCP tool 风格
12. crates/memoforge-tauri/src/main.rs — 理解现有 Tauri command 风格
13. frontend/src/App.tsx — 理解主布局和导航结构
14. frontend/src/components/RightPanel.tsx — 理解右侧面板 Tab 结构
15. frontend/src/components/KbSwitcher.tsx — 理解知识库切换
16. frontend/src/components/GitPanel.tsx — 理解 Git 面板
17. frontend/src/components/SettingsModal.tsx — 理解设置页
18. frontend/src/stores/appStore.ts — 理解状态管理
19. frontend/src/services/tauri.ts — 理解前端服务层

读完之后，用 1 Lead（你自己，opus）+ 4 Worker（都用 sonnet）组建团队。按代码层级分工，避免多人改同一文件。

---

### Worker 1: Core+MCP Agent — 模型用 sonnet

独占文件范围：crates/memoforge-core/src/draft.rs、document_ops.rs、api.rs + crates/memoforge-mcp/src/tools.rs、main.rs

阶段 1（Agent Sprint 1 — 最先开工）：

任务 A2（最先）— 新增 document_ops.rs：
- 实现 section 按 ## (h2) 切分，参考 knowledge.rs 中 split_sections
- 提供 read_sections / append_section / replace_section / remove_section
- 提供 metadata patch 应用
- 提供简单 diff summary 生成
- 验收：标题层级不被破坏，未改动 section 原文不变，多次 patch 后 Markdown 结构稳定

任务 A1 — 新增 draft.rs + api.rs 扩展：
- 依赖 A2 的 section 操作类型先确定
- DraftId / DraftTarget / DraftOperation / DraftPreview 数据结构
- .memoforge/drafts/<draft_id>.json 存储，确保加入 .gitignore
- start_draft / update_draft / preview_draft / commit_draft / discard_draft 五个函数
- commit 时基于 base_revision 做冲突检测，冲突时保留 Draft 不自动丢弃
- 支持基于 updated_at 的 TTL 过期清理

任务 A4 — 扩展 tools.rs：
- 依赖 A1 和 A2 都完成
- read_knowledge / start_draft / update_draft / preview_draft / commit_draft / discard_draft 6 个新工具
- 工具 description 面向 AI Agent 写清楚推荐工作流和使用场景
- 旧工具继续可用，默认 list_tools() 返回值不变
- commit_draft 冲突错误返回补充可恢复提示

阶段 2（Tauri 需要时按需配合）：
- 为 Tauri command 提供必要的 core 层支撑函数（如 workspace overview 数据源、kb health 检查）
- 确保 Draft API 可被 Tauri 层调用

---

### Worker 2: Tauri Desktop Agent — 模型用 sonnet

独占文件范围：crates/memoforge-tauri/src/main.rs 及同目录新增模块

阶段 1（先等 Worker 1 完成 A2）：

Epic A 后端：
- 新增 clone_kb_cmd（独立命令，不复用 initKb(mode="clone")）
- 新增 list_templates_cmd / create_kb_from_template_cmd
- 新增 get_kb_health_cmd（路径存在性、最近打开是否成功、是否为 Git 仓库）
- 所有 command 参考现有 command 的参数风格（path 参数、返回 Result<Json, MemoError>）

Epic B 后端：
- 新增 get_workspace_overview_cmd（返回最近编辑数、待整理数、摘要过期数等）

Epic C 后端：
- 新增 get_git_overview_cmd（返回当前分支、ahead/behind、工作区改动数）

阶段 2（Agent Sprint 1 完成后）：

Epic D 后端：
- 新增 list_drafts_cmd / get_draft_preview_cmd / commit_draft_cmd / discard_draft_cmd
- SSE snapshot 扩展：当前草稿数、最近 Agent 草稿

注意：Worker 2 改 main.rs 时，不要同时引入 frontend 改动，前端由 Worker 3 负责。

---

### Worker 3: Frontend Agent — 模型用 sonnet

独占文件范围：frontend/src/ 下所有文件

Epic A 前端（与 Worker 2 Epic A 后端并行）：
- 新增 WelcomeFlow.tsx：无知识库时默认进入，提供新建/导入/Clone 三条入口
- 新增 TemplatePicker.tsx：展示至少 3 套模板
- 改造 KbSwitcher.tsx：升级为知识库管理中心（最近打开列表、路径存在性、Git 状态、移除注册）
- 改造 tauri.ts：新增 cloneKb()，标记 initKb(mode="clone") 为历史占位

Epic B 前端（与 Worker 2 Epic B 后端并行）：
- 新增 WorkspaceDashboard.tsx：最近编辑、最近导入、待整理事项
- 新增 KnowledgeHealthPanel.tsx：无摘要/摘要过期/无标签/孤立知识
- 新增 RecentActivityPanel.tsx：最近事件时间线
- 改造 ImportModal.tsx：导入完成后显示统计字段和后续动作按钮

Epic C 前端（与 Worker 2 Epic C 后端并行）：
- 新增 GitOverviewPanel.tsx：当前分支、ahead/behind、工作区改动
- 改造 GitPanel.tsx：pull 前未提交改动风险提示，push 失败恢复建议
- 改造 SettingsModal.tsx：按分组展示（通用/编辑器/知识库/Git/MCP/诊断），新增偏好项，localStorage 持久化

Epic D 前端（需确认 Worker 1 Draft API 已可用）：
- 新增 AgentDraftPanel.tsx：待确认草稿列表，目标知识、更新时间、变更摘要
- 新增 DraftPreviewModal.tsx：正文变更预览 + metadata diff + 提交/丢弃按钮
- 改造 RightPanel.tsx：新增 Agent tab，显示待处理草稿计数

---

### Worker 4: QA Agent — 模型用 sonnet

不改实现文件。负责测试、回归和文档验证。

阶段 1（Worker 1 完成各任务后跟进）：
- document_ops 单测（A2 完成后）：section append/replace/remove、metadata patch
- draft 单测（A1 完成后）：Draft 创建删除、冲突检测
- MCP E2E（A4 完成后）：新建知识 Draft 全流程、已有知识 section 更新 Draft 流
- 回归：旧 create_knowledge / update_knowledge 仍可用

阶段 2（桌面端各 Epic 完成后跟进）：
- 组件测试：WorkspaceDashboard、KnowledgeHealthPanel、KbSwitcher
- 桌面端 E2E：扩展 tests/frontend_ops_e2e.py 覆盖新主路径（欢迎流、新建知识库、导入整理、工作台、设置持久化、Agent 草稿）
- README 更新：增加 Draft 工作流推荐示例

---

### 执行节奏

整个团队按以下节奏推进，Lead 负责控制节奏和依赖：

第一步：Agent Sprint 1（Draft 最小闭环）
- Worker 1: A2 → A1 → A4 顺序推进
- Worker 2: 等 Worker 1 完成 A2 后开始 Epic A 后端
- Worker 3: 等 Worker 2 Epic A 后端接口确定后开始 Epic A 前端
- Worker 4: Worker 1 完成各任务后跟进测试

第二步：桌面端 Epic A → B → C 顺序推进
- 每个 Epic：Worker 2 后端 + Worker 3 前端并行
- Worker 4 每个 Epic 完成后跟进测试

第三步：桌面端 Epic D（Agent 结果消费）
- 前提：Worker 1 的 Draft API 已稳定可用
- Worker 2: Draft commands + SSE 扩展
- Worker 3: Draft Panel + Preview Modal + RightPanel 改造
- Worker 4: E2E 回归

第四步：集成验收
- Worker 4: 全线 E2E 回归 + README 更新
- Lead: 最终集成验收

完成定义：
1. 命令行可完成"创建草稿 -> 追加 section -> 预览 -> 提交"完整闭环
2. 新 Draft 流通过自动化测试，legacy 工具回归无破坏
3. 桌面端欢迎流、工作台、Git 总览、Agent 草稿面板全部可用
4. README 有使用示例
```

---

## 执行时的操作提示

- 等文档读完、团队创建完成后，用 `Ctrl+T` 查看任务列表
- 用 `Shift+Down` 切换查看各 Teammate 进度
- Teammate 完成任务后会有空闲通知，及时分配下一个任务
- Worker 2 等 Worker 1 的 A2 完成、Worker 3 等 Worker 2 的后端接口确定，这些等待是正常的
- 每个 Epic 完成后做一次 `cargo build` + `npm run build` 验证不破坏编译
- Epic D 开始前确认 crates/memoforge-core/src/draft.rs 已存在且可用
- 全部完成后，说"关闭所有 teammate 并清理团队"

---

## 已知限制与注意事项

| 项目 | 说明 |
|------|------|
| 模型可能被忽略 | Teammate 有已知 bug（#31411）可能忽略 sonnet 设置而用 opus，注意 token 消耗 |
| 一个会话一个 Team | 必须先清理当前 Team 才能创建新 Team |
| Teammate 无对话历史 | Lead 必须在任务描述里写足上下文，不能假设 Teammate 读过方案文档 |
| 文件独占避免冲突 | 每个 Worker 只改自己负责的文件范围，Lead 不改实现文件 |
| 不要让两个 Worker 改同一文件 | 按代码层级分工就是这个目的，如果出现跨层依赖通过 Lead 协调 |
| 关闭可能较慢 | Teammate 会完成当前请求后才退出，等待是正常的 |
| 建议先预批准权限 | 在 settings.json 中预批准文件读写和 cargo/npm 命令，减少中断 |
