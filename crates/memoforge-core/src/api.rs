//! High-level API for MCP integration
//! 参考: 技术实现文档 §4

use crate::*;
use crate::config::{load_config, save_config, register_category, validate_category_path};
use crate::knowledge::split_sections;
use std::path::Path;
use std::fs;

/// List knowledge entries
pub fn list_knowledge(
    kb_path: &Path,
    level: LoadLevel,
    category_id: Option<&str>,
    tags: Option<&[String]>,
    limit: Option<usize>,
    offset: Option<usize>,
) -> Result<Vec<Knowledge>, MemoError> {
    let mut results = Vec::new();
    let entries = fs::read_dir(kb_path).map_err(|e| MemoError {
        code: ErrorCode::InvalidPath,
        message: format!("Failed to read directory: {}", e),
        retry_after_ms: None,
        context: None,
    })?;

    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|s| s.to_str()) == Some("md") {
            if let Ok(k) = load_knowledge(&path, level) {
                // Filter by category
                if let Some(cat) = category_id {
                    if k.category.as_deref() != Some(cat) {
                        continue;
                    }
                }
                // Filter by tags
                if let Some(filter_tags) = tags {
                    if !filter_tags.iter().any(|t| k.tags.contains(t)) {
                        continue;
                    }
                }
                results.push(k);
            }
        }
    }

    // Apply pagination
    let start = offset.unwrap_or(0);
    let end = limit.map(|l| start + l).unwrap_or(results.len());
    Ok(results.into_iter().skip(start).take(end - start).collect())
}

/// Get single knowledge by ID
pub fn get_knowledge_by_id(
    kb_path: &Path,
    id: &str,
    level: LoadLevel,
) -> Result<Knowledge, MemoError> {
    let path = kb_path.join(format!("{}.md", id));
    load_knowledge(&path, level)
}

/// Get content with optional section filtering
pub fn get_content(
    kb_path: &Path,
    id: &str,
    section: Option<&str>,
) -> Result<String, MemoError> {
    let path = kb_path.join(format!("{}.md", id));
    let k = load_knowledge(&path, LoadLevel::L2)?;

    let content = k.content.ok_or_else(|| MemoError {
        code: ErrorCode::NotFoundKnowledge,
        message: "No content available".to_string(),
        retry_after_ms: None,
        context: None,
    })?;

    if let Some(section_title) = section {
        let sections = split_sections(&content);
        sections.into_iter()
            .find(|s| s.title == section_title)
            .map(|s| s.content)
            .ok_or_else(|| MemoError {
                code: ErrorCode::NotFoundKnowledge,
                message: format!("Section '{}' not found", section_title),
                retry_after_ms: None,
                context: None,
            })
    } else {
        Ok(content)
    }
}

/// Create knowledge
pub fn create_knowledge(
    kb_path: &Path,
    title: &str,
    content: &str,
    tags: Vec<String>,
    category: Option<String>,
    summary: Option<String>,
) -> Result<String, MemoError> {
    // Validate category if provided
    if let Some(ref cat_id) = category {
        if !validate_category_path(kb_path, cat_id)? {
            return Err(MemoError {
                code: ErrorCode::NotFoundCategory,
                message: format!("Category '{}' not registered in config", cat_id),
                retry_after_ms: None,
                context: None,
            });
        }
    }

    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now();

    let frontmatter = Frontmatter {
        id: id.clone(),
        title: title.to_string(),
        tags,
        category,
        summary,
        created_at: now,
        updated_at: now,
    };

    let fm_yaml = serde_yaml::to_string(&frontmatter).map_err(|e| MemoError {
        code: ErrorCode::InvalidPath,
        message: format!("Failed to serialize frontmatter: {}", e),
        retry_after_ms: None,
        context: None,
    })?;

    let full_content = format!("---\n{}---\n{}", fm_yaml, content);
    let path = kb_path.join(format!("{}.md", id));
    fs::write(&path, full_content).map_err(|e| MemoError {
        code: ErrorCode::InvalidPath,
        message: format!("Failed to write file: {}", e),
        retry_after_ms: None,
        context: None,
    })?;

    Ok(id)
}

