# ForgeNerve CI 触发策略

## 目标

把日常开发验证、桌面专项回归和正式发布拆成 3 条明确路径，减少两类问题：

- 把所有事情都塞进一次重型流水线，导致排障成本过高
- 还没完成发布前验证就直接打 tag，导致 release 失败后返工

## 当前工作流

仓库当前使用两个主工作流：

- [`.github/workflows/ci.yml`](/Users/chenpu/workspace/claude-code/知识库/.github/workflows/ci.yml)
  - 日常开发与回归验证
- [`.github/workflows/release.yml`](/Users/chenpu/workspace/claude-code/知识库/.github/workflows/release.yml)
  - tag 驱动正式发布

## 触发分层

### 1. 日常开发验证

适用场景：

- PR 合并前
- `main` 上常规功能改动
- Core / MCP / Frontend 任意一层改动

触发方式：

- `push`
- `pull_request`
- 必要时手动 `workflow_dispatch`

执行策略：

- 默认跑 `ci_scope=full`
- 这是唯一可作为“准备发版基线”的 CI 结果

### 2. 桌面专项复核

适用场景：

- Tauri command 改动
- 桌面 UI 改动
- Welcome Flow / 设置页 / 多知识库切换 / Agent draft 审阅链路改动
- 想单独复查 Linux / Windows 桌面链路，而不重跑容器与浏览器链路

触发方式：

- `CI` workflow 手动运行
- `ci_scope=desktop-e2e-only`

预期只会触发：

- `desktop-e2e-linux`
- `desktop-e2e-windows`

不应触发：

- `container-smoke`
- `frontend`
- `integration`

### 3. 正式发布

适用场景：

- 已确认 `main` 上某个提交可对外发布

触发方式：

- 推送 tag：`git push origin v0.1.0`
- 或在 `Release` workflow 手动运行 `workflow_dispatch`，指定一个已经存在的 tag

执行策略：

- 发布前必须先有一次 `ci_scope=full` 的绿色结果
- 如包含桌面改动，建议再补一次 `desktop-e2e-only`
- 不建议“先打 tag 再看 CI”

## 推荐决策表

| 场景 | 触发哪条 CI | 备注 |
|---|---|---|
| 普通 PR / merge 后回归 | `CI` with `full` | 默认路径 |
| 只想复查桌面链路 | `CI` with `desktop-e2e-only` | 快速复核 |
| 准备发版 | 先 `CI` with `full` | 必需 |
| 发版前桌面链路风险较高 | 再跑 `desktop-e2e-only` | 建议 |
| tag 已推送但 release workflow 因环境失败 | `Release` with existing tag | 不移动 tag |
| 发布后发现代码缺陷 | 新补丁版本 tag | 不覆盖旧正式版 |

## 推荐节奏

### 常规版本

1. 功能合入 `main`
2. `CI(full)` 通过
3. 如果涉及桌面，再跑 `CI(desktop-e2e-only)`
4. 更新 release notes
5. 打 tag
6. 自动触发 `Release`

### 预发布版本

1. 先在 `main` 上完成同样的 `CI(full)` 验证
2. 打预发布 tag，例如 `v0.1.0-alpha.1`
3. `release.yml` 会自动标记 `prerelease=true`
4. GHCR 不会刷新 `latest`

### release workflow 失败时

1. 判断是 workflow / 外部依赖问题，还是代码问题
2. 如果是 workflow / 环境问题：
   - 修复后手动运行 `Release`
   - 输入已有 tag
3. 如果是代码问题：
   - 修复代码
   - 重新走 `CI(full)`
   - 发新 tag，例如 `v0.1.1`

## 约束与原则

1. `CI(full)` 是发版前唯一的主门禁。
2. `desktop-e2e-only` 只是专项补充，不替代完整回归。
3. 正式版不要重写或重推已有 tag。
4. 不要从本地手工上传 release 资产，统一走 `release.yml`。
5. 对外品牌使用 `ForgeNerve`，兼容层二进制名继续保留 `memoforge-*` 时，需要在文档中明确说明。

## 相关文档

- [release-checklist.md](/Users/chenpu/workspace/claude-code/知识库/docs/tech_notes/release-checklist.md)
- [ci-desktop-e2e.md](/Users/chenpu/workspace/claude-code/知识库/docs/tech_notes/ci-desktop-e2e.md)
- [RELEASE_NOTES.md](/Users/chenpu/workspace/claude-code/知识库/RELEASE_NOTES.md)
