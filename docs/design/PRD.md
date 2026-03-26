# MemoForge 产品需求文档（PRD）

> 版本: v1.10
> 日期: 2026-03-25
> 状态: 设计阶段（部分功能待实现）
> 更新: 明确 AI 协作机制的实现状态

---

## 1. 产品概述

### 1.1 产品名称

**MemoForge**

### 1.2 一句话定位

AI驱动的个人知识管理应用——人与AI双向编辑，Git原生存储与协作。

### 1.3 产品愿景

MemoForge 是一款面向开发者和知识工作者的知识管理工具。用户通过桌面应用直接查看和编辑知识，同时通过 MCP 接口让 AI Agent（Claude Code、Codex、OpenCode 等）直接读写知识库。知识以 Markdown 文件存储，通过 Git 实现版本管理、多设备同步和多人协作。

> **MVP 能力边界说明：** 首次发布版本提供完整的桌面编辑体验和 MCP 读写能力。Web 远程访问（只读）在 Should Have 阶段提供，Web 编辑能力在后续迭代中实现。

### 1.4 核心理念

- **AI原生** — 产品从设计之初就为AI Agent优化，不是事后添加AI功能
- **与模型解耦** — 应用本身不内置AI能力，AI由外部Agent驱动（类似Pencil的设计哲学）
- **Git原生** — 分享就是分享一个Git仓库，协作就是Git协作，不发明新的同步协议
- **渐进式披露** — 知识分L0/L1/L2三层暴露，为AI Agent优化token消耗
- **开放格式** — 纯Markdown + YAML frontmatter，无厂商锁定

---

## 2. 用户画像

### 2.1 主要用户：软件开发者

- 日常使用 Claude Code、Codex、Cursor 等AI编程工具
- 需要积累和复用技术方案、架构设计、踩坑经验
- 希望AI编程时能直接查询自己的技术知识库
- 熟悉 Git、Markdown，对命令行操作无障碍

### 2.2 次要用户：知识工作者

- 具备一定计算机专业性
- 需要系统化管理专业领域知识
- 希望通过AI辅助整理和检索知识
- 能接受Markdown格式的写作方式

### 2.3 非目标用户

- 追求零门槛的普通消费者
- 需要富文本所见即所得编辑的用户
- 对Git/Markdown完全陌生的用户

---

## 3. 核心使用场景

### 场景1：用户构建知识

用户在日常工作中积累技术方案、学习笔记、项目经验，通过 MemoForge 桌面应用编写和组织 Markdown 文件。支持目录结构、标签、双向链接等多维度组织方式。

### 场景2：用户查看知识

用户通过桌面应用或Web界面浏览知识库，按目录、标签、搜索等方式定位知识，查看格式化的Markdown渲染内容。

### 场景3：AI Agent使用知识

开发者在 Claude Code 等工具中编程时，AI Agent 通过 MCP 接口查询用户的知识库。Agent 先获取目录概览（L0），再按需获取摘要（L1）或全文（L2），高效利用context window。

**示例对话：**
```
用户: 帮我用tokio写一个并发爬虫
Claude Code: [通过MCP查询知识库，发现用户有"Rust异步编程模式"和"tokio-best-practices"两条知识]
Claude Code: 我在你的知识库中找到了相关知识，让我参考你之前总结的tokio最佳实践...
```

### 场景4：AI Agent录入知识

AI Agent 在编程过程中发现了有价值的技术方案或解决了一个复杂问题，通过 MCP 接口将经验写入知识库，包括自动生成摘要和标签。

**示例对话：**
```
用户: 把这次的解决方案记录到我的知识库
Claude Code: [通过MCP创建新知识条目，自动生成frontmatter]
Claude Code: 已将"PostgreSQL连接池优化方案"录入你的知识库，标签为[postgresql, connection-pool, performance]
```

### 场景5：知识分享与协作

用户将知识库推送到 GitHub，团队成员 clone 后即可在自己的 MemoForge 中浏览和编辑。团队的共享知识通过 Git 自然流转。

### 场景6：冷启动 — 新用户首次使用

新用户第一次打开 MemoForge：

**路径A：从零开始**
1. 创建新知识库（选择本地目录）
2. 可选关联 Git 远程仓库
3. 从模板知识库初始化（提供「开发者知识库」「技术笔记」等预设模板，包含示例目录结构和几条示例知识）
4. 编写第一条知识

**路径B：导入已有知识**
1. 选择已有的 Markdown 文件夹（如 Obsidian vault、散落的 .md 笔记目录）
2. MemoForge 扫描目录，自动识别 .md 文件
3. 对没有 frontmatter 的文件，提示用户是否批量生成（从文件名推断 title，后续可通过 AI 批量生成 summary 和 tags）
4. 完成导入，即可正常使用

**路径C：Clone 已有知识库**
1. 输入 Git 仓库 URL
2. Clone 到本地
3. 直接打开使用

---

## 4. 知识数据模型

### 4.1 知识条目

一个知识条目 = 一个 Markdown 文件，包含 YAML frontmatter 和正文内容。

```markdown
---
title: "知识标题"
tags: [tag1, tag2, tag3]
summary: "知识摘要，200-500字，描述核心内容。由AI生成，通过MCP写入。"
related: ["programming/rust/error-handling.md", "programming/rust/tokio-best-practices.md"]
created: 2026-03-22
updated: 2026-03-22
---

# 知识标题

## 章节一
正文内容，支持标准Markdown语法。

支持双向链接：参考 [[programming/rust/error-handling.md]]

## 章节二
更多内容...
```

### 4.1.1 知识条目身份与链接规则

知识条目的唯一标识是其**相对于知识库根目录的路径**（如 `programming/rust/async-patterns.md`）。所有引用必须使用此完整相对路径，不允许仅用文件名。

**统一规则：**
- `related` 字段：使用知识库根目录的相对路径（如 `"programming/rust/error-handling.md"`）
- `[[双向链接]]`：同样使用相对路径（如 `[[programming/rust/error-handling.md]]`）
- 不支持无路径的文件名引用（如 ~~`[[error-handling]]`~~），避免重名歧义

**`move_knowledge` 的引用更新：**
- 移动/重命名文件时，自动扫描全知识库，更新所有 `related` 字段和 `[[]]` 链接中引用了旧路径的条目
- 更新范围包括：frontmatter 的 `related` 数组 + 正文中的 `[[旧路径]]`
- 操作返回值中包含受影响的文件列表，方便用户确认

### 4.2 Frontmatter 字段定义

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `title` | string | 是 | 知识标题 |
| `tags` | string[] | 否 | 标签列表 |
| `summary` | string | 否 | 摘要描述（L1层），由外部AI生成并通过MCP写入 |
| `summary_hash` | string | 否 | 正文内容的hash值（生成summary时记录），用于判断summary是否与正文同步 |
| `related` | string[] | 否 | 关联知识文件的相对路径 |
| `created` | date | 是 | 创建日期（自动生成） |
| `updated` | date | 是 | 最后更新日期（自动更新） |

**Summary 生命周期管理：**

