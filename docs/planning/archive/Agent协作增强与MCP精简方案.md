# MemoForge Agent 协作增强与 MCP 精简方案

> 版本: v0.1
> 日期: 2026-04-08
> 状态: 方案评审稿
> 关联文档:
> - [PRD](../../design/PRD.md)
> - [README](../../README.md)
> - [MCP Server README](../../crates/memoforge-mcp/README.md)

---

## 1. 背景

MemoForge 当前已经具备可用的桌面端、MCP Server、Git 集成、知识图谱、导入、多知识库切换和基础测试体系。

当前问题不在于“没有能力”，而在于 Agent 与 MemoForge 的交互模式仍然偏底层：

- 读取能力已经支持渐进式披露和 section 级读取
- 写入能力仍以整篇 Markdown 创建或整篇替换为主
- MCP tools 数量增长后，默认暴露给 Agent 的接口存在重叠、分叉和 legacy 参数干扰

这会导致两个典型问题：

1. 大文档写入时，Agent 容易一次生成过长 Markdown，导致格式错误、遗漏 section、frontmatter 不一致。
2. Agent 面对多个相似工具时，容易选错接口或混用 `path` / `id` / `category_id` 等参数形态。

本方案的目标，是把 MemoForge 从“Agent 可调用的知识 CRUD 服务”升级为“面向 Agent 工作流的知识协作协议”。

---

## 2. 问题陈述

### 2.1 当前交互缺口

#### 写操作过粗

当前主写接口存在如下限制：

- `create_knowledge` 需要直接传完整 `content`
- `update_knowledge` 对正文采用整篇替换
- `update_metadata` 虽然细粒度，但只覆盖 frontmatter

结果是：

- Agent 无法自然地分章节写作
- 用户只想“补一节”时，Agent 也要重写全文
- 一次失败就要整篇重试，稳定性差

#### 工具存在重叠

当前读工具包含：

- `get_summary`
- `get_content`
- `get_knowledge`
- `get_knowledge_with_stale`

当前写工具包含：

- `create_knowledge`
- `update_knowledge`
- `update_metadata`

这些工具从服务端兼容角度合理，但对 Agent 选择工具并不友好。

#### schema 中保留了过多 legacy 路径

当前多个工具同时暴露：

- `path`
- `id`
- `category_id`
- `path` 形式的 category

这会增加模型的决策分叉。

### 2.2 用户影响

从用户视角，当前最容易出现的失败体验是：

- “让 AI 记录这次方案”，结果文档内容残缺或结构混乱
- “让 AI 补充一个 section”，结果整篇被重写
- “让 AI 更新摘要”，结果调用了错误工具
- “让 AI 写很长的设计稿”，结果中途失败且不可恢复

---

## 3. 目标与非目标

### 3.1 目标

本阶段目标：

1. 让 Agent 能够以小步、结构化、可预览的方式写知识。
2. 让默认 MCP 接口集更小、更稳定、更易于被模型正确选择。
3. 让桌面应用能把 Agent 的写作过程显式呈现给用户。
4. 保持对现有 MCP 调用方的向后兼容。

### 3.2 非目标

本阶段不做：

- 内置 LLM 或内嵌聊天窗口
- Web 端完整编辑能力
- 多人实时协同编辑
- 复杂权限系统
- 完全移除 legacy MCP tools

---

## 4. 产品设计

### 4.1 新能力带: Agent Assist

建议在 MemoForge 中新增一条明确的产品能力带，名称暂定为 `Agent Assist`。

该能力带包含三部分：

#### A. Agent 草稿箱

草稿是 Agent 与知识库之间的缓冲层。

用户体验：

- Agent 发起写入时，默认进入草稿，而不是直接落盘
- 草稿按知识条目聚合
- 用户能看到草稿来源、更新时间、变更摘要
- 用户可以预览、提交、丢弃

#### B. 结构化写作

知识写入不再只依赖整篇 Markdown，而是支持：

- 新建知识壳
- 追加 section
- 替换指定 section
- 更新 metadata
- 预览 diff
- 最终提交

#### C. Agent 活动可见性

桌面端需要能展示：

