//! 模板知识库模块
//! 参考: PRD §5.1.6, 技术实现 §6.5

use crate::{ErrorCode, MemoError};
use std::fs;
use std::path::Path;

const TEMPLATES: &[(&str, &str)] = &[
    ("welcome.md", include_str!("../templates/welcome.md")),
    ("rust-async.md", include_str!("../templates/rust-async.md")),
    (
        "git-workflow.md",
        include_str!("../templates/git-workflow.md"),
    ),
];

/// 复制模板知识库到目标目录
pub fn copy_template(dest: &Path) -> Result<(), MemoError> {
    // 创建分类目录
    let dev_dir = dest.join("开发");
    fs::create_dir_all(&dev_dir).map_err(io_error)?;

    // 复制模板文件
    for (filename, content) in TEMPLATES {
        let target = if *filename == "welcome.md" {
            dest.join(filename)
        } else {
            dev_dir.join(filename)
        };
        fs::write(target, content).map_err(io_error)?;
    }

    // 更新配置文件注册分类
    let config = r#"# ForgeNerve 配置文件
version: "1.0"
categories:
  - path: "开发"
    name: "开发"
    description: "开发相关知识"
"#;
    fs::write(dest.join(".memoforge/config.yaml"), config).map_err(io_error)?;

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