- 当正文内容被修改时，`updated` 字段自动更新
- `summary_hash` 记录生成 summary 时正文的内容 hash
- AI Agent 或用户可通过 `get_summary()` 接口的返回值中的 `summary_stale` 字段判断 summary 是否过期（即 summary_hash 与当前正文 hash 不一致）
- 过期的 summary 仍然可用（比没有强），但 AI Agent 可选择重新生成并通过 `update_metadata()` 写入
- 桌面应用在 UI 上对过期 summary 做视觉提示（如淡色或标记图标）

**summary_hash 更新规则：**

| 操作 | summary_hash 行为 | 原因 |
|------|-------------------|------|
| `update_knowledge(content=...)` 更新正文 | **不变** | 正文变了但 summary 没更新，hash 不一致 → summary_stale=true |
| `update_metadata(summary=...)` 更新摘要 | **重算**（基于当前正文内容） | 新 summary 对应当前正文，hash 应同步 |
| `update_knowledge(content=..., metadata.summary=...)` 同时更新 | **重算** | 同上 |

### 4.3 目录结构与分类约束

知识库是一个标准的文件目录结构，但**顶层分类目录受约束管理**：

```
my-knowledge/              # 知识库根目录（Git仓库）
├── .memoforge/            # MemoForge配置目录
│   ├── config.yaml        # 知识库配置
│   └── events.jsonl       # 事件日志
├── programming/           # 知识分类目录（在config中注册）
│   ├── rust/
│   │   ├── async-patterns.md
│   │   └── error-handling.md
│   └── python/
│       └── decorators.md
├── architecture/
│   ├── microservices.md
│   └── event-driven.md
└── devops/
    └── docker-best-practices.md
```

**分类目录管理机制：**

知识库的顶层分类目录在 `.memoforge/config.yaml` 中注册：

```yaml
# .memoforge/config.yaml
name: "我的知识库"
categories:
  - path: programming
    label: "编程技术"
    icon: code
  - path: architecture
    label: "架构设计"
    icon: layers
  - path: devops
    label: "运维部署"
    icon: server
```

**约束规则：**
- 创建知识条目时，必须指定一个已注册的分类目录（或其子目录）
- MCP 接口 `create_knowledge(path, ...)` 的 path 必须以已注册分类开头，否则返回 `INVALID_PATH` 错误并附带可用分类列表
- 新增顶层分类需通过专门的接口 `create_category(path, label)` 或在桌面应用中通过"管理分类"操作
- **子目录层级不限**，用户可按需创建多级子分类（如 `programming/rust/async/tokio/`）
- 当某分类下知识超过 30 条时，UI 提示"建议创建子分类整理"
- 目的：防止 AI Agent 或用户随意在根目录创建零散文件/目录，保持知识库结构有序

### 4.4 渐进式披露模型（L0/L1/L2）

| 层级 | 内容 | Token量级 | 数据来源 | MCP接口 |
|------|------|-----------|----------|---------|
| **L0 — 目录索引** | 目录树 + 每条知识的标题和标签 | ~100 tokens/条 | 自动从frontmatter提取 | `list_knowledge` |
| **L1 — 摘要** | 每条知识的摘要描述 | ~200-500 tokens/条 | 由外部AI生成，通过MCP写入frontmatter的summary字段 | `get_summary` |
| **L2 — 全文** | 完整的Markdown内容 | 不限 | 原始文件内容 | `get_content` |

**AI Agent典型调用流程：**
1. 调用 `list_knowledge()` 获取L0目录索引，快速了解知识库全貌
2. 根据任务相关性，调用 `get_summary(path)` 获取L1摘要，判断是否需要详细内容
3. 仅对确实需要的知识调用 `get_content(path)` 获取L2全文

---

## 5. 功能设计

### 5.1 桌面应用功能

#### 5.1.0 UI设计理念

MemoForge 的 UI 应该像一款**知识记录软件**，而不是文件管理器。用户操作的对象是"知识条目"和"分类"，而不是"文件"和"目录"。底层虽然是 Markdown 文件，但 UI 层应隐藏文件系统细节。

**核心原则：**
- 用户看到的是"知识标题"，不是"文件名"
- 用户操作的是"选择分类 → 填写标题 → 编写内容"，不是"选择目录 → 输入文件名 → 编辑文件"
- 目录树展示为"分类导航"，显示分类名称和图标，不显示 `.md` 扩展名
- Frontmatter 对用户透明——标题、标签、关联等通过表单化 UI 编辑，用户不需要知道 YAML 语法
- Markdown 编辑集成成熟的所见即所得编辑器组件（如 Milkdown、Tiptap），提供工具栏（加粗、列表、代码块、链接等），降低 Markdown 语法门槛
- 高级用户可切换到"源码模式"直接编辑 Markdown 原文

#### 5.1.1 知识浏览

- **分类导航面板** — 左侧显示知识库的分类结构（由 config.yaml 定义的顶层分类 + 子分类），显示分类名称和图标，支持展开/折叠
- **知识列表** — 中间区域显示当前分类下的知识条目列表，展示标题、标签、更新时间（不显示文件路径和扩展名）
- **知识阅读** — 右侧/主区域渲染Markdown内容，支持目录导航
- **标签过滤** — 按标签筛选知识条目
- **双向链接面板** — 显示当前知识的关联知识和反向链接

#### 5.1.1.1 右侧面板设计（v2.0）

为最大化编辑区域空间利用率，采用**可折叠右侧面板**设计：

**布局结构：**
```
┌────────┬────────────┬─────────────────────────────────┬──────────┐
│ Sidebar │ 知识列表   │          编辑器                  │ 右侧面板  │
│ (240px) │ (300px)    │          (flex-1)               │ (可折叠) │
│         │            │                                 │          │
│ 分类    │ 知识条目   │    Markdown 编辑/预览           │ ▶ 元数据 │
│ 标签    │            │                                 │   Git    │
│         │            │                                 │   反向链接│
└────────┴────────────┴─────────────────────────────────┴──────────┘
```

**面板特性：**
- **折叠状态**：仅显示图标栏（~40px），不占用内容空间
- **展开状态**：显示完整面板（~300px），包含 Tab 切换
- **Tab 内容**：
  - **元数据** — 标题、标签、关联知识、摘要编辑
  - **Git** — Git 状态、提交、拉取、推送操作
  - **反向链接** — 显示引用当前知识的其他条目

**交互设计：**
- 点击右侧边缘的展开/折叠按钮切换面板状态
- Tab 切换使用图标 + 文字标签
- 面板状态记忆：下次打开时恢复上次的展开/折叠状态和选中的 Tab

**优势：**
- 最大化编辑区域空间
- 统一的扩展信息入口
- 不再占用底部空间（Git 面板从底部移至右侧）
- 用户可按需展开查看详情

#### 5.1.2 知识编辑

- **新建知识** — 用户选择分类 → 填写标题 → 进入编辑器。文件名由标题自动生成（如标题"Rust异步编程"→ 文件名 `rust-async-programming.md`），用户无需关心
- **Markdown编辑器** — 集成成熟的所见即所得 Markdown 编辑器组件（如 Milkdown），提供工具栏操作，支持切换到源码模式
- **元数据面板** — 编辑器顶部或侧边以表单方式展示标题、标签（tag 输入框）、关联知识（下拉选择），用户不接触 YAML 语法
- **知识管理** — 通过右键菜单或操作按钮进行移动（选择目标分类）、重命名、删除等操作，UI 不暴露文件路径
- **双向链接输入** — 输入 `[[` 时自动补全知识文件的完整相对路径（如 `[[programming/rust/error-handling.md]]`）

