# ForgeNerve 品牌迁移方案

> 日期: 2026-04-09
> 状态: 提案
> 当前品牌: `MemoForge`
> 候选新品牌: `ForgeNerve`
> 建议定位语: `The Agent Knowledge OS for Developers`

---

## 1. 背景

当前项目名 `MemoForge` 已存在公开重名风险。继续沿用会带来以下问题：

- 官网与搜索引擎结果混淆
- 用户口碑传播时难以准确定位到本产品
- 域名、社媒名、组织名和商标申请空间受限
- 后续发布桌面应用、MCP 服务和内容品牌时，品牌资产会被稀释

与此同时，MemoForge 当前的产品方向已经不只是“知识管理工具”，而是在向：

- 本地优先
- Git 原生
- 面向 AI Agent 协作
- 可审计、可回滚、可审批的知识操作系统

因此需要引入更有辨识度的新品牌名，承载下一阶段的产品叙事。

---

## 2. 结论

建议采用以下品牌结构：

- 品牌名：`ForgeNerve`
- 品类定位：`Agent Knowledge OS`
- 副标题：`The Agent Knowledge OS for Developers`
- 短描述：`Git-native memory layer for AI agents`

不建议把 `Agent Knowledge OS` 直接作为正式产品名，原因如下：

- 更像品类词，不像品牌名
- SEO 和命名注册空间弱
- 缺少独特记忆点
- 后续产品边界扩展时容易被名称绑定

---

## 3. 为什么是 ForgeNerve

### 3.1 品牌语义

- `Forge` 对应构建、锻造、工程能力、开发者工具气质
- `Nerve` 对应上下文、连接、反馈回路、知识与 Agent 的“神经系统”

组合后的含义是：

> 为开发者和 AI Agent 提供知识与上下文流动的神经系统。

### 3.2 与产品定位的一致性

ForgeNerve 比 MemoForge 更贴近下阶段产品核心：

- 不只记录 memo，而是管理上下文与知识流
- 不只是文档工具，而是 Agent 可调用的知识运行层
- 更适合承载 “Agent Workspace / Context Pack / Retrieval 2.0 / Safe Write” 这类新能力

### 3.3 当前初步风险判断

基于 2026-04-09 的公开网页/GitHub 快速检索，暂未发现明显的 `ForgeNerve` 精确重名产品。

但这不是法律可用性的最终结论。正式发布前仍需补齐：

- 域名可用性检查
- GitHub 组织名可用性检查
- 常见包管理器名称占用检查
- 中国 / 美国商标初筛

---

## 4. 品牌迁移策略

建议采用“品牌先迁移、代码标识后迁移”的两阶段策略。

### 阶段 A：对外品牌切换

本阶段先切换用户可见层，不动底层 crate / package / 配置标识。

包括：

- README、官网文案、发布稿
- 桌面应用欢迎页、标题栏、设置帮助
- 产品介绍文档、路线图文档

保留：

- Rust crate 名：`memoforge-*`
- CLI 可执行名：`memoforge`
- 默认目录：`.memoforge/`
- 配置键与环境变量前缀：`MEMOFORGE_*`

这样做的好处是：

- 低风险
- 不影响现有脚本、CI、MCP 客户端配置
- 可以先验证新品牌接受度

### 阶段 B：技术标识迁移

在新品牌稳定后，再评估是否迁移底层技术标识：

- crate / binary 名称
- Tauri `productName`
- 安装包文件名
- 默认 Git 提交签名
- `.memoforge` 目录兼容策略

这一阶段必须单独立项，不应和品牌文案切换混在同一版本内完成。

---

## 5. 本轮建议落地范围

本轮只建议完成以下内容：

1. 在 README 明确品牌升级方向
2. 在应用启动页和标题栏展示 `ForgeNerve`
3. 在设置页 MCP 帮助与 Git 帮助文案中使用新品牌
4. 在开发文档中明确：
   - 对外品牌名升级为 `ForgeNerve`
   - 内部工程标识暂时保持 `MemoForge` / `memoforge-*`

本轮不建议完成：

- crate 重命名
- CLI 命令改名
- `.memoforge/` 目录改名
- 打包产物名改名
- 所有历史文档全量替换

---

## 6. 对外说法建议

### 6.1 官网 / README 标题

`ForgeNerve`

### 6.2 副标题

`The Agent Knowledge OS for Developers`

### 6.3 首段描述

`ForgeNerve is a Git-native knowledge workspace for developers and AI agents.`

### 6.4 兼容说明

`This repository still uses memoforge-* package names and .memoforge runtime paths during the transition period.`

---

## 7. 风险与缓解

### 风险 1：用户对新旧名称混淆

缓解：

- 在 README 和设置页显式写出 `ForgeNerve (formerly MemoForge)`
- 发布说明里单独说明“品牌升级，不影响现有配置和 CLI”

### 风险 2：工程标识与品牌名不一致

缓解：

- 在开发文档中明确“对外品牌”和“内部标识”是两层概念
- 暂不在同一版本内做底层重命名

### 风险 3：正式发布前发现域名或商标问题

缓解：

- 先在仓库和应用文案中采用“候选品牌 / working brand”措辞
- 在发布前做 final legal + naming check

---

## 8. 下一步清单

1. 完成 README / 应用内品牌占位替换
2. 产出官网首页 Hero 文案
3. 产出发布公告文案
4. 完成 `forgenerve` 域名、组织名、商标初筛
5. 再决定是否进入技术标识迁移
