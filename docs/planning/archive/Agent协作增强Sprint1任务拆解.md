# MemoForge Agent 协作增强 Sprint 1 任务拆解

> 版本: v0.1
> 日期: 2026-04-08
> 状态: 可开工任务拆解
> 关联文档:
> - [Agent协作增强与MCP精简方案](./Agent协作增强与MCP精简方案.md)
> - [Agent协作增强开发计划](./Agent协作增强开发计划.md)
> - [规划与现状对齐说明](./规划与现状对齐说明.md)

---

## 1. Sprint 目标

Sprint 1 只做一件事:

- 跑通“Agent 通过 Draft 流安全写一篇知识”的最小闭环

不追求 GUI，不追求完整高级能力，不追求一次把所有 legacy tool 全部重构。

验收主路径:

1. Agent 创建草稿
2. Agent 分段写入标题、metadata、section
3. Agent 预览草稿
4. Agent 提交草稿
5. 知识文件正确落盘，事件可追踪，旧接口不被破坏

---

## 2. 交付范围

本 Sprint 包含:

- core Draft 模型
- section 级文档操作
- MCP 最小草稿工具链
- CLI / E2E 验证
- 文档和示例更新

本 Sprint 不包含:

- Tauri Draft Panel
- Draft Diff 的复杂富文本渲染
- 工具 profile 的最终默认切换
- 变更 `list_tools()` 默认返回集合
- 历史工具下线

---

## 3. Issue 级任务拆解

### A1. 设计 Draft 数据模型

目标:

- 在 core 中定义 Draft 的稳定存储结构和生命周期

建议文件:

- `crates/memoforge-core/src/draft.rs`
- `crates/memoforge-core/src/api.rs`

任务:

1. 定义 `DraftId`
2. 定义 `DraftTarget`
3. 定义 `DraftOperation`
4. 定义 `DraftPreview`
5. 定义 Draft 存储目录与序列化格式
6. 定义基础错误类型: 不存在、目标已变化、非法 section
7. 定义 Draft 生命周期策略：过期、清理、保留
8. 明确 `.memoforge/drafts/` 的 Git 策略

验收:

- Draft 结构可序列化
- core 层可以创建、读取、删除 Draft

### A2. 实现 section 级文档操作

目标:

- 把“整篇替换”改为“结构化变更可组合”

建议文件:

- `crates/memoforge-core/src/document_ops.rs`
- `crates/memoforge-core/src/api.rs`

任务:

1. 提供读取文档 section 树的内部能力
2. 实现 `append_section`
3. 实现 `replace_section`
4. 实现 `remove_section`
5. 实现 metadata patch 应用
6. 生成简单 diff summary

接口契约说明:

- A2 先定义 section 操作接口，再由 A1/A3 引用这些操作类型

验收:

- 标题层级不被破坏
- 未改动 section 原文保持不变
- 多次 patch 后输出 Markdown 结构稳定

### A3. 实现 Draft 工作流 API

目标:

- 在 core 暴露最小 Draft API

建议文件:

- `crates/memoforge-core/src/api.rs`

任务:

1. 新增 `read_knowledge`
2. 新增 `start_draft`
3. 新增 `update_draft`
4. 新增 `preview_draft`
5. 新增 `commit_draft`
6. 新增 `discard_draft`

验收:

- 可以对新知识和已有知识都创建 Draft
- `commit_draft` 有基础冲突检测
- 提交后会更新事件记录

### A4. MCP 工具与 schema 接入

目标:

- 让 Claude Code / OpenCode 能直接走新工作流

建议文件:

- `crates/memoforge-mcp/src/tools.rs`
- `crates/memoforge-mcp/src/main.rs`

任务:

1. 为 6 个新工具定义参数 schema
2. 为 `read_knowledge` 定义面向 Agent 的描述文案
3. 在工具说明中明确推荐工作流
4. 保持 legacy 工具继续可用，且默认工具列表不变
5. 给错误返回补充可恢复提示
6. 预留后续 tool profile 接入点，但不在本 Sprint 切默认值

验收:

- MCP tool list 中可看到新工具
- 调用链可完成最小闭环
- 旧的 `create_knowledge` / `update_knowledge` 不回归

### A5. 测试与验证

目标:

- 避免第一个 Sprint 就引入新的写入破坏

建议文件:

- `tests/mcp_e2e.py`
- 新增 `tests/draft_flow_e2e.py`
- core 对应单测文件

任务:

1. 单测: Draft 创建与删除
2. 单测: section append / replace / remove
3. 单测: metadata patch
4. E2E: 新建知识 Draft 流
5. E2E: 已有知识 section 更新 Draft 流
6. 回归: legacy 工具仍可用

验收:

- 新流程主路径通过
- 旧流程回归通过

### A6. 文档与示例

目标:

- 让用户和 Agent 都知道应该怎么调用

建议文件:

- `README.md`
- `crates/memoforge-mcp/README.md`

任务:

1. 增加 Draft 工作流推荐示例
2. 增加“大文档不要整篇直写”的说明
3. 增加 Claude Code / OpenCode 调用建议

验收:

- README 中存在最小可复制示例

---

## 4. 建议团队分工

适合按 1 Lead + 4 Worker 的轻量团队推进。

### Lead

负责:

- 数据结构和工具契约拍板
- 合并冲突处理
- 验收主路径

### Worker 1: Core Draft

负责:

- `draft.rs`
- Draft 生命周期

### Worker 2: Document Ops

负责:

- `document_ops.rs`
- section 级 patch 逻辑

### Worker 3: MCP

负责:

- `memoforge-mcp` 新工具
- tool description

### Worker 4: QA + Docs

负责:

- E2E
- README 示例
- 回归清单

---

## 5. 测试清单

### 必测成功路径

1. 创建新知识 Draft 并提交
2. 为已有知识追加二级标题 section
3. 替换已有 section，其他 section 不变
4. 仅更新 metadata，不修改正文

### 必测失败路径

1. Draft ID 不存在
2. section 路径不存在
3. 提交前源文件被外部改动
4. metadata patch 非法

### 必测回归路径

1. `create_knowledge` 仍可创建整篇内容
2. `update_knowledge` 仍可更新旧流程
3. 搜索、列表、读取接口不受影响

---

## 6. 完成定义

Sprint 1 完成必须同时满足:

1. 新 Draft 流通过自动化测试
2. README 和 MCP README 有使用示例
3. legacy 工具回归无破坏
4. 至少完成一次真实 Agent 手工联调记录

如果只完成代码但没有验证主路径，不算 Sprint 完成。