#### 5.1.3 搜索

- **全文搜索** — 支持正则表达式，返回匹配行及上下文预览，搜索结果关键词高亮
- **标签搜索** — 按标签精确匹配，支持多标签组合（MVP 阶段仅支持 AND 语义，OR 后续迭代）
- **标题搜索** — 按知识标题模糊匹配
- **组合搜索** — 支持标签 + 关键词组合搜索（如 `tag:rust async patterns`）

#### 5.1.4 Git集成

> **v2.0 更新**：Git 面板已移至右侧可折叠面板，不再占用底部空间。

- **状态面板** — 在右侧面板的 Git Tab 中显示当前Git状态（修改、未提交等）
- **提交** — 一键提交当前修改
- **拉取** — 从远程拉取变更；冲突时显示冲突文件列表（MVP 阶段需用户手动编辑解决，后续迭代提供 diff UI）
- **推送** — 推送本地提交到远程；rejected 时提示先拉取
- **历史** — 查看文件/全局变更历史

#### 5.1.5 Web远程访问（Should Have 阶段）

- `memoforge serve` 进程可选启动内置 HTTP 服务（`--http --port 8080`），对外提供 Web 访问
- Web 端提供与桌面端一致的只读浏览体验
- 后续迭代支持 Web 端编辑
- 注意：HTTP Server 运行在 `memoforge serve` 进程中，不在桌面应用（GUI）中

**Web/HTTP 安全模型：**

| 安全层 | 策略 | 说明 |
|--------|------|------|
| **监听地址** | 默认 `127.0.0.1`（仅本机） | 局域网/公网访问需用户显式配置 `--bind 0.0.0.0` |
| **认证** | Bearer Token（仅 Authorization header） | 启动时自动生成随机 token，显示在终端输出中。**不支持 URL query 参数传递 token**，避免浏览器历史/日志/代理泄漏 |
| **CORS** | 默认禁止跨域 | 仅允许同源请求；如需跨域，用户在配置中显式添加允许的 origin |
| **TLS** | MVP 不内置 | 局域网内明文可接受；公网暴露场景建议用户通过 reverse proxy（nginx/caddy）挂载 TLS |
| **读写控制** | Web 默认只读 | 即使后续支持 Web 编辑，也需单独开启，且受 token 认证保护 |

启动示例：
```bash
# MCP only（默认，不启动 HTTP）
memoforge serve --knowledge-path /path/to/kb

# MCP + Web 访问
memoforge serve --knowledge-path /path/to/kb --http --port 8080
# 启动后输出: Web access token: mf_a7x9k2... (pass via Authorization: Bearer header)

# 局域网访问
memoforge serve --knowledge-path /path/to/kb --http --bind 0.0.0.0 --port 8080
```

#### 5.1.6 冷启动与导入

- **新建知识库** — 选择本地目录，可从模板初始化（预置目录结构和示例知识）
- **导入已有文件夹** — 扫描选定目录的 .md 文件，对无 frontmatter 的文件自动生成基础 metadata（从文件名推断 title，created/updated 从文件时间戳获取）
- **Clone Git仓库** — 输入远程仓库 URL，clone 并直接打开
- **多知识库切换** — 支持管理多个知识库（不同 Git 仓库/本地目录），通过下拉菜单或侧边栏快速切换

### 5.2 MCP接口功能

详见第6节「MCP接口设计」。

---

## 6. MCP接口设计

### 6.1 设计原则

- **渐进式披露** — 遵循L0→L1→L2的分层加载模式
- **接口描述自解释** — 每个MCP tool的description要清晰说明功能、参数、返回值，方便AI Agent理解和调用
- **幂等性** — 写入接口尽量保证幂等
- **错误友好** — 返回结构化的错误信息（统一错误码），方便AI Agent识别和处理
- **安全可控** — 破坏性操作需要确认机制，支持只读接入模式
- **并发安全** — 多个 Agent 进程和 GUI 同时操作时不会数据损坏

### 6.1.1 统一错误响应格式

所有 MCP 接口在出错时返回统一的结构化错误，AI Agent 可通过 `error_code` 机器可读地识别问题并自动处理：

```json
{
  "success": false,
  "error_code": "CONFLICT_FILE_LOCKED",
  "error_message": "文件 programming/rust/async-patterns.md 正在被其他进程编辑，请稍后重试",
  "retry_after_ms": 2000,
  "context": {
    "locked_by": "mcp:claude-code-2",
    "locked_since": "2026-03-23T14:30:00Z"
  }
}
```

**错误码分类：**

| 错误码前缀 | 类别 | 示例 |
|-----------|------|------|
| `NOT_INITIALIZED` | 无活跃知识库 | 冷启动未完成或知识库切换失败后 |
| `NOT_FOUND_*` | 资源不存在 | `NOT_FOUND_KNOWLEDGE`、`NOT_FOUND_CATEGORY` |
| `INVALID_*` | 参数或格式错误 | `INVALID_PATH`（路径不在已注册分类下）、`INVALID_FRONTMATTER` |
| `CONFLICT_*` | 并发冲突 | `CONFLICT_FILE_LOCKED`、`CONFLICT_GIT_MERGE` |
| `GIT_*` | Git 操作失败 | `GIT_AUTH_FAILED`、`GIT_PUSH_REJECTED`、`GIT_REMOTE_UNREACHABLE`、`GIT_DIRTY_STATE` |
| `PERMISSION_*` | 权限不足 | `PERMISSION_READONLY`（readonly 模式下调用写入接口） |
| `LIMIT_*` | 超出限制 | `LIMIT_RESULT_TOO_LARGE`（建议加 depth/tags 过滤） |

**关键错误的 Agent 处理指引（写在 tool description 中）：**

| 错误码 | Agent 应如何处理 |
|--------|-----------------|
| `NOT_FOUND_KNOWLEDGE` | 检查路径是否正确，调用 `list_knowledge` 确认 |
| `INVALID_PATH` | 路径必须以已注册分类开头，调用 `get_config` 获取可用分类列表 |
| `CONFLICT_FILE_LOCKED` | 等待 `retry_after_ms` 后重试，或操作其他文件 |
| `CONFLICT_GIT_MERGE` | 调用 `get_content` 读取冲突内容，解决冲突后 `update_knowledge` + `git_commit` |
| `GIT_PUSH_REJECTED` | 先调用 `git_pull`，解决可能的冲突后再 `git_push` |
| `GIT_AUTH_FAILED` | 告知用户检查 Git 凭证配置 |
| `PERMISSION_READONLY` | 告知用户当前为只读模式，无法执行写入操作 |

### 6.1.2 多 Agent 并发控制

多个 Claude Code / Codex 实例可能同时启动多个 `memoforge serve` 进程，加上 Tauri 桌面应用，形成多进程并发操作同一知识库的场景：

