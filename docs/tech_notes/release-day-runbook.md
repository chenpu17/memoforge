# ForgeNerve 发版当天操作单

## 适用范围

这份 runbook 适用于 ForgeNerve 首个正式版或后续常规版本发布。

目标：

- 避免漏跑关键 CI
- 避免打 tag 后才发现 release workflow 本身有问题
- 避免 GitHub Release 产物不完整或品牌名错误

## 建议使用口径

首个正式版建议：

- tag: `v0.1.0`
- Release title: `ForgeNerve v0.1.0`

如果是预发布：

- tag: `v0.1.0-alpha.1`
- Release title: `ForgeNerve v0.1.0-alpha.1`

## 发版前 10 分钟确认

1. 确认当前准备发布的提交已经在 `main`。
2. 确认 [RELEASE_NOTES.md](/Users/chenpu/workspace/claude-code/知识库/RELEASE_NOTES.md) 已更新。
3. 确认 [release-launch-pack.md](/Users/chenpu/workspace/claude-code/知识库/docs/tech_notes/release-launch-pack.md) 的标题和正文就是这次要发的口径。
4. 确认没有额外准备合入的热修复。
5. 确认 GitHub Actions 当前没有失败中的关键 workflow。

## Step 1: 手动跑主门禁 CI

GitHub 页面操作：

1. 打开仓库 `Actions`
2. 选择 `CI`
3. 点击 `Run workflow`
4. `ci_scope` 选择 `full`
5. 点击运行

必须观察的 job：

- `container-smoke`
- `frontend`
- `integration`
- `desktop-e2e-linux`
- `desktop-e2e-windows`

通过标准：

- 全部为绿色
- 没有被意外跳过
- 没有需要人工重试的 flaky 失败

如果这里不过，不进入打 tag。

## Step 2: 桌面专项复核

适用条件：

- 最近刚改过 Tauri command
- 最近改过欢迎页、设置页、知识库切换、Agent Draft 审阅
- 你担心桌面链路而不只是浏览器链路

GitHub 页面操作：

1. 再次进入 `CI`
2. 点击 `Run workflow`
3. `ci_scope` 选择 `desktop-e2e-only`
4. 点击运行

正常现象：

- 只启动 `desktop-e2e-linux`
- 只启动 `desktop-e2e-windows`

异常现象：

- `container-smoke`、`frontend` 或 `integration` 也被触发
- 这说明 `ci.yml` 条件判断被改坏了，先修 workflow，再继续发版

## Step 3: 本地创建并推送 tag

在本地终端执行：

```bash
git checkout main
git pull --ff-only
git tag v0.1.0
git push origin v0.1.0
```

注意：

- 不要在未确认 `main` HEAD 的情况下打 tag
- 不要强推 tag
- 不要删除再重建正式版 tag

## Step 4: 观察 Release workflow

GitHub 页面操作：

1. 打开 `Actions`
2. 选择 `Release`
3. 打开这次由 tag 触发的 workflow run

必须观察的 job：

- `prepare-release`
- `build`
- `build-mcp`
- `release-mcp`
- `publish-ghcr`

通过标准：

- `prepare-release` 正确识别 tag
- `build` 成功产出桌面包
- `build-mcp` 成功产出 CLI 二进制
- `release-mcp` 成功创建或更新 GitHub Release 资产
- `publish-ghcr` 成功推送镜像

## Step 5: 检查 GitHub Release 页面

打开 Releases 页面，重点检查：

1. 标题是否正确
   - `ForgeNerve v0.1.0`
2. 是否错误标成 `Pre-release`
3. 是否有桌面端资产
4. 是否有 Windows portable
   - `ForgeNerve_x64_portable.exe`
5. 是否有 MCP CLI 资产
   - `memoforge-darwin-arm64`
   - `memoforge-darwin-x64`
   - `memoforge-linux-x64`
   - `memoforge-linux-arm64`
   - `memoforge-windows-x64.exe`
6. Release 文案是否使用了本次准备好的版本说明

## Step 6: 检查 GHCR

到 GHCR 或包页面确认：

- `ghcr.io/chenpu17/memoforge-http:v0.1.0`
- `ghcr.io/chenpu17/memoforge-mcp:v0.1.0`

正式版额外检查：

- `ghcr.io/chenpu17/memoforge-http:latest`
- `ghcr.io/chenpu17/memoforge-mcp:latest`

如果是预发布：

- 没有 `latest` 是正常现象

## Step 7: 实际下载抽检

至少做一次抽检：

1. 下载 `ForgeNerve_x64_portable.exe`
2. 确认文件名和品牌名正确
3. 如时间允许，再下载一个 MCP CLI 二进制确认附件存在

## Step 8: 对外同步

发版完成后，同步以下入口：

1. GitHub Release
2. README 顶部版本状态
3. 官网首页 Hero 文案
4. 品牌升级公告
5. 社媒短帖

可直接使用：

- [release-launch-pack.md](/Users/chenpu/workspace/claude-code/知识库/docs/tech_notes/release-launch-pack.md)
- [ForgeNerve品牌升级公告.md](/Users/chenpu/workspace/claude-code/知识库/docs/planning/ForgeNerve品牌升级公告.md)

## 失败处理

### 情况 A: CI 失败，尚未打 tag

处理：

1. 停止发版
2. 修复问题
3. 重新跑 `CI(full)`
4. 必要时重新跑 `desktop-e2e-only`

### 情况 B: tag 已推送，但 Release workflow 因环境或 workflow 问题失败

处理：

1. 不移动 tag
2. 修复 workflow 或环境问题
3. 在 `Release` workflow 页面点 `Run workflow`
4. 输入同一个已存在 tag
5. 重新执行

### 情况 C: tag 已推送，发现是代码缺陷

处理：

1. 不覆盖旧资产
2. 修复代码
3. 重新跑完整 CI
4. 发布新补丁版本
   - 例如 `v0.1.1`

## 最终完成标准

全部满足才算发版完成：

- `CI(full)` 绿色
- `Release` workflow 绿色
- GitHub Release 资产完整
- GHCR 标签完整
- 至少一次下载抽检通过
- 对外文案已同步

## 关联文档

- [release-checklist.md](/Users/chenpu/workspace/claude-code/知识库/docs/tech_notes/release-checklist.md)
- [release-ci-strategy.md](/Users/chenpu/workspace/claude-code/知识库/docs/tech_notes/release-ci-strategy.md)
- [release-launch-pack.md](/Users/chenpu/workspace/claude-code/知识库/docs/tech_notes/release-launch-pack.md)
- [ci-desktop-e2e.md](/Users/chenpu/workspace/claude-code/知识库/docs/tech_notes/ci-desktop-e2e.md)
