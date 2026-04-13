//! 统一错误类型
//! 参考: 技术实现文档 §2.1.7, PRD §6.1.1

use serde::{Deserialize, Serialize};
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
    PermissionProfileDenied,
    // 限制
    LimitResultTooLarge,
}

/// Validate a storage ID to prevent path traversal attacks.
///
/// Rejects empty strings, overly long strings (>128 chars), and any ID
/// containing `/`, `\`, `.`, or `\0` characters.
pub fn validate_storage_id(id: &str, label: &str) -> Result<(), MemoError> {
    if id.is_empty()
        || id.len() > 128
        || id.contains('/')
        || id.contains('\\')
        || id.contains('.')
        || id.contains('\0')
    {
        Err(MemoError {
            code: ErrorCode::InvalidPath,
            message: format!("Invalid {}: '{}'", label, id),
            retry_after_ms: None,
            context: None,
        })
    } else {
        Ok(())
    }
}