```
Claude Code 窗口1  →  memoforge serve 进程A  ──┐
Claude Code 窗口2  →  memoforge serve 进程B  ──┼──→ 同一个知识库目录
Codex              →  memoforge serve 进程C  ──┤
Tauri 桌面应用     ────────────────────────────┘
```

**并发控制策略：**

| 操作类型 | 锁机制 | 说明 |
|---------|--------|------|
| 读操作（list/get/grep/search） | 无锁 | 多进程可同时读取 |
| 写单个知识文件 | 文件级 flock | 对目标 .md 文件加排他锁，写完释放。其他进程写同一文件时返回 `CONFLICT_FILE_LOCKED` |
| Git 操作（commit/pull/push） | 全局锁 `.memoforge/git.lock` | Git 操作串行执行，避免仓库状态混乱 |
| events.jsonl 追加 | append 模式 | 单行 JSON + 文件追加，操作系统保证行级原子性 |
| Frontmatter 索引缓存 | 各进程独立 | 每次写操作后通知其他进程（通过文件 mtime 变化触发重新加载） |

### 6.1.3 MCP 服务状态检测

`memoforge serve` 启动时在 `.memoforge/agents/` 目录下写入 `{pid}.json` 文件（含 PID、启动时间、Agent 名称），退出时清除。

```json
// .memoforge/agents/12345.json
{
  "pid": 12345,
  "name": "claude-code",
  "started_at": "2026-03-25T10:30:00Z",
  "kb_path": "/path/to/kb"
}
```

桌面应用扫描此目录获取所有活跃的 MCP 连接，在状态栏显示：
- 🟢 MCP: 2 个连接 (claude-code, codex)
- 🔴 MCP: 未连接

**Agent 名称识别规则：**
- 从环境变量 `MEMOFORGE_AGENT_NAME` 获取（Agent 启动时设置）
- 若未设置，从父进程名称推断（如 `claude` → `claude-code`）
- 默认值：`unknown`

**清理机制：**
- 启动时扫描 `.memoforge/agents/` 目录，清理已终止进程的 PID 文件
- 每次查询状态时验证 PID 是否存活

`get_status()` 接口也返回当前活跃的 Agent 列表，便于 GUI 显示。

### 6.1.1 MCP 运行模式

MemoForge 提供统一的 CLI 入口 `memoforge`，支持两种运行模式：

**模式A：Headless 模式（MCP 首选）**
- 通过命令行启动独立的 MCP Server 进程，不启动 GUI
- 命令：`memoforge serve --knowledge-path /path/to/kb`
- 这是 AI Agent 接入的标准方式——Claude Code 在 MCP 配置中直接启动此命令
- 适用场景：所有 AI Agent 接入、服务器部署、CI/CD 环境

**模式B：桌面应用模式**
- 通过 `memoforge` （无 serve 子命令）或点击图标启动 Tauri 桌面应用
- 桌面应用内置同样的知识管理引擎，用户通过 GUI 操作
- 此模式下 **不内嵌 MCP Server**——AI Agent 的接入统一走 Headless 模式

> **设计决策说明：** 将 MCP Server 和 GUI 解耦为两个独立进程，避免了"启动 GUI 才能用 MCP"和"Claude Code 配置到底启动谁"的问题。用户可以同时运行桌面应用（GUI 编辑）和 Headless 进程（AI Agent 接入），两者操作同一个知识库目录，通过文件系统自然同步。

**AI Agent 接入配置（Claude Code）：**
```json
{
  "mcpServers": {
    "memoforge": {
      "command": "memoforge",
      "args": ["serve", "--knowledge-path", "/path/to/my-knowledge"]
    }
  }
}
```

**多知识库：** 一个 `memoforge serve` 进程服务一个知识库。如需同时访问多个知识库，启动多个进程，在 MCP 配置中注册多个 server：

```json
{
  "mcpServers": {
    "memoforge-personal": {
      "command": "memoforge",
      "args": ["serve", "--knowledge-path", "/path/to/personal-kb"]
    },
    "memoforge-work": {
      "command": "memoforge",
      "args": ["serve", "--knowledge-path", "/path/to/work-kb"]
    }
  }
}
```

### 6.1.2 安全机制

AI Agent 通过 MCP 可以执行有破坏力的操作，需要安全防护：

**访问模式：**
- `readwrite`（默认）— 完整的读写权限
- `readonly` — 只允许浏览和搜索类接口，拒绝所有写入和 Git 推送操作

通过启动参数控制：`memoforge serve --mode readonly`

**破坏性操作保护：**

破坏性操作的安全防护分两层，将**人**放进确认回路：

**第一层：MCP tool 的 description 声明（依赖 Agent 宿主的确认机制）**

MCP 协议中，tool 的 description 会明确标注"此操作将删除文件/推送到远程"。Claude Code 等 Agent 宿主本身具备用户确认机制（如 Claude Code 在执行有副作用的工具调用时会 prompt 用户确认）。这是最自然的"人在回路"——由 Agent 宿主而非 MemoForge 来拦截确认。

**第二层：MemoForge 应用侧的 dry-run 预览**

对于高风险操作，MemoForge 提供 `dry_run` 参数（默认 `true`），返回操作影响预览而不实际执行：

```
// dry-run（默认）— 仅预览影响
Agent 调用: delete_knowledge("programming/rust/old-notes.md")
返回: { "dry_run": true, "impact": "将删除 old-notes.md (1.2KB), 有3个文件引用了此知识", "affected_files": [...] }

// 实际执行 — 需显式传 dry_run=false
Agent 调用: delete_knowledge("programming/rust/old-notes.md", dry_run=false)
返回: { "success": true, "deleted": "programming/rust/old-notes.md" }
```

两层配合：Agent 宿主先向用户展示预览信息并获取确认，再以 `dry_run=false` 执行。即使 Agent 跳过了预览直接传 `dry_run=false`，Claude Code 等宿主仍会在工具调用时提示用户确认。

需要 dry-run 保护的操作：

| 操作 | 风险说明 |
|------|----------|
| `delete_knowledge` | 删除知识条目（不可逆，除非 Git 回退） |
| `git_push` | 推送到远程仓库，影响他人 |
| `move_knowledge` | 移动文件会触发全库引用更新 |

注：`git_commit` 为本地操作，不做 dry-run 保护。

**操作审计与事件通知：**
- **所有入口**（MCP Server、桌面应用 GUI、CLI）的写操作统一记录到 `.memoforge/events.jsonl`
- 记录内容：时间、操作来源（`mcp:<agent名称>`、`gui`、`cli`）、操作类型、操作路径、操作描述
- 桌面应用监听此文件，实时展示操作通知（toast 消息）
- 用户可通过桌面应用查看完整操作历史

### 6.2 接口列表

#### 6.2.1 系统状态类

| 接口 | 参数 | 说明 |
|------|------|------|
| `get_status()` | 无 | 获取知识库状态：是否已初始化、知识总数、Git状态（是否为Git仓库、是否有未提交修改、远程仓库地址等） |
| `get_config()` | 无 | 获取知识库配置信息（含已注册的分类目录列表） |
| `create_category(path, label)` | `path`: 分类目录名<br>`label`: 显示名称 | 新增顶层分类目录，注册到 config.yaml |