- 哪个 Agent 正在操作
- 操作的是哪条知识
- 当前是草稿态还是已提交
- 是否导致 `summary_stale`
- 是否影响引用链接

### 4.2 典型用户路径

#### 路径 1: 让 Agent 记录一次方案

1. 用户在 Claude Code/OpenCode 中要求“把这次方案记录到知识库”
2. Agent 调用 `start_draft`
3. Agent 分多次调用 `update_draft(op="append_section")`
4. Agent 调用 `preview_draft`
5. 桌面端显示“待确认草稿”
6. 用户点击预览并确认提交
7. 系统写入知识并记录事件

#### 路径 2: 让 Agent 补充已有知识的一章

1. Agent `read_knowledge(section=...)`
2. Agent `start_draft(path=...)`
3. Agent `update_draft(op="replace_section")`
4. Agent `preview_draft`
5. 用户确认后 `commit_draft`

#### 路径 3: 让 Agent 整理摘要与标签

1. Agent 读取文档 metadata
2. Agent 调用 `update_draft(op=update_metadata)`
3. 预览显示“正文未改动，仅 metadata 更新”
4. 用户提交

---

## 5. MCP 设计

### 5.1 设计原则

新的 MCP 设计遵循四条原则：

1. 默认接口必须面向工作流，而不是面向底层实现。
2. 读取和写入粒度要对称。
3. legacy 能力保留兼容，但不再作为默认推荐接口。
4. 所有破坏性和复杂写入都应支持预览。

### 5.2 Tool Profile 设计

为避免直接破坏现有 MCP 合同，本方案不建议在没有 profile 开关和兼容期的情况下直接修改默认工具集。

建议分三层 profile：

#### A. `generic-stdio`

这是面向 Claude Code、OpenCode、通用 stdio MCP 客户端的推荐 profile，控制在 8 到 10 个工具：

- `get_status`
- `get_config`
- `list_knowledge`
- `read_knowledge`
- `search_knowledge`
- `start_draft`
- `update_draft`
- `preview_draft`
- `commit_draft`
- `discard_draft`

#### B. `desktop-assisted`

这是桌面端联动场景的推荐 profile，在 `generic-stdio` 基础上追加：

- `get_editor_state`

说明：

- `get_editor_state` 依赖桌面应用状态，不适合作为通用 stdio 默认推荐工具

#### C. `legacy-full`

这是兼容现有客户端和完整诊断场景的 profile，保留当前历史工具集。

### 5.3 兼容与切换策略

建议按以下顺序推进：

1. Sprint 1 先新增 Draft 流工具，不改现有默认 `list_tools()` 行为。
2. Sprint 3 引入显式 profile 开关（见下方具体方案）。
3. 只有在 profile 选择、文档迁移和回归测试都完成后，才考虑是否调整默认推荐 profile。

补充说明：

- 当前运行时默认仍为现有工具集，直到 profile 开关正式落地
- `generic-stdio` 当前表示”推荐目标形态”，不表示”已生效默认值”

**Profile 切换具体方案：**

采用 MCP initialize 参数传入，在客户端首次握手时指定所需 profile：

```json
{
  “jsonrpc”: “2.0”,
  “id”: 1,
  “method”: “initialize”,
  “params”: {
    “capabilities”: {},
    “_meta”: {
      “memoforge_profile”: “generic-stdio”
    }
  }
}
```

选型理由：

- SSE 模式下没有 CLI 参数和进程启动入口，initialize 参数是唯一通用的协商点
- `_meta` 是 MCP 协议允许的扩展字段，不会破坏协议兼容
- 不传 `_meta.memoforge_profile` 或传 `”legacy-full”` 时保持当前行为，零迁移成本
- 后续如需更细粒度的工具协商，可在 `_meta` 中扩展

未传入 profile 时的默认行为：

- `list_tools()` 返回当前完整工具集（等同于 `legacy-full`）
- 直到文档迁移、回归测试全部完成且默认切换经过一轮验证后，再考虑改变此默认值

### 5.4 高级工具集

以下工具保留，但降级为“高级工具”或“兼容工具”：

