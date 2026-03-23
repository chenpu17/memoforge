---
id: git-workflow
title: Git 工作流
tags: [git, workflow, version-control]
summary: 常用 Git 工作流和命令参考
created: 2026-03-23T00:00:00Z
updated: 2026-03-23T00:00:00Z
---

# Git 工作流

## 基本操作

```bash
# 查看状态
git status

# 提交更改
git add .
git commit -m "描述"

# 同步远程
git pull
git push
```

## 分支管理

```bash
# 创建分支
git checkout -b feature/new-feature

# 合并分支
git merge feature/new-feature
```

## 最佳实践

- 提交信息清晰描述变更
- 频繁提交小的更改
- 推送前先拉取远程更新
