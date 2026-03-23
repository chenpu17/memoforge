//! 文件系统操作模块
//! Task 1.5: 文件读写和路径处理

use std::path::Path;
use std::fs;
use crate::{MemoError, ErrorCode};

/// 读取知识文件
pub fn read_knowledge_file(path: &Path) -> Result<String, MemoError> {
    fs::read_to_string(path).map_err(|e| MemoError {
        code: ErrorCode::NotFoundKnowledge,
        message: format!("Failed to read file: {}", e),
        retry_after_ms: None,
        context: None,
    })
}

/// 写入知识文件
pub fn write_knowledge_file(path: &Path, content: &str) -> Result<(), MemoError> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| MemoError {
            code: ErrorCode::InvalidPath,
            message: format!("Failed to create directory: {}", e),
            retry_after_ms: None,
            context: None,
        })?;
    }

    fs::write(path, content).map_err(|e| MemoError {
        code: ErrorCode::InvalidPath,
        message: format!("Failed to write file: {}", e),
        retry_after_ms: None,
        context: None,
    })
}
