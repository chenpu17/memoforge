//! Git 操作模块
//! 参考: 技术实现文档 §2.1, PRD §6.2

use crate::{ErrorCode, MemoError};
use git2::{DiffOptions, IndexAddOption, Repository, Signature, StatusOptions};
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Serialize, Deserialize)]
pub struct GitCommit {
    pub hash: String,
    pub author: String,
    pub message: String,
    pub timestamp: i64,
}

/// 初始化 Git 仓库
pub fn git_init(path: &Path) -> Result<(), MemoError> {
    Repository::init(path).map_err(|e| MemoError {
        code: ErrorCode::GitDirtyState,
        message: format!("Failed to init git: {}", e),
        retry_after_ms: None,
        context: None,
    })?;
    Ok(())
}

/// 获取 Git 状态
pub fn git_status(path: &Path) -> Result<Vec<String>, MemoError> {
    let repo = open_repo(path)?;
    let mut opts = StatusOptions::new();
    opts.include_untracked(true);

    let statuses = repo.statuses(Some(&mut opts)).map_err(git_error)?;
    let mut files = Vec::new();

    for entry in statuses.iter() {
        if let Some(path) = entry.path() {
            files.push(path.to_string());
        }
    }

    Ok(files)
}

/// 提交更改
pub fn git_commit(path: &Path, message: &str) -> Result<(), MemoError> {
    let repo = open_repo(path)?;

    // 检查是否有未提交的更改
    if is_clean(&repo)? {
        return Err(MemoError {
            code: ErrorCode::GitDirtyState,
            message: "No changes to commit".to_string(),
            retry_after_ms: None,
            context: None,
        });
    }

    // 添加所有更改
    let mut index = repo.index().map_err(git_error)?;
    index
        .add_all(["*"].iter(), IndexAddOption::DEFAULT, None)
        .map_err(git_error)?;
    unstage_runtime_files(path, &mut index)?;
    index.write().map_err(git_error)?;

    // 创建提交
    let tree_id = index.write_tree().map_err(git_error)?;
    let tree = repo.find_tree(tree_id).map_err(git_error)?;
    let sig = Signature::now("MemoForge", "memoforge@local").map_err(git_error)?;

    let parent_commit = repo.head().ok().and_then(|h| h.peel_to_commit().ok());

    if let Some(parent) = parent_commit {
        repo.commit(Some("HEAD"), &sig, &sig, message, &tree, &[&parent])
            .map_err(git_error)?;
    } else {
        repo.commit(Some("HEAD"), &sig, &sig, message, &tree, &[])
            .map_err(git_error)?;
    }

    Ok(())
}

fn unstage_runtime_files(repo_path: &Path, index: &mut git2::Index) -> Result<(), MemoError> {
    let runtime_dir = repo_path.join(".memoforge");
    if !runtime_dir.exists() {
        return Ok(());
    }

    let tracked_runtime_files = [
        ".memoforge/serve.pid",
        ".memoforge/http.token",
        ".memoforge/events.jsonl",
        ".memoforge/git.lock",
        ".memoforge/write.lock",
    ];

    for relative in tracked_runtime_files {
        let _ = index.remove_path(Path::new(relative));
    }

    if let Ok(entries) = std::fs::read_dir(&runtime_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            let file_name = match path.file_name().and_then(|value| value.to_str()) {
                Some(value) => value,
                None => continue,
            };

            if file_name.ends_with(".lock") {
                let relative = format!(".memoforge/{}", file_name);
                let _ = index.remove_path(Path::new(&relative));
            }
        }
    }

    Ok(())
}

/// Pull 远程更改
pub fn git_pull(path: &Path) -> Result<(), MemoError> {
    let repo = open_repo(path)?;

    // 获取远程
    let mut remote = repo.find_remote("origin").map_err(|e| MemoError {
        code: ErrorCode::GitRemoteUnreachable,
        message: format!("Remote not found: {}", e),
        retry_after_ms: None,
        context: None,
    })?;

    // Fetch
    remote.fetch(&["main"], None, None).map_err(|e| {
        if e.message().contains("authentication") || e.message().contains("credentials") {
            MemoError {
                code: ErrorCode::GitAuthFailed,
                message: format!("Authentication failed: {}", e),
                retry_after_ms: None,
                context: None,
            }
        } else {
            MemoError {
                code: ErrorCode::GitRemoteUnreachable,
                message: format!("Fetch failed: {}", e),
                retry_after_ms: None,
                context: None,
            }
        }
    })?;

    // Merge
    let fetch_head = repo.find_reference("FETCH_HEAD").map_err(git_error)?;
    let fetch_commit = repo
        .reference_to_annotated_commit(&fetch_head)
        .map_err(git_error)?;

    let analysis = repo.merge_analysis(&[&fetch_commit]).map_err(git_error)?;

    if analysis.0.is_up_to_date() {
        return Ok(());
    }

    if analysis.0.is_fast_forward() {
        let refname = "refs/heads/main";
        let mut reference = repo.find_reference(refname).map_err(git_error)?;
        reference
            .set_target(fetch_commit.id(), "Fast-forward")
            .map_err(git_error)?;
        repo.set_head(refname).map_err(git_error)?;
        repo.checkout_head(Some(git2::build::CheckoutBuilder::default().force()))
            .map_err(git_error)?;
        return Ok(());
    }

    // 有冲突
    Err(MemoError {
        code: ErrorCode::ConflictGitMerge,
        message: "Merge conflict detected".to_string(),
        retry_after_ms: None,
        context: None,
    })
}

