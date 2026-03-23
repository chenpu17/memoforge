//! 知识加载模块
//! Task 1.6: L0/L1/L2 分层加载逻辑

use std::path::Path;
use crate::{MemoError, models::{Knowledge, LoadLevel}};
use crate::frontmatter::parse_frontmatter;
use crate::fs::read_knowledge_file;
use regex::Regex;

/// 章节结构
#[derive(Debug, Clone, PartialEq)]
pub struct Section {
    pub title: String,
    pub level: usize,
    pub content: String,
}

/// 按指定层级加载知识
pub fn load_knowledge(path: &Path, level: LoadLevel) -> Result<Knowledge, MemoError> {
    let content = read_knowledge_file(path)?;
    let (frontmatter, body) = parse_frontmatter(&content)?;

    let summary = match level {
        LoadLevel::L0 => None,
        LoadLevel::L1 | LoadLevel::L2 => frontmatter.summary.clone(),
    };

    let content = match level {
        LoadLevel::L0 | LoadLevel::L1 => None,
        LoadLevel::L2 => Some(body),
    };

    Ok(Knowledge {
        id: frontmatter.id,
        title: frontmatter.title,
        tags: frontmatter.tags,
        category: frontmatter.category,
        summary,
        content,
        created_at: frontmatter.created_at,
        updated_at: frontmatter.updated_at,
    })
}

/// 按标题拆分章节
pub fn split_sections(content: &str) -> Vec<Section> {
    let re = Regex::new(r"(?m)^(#{2,})\s+(.+)$").unwrap();
    let mut sections = Vec::new();
    let mut last_pos = 0;
    let mut last_title = String::new();
    let mut last_level = 0;
    let mut first = true;

    for cap in re.captures_iter(content) {
        let match_start = cap.get(0).unwrap().start();

        if !first {
            let section_content = content[last_pos..match_start].trim().to_string();
            sections.push(Section {
                title: last_title.clone(),
                level: last_level,
                content: section_content,
            });
        }

        last_title = cap[2].to_string();
        last_level = cap[1].len();
        last_pos = match_start;
        first = false;
    }

    if !first {
        let section_content = content[last_pos..].trim().to_string();
        sections.push(Section {
            title: last_title,
            level: last_level,
            content: section_content,
        });
    }

    sections
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::PathBuf;

    fn create_test_file() -> PathBuf {
        let dir = std::env::temp_dir().join("memoforge_test");
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join("test.md");

        let content = r#"---
id: test-001
title: Test Knowledge
tags: [rust, test]
summary: Test summary
created_at: 2026-03-23T10:00:00Z
updated_at: 2026-03-23T11:00:00Z
---
# Content Body

Test content."#;

        fs::write(&path, content).unwrap();
        path
    }

    #[test]
    fn test_load_l0() {
        let path = create_test_file();
        let k = load_knowledge(&path, LoadLevel::L0).unwrap();
        assert_eq!(k.id, "test-001");
        assert!(k.summary.is_none());
        assert!(k.content.is_none());
    }

    #[test]
    fn test_load_l1() {
        let path = create_test_file();
        let k = load_knowledge(&path, LoadLevel::L1).unwrap();
        assert_eq!(k.summary, Some("Test summary".to_string()));
        assert!(k.content.is_none());
    }

    #[test]
    fn test_load_l2() {
        let path = create_test_file();
        let k = load_knowledge(&path, LoadLevel::L2).unwrap();
        assert!(k.summary.is_some());
        assert!(k.content.is_some());
        assert!(k.content.unwrap().contains("Test content"));
    }

    #[test]
    fn test_split_sections() {
        let content = r#"## Section 1
Content 1

### Subsection 1.1
Content 1.1

## Section 2
Content 2"#;

        let sections = split_sections(content);
        assert_eq!(sections.len(), 3);
        assert_eq!(sections[0].title, "Section 1");
        assert_eq!(sections[0].level, 2);
        assert!(sections[0].content.contains("Content 1"));
        assert_eq!(sections[1].title, "Subsection 1.1");
        assert_eq!(sections[1].level, 3);
        assert_eq!(sections[2].title, "Section 2");
    }

    #[test]
    fn test_split_sections_empty() {
        let sections = split_sections("No sections here");
        assert_eq!(sections.len(), 0);
    }
}