/// Update knowledge (partial)
pub fn update_knowledge(
    kb_path: &Path,
    id: &str,
    title: Option<&str>,
    content: Option<&str>,
    tags: Option<Vec<String>>,
    summary: Option<&str>,
) -> Result<(), MemoError> {
    let path = kb_path.join(format!("{}.md", id));
    let file_content = fs::read_to_string(&path).map_err(|_| MemoError {
        code: ErrorCode::NotFoundKnowledge,
        message: "Knowledge not found".to_string(),
        retry_after_ms: None,
        context: None,
    })?;

    let (mut fm, body) = parse_frontmatter(&file_content)?;

    if let Some(t) = title {
        fm.title = t.to_string();
    }
    if let Some(t) = tags {
        fm.tags = t;
    }
    if let Some(s) = summary {
        fm.summary = Some(s.to_string());
    }
    fm.updated_at = chrono::Utc::now();

    let fm_yaml = serde_yaml::to_string(&fm).map_err(|e| MemoError {
        code: ErrorCode::InvalidPath,
        message: format!("Failed to serialize: {}", e),
        retry_after_ms: None,
        context: None,
    })?;

    let new_body = content.unwrap_or(&body);
    let full_content = format!("---\n{}---\n{}", fm_yaml, new_body);
    fs::write(&path, full_content).map_err(|e| MemoError {
        code: ErrorCode::InvalidPath,
        message: format!("Failed to write: {}", e),
        retry_after_ms: None,
        context: None,
    })?;

    Ok(())
}

/// Delete knowledge
pub fn delete_knowledge(kb_path: &Path, id: &str) -> Result<(), MemoError> {
    let path = kb_path.join(format!("{}.md", id));
    fs::remove_file(&path).map_err(|_| MemoError {
        code: ErrorCode::NotFoundKnowledge,
        message: "Knowledge not found".to_string(),
        retry_after_ms: None,
        context: None,
    })
}

/// Move knowledge to different category
pub fn move_knowledge(
    kb_path: &Path,
    id: &str,
    new_category_id: &str,
) -> Result<(), MemoError> {
    update_knowledge(kb_path, id, None, None, None, None)?;
    let path = kb_path.join(format!("{}.md", id));
    let content = fs::read_to_string(&path).map_err(|_| MemoError {
        code: ErrorCode::NotFoundKnowledge,
        message: "Knowledge not found".to_string(),
        retry_after_ms: None,
        context: None,
    })?;

    let (mut fm, body) = parse_frontmatter(&content)?;
    fm.category = Some(new_category_id.to_string());
    fm.updated_at = chrono::Utc::now();

    let fm_yaml = serde_yaml::to_string(&fm).unwrap();
    let full_content = format!("---\n{}---\n{}", fm_yaml, body);
    fs::write(&path, full_content).map_err(|e| MemoError {
        code: ErrorCode::InvalidPath,
        message: format!("Failed to write: {}", e),
        retry_after_ms: None,
        context: None,
    })
}

/// Search knowledge
pub fn search_knowledge(
    kb_path: &Path,
    query: &str,
    tags: Option<&[String]>,
    category_id: Option<&str>,
    limit: Option<usize>,
) -> Result<Vec<Knowledge>, MemoError> {
    let all = list_knowledge(kb_path, LoadLevel::L2, category_id, tags, None, None)?;
    let query_lower = query.to_lowercase();

    let mut results: Vec<_> = all.into_iter()
        .filter(|k| {
            k.title.to_lowercase().contains(&query_lower) ||
            k.content.as_ref().map_or(false, |c| c.to_lowercase().contains(&query_lower))
        })
        .collect();

    if let Some(l) = limit {
        results.truncate(l);
    }
    Ok(results)
}