/// Push 到远程
pub fn git_push(path: &Path) -> Result<(), MemoError> {
    let repo = open_repo(path)?;

    let mut remote = repo.find_remote("origin").map_err(|e| MemoError {
        code: ErrorCode::GitRemoteUnreachable,
        message: format!("Remote not found: {}", e),
        retry_after_ms: None,
        context: None,
    })?;

    remote
        .push(&["refs/heads/main:refs/heads/main"], None)
        .map_err(|e| {
            if e.message().contains("authentication") || e.message().contains("credentials") {
                MemoError {
                    code: ErrorCode::GitAuthFailed,
                    message: format!("Authentication failed: {}", e),
                    retry_after_ms: None,
                    context: None,
                }
            } else if e.message().contains("rejected") || e.message().contains("non-fast-forward") {
                MemoError {
                    code: ErrorCode::GitPushRejected,
                    message: format!("Push rejected: {}", e),
                    retry_after_ms: None,
                    context: None,
                }
            } else {
                MemoError {
                    code: ErrorCode::GitRemoteUnreachable,
                    message: format!("Push failed: {}", e),
                    retry_after_ms: None,
                    context: None,
                }
            }
        })?;

    Ok(())
}

/// 获取提交历史
pub fn git_log(path: &Path, limit: usize) -> Result<Vec<GitCommit>, MemoError> {
    let repo = open_repo(path)?;
    let mut revwalk = repo.revwalk().map_err(git_error)?;
    revwalk.push_head().map_err(git_error)?;

    let mut commits = Vec::new();

    for (i, oid) in revwalk.enumerate() {
        if i >= limit {
            break;
        }

        let oid = oid.map_err(git_error)?;
        let commit = repo.find_commit(oid).map_err(git_error)?;

        commits.push(GitCommit {
            hash: oid.to_string(),
            author: commit.author().name().unwrap_or("Unknown").to_string(),
            message: commit.message().unwrap_or("").to_string(),
            timestamp: commit.time().seconds(),
        });
    }

    Ok(commits)
}

/// 获取 diff
pub fn git_diff(path: &Path) -> Result<String, MemoError> {
    let repo = open_repo(path)?;

    let head = repo.head().ok().and_then(|h| h.peel_to_tree().ok());
    let mut opts = DiffOptions::new();

    let diff = if let Some(tree) = head {
        repo.diff_tree_to_workdir_with_index(Some(&tree), Some(&mut opts))
            .map_err(git_error)?
    } else {
        repo.diff_tree_to_workdir_with_index(None, Some(&mut opts))
            .map_err(git_error)?
    };

    let mut diff_text = String::new();
    diff.print(git2::DiffFormat::Patch, |_delta, _hunk, line| {
        diff_text.push_str(std::str::from_utf8(line.content()).unwrap_or(""));
        true
    })
    .map_err(git_error)?;

    Ok(diff_text)
}

// 辅助函数
fn open_repo(path: &Path) -> Result<Repository, MemoError> {
    Repository::open(path).map_err(|e| MemoError {
        code: ErrorCode::NotInitialized,
        message: format!("Failed to open git repo: {}", e),
        retry_after_ms: None,
        context: None,
    })
}

/// 检查是否是 Git 仓库
pub fn is_git_repo(path: &Path) -> bool {
    Repository::open(path).is_ok()
}

fn is_clean(repo: &Repository) -> Result<bool, MemoError> {
    let statuses = repo.statuses(None).map_err(git_error)?;
    Ok(statuses.is_empty())
}

fn git_error(e: git2::Error) -> MemoError {
    MemoError {
        code: ErrorCode::GitDirtyState,
        message: format!("Git error: {}", e),
        retry_after_ms: None,
        context: None,
    }
}