#### 6.2.2 知识浏览类（只读）

| 接口 | 参数 | 说明 |
|------|------|------|
| `list_knowledge(path?, tags?, depth?, cursor?, limit?)` | `path`: 目录路径（可选，默认根目录）<br>`tags`: 标签过滤（可选）<br>`depth`: 目录深度（可选，默认1）<br>`cursor`: 分页游标（可选）<br>`limit`: 每页条数（可选，默认200） | **L0层** — 返回目录/知识列表，包含每条知识的title和tags。超过 limit 时返回 `next_cursor` |
| `get_summary(path)` | `path`: 知识文件路径 | **L1层** — 返回知识的frontmatter元数据（包含summary） |
| `get_content(path, section?)` | `path`: 知识文件路径<br>`section`: 章节索引（可选，从0开始，对应 sections 数组的下标） | **L2层** — 返回完整Markdown内容，可选按章节获取。使用数字索引而非标题字符串，避免重复标题歧义。**章节切分规则：** 按 `##` (h2) 级别标题切分，每个章节包含该标题到下一个同级标题之间的所有内容（含子标题 ###/#### 等）。`#` (h1) 视为文档标题不参与切分。sections 数组按文档中出现顺序编号 |
| `grep(pattern, path?, options?)` | `pattern`: 搜索模式（正则）<br>`path`: 搜索范围（可选）<br>`options`: 搜索选项（忽略大小写等） | 全文搜索，类似grep，返回匹配的文件和行 |

#### 6.2.3 知识管理类（写入）

| 接口 | 参数 | 说明 |
|------|------|------|
| `create_knowledge(path, content, metadata?)` | `path`: 文件路径（必须以已注册分类开头）<br>`content`: Markdown正文<br>`metadata`: frontmatter字段 | 创建新知识条目，自动生成created/updated。path 不在已注册分类下时返回错误及可用分类列表 |
| `update_knowledge(path, content?, metadata?)` | `path`: 文件路径<br>`content`: 新的正文内容（可选）<br>`metadata`: 要更新的frontmatter字段（可选） | 更新知识内容和/或元数据，自动更新updated |
| `update_metadata(path, metadata)` | `path`: 文件路径<br>`metadata`: 要更新的frontmatter字段 | 仅更新frontmatter（用于AI写入summary、tags等） |
| `delete_knowledge(path, dry_run?)` | `path`: 文件路径<br>`dry_run`: 默认 true | 删除知识条目（dry_run=true 时仅返回影响预览） |
| `move_knowledge(from, to, dry_run?)` | `from`: 原路径<br>`to`: 目标路径<br>`dry_run`: 默认 true | 移动/重命名知识文件（dry_run=true 时返回受影响的引用列表），实际执行时自动更新所有 `related` 字段和正文 `[[旧路径]]` 链接 |

#### 6.2.4 Git操作类

| 接口 | 参数 | 说明 |
|------|------|------|
| `git_status()` | 无 | 获取Git状态：是否为Git仓库、当前分支、未提交修改列表、远程仓库信息 |
| `git_commit(message?)` | `message`: 提交信息（可选，可自动生成） | 提交当前所有修改 |
| `git_pull()` | 无 | 仅拉取远程变更并合并到本地 |
| `git_push(dry_run?)` | `dry_run`: 默认 true | 推送本地提交到远程仓库（dry-run 保护） |
| `git_log(path?, limit?)` | `path`: 文件路径（可选，不填则全局）<br>`limit`: 返回条数（可选，默认10） | 查看变更历史 |

**`git_sync` 已拆分为 `git_pull` + `git_push`：**

原设计的 `git_sync()`（pull --rebase + push 一步完成）隐藏了太多复杂性。拆分原因：
- rebase 可能失败（冲突），用户需要看到中间状态而不是一个笼统的错误
- push 是影响他人的操作，应该独立控制
- AI Agent 可以先 pull 检查是否有冲突，再决定是否 push

**Git 操作错误处理：**

| 错误场景 | 返回行为 | 预期处理 |
|---------|---------|---------|
| pull 时远程有冲突 | 返回冲突文件列表和冲突内容片段，本地保持 merge 中间状态 | AI Agent 可读取冲突文件、解决冲突后 commit；用户可在 GUI 中手动处理 |
| push 时远程已更新 (rejected) | 返回 `rejected: remote has new commits`，不自动 force push | 提示先 pull |
| 认证失败 | 返回 `auth_failed`，附带需要的认证方式（SSH/HTTPS） | 提示用户检查凭证配置 |
| 远程仓库不可达 | 返回 `remote_unreachable`，附带 URL | 提示检查网络或仓库地址 |
| 仓库处于异常状态（rebase 中断等） | 返回 `repo_dirty_state`，附带状态描述 | 提示用户手动解决或通过 `git_status` 查看详情 |

#### 6.2.5 关联查询类

| 接口 | 参数 | 说明 |
|------|------|------|
| `get_related(path)` | `path`: 知识文件路径 | 获取关联知识（基于related字段和双向链接 `[[]]`） |
| `get_tags(prefix?)` | `prefix`: 标签前缀过滤（可选） | 获取所有标签列表及其使用次数 |
| `get_backlinks(path)` | `path`: 知识文件路径 | 获取反向链接：哪些知识引用了当前知识 |

### 6.3 接口返回格式示例

**`list_knowledge("programming/rust")` 返回示例（L0层）：**

```json
{
  "path": "programming/rust",
  "type": "directory",
  "children": [
    {
      "path": "programming/rust/async-patterns.md",
      "type": "knowledge",
      "title": "Rust异步编程模式",
      "tags": ["rust", "async", "tokio"],
      "updated": "2026-03-20"
    },
    {
      "path": "programming/rust/error-handling.md",
      "type": "knowledge",
      "title": "Rust错误处理最佳实践",
      "tags": ["rust", "error-handling"],
      "updated": "2026-03-15"
    }
  ],
  "total": 2,
  "next_cursor": null
}
```

**`get_summary("programming/rust/async-patterns.md")` 返回示例（L1层）：**

```json
{
  "path": "programming/rust/async-patterns.md",
  "title": "Rust异步编程模式",
  "tags": ["rust", "async", "tokio"],
  "summary": "介绍Rust中async/await的核心概念，包括Future trait、tokio运行时、常见的并发模式（join、select、spawn）以及错误处理最佳实践。",
  "summary_hash": "a3f8c2d1",
  "summary_stale": false,
  "related": ["programming/rust/error-handling.md", "programming/rust/tokio-best-practices.md"],
  "created": "2025-12-01",
  "updated": "2026-03-20"
}
```

**`get_content("programming/rust/async-patterns.md")` 返回示例（L2层）：**

```json
{
  "path": "programming/rust/async-patterns.md",
  "metadata": {
    "title": "Rust异步编程模式",
    "tags": ["rust", "async", "tokio"],
    "summary": "...",
    "related": ["programming/rust/error-handling.md", "programming/rust/tokio-best-practices.md"],
    "created": "2025-12-01",
    "updated": "2026-03-20"
  },
  "content": "# Rust异步编程模式\n\n## 1. async/await基础\n\n...(完整Markdown正文)...",
  "sections": ["async/await基础", "Future trait", "tokio运行时", "并发模式", "错误处理"]
}
```

