//! 冷启动模块
//! 参考: PRD §3 场景6, §5.1.6, 技术实现 §6.4

use crate::{MemoError, ErrorCode};
use std::path::Path;
use std::fs;

/// 检测知识库是否已初始化
pub fn is_initialized(path: &Path) -> bool {
    path.join(".memoforge").exists()
}

/// 初始化空白知识库
pub fn init_new(path: &Path, use_template: bool) -> Result<(), MemoError> {
    if is_initialized(path) {
        return Err(MemoError {
            code: ErrorCode::InvalidPath,
            message: "Knowledge base already initialized".to_string(),
            retry_after_ms: None,
            context: None,
        });
    }

    // 创建目录结构
    fs::create_dir_all(path.join(".memoforge")).map_err(io_error)?;

    // 创建配置文件
    let config = r#"# MemoForge 配置文件
version: "1.0"
categories: []
"#;
    fs::write(path.join(".memoforge/config.yaml"), config).map_err(io_error)?;

    // 初始化 Git
    crate::git::git_init(path)?;

    // 创建 .memoforge/.gitignore，排除运行时文件
    let memoforge_gitignore = r#"serve.pid
http.token
events.jsonl
git.lock
*.lock
"#;
    fs::write(path.join(".memoforge/.gitignore"), memoforge_gitignore).map_err(io_error)?;

    // 创建仓库根 .gitignore
    let gitignore = r#".DS_Store
"#;
    fs::write(path.join(".gitignore"), gitignore).map_err(io_error)?;

    // 复制模板（如果需要）
    if use_template {
        crate::template::copy_template(path)?;
    }

    Ok(())
}

/// Clone Git 仓库初始化
pub fn init_clone(url: &str, path: &Path) -> Result<(), MemoError> {
    git2::Repository::clone(url, path).map_err(|e| MemoError {
        code: ErrorCode::GitRemoteUnreachable,
        message: format!("Failed to clone: {}", e),
        retry_after_ms: None,
        context: None,
    })?;

    if !is_initialized(path) {
        return Err(MemoError {
            code: ErrorCode::NotInitialized,
            message: "Cloned repository is not a valid knowledge base".to_string(),
            retry_after_ms: None,
            context: None,
        });
    }

    Ok(())
}

/// 打开已有目录
pub fn init_open(path: &Path) -> Result<(), MemoError> {
    if !is_initialized(path) {
        return Err(MemoError {
            code: ErrorCode::NotInitialized,
            message: "Directory is not a knowledge base. Use init_new to initialize.".to_string(),
            retry_after_ms: None,
            context: None,
        });
    }
    Ok(())
}

fn io_error(e: std::io::Error) -> MemoError {
    MemoError {
        code: ErrorCode::InvalidPath,
        message: format!("IO error: {}", e),
        retry_after_ms: None,
        context: None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn test_init_new_without_template() {
        let temp = TempDir::new().unwrap();
        let path = temp.path();

        assert!(!is_initialized(path));
        init_new(path, false).unwrap();
        assert!(is_initialized(path));
        assert!(path.join(".memoforge/config.yaml").exists());
    }

    #[test]
    fn test_init_new_with_template() {
        let temp = TempDir::new().unwrap();
        let path = temp.path();

        init_new(path, true).unwrap();
        assert!(path.join("welcome.md").exists());
        assert!(path.join("开发/rust-async.md").exists());
    }
}
