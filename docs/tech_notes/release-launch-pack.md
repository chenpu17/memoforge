# ForgeNerve Release Launch Pack

## 目标

把首次正式发版时最容易临时拼凑的材料一次准备好：

- 推荐 tag 命名
- GitHub Release 标题与正文
- 品牌升级公告短版
- 社媒短帖

## 推荐发版策略

如果你认为当前版本已经可以作为首个正式对外版本：

- 推荐 tag：`v0.1.0`
- GitHub Release 标题：`ForgeNerve v0.1.0`

如果你还想先做一轮低风险公开试用：

- 推荐 tag：`v0.1.0-alpha.1`
- GitHub Release 标题：`ForgeNerve v0.1.0-alpha.1`

建议口径：

- `v0.1.0` 代表 ForgeNerve 品牌下的首个正式版本
- `v0.1.0-alpha.1` 代表品牌升级后的首次公开预发布

## GitHub Release 标题

正式版：

`ForgeNerve v0.1.0`

预发布：

`ForgeNerve v0.1.0-alpha.1`

## GitHub Release 正文

可直接粘贴：

```md
ForgeNerve v0.1.0 is the first public release under the ForgeNerve brand.

This release turns the project into a more complete Agent Knowledge OS for developers:

- AI agents can create Inbox items, sessions, and reviewable Draft changes
- humans can review and approve knowledge changes in the desktop app
- knowledge quality can be scanned and repaired through the Reliability Dashboard
- reusable Context Packs can be prepared for future agent sessions

Highlights:

- Inbox + Agent Session + Draft review workflow
- section-level Draft writing with preview and conflict detection
- Reliability Dashboard with fix draft generation
- Context Pack creation and export
- Tauri desktop app with embedded SSE MCP server
- Linux and Windows desktop E2E coverage in CI

Compatibility:

- public branding is now ForgeNerve
- existing `memoforge` CLI, MCP config, and `.memoforge` runtime paths remain compatible

Recommended assets:

- desktop bundles for macOS / Linux / Windows
- `ForgeNerve_x64_portable.exe` for Windows portable use
- `memoforge-*` binaries for MCP / CLI workflows
```

## 品牌升级公告短版

中文：

`MemoForge` 正在升级为 `ForgeNerve`。

这不是产品方向变化，而是一次更准确的品牌定位升级。我们正在把产品从一个 AI 驱动的知识工具，推进为一个面向开发者与 AI Agent 的知识操作系统。

这一轮升级不会破坏现有兼容性：

- 现有 `memoforge` CLI 继续可用
- 现有 MCP 配置继续可用
- 现有 `.memoforge` 目录结构继续可用

新的对外品牌是：

`ForgeNerve`
`The Agent Knowledge OS for Developers`

英文：

`MemoForge` is becoming `ForgeNerve`.

This is a brand upgrade, not a product reset. We are clarifying the product as an Agent Knowledge OS for developers while keeping existing CLI, MCP, and runtime compatibility intact.

## 社媒短帖

中文：

`MemoForge` 正式升级为 `ForgeNerve`。

一个更清晰的新名字，指向同一个方向：
面向开发者与 AI Agent 的知识操作系统。

这次升级不影响现有 CLI、MCP 配置和知识库结构。

英文：

`MemoForge` is becoming `ForgeNerve`.

Same direction, clearer positioning:
the Agent Knowledge OS for developers.

No breaking change to existing CLI, MCP config, or knowledge base structure.

## 发布当天建议同步更新

1. GitHub Release 标题和正文
2. README 顶部版本状态
3. 官网首页 Hero 文案
4. 品牌升级公告
5. 如有社媒渠道，同步发布短帖

## 关联文档

- [RELEASE_NOTES.md](/Users/chenpu/workspace/claude-code/知识库/RELEASE_NOTES.md)
- [release-checklist.md](/Users/chenpu/workspace/claude-code/知识库/docs/tech_notes/release-checklist.md)
- [ForgeNerve品牌升级公告.md](/Users/chenpu/workspace/claude-code/知识库/docs/planning/ForgeNerve品牌升级公告.md)
- [ForgeNerve官网首页文案.md](/Users/chenpu/workspace/claude-code/知识库/docs/planning/ForgeNerve官网首页文案.md)
