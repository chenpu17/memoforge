# CI 与桌面 E2E 运行说明

## 当前 CI 结构

桌面相关验证现在分成 3 类：

- `integration`
  - Linux
  - 负责浏览器态 E2E、前端操作 E2E、MCP E2E
  - 不再承载 Tauri 桌面 E2E
- `desktop-e2e-linux`
  - Linux
  - 负责真实 Tauri 桌面应用 + `tauri-driver` + 内嵌 MCP 的端到端验证
- `desktop-e2e-windows`
  - Windows
  - 负责 Windows 平台上的同一套桌面端到端验证

这样拆分后，桌面问题不会再被混在综合集成任务里，排查成本更低。

## 手动触发

GitHub Actions 手动运行 `CI` workflow 时支持 `ci_scope`：

- `full`
  - 跑完整流水线
  - 包括容器构建、前端单测、浏览器 E2E、MCP E2E、Linux/Windows 桌面 E2E
- `desktop-e2e-only`
  - 只跑 `desktop-e2e-linux` 和 `desktop-e2e-windows`
  - 适合排查桌面 UI、Tauri command、内嵌 SSE / MCP 状态同步问题

推荐操作步骤：

1. 进入仓库 `Actions` 页面。
2. 选择 `CI` workflow。
3. 点击 `Run workflow`。
4. 把 `ci_scope` 设为 `desktop-e2e-only`。
5. 观察是否只启动 `desktop-e2e-linux`、`desktop-e2e-windows` 两个 job。

如果此时还看到 `container-smoke`、`frontend` 或 `integration` 被触发，说明 workflow 条件判断被后续改坏了。

## 失败产物

桌面 E2E 失败时，CI 会上传以下 artifact：

- `tauri-desktop-e2e-artifacts-linux`
- `tauri-desktop-e2e-artifacts-windows`

产物目录来自：

- `test-artifacts/tauri-desktop-e2e/`

通常包含：

- `failure.png`
- `page.html`
- `browser.log`
- `tauri-driver.log`
- `desktop-*.log`
- `traceback.txt`

## 平台说明

- Linux：CI 主跑平台，依赖 `xvfb` 和系统 WebKit 组件
- Windows：CI 次跑平台，用于验证 Tauri 桌面链路的 Windows 兼容性
- macOS：本地脚本会直接 `SKIP`
  - 原因是官方 Tauri WebDriver 当前没有可用的 WKWebView driver
  - 这不是业务代码失败

## Python 依赖注意事项

`tests/tauri_desktop_e2e.py` 虽然直接使用的是 `selenium`，但它复用了 `tests/frontend_e2e.py` 里的测试夹具与种子函数。
因此桌面 E2E job 的 Python 环境必须同时安装：

- `selenium`
- `playwright`

否则脚本在 import `frontend_e2e` 时就会因为缺少 `playwright.sync_api` 提前失败，根本跑不到桌面断言。

## 本地复现建议

如果 CI 上某个桌面场景失败，建议按顺序复现：

1. 先本地跑浏览器链路，确认不是 HTTP / 前端基础能力问题
2. 再在 Linux 或 Windows 环境跑 `tests/tauri_desktop_e2e.py`
3. 对照 artifact 中的 `failure.png`、`page.html` 和 `tauri-driver.log`
4. 如果怀疑是桌面状态同步问题，优先看 `get_editor_state` 相关断言失败点

## 维护原则

- 浏览器态 E2E 只验证 HTTP fallback 路径
- 桌面态 E2E 只验证 Tauri command 分支与内嵌 MCP / SSE
- 不要把桌面特有断言重新塞回浏览器 E2E
- 新增桌面功能时，优先补 `tests/tauri_desktop_e2e.py`，其次再决定是否补浏览器态覆盖

## 当前已覆盖的关键入口

当前 `tests/tauri_desktop_e2e.py` 已覆盖以下桌面入口：

- Welcome Flow
  - 导入已有目录
  - 新建知识库模板
  - Clone Git 仓库
  - 下载与发布入口可见性
- Workspace 主链路
  - 知识树 / 目录浏览 / 文档打开
  - 编辑器选区同步
  - 知识图谱选择
  - 新建、保存、导入、Git 提交推送
  - Agent Draft 提交与丢弃
- 应用内辅助入口
  - 设置页中的 MCP 快速配置
  - 设置页中的下载与发布区
  - 搜索空结果时的接入引导卡

如果后续再新增欢迎页、空状态页、发布入口或 MCP 引导文案，默认应先更新这份桌面 E2E。