/// Load categories from config
pub fn list_categories(kb_path: &Path) -> Result<Vec<Category>, MemoError> {
    let config = load_config(kb_path)?;
    Ok(config.categories.iter().map(|c| Category {
        id: c.id.clone(),
        name: c.name.clone(),
        parent_id: c.parent_id.clone(),
        description: c.description.clone(),
    }).collect())
}

/// Create category
pub fn create_category(
    kb_path: &Path,
    name: &str,
    parent_id: Option<String>,
    description: Option<String>,
) -> Result<String, MemoError> {
    let id = uuid::Uuid::new_v4().to_string();
    let category = Category {
        id: id.clone(),
        name: name.to_string(),
        parent_id: parent_id.clone(),
        description: description.clone()
    };

    // Register in config.yaml
    let path = if let Some(ref pid) = parent_id {
        format!("{}/{}", pid, name)
    } else {
        name.to_string()
    };
    register_category(kb_path, &category, &path)?;

    Ok(id)
}

/// Update category
pub fn update_category(
    kb_path: &Path,
    id: &str,
    name: Option<&str>,
    description: Option<&str>,
) -> Result<(), MemoError> {
    let mut config = load_config(kb_path)?;
    let cat = config.categories.iter_mut().find(|c| c.id == id)
        .ok_or_else(|| MemoError {
            code: ErrorCode::NotFoundCategory,
            message: "Category not found".to_string(),
            retry_after_ms: None,
            context: None,
        })?;

    if let Some(n) = name {
        cat.name = n.to_string();
    }
    if let Some(d) = description {
        cat.description = Some(d.to_string());
    }
    save_config(kb_path, &config)
}

/// Delete category
pub fn delete_category(kb_path: &Path, id: &str, _force: bool) -> Result<(), MemoError> {
    let mut config = load_config(kb_path)?;
    config.categories.retain(|c| c.id != id);
    save_config(kb_path, &config)
}

/// Get status
pub fn get_status(kb_path: &Path) -> Result<(usize, usize, bool), MemoError> {
    let knowledge_count = list_knowledge(kb_path, LoadLevel::L0, None, None, None, None)?.len();
    let category_count = list_categories(kb_path)?.len();
    let git_initialized = kb_path.join(".git").exists();
    Ok((knowledge_count, category_count, git_initialized))
}

/// Get all tags from knowledge base
pub fn get_tags(
    kb_path: &Path,
    prefix: Option<&str>,
) -> Result<Vec<String>, MemoError> {
    use std::collections::HashSet;

    let mut tags = HashSet::new();
    let entries = fs::read_dir(kb_path).map_err(|e| MemoError {
        code: ErrorCode::InvalidPath,
        message: format!("Failed to read directory: {}", e),
        retry_after_ms: None,
        context: None,
    })?;

    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|s| s.to_str()) == Some("md") {
            if let Ok(k) = load_knowledge(&path, LoadLevel::L1) {
                for tag in k.tags {
                    if let Some(p) = prefix {
                        if tag.starts_with(p) {
                            tags.insert(tag);
                        }
                    } else {
                        tags.insert(tag);
                    }
                }
            }
        }
    }

    let mut result: Vec<String> = tags.into_iter().collect();
    result.sort();
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn test_get_content_with_section() {
        let dir = std::env::temp_dir().join("memoforge_api_test");
        fs::create_dir_all(&dir).unwrap();

        let content = r#"---
id: test-001
title: Test
tags: []
created_at: 2026-03-23T10:00:00Z
updated_at: 2026-03-23T11:00:00Z
---
## Section 1
Content 1

## Section 2
Content 2"#;

        fs::write(dir.join("test-001.md"), content).unwrap();

        let result = get_content(&dir, "test-001", Some("Section 1")).unwrap();
        assert!(result.contains("Section 1"));
        assert!(result.contains("Content 1"));

        let full = get_content(&dir, "test-001", None).unwrap();
        assert!(full.contains("Section 1"));
        assert!(full.contains("Section 2"));
    }
}
