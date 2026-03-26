//! 统一错误类型
//! 参考: 技术实现文档 §2.1.7, PRD §6.1.1

use serde::{Serialize, Deserialize};
use thiserror::Error;

#[derive(Debug, Error, Serialize)]
#[error("{message}")]
pub struct MemoError {
    pub code: ErrorCode,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub retry_after_ms: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub context: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ErrorCode {
    // 状态
    NotInitialized,
    // 资源不存在
    NotFoundKnowledge,
    NotFoundCategory,
    // 参数错误
    InvalidPath,
    InvalidFrontmatter,
    InvalidArgument,
    InvalidData,
    // 并发冲突
    ConflictFileLocked,
    ConflictGitMerge,
    // Git
    GitAuthFailed,
    GitPushRejected,
    GitRemoteUnreachable,
    GitDirtyState,
    // 权限
    PermissionReadonly,
    // 限制
    LimitResultTooLarge,
}
