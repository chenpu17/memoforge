# 规划文档目录

> 文档层级: 当前版本 / 历史归档 / 品牌文案
> 当前权威版本: v0.3.0
> 更新日期: 2026-04-12

---

## 1. 目录结构

- `releases/v0.3.0/`
  - 当前正在评审、冻结、开发的权威版本文档
  - PRD、技术方案、开发计划、Sprint 拆解、验收矩阵都放在这里
- `archive/`
  - 历史规划、阶段性方案、问题修复记录、旧提示词
  - 仅供回溯，不再作为当前开发事实源
- `brand/`
  - 品牌升级、官网文案、启动页文案等对外表达文档

---

## 2. 当前权威文档

当前版本统一以 `v0.3.0` 为目标版本，入口从这里开始：

1. [ForgeNerve v0.3.0 文档索引](./releases/v0.3.0/ForgeNerve-v0.3.0-文档索引.md)
2. [ForgeNerve v0.3.0 产品需求文档](./releases/v0.3.0/ForgeNerve-v0.3.0-产品需求文档.md)
3. [ForgeNerve v0.3.0 技术方案](./releases/v0.3.0/ForgeNerve-v0.3.0-技术方案.md)
4. [ForgeNerve v0.3.0 开发计划](./releases/v0.3.0/ForgeNerve-v0.3.0-开发计划.md)
5. [ForgeNerve v0.3.0 开发前准备清单](./releases/v0.3.0/ForgeNerve-v0.3.0-开发前准备清单.md)

---

## 3. 命名规则

统一采用明确版本号，不再使用 `vNext`。

- 版本文档目录: `docs/planning/releases/vX.Y.Z/`
- 文档文件名: `ForgeNerve-vX.Y.Z-<文档名称>.md`
- 文档头部必须声明 `目标版本: vX.Y.Z`
- 文档修订不改文件名，在文档头部增加 `修订: rev1 / rev2`
- 后续版本直接新增新目录，例如 `releases/v0.4.0/`

示例：

- `docs/planning/releases/v0.3.0/ForgeNerve-v0.3.0-产品需求文档.md`
- `docs/planning/releases/v0.3.0/ForgeNerve-v0.3.0-技术方案.md`
- `docs/planning/releases/v0.4.0/ForgeNerve-v0.4.0-开发计划.md`

---

## 4. 使用约束

- README、开发计划、Agent Teams 提示词在默认入口和当前开发主链中必须优先引用 `releases/` 下的权威版本文档
- `archive/` 仅允许在独立的“历史归档”分区中引用，不能替代当前版本事实源
- `archive/` 文档不能作为当前范围、契约、验收的唯一依据
- 品牌文档与工程文档分离，避免官网文案与开发方案混在一起
- 如果当前版本升级，例如从 `v0.3.0` 进入 `v0.4.0`，先复制权威文档集，再在新目录内演进

---

## 5. 迁移说明

- 旧的 `ForgeNerve-vNext*.md` 命名已经废弃
- 本次整理后，`v0.3.0` 成为当前版本化规划的唯一入口
- 历史 `Agent 协作增强`、`Tauri 增强`、`规划与现状对齐说明` 等文档已归入 `archive/`
- `archive/` 的使用说明见 [archive/README.md](./archive/README.md)