### 6.4 AI 协作机制

> 本节描述 MemoForge 的核心差异化特性：让 AI Agent 能够感知用户的工作上下文，实现真正的"人机协作"。

#### 6.4.1 设计理念

MemoForge 不仅仅是一个知识管理工具，更是一个**面向 AI 交互的文档工具**。设计灵感来自 Pencil 等产品的"共享编辑器状态"模式：

- **AI 不是外部工具，而是协作伙伴** — AI 应该能"看到"用户正在看什么
- **上下文共享** — 用户在桌面应用中的操作状态（当前知识库、当前知识点、选中文本等）自动同步给 AI Agent
- **无缝协作** — 用户不需要每次都向 AI 解释"我在看哪个知识库"

#### 6.4.2 共享编辑器状态

桌面应用和 MCP Server 通过**共享状态文件**同步用户的工作上下文：

```
┌─────────────────────────────────────────────────────────┐
│              共享状态文件                                │
│          ~/.memoforge/editor_state.yaml                 │
├─────────────────────────────────────────────────────────┤
│ current_kb: /Users/xxx/知识库                           │
│ current_knowledge: programming/rust/async-patterns.md   │
│ selection:                                              │
│   start_line: 15                                        │
│   end_line: 25                                          │
│ desktop_pid: 12345                                      │
│ desktop_running: true                                   │
│ updated_at: 2026-03-25T10:30:00Z                        │
└─────────────────────────────────────────────────────────┘
         ↑ 写入                           ↑ 读取
         │                                │
┌────────┴────────┐              ┌────────┴────────┐
│  桌面应用 (Tauri) │              │   MCP Server    │
│                 │              │                 │
│ - 打开 KB 时写入  │              │ - get_editor_state() │
│ - 切换 KB 时更新  │              │ - 默认用共享状态    │
│ - 选中知识点时更新│              │ - 支持显式指定      │
│ - 选中文本时更新  │              │                   │
└─────────────────┘              └──────────────────┘
```

#### 6.4.3 `get_editor_state` MCP 工具

新增核心工具，让 AI Agent 获取用户的当前工作上下文：

```json
{
  "name": "get_editor_state",
  "description": "获取用户当前的编辑器状态。包括当前打开的知识库、选中的知识点、文本选择范围等。调用此工具可以了解用户正在关注的内容，无需用户每次都说明上下文。",
  "inputSchema": {
    "type": "object",
    "properties": {}
  }
}
```

**返回示例：**

```json
{
  "mode": "follow",
  "desktop": {
    "running": true,
    "pid": 12345,
    "focused": true
  },
  "current_kb": {
    "path": "/Users/chenpu/workspace/知识库",
    "name": "我的知识库",
    "knowledge_count": 156
  },
  "current_knowledge": {
    "path": "programming/rust/async-patterns.md",
    "title": "Rust异步编程模式",
    "category": "programming"
  },
  "selection": {
    "start_line": 15,
    "end_line": 25,
    "has_text": true,
    "text_length": 45
  },
  "active_agents": [
    {"name": "claude-code", "pid": 12346, "started_at": "2026-03-25T10:00:00Z"}
  ],
  "state_valid": true,
  "updated_at": "2026-03-25T10:30:00Z"
}
```

**返回字段规范（Canonical Schema）：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `mode` | string | `"follow"` (跟随模式) 或 `"bound"` (绑定模式) |
| `desktop` | object \| null | 桌面应用状态，`running`/`pid`/`focused` |
| `current_kb` | object \| null | 当前知识库，`path`/`name`/`knowledge_count` |
| `current_knowledge` | object \| null | 当前知识点，`path`/`title`/`category` |
| `selection` | object \| null | 选区信息，`start_line`/`end_line`/`has_text`/`text_length` |
| `active_agents` | array | 活跃的 MCP Agent 列表 |
| `state_valid` | boolean | 状态是否有效（PID 存活 + TTL 未过期） |
| `updated_at` | string | 状态更新时间 (ISO 8601) |
| `error` | string \| null | 错误信息（如状态无效时） |

> **隐私保护：** `selection.text` 默认不返回，仅返回 `has_text` 和 `text_length`。完整文本需要用户显式开启。详见 6.4.6 节。

#### 6.4.4 两种运行模式

MCP Server 支持两种运行模式，行为和风险不同：

**模式 A：绑定模式（Bound Mode）**

```json
{
  "mcpServers": {
    "memoforge": {
      "command": "memoforge",
      "args": ["serve", "--knowledge-path", "/path/to/kb"]
    }
  }
}
```

- **语义**：启动时静态绑定到指定知识库，整个生命周期内不变
- **适用场景**：明确的单一知识库场景，AI 不需要感知用户界面
- **优点**：行为确定，无状态不一致风险
- **注意**：用户在桌面应用中切换知识库后，AI 仍然操作绑定的知识库

**模式 B：跟随模式（Follow Mode）** ⭐ 推荐

```json
{
  "mcpServers": {
    "memoforge": {
      "command": "memoforge",
      "args": ["serve"]
    }
  }
}
```

- **语义**：每次调用都跟随当前桌面应用的知识库状态
- **适用场景**：人机协作场景，AI 需要感知用户当前上下文
- **优点**：真正的"AI 协作"，用户切换知识库后 AI 自动跟随
- **风险控制**：
  - **严格模式（推荐）**：没有有效状态时，所有操作（包括只读）都返回 `NOT_INITIALIZED` 错误
  - **宽松模式（可选）**：只读操作允许使用最近一次的知识库（需显式开启 `--allow-stale-kb`）
  - 默认采用严格模式，避免"AI 读的是 A 知识库，实际写入 B 知识库"的问题
- **状态有效性**：PID 存活 + 60 秒 TTL

> **实现状态**：当前版本（v1.x）仅实现了绑定模式。跟随模式、共享编辑器状态、`get_editor_state` 工具均处于**设计阶段**，计划在 v2.0 实现。
>
> 当前 CLI 参数：
> ```bash
> # 当前实现（绑定模式）
> memoforge serve --knowledge-path /path/to/kb [--mode readonly|readwrite]
> ```
>
> 计划中的 CLI（v2.0）：
> ```bash
> # 绑定模式
> memoforge serve --mode bound --knowledge-path /path/to/kb
> # 跟随模式
> memoforge serve --mode follow
> ```

**两种模式对比：**

| 特性 | 绑定模式 | 跟随模式 |
|------|----------|----------|
| 配置复杂度 | 需要指定路径 | 无需任何参数 |
| 知识库切换 | 不跟随 | 自动跟随 |
| 写入保护 | 无（直接写入） | 无有效状态时拒绝写入 |
| 适用场景 | 自动化脚本/CI | 人机协作 |
| 状态依赖 | 无 | 依赖桌面应用状态 |

#### 6.4.5 协作场景示例

**场景 1：基于当前上下文编辑**

