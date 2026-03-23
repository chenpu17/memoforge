//! 文件锁管理
//! 参考: 技术实现文档 §2.1.5, PRD §6.1.2

use crate::error::{ErrorCode, MemoError};
use fs2::FileExt;
use std::fs::{File, OpenOptions};
use std::path::{Path, PathBuf};

/// 文件锁（自动释放）
pub struct FileLock {
    _file: File,
    path: PathBuf,
}

impl FileLock {
    pub fn path(&self) -> &Path {
        &self.path
    }
}

/// 全局写锁（用于 move_knowledge）
pub struct GlobalWriteLock {
    _file: File,
}

/// 锁管理器
pub struct LockManager {
    kb_path: PathBuf,
}

impl LockManager {
    pub fn new(kb_path: PathBuf) -> Self {
        Self { kb_path }
    }

    /// 锁定单个文件（非阻塞）
    pub fn lock_file(&self, path: &Path) -> Result<FileLock, MemoError> {
        let file = OpenOptions::new()
            .write(true)
            .create(true)
            .open(path)
            .map_err(|e| MemoError {
                code: ErrorCode::InvalidPath,
                message: format!("无法打开文件: {}", e),
                retry_after_ms: None,
                context: None,
            })?;

        file.try_lock_exclusive().map_err(|_| MemoError {
            code: ErrorCode::ConflictFileLocked,
            message: format!("文件已被锁定: {}", path.display()),
            retry_after_ms: Some(100),
            context: None,
        })?;

        Ok(FileLock {
            _file: file,
            path: path.to_path_buf(),
        })
    }

    /// 批量锁定文件（按字典序防死锁）
    pub fn lock_files(&self, paths: &[&Path]) -> Result<Vec<FileLock>, MemoError> {
        let mut sorted: Vec<_> = paths.iter().map(|p| p.to_path_buf()).collect();
        sorted.sort();
        sorted.dedup();

        let mut locks = Vec::new();
        for path in sorted {
            locks.push(self.lock_file(&path)?);
        }
        Ok(locks)
    }

    /// 全局写锁（move_knowledge 时排他持有）
    pub fn lock_global_write(&self) -> Result<GlobalWriteLock, MemoError> {
        let lock_path = self.kb_path.join(".memoforge/write.lock");
        std::fs::create_dir_all(lock_path.parent().unwrap()).ok();

        let file = OpenOptions::new()
            .write(true)
            .create(true)
            .open(&lock_path)
            .map_err(|e| MemoError {
                code: ErrorCode::InvalidPath,
                message: format!("无法创建全局写锁: {}", e),
                retry_after_ms: None,
                context: None,
            })?;

        file.try_lock_exclusive().map_err(|_| MemoError {
            code: ErrorCode::ConflictFileLocked,
            message: "全局写锁已被持有".to_string(),
            retry_after_ms: Some(100),
            context: None,
        })?;

        Ok(GlobalWriteLock { _file: file })
    }
}
