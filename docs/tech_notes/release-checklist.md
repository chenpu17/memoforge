# ForgeNerve Release Checklist

## 目标

这份清单用于把当前仓库从“开发完成”推进到“可以稳定对外发布”。

适用对象：

- GitHub Release
- Tauri 桌面安装包与 Windows portable `.exe`
- MCP CLI 二进制
- GHCR 容器镜像

## 发布前冻结

1. 确认本次发布基线已经合入 `main`，且不再继续混入无关改动。
2. 确认版本号与标签格式。
   - 正式版：`v0.1.0`
   - 预发布：`v0.1.0-alpha.1`
3. 确认对外品牌文案使用 `ForgeNerve`。
   - 桌面应用名：`ForgeNerve`
   - GitHub Release 标题：`ForgeNerve <tag>`
   - 兼容保留项：crate / CLI / `.memoforge` 目录仍沿用 `memoforge-*`
4. 确认 [RELEASE_NOTES.md](/Users/chenpu/workspace/claude-code/知识库/RELEASE_NOTES.md) 已更新到本次版本。

## 发布前验证

必须项：

1. 主干 CI 为绿色。
   - 运行 [`.github/workflows/ci.yml`](/Users/chenpu/workspace/claude-code/知识库/.github/workflows/ci.yml)
   - `ci_scope=full`
2. 如果这次包含桌面端改动，至少额外手动跑一次 `desktop-e2e-only`。
3. 本地静态校验通过。
   - `cargo fmt`
   - `cargo test`
   - `cd frontend && npm test`
   - `cd frontend && npm run build`
4. Agent 主链路验证通过。
   - `python3 tests/mcp_e2e.py`
   - `python3 -m pytest -q tests/draft_flow_e2e.py`
5. 浏览器链路验证通过。
   - `python3 tests/frontend_e2e.py`
   - `python3 tests/frontend_ops_e2e.py`
6. Sprint 回归通过。
   - `python3 tests/sprint1_user_e2e.py`
   - `python3 tests/sprint2_user_e2e.py`

桌面发版建议项：

1. 检查 [docs/planning/windows-first-run-checklist.md](/Users/chenpu/workspace/claude-code/知识库/docs/planning/windows-first-run-checklist.md) 中的关键首次启动路径。
2. 至少确认以下场景在 Linux / Windows 桌面 E2E 中覆盖正常：
   - Welcome Flow
   - 知识库切换
   - 设置页
   - Markdown 导入
   - Git commit / push
   - Agent draft 提交 / 丢弃
   - `get_editor_state` 同步

## 预期发布产物

GitHub Release 中至少应看到以下产物：

- Tauri 桌面安装包
  - macOS bundle
  - Linux bundle
  - Windows bundle
- Windows portable 可执行文件
  - `ForgeNerve_x64_portable.exe`
- MCP CLI 二进制
  - `memoforge-darwin-arm64`
  - `memoforge-darwin-x64`
  - `memoforge-linux-x64`
  - `memoforge-linux-arm64`
  - `memoforge-windows-x64.exe`

GHCR 中至少应看到以下镜像标签：

- `ghcr.io/chenpu17/memoforge-http:<tag>`
- `ghcr.io/chenpu17/memoforge-mcp:<tag>`

正式版额外应有：

- `ghcr.io/chenpu17/memoforge-http:latest`
- `ghcr.io/chenpu17/memoforge-mcp:latest`

## 正式执行步骤

1. 确认 `main` HEAD 就是准备发布的提交。
2. 在 GitHub Actions 手动运行一次 `CI` workflow，使用 `ci_scope=full`。
3. 若桌面链路近期改动较多，再手动运行一次 `ci_scope=desktop-e2e-only`。
4. 所有结果正常后，创建并推送标签。

```bash
git checkout main
git pull --ff-only
git tag v0.1.0
git push origin v0.1.0
```

5. 等待 [`.github/workflows/release.yml`](/Users/chenpu/workspace/claude-code/知识库/.github/workflows/release.yml) 跑完以下 job：
   - `prepare-release`
   - `build`
   - `build-mcp`
   - `release-mcp`
   - `publish-ghcr`
6. 在 GitHub Release 页面检查标题、预发布标记、附件数量和名称。

## 失败时处理

如果 `release.yml` 失败：

1. 不要移动已有 tag。
2. 如果只是 workflow 或外部环境问题，修复后在 `Release` workflow 用 `workflow_dispatch` 传入已存在 tag 重跑。
3. 如果是代码本身有问题，走新的补丁版本。
   - 例如从 `v0.1.0` 升到 `v0.1.1`
4. 不要覆盖用户已经下载过的正式版资产。

## 发布后确认

1. 从 GitHub Release 页面实际下载一次 Windows portable `.exe`。
2. 检查安装包、portable 包和 CLI 二进制都能看到。
3. 检查 GHCR 是否已有对应 tag。
4. 检查 README 中的下载/接入说明是否仍与当前发布方式一致。
5. 如需对外公告，再同步官网首页、品牌公告和迁移文案。

## 相关文档

- [release.yml](/Users/chenpu/workspace/claude-code/知识库/.github/workflows/release.yml)
- [ci.yml](/Users/chenpu/workspace/claude-code/知识库/.github/workflows/ci.yml)
- [ci-desktop-e2e.md](/Users/chenpu/workspace/claude-code/知识库/docs/tech_notes/ci-desktop-e2e.md)
- [windows-first-run-checklist.md](/Users/chenpu/workspace/claude-code/知识库/docs/planning/windows-first-run-checklist.md)
- [RELEASE_NOTES.md](/Users/chenpu/workspace/claude-code/知识库/RELEASE_NOTES.md)