```
用户: [在桌面应用中选中一段代码] "帮我优化这段代码的性能"
AI: [调用 get_editor_state() 获取选中的代码]
AI: 我看到你选中了 async-patterns.md 中的 fetch_data 函数，让我帮你优化...
```

**场景 2：基于当前知识点推荐**

```
用户: [正在阅读 "Rust异步编程模式"] "推荐一些相关的知识"
AI: [调用 get_editor_state() 获取当前知识点]
AI: 你正在阅读 Rust 异步编程的内容，我推荐你看看这些相关知识：
    - Rust错误处理最佳实践
    - tokio运行时配置
```

**场景 3：在当前分类下创建**

```
用户: [当前在 "programming/rust" 分类下] "新建一篇关于 trait 的笔记"
AI: [调用 get_editor_state() 获取当前分类]
AI: 好的，我将在 programming/rust 分类下创建 trait-object.md...
```

#### 6.4.6 隐私与安全

**共享粒度产品化：**

| 共享级别 | current_kb | current_knowledge | selection 范围 | selected_text |
|---------|------------|-------------------|---------------|---------------|
| **最小**（默认） | ✅ | ✅ | ✅ | ❌ |
| **标准** | ✅ | ✅ | ✅ | ✅（长度 ≤ 500 字符） |
| **完整** | ✅ | ✅ | ✅ | ✅（无限制） |

用户可在桌面应用设置中选择共享级别。

**selected_text 安全控制：**

1. **显式开关**：默认不共享选中文本，用户需在设置中开启
2. **长度上限**：标准模式下最多 500 字符，完整模式无限制
3. **敏感内容跳过**：检测到以下模式时不共享：
   - 看起来像密钥/token：`[A-Za-z0-9]{32,}`, `sk-`, `api_key`, `password`, `secret`
   - 看起来像代码中的敏感配置：`AWS_`, `GITHUB_TOKEN`, `PRIVATE_KEY`
4. **用户确认**：首次开启文本共享时显示确认对话框

**文件安全：**

- **共享状态文件权限**：`~/.memoforge/editor_state.yaml` 仅所有者可读写（chmod 600）
- **本地-only**：共享状态仅在本地文件系统，不上传云端
- **用户可控**：桌面应用提供"禁止共享编辑器状态"选项，关闭后不再写入共享状态
- **明确提示**：桌面应用状态栏显示"AI 可感知当前状态"指示器

**企业场景兼容：**

- 管理员可通过配置文件 `~/.memoforge/privacy.yaml` 强制设置共享级别
- 支持"完全禁用共享"模式，适用于高安全要求环境
- 审计日志记录所有 `get_editor_state` 调用（可选开启）

---

## 7. 技术架构概览

### 7.1 整体架构

```
                    ┌─────────────────────┐
                    │   知识库目录 (Git)    │
                    │  Markdown + YAML     │
                    └──────┬──────┬───────┘
                           │      │
              ┌────────────┘      └────────────┐
              ▼                                ▼
┌──────────────────────────┐    ┌──────────────────────────┐
│  MemoForge Desktop (GUI) │    │  memoforge serve              │
│  Tauri + React           │    │  独立 CLI 进程                │
│                          │    │                              │
│  ・目录树浏览 / 编辑     │    │  ・知识管理引擎               │
│  ・Markdown编辑器        │    │  ・MCP Server (stdio)         │
│  ・标签过滤 / 搜索       │    │  ・HTTP Server (可选, --http) │
│  ・Git 状态面板          │    │  ・安全控制 + 事件日志        │
│  ・文件监听 + 通知       │    │                              │
└──────────────────────────┘    └─────────┬──────┬─────────────┘
        │                                 │      │
    用户直接操作                     MCP(stdio)  HTTP(可选)
                                          │      │
                                   ┌──────┘      └──────┐
                                   ▼                     ▼
                             AI Agent              Web 浏览器
                         (Claude Code等)
```

**关键设计：MCP Server 与 GUI 解耦**
- 桌面应用（GUI）和 `memoforge serve` 是两个独立进程
- AI Agent 始终通过 `memoforge serve` 接入，不依赖 GUI 是否运行
- 共享同一套 Rust 知识管理引擎（作为 library crate），确保行为一致
- 两者通过**文件系统监听 + 事件日志**协同，详见 7.4 节

### 7.2 技术选型

| 组件 | 技术 | 说明 |
|------|------|------|
| 桌面框架 | Tauri v2 | 跨平台桌面应用 |
| 后端语言 | Rust | 核心逻辑、MCP Server、HTTP Server |
| 前端框架 | React | 桌面/Web共用前端（通过 isTauri() 分层） |
| 知识格式 | Markdown + YAML frontmatter | 纯文本，无锁定 |
| 版本管理 | Git (git2-rs) | 内嵌Git操作 |
| 全文搜索 | grep级别（MVP）/ Tantivy（后续） | Rust原生搜索引擎 |
| MCP协议 | stdio传输 | 独立进程，不依赖 GUI |
| 文件系统监听 | notify (Rust crate) | 跨平台 fs watcher |
| Markdown解析 | pulldown-cmark / comrak | Rust原生Markdown解析 |
| Frontmatter解析 | serde_yaml | YAML序列化/反序列化 |

### 7.3 Git集成设计

- Git为可选功能，不依赖Git也能正常使用知识管理功能
- 使用git2-rs库实现Git操作，不依赖系统安装的git命令
- 默认支持GitHub作为远程仓库
- Git 同步拆分为独立的 pull 和 push 操作，不提供"一键同步"——显式暴露中间状态，避免掩盖冲突
- 冲突处理 MVP：pull 冲突时返回冲突文件列表和内容，由 AI Agent 或用户手动解决；后续迭代提供 GUI diff 对比

**关于 git2-rs 的注意事项：**
- git2-rs 基于 libgit2，不依赖系统 git，但需要自行处理 SSH key 和 credential
- 策略：优先复用用户系统的 SSH agent 和 `~/.ssh/` 密钥；credential 方面支持读取系统 git credential helper 配置
- GPG 签名：MVP 阶段不支持，后续按需增加
- 如 git2-rs 在某些场景（如复杂 merge）能力不足，可 fallback 到调用系统 git 命令

### 7.4 跨进程变更感知机制

桌面应用（GUI）和 `memoforge serve` 是独立进程，需要一种机制让 GUI 感知到外部修改。采用**双通道设计**，分阶段交付：

#### 通道一：文件系统监听（Day 1 — 实时刷新）

- 桌面应用使用 `notify` crate 监听知识库目录的文件变更事件（创建、修改、删除、重命名）
- 任何来源的文件变更（MCP Server、用户手动编辑、Git pull、外部编辑器）都能在毫秒级被感知
- 触发行为：
  - 目录树自动刷新
  - 当前打开的文件如被外部修改，自动重新加载（如用户正在编辑则提示）
  - Frontmatter 索引缓存增量更新

#### 通道二：事件日志（快速跟进 — 操作通知）

> Day 1 仅靠文件监听即可完成 GUI 刷新，但只知道"文件变了"，不知道"谁做了什么"。事件日志在快速跟进阶段补齐，提供丰富的操作上下文通知。

所有入口（MCP Server、桌面应用 GUI、CLI）执行写操作时，统一追加一条结构化事件到 `.memoforge/events.jsonl`：