- `get_backlinks`
- `get_related`
- `get_knowledge_graph`
- `create_category`
- `update_category`
- `delete_category`
- `git_status`
- `git_commit`
- `git_pull`
- `git_push`
- `git_log`
- 旧版 `create_knowledge`
- 旧版 `update_knowledge`
- 旧版 `update_metadata`

### 5.5 新读接口: `read_knowledge`

统一替代当前多个重叠读接口。

#### 输入

```json
{
  "path": "programming/rust/async-patterns.md",
  "level": "L1",
  "section": "Tokio runtime",
  "include_metadata": true,
  "include_stale": true
}
```

#### 返回

```json
{
  "path": "programming/rust/async-patterns.md",
  "metadata": {
    "title": "Rust Async Patterns",
    "tags": ["rust", "async"],
    "summary": "Memo...",
    "summary_stale": false,
    "updated_at": "2026-04-08T12:00:00Z"
  },
  "content": "## Tokio runtime\\n...",
  "sections": [
    { "index": 0, "title": "Overview" },
    { "index": 1, "title": "Tokio runtime" }
  ]
}
```

### 5.6 新写接口: 草稿流

#### `start_draft`

用途：

- 新建草稿
- 可针对新文档，也可针对已有文档

输入示例：

```json
{
  "path": "programming/rust/tokio-crawler.md",
  "metadata": {
    "title": "Tokio Crawler Design",
    "tags": ["rust", "tokio", "crawler"]
  }
}
```

输出示例：

```json
{
  "draft_id": "draft_01HV...",
  "path": "programming/rust/tokio-crawler.md",
  "created": true
}
```

#### `update_draft`

用途：

- 对草稿应用一个结构化操作
- `append_section`、`replace_section` 等是 `update_draft` 的 `op` 枚举值，不是独立 MCP tools

支持操作：

- `set_content`
- `append_section`
- `replace_section`
- `insert_after_section`
- `delete_section`
- `update_metadata`

示例：

```json
{
  "draft_id": "draft_01HV...",
  "op": "append_section",
  "heading": "Implementation Notes",
  "level": 2,
  "content": "- Use tokio::select!\\n- Prefer bounded channels\\n"
}
```

#### `preview_draft`

用途：

- 返回最终预览、变更摘要和风险提示

返回应包含：

- `diff_summary`
- `sections_changed`
- `summary_will_be_stale`
- `warnings`
- `link_updates`

#### `commit_draft`

用途：

- 把草稿真正写入知识库

返回应包含：

- `committed`
- `path`
- `changed_sections`
- `summary_stale`

#### `discard_draft`

用途：

- 丢弃草稿，不写入知识库

---

## 6. 桌面端设计

### 6.1 右侧面板新增 Agent Tab

建议在现有右侧面板中新增 `Agent` tab，与 `元数据 / Git / 反向链接` 并列。

该 tab 展示：

- 当前待确认草稿
- 最近 Agent 提交记录
- 当前连接的 Agent 数量
- 最近一次失败写入的原因

### 6.2 草稿预览弹窗

预览弹窗建议展示：

- 文档标题和路径
- 受影响 section 列表
- 摘要是否会过期
- 变更摘要
- 提交 / 丢弃按钮

### 6.3 活动反馈

Toast 不再只显示简单事件。

建议新增几类事件：

- `Agent 已创建草稿`
- `Agent 草稿待确认`
- `Agent 草稿已提交`
- `Agent 提交失败`

---

## 7. 实现方案

### 7.1 Core 层

建议新增模块：

- `crates/memoforge-core/src/draft.rs`
- `crates/memoforge-core/src/document_ops.rs`

#### draft.rs 职责

- 创建草稿
- 读取草稿
- 持久化草稿
- 提交草稿
- 丢弃草稿

#### document_ops.rs 职责

- section 检测
- append / replace / insert / delete section
- metadata 合并
- diff summary 生成

#### 草稿存储建议

草稿文件存放在：

```text
.memoforge/drafts/<draft_id>.json
```

草稿结构建议至少包含：

- `draft_id`
- `path`
- `base_revision`
- `metadata`
- `content`
- `ops`
- `updated_at`
- `source_agent`

#### 草稿边界场景约束

**并发 Draft：**

