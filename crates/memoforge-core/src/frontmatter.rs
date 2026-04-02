//! Frontmatter 解析模块
//! Task 1.3: 解析 YAML frontmatter 和 Markdown body

use crate::models::Frontmatter;
use crate::{ErrorCode, MemoError};

fn strip_utf8_bom(content: &str) -> &str {
    content.strip_prefix('\u{feff}').unwrap_or(content)
}

/// 解析包含 frontmatter 的 Markdown 文件
/// 格式: ---\nYAML\n---\nMarkdown body
pub fn parse_frontmatter(content: &str) -> Result<(Frontmatter, String), MemoError> {
    let content = strip_utf8_bom(content).trim_start();

    if !content.starts_with("---") {
        return Err(MemoError {
            code: ErrorCode::InvalidFrontmatter,
            message: "Missing frontmatter delimiter".to_string(),
            retry_after_ms: None,
            context: None,
        });
    }

    let after_first = &content[3..];
    let end_pos = after_first
        .find("\n---\n")
        .or_else(|| after_first.find("\n---\r\n"))
        .ok_or_else(|| MemoError {
            code: ErrorCode::InvalidFrontmatter,
            message: "Missing closing frontmatter delimiter".to_string(),
            retry_after_ms: None,
            context: None,
        })?;

    let yaml_str = &after_first[..end_pos];
    let body_start = end_pos + 5; // "\n---\n".len()
    let body = after_first[body_start..].trim_start().to_string();

    let frontmatter: Frontmatter = serde_yaml::from_str(yaml_str).map_err(|e| MemoError {
        code: ErrorCode::InvalidFrontmatter,
        message: format!("Failed to parse YAML: {}", e),
        retry_after_ms: None,
        context: None,
    })?;

    Ok((frontmatter, body))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_valid_frontmatter() {
        let content = r#"---
id: test-001
title: Test Knowledge
tags: [rust, test]
category: tech
summary: A test summary
created_at: 2026-03-23T10:00:00Z
updated_at: 2026-03-23T11:00:00Z
---
# Content

This is the body."#;

        let result = parse_frontmatter(content);
        assert!(result.is_ok());

        let (fm, body) = result.unwrap();
        assert_eq!(fm.id, "test-001");
        assert_eq!(fm.title, "Test Knowledge");
        assert_eq!(fm.tags, vec!["rust", "test"]);
        assert!(body.contains("# Content"));
    }

    #[test]
    fn test_parse_missing_delimiter() {
        let content = "No frontmatter here";
        let result = parse_frontmatter(content);
        assert!(result.is_err());
        assert_eq!(result.unwrap_err().code, ErrorCode::InvalidFrontmatter);
    }

    #[test]
    fn test_parse_frontmatter_with_utf8_bom() {
        let content = "\u{feff}---\n\
id: test-001\n\
title: Test Knowledge\n\
tags: [rust, test]\n\
created_at: 2026-03-23T10:00:00Z\n\
updated_at: 2026-03-23T11:00:00Z\n\
---\n\
# Content\n";

        let (fm, body) = parse_frontmatter(content).unwrap();
        assert_eq!(fm.id, "test-001");
        assert_eq!(fm.title, "Test Knowledge");
        assert!(body.contains("# Content"));
    }
}