```json
{"time":"2026-03-22T14:30:00Z","source":"mcp:claude-code","action":"create","path":"programming/rust/new-pattern.md","detail":"AI创建了新知识: Rust模式匹配技巧"}
{"time":"2026-03-22T14:30:05Z","source":"mcp:claude-code","action":"update_metadata","path":"programming/rust/async-patterns.md","detail":"AI更新了摘要"}
{"time":"2026-03-22T14:31:00Z","source":"mcp:claude-code","action":"git_commit","path":null,"detail":"AI提交了2个文件的修改"}
```

字段说明：

| 字段 | 说明 |
|------|------|
| `time` | 事件时间（ISO 8601） |
| `source` | 操作来源标识（`mcp:<agent名称>`、`gui`、`cli` 等） |
| `action` | 操作类型（`create`、`update`、`update_metadata`、`delete`、`move`、`git_commit`、`git_pull`、`git_push`） |
| `path` | 受影响的知识文件路径（全局操作如 git_commit 可为 null） |
| `detail` | 人类可读的操作描述 |

桌面应用通过文件监听感知到 `events.jsonl` 变更后，读取新增事件，以 **toast 通知**方式展示给用户（如"Claude Code 创建了新知识: Rust模式匹配技巧"）。

> **与审计日志的关系：** 事件日志（`events.jsonl`）和审计日志（`audit.log`）合并为同一个文件，即 `events.jsonl` 同时承担审计职责。不再单独维护 `audit.log`。

---

## 8. 性能预期与限制

### 8.1 规模预期

| 知识库规模 | 知识条目数 | L0 全量返回 token 估算 | 支持级别 |
|-----------|-----------|----------------------|---------|
| 小型 | < 100 条 | ~10K tokens | 完全支持，L0可全量返回 |
| 中型 | 100-1000 条 | ~100K tokens | 支持，L0建议配合 `depth` 和 `tags` 参数过滤 |
| 大型 | 1000-10000 条 | ~1M tokens | 支持，L0 必须分目录/分页获取，不应全量返回 |

### 8.2 应对策略

- **`list_knowledge` 分页**：当返回结果超过阈值（默认 200 条）时，自动分页返回，提供 `cursor` 参数获取下一页
- **`depth` 参数控制**：`depth=1` 只返回当前目录直接子项，避免深层递归的大量返回
- **`grep` 性能**：基于文件系统遍历，1000 条知识（平均 5KB/条）预期响应时间 < 500ms；超大知识库后续可切换 Tantivy 索引
- **Frontmatter 索引缓存**：应用启动时扫描所有 .md 文件的 frontmatter 建立内存索引，后续查询 L0/L1 直接走缓存，文件变更时增量更新

### 8.3 资源占用目标

- Tauri 桌面应用（GUI）：内存 < 100MB，CPU 空闲时 < 1%
- `memoforge serve`（MCP Server，不含 HTTP）：内存 < 50MB
- `memoforge serve --http`（MCP + HTTP Server）：内存 < 80MB

---

## 9. MVP版本范围

### 9.1 Day 1 Must Have（首次发布）

核心闭环：用户能创建知识库、编辑知识、AI Agent 能通过 MCP 读写知识。

- [ ] Tauri桌面应用基础框架
- [ ] Markdown编辑器（实时预览）
- [ ] 目录树浏览 + 文件管理（新建、删除、移动、重命名）
- [ ] YAML frontmatter支持（title, tags, summary, summary_hash, related, created, updated）
- [ ] MCP Server 独立进程（`memoforge serve`），提供核心接口（list/get/create/update/delete/grep/status）
- [ ] MCP readonly 模式 + 破坏性操作 dry-run 保护
- [ ] 基础搜索（正则全文搜索 + 上下文预览 + 高亮）
- [ ] Git集成（init, commit, pull, push, status, log），pull/push 分离，冲突时返回详细错误
- [ ] 冷启动流程（新建知识库 / Clone Git仓库），含基础模板知识库（预置「开发者知识库」等模板目录结构和示例知识）
- [ ] 文件系统监听（知识库目录变更实时刷新 GUI）

### 9.2 快速跟进（发布后两周内）

Day 1 之后立即补齐的能力，不阻塞首次发布。

- [ ] 导入已有 Markdown 文件夹（扫描 .md 文件，自动生成基础 frontmatter）
- [ ] 多知识库管理（切换不同知识库路径）
- [ ] 标签搜索 + 组合搜索（tag:xxx + keyword）
- [ ] MCP 事件日志（events.jsonl）+ 桌面应用变更通知

### 9.3 Should Have（一个月内）

- [ ] 标签过滤视图
- [ ] 双向链接（`[[]]` 语法）+ 反向链接面板
- [ ] L0/L1/L2渐进式披露完整实现（含 summary_stale 检测、list_knowledge 分页）
- [ ] Web远程访问模式（只读）

### 9.4 Nice to Have（后续迭代）

- [ ] 语义搜索（向量检索，可选Tantivy或外部向量引擎）
- [ ] 知识图谱可视化
- [ ] 冲突解决UI
- [ ] 插件系统
- [ ] Web端编辑能力

---

## 10. 竞品对比

| 特性 | MemoForge | Obsidian | Notion | Basic Memory |
|------|-----------|----------|--------|--------------|
| AI原生MCP接口 | ✅ 核心特性 | ❌ | ❌ | ✅ 有MCP |
| 渐进式披露(L0/L1/L2) | ✅ | ❌ | ❌ | ❌ |
| 独立桌面应用 | ✅ | ✅ | ✅ (Electron) | ❌ |
| Markdown本地存储 | ✅ | ✅ | ❌ (云端) | ✅ |
| Git集成 | ✅ 内置 | ⚠️ 需插件（obsidian-git成熟可用） | ❌ | ❌ |
| 双向链接 | ✅ | ✅ 非常成熟 | ✅ | ✅ |
| Web访问 | ⚠️ Should Have 阶段提供只读 | ❌ | ✅ 完整Web体验 | ❌ |
| 免费开源 | ✅ | ⚠️ 核心免费，同步/发布付费 | ⚠️ 免费版有限制 | ✅ |
| AI与人双向编辑 | ✅ 核心设计 | ❌ | ❌ | ⚠️ 部分（偏向AI写入） |
| Headless/CLI模式 | ✅ | ❌ | ❌ | ✅ |
| 搜索能力 | ⚠️ Day 1 正则全文搜索，两周内补标签组合 | ✅ 非常强大 | ✅ 强大 | ⚠️ 基础 |

**诚实评估：** Obsidian 在编辑器体验、插件生态、搜索能力上远超我们 MVP 阶段的能力。我们的核心优势在于 AI 原生设计（MCP + 渐进式披露 + Headless 模式），这是 Obsidian 架构上难以后补的。

---

## 11. 关联文档

- [需求原始讨论](./需求.md)
- [讨论记录](./讨论.md)
- UI设计: Pencil 项目（5页：主界面、新建知识、搜索、Git面板、AI通知）
- [技术实现文档](./技术实现文档.md) v1.0
- [开发计划文档](./开发计划文档.md) v1.0