- 允许多个 Agent 对同一知识创建不同 Draft
- `commit_draft` 时必须基于 `base_revision` 检测冲突
- 默认不做“后提交覆盖先提交”，冲突时要求显式恢复路径

**生命周期与清理：**

- Draft 默认持久化到 `.memoforge/drafts/`
- 长时间未更新的 Draft 需要支持清理策略，建议首版先提供：
  - 手动丢弃
  - 启动时扫描过期 Draft
  - 基于 `updated_at` 的 TTL 清理

**Git 边界：**

- `.memoforge/drafts/` 应默认加入 `.gitignore`
- Draft 属于本地协作缓冲层，不应进入知识库版本历史

**冲突恢复路径：**

- 当 `commit_draft` 发现源文件已变化时：
  - 返回冲突类型和当前文件摘要
  - 保留原 Draft，不自动丢弃
  - 推荐恢复路径是 `read_knowledge -> start_draft(新)` 或在原 Draft 上继续 `update_draft` 后重试

### 7.2 MCP 层

在 `memoforge-mcp` 中新增：

- `read_knowledge`
- `start_draft`
- `update_draft`
- `preview_draft`
- `commit_draft`
- `discard_draft`

同时调整：

- 旧工具继续存在
- 当前默认 `list_tools()` 行为先保持不变
- profile 开关落地后，再引入推荐工具集切换
- 可通过 profile 或 config 切到 full toolset

### 7.3 Tauri 层

在 `memoforge-tauri` 中新增 commands：

- `list_drafts_cmd`
- `get_draft_preview_cmd`
- `commit_draft_cmd`
- `discard_draft_cmd`

并在 SSE snapshot 中加入：

- 当前草稿数
- 最近 Agent 草稿
- 最近提交摘要

### 7.4 前端层

建议新增组件：

- `AgentDraftPanel.tsx`
- `DraftPreviewModal.tsx`
- `AgentActivityFeed.tsx`

并改造：

- `RightPanel.tsx`
- `ToastNotifications.tsx`
- `SettingsModal.tsx`

---

## 8. 向后兼容策略

### 8.1 保留旧工具

以下旧工具保留一段时间：

- `get_summary`
- `get_content`
- `get_knowledge`
- `get_knowledge_with_stale`
- `create_knowledge`
- `update_knowledge`
- `update_metadata`

### 8.2 默认 schema 收敛

默认暴露给 Agent 的 schema 应只保留推荐参数：

- 统一使用 `path`
- 分类统一使用 category path
- 不再默认展示 `id`
- 不再默认展示 `category_id`

### 8.3 文档迁移

README、MCP README、应用内帮助都要同步改成：

- 推荐工具流
- 大文档请使用草稿 / 分段写入
- legacy 接口仅用于兼容旧客户端

---

## 9. 风险与对策

### 风险 1: Markdown 结构化编辑破坏原文格式

对策：

- 先做最小结构化，仅围绕 heading section 操作
- 不做复杂 AST 重排
- 预览阶段必须返回 diff summary

### 风险 2: 草稿与外部修改冲突

对策：

- 草稿记录 `base_revision`
- 提交时检测文件是否已变化
- 变化时返回冲突提示，不强行覆盖

### 风险 3: MCP 工具重构引发兼容问题

对策：

- 保留旧 handler
- 分离“默认工具集”和“完整工具集”
- 先迁移文档和推荐实践，再逐步迁移客户端

### 风险 4: 前端面板复杂度增加

对策：

- 第一阶段只做最小草稿列表 + 预览弹窗
- 不一次性做完整工作台

---

## 10. 验收标准

### 产品验收

- Agent 能分 3 到 5 次写入完成一篇长文档
- 用户能在桌面端看到待确认草稿
- 用户能预览后提交或丢弃
- 提交后知识内容、metadata、summary_stale 状态符合预期

### 技术验收

- 新草稿流通过 MCP E2E
- 旧工具回归测试通过
- 大文档写入稳定性高于现有整篇替换模式
- section 级写入与 section 级读取对称

### 文档验收

- README 增加推荐 Agent 工作流
- MCP 文档区分 default vs legacy toolset
- 开发计划和测试计划与本方案一致
