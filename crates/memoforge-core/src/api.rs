//! High-level API for MCP integration
//! 参考: 技术实现文档 §4

use crate::config::{load_config, register_category, save_config, validate_category_path};
use crate::events::{log_create, log_delete, log_update, EventSource};
use crate::fs::write_knowledge_file;
use crate::knowledge::split_sections;
use crate::models::KnowledgeWithStale;
use crate::*;
use regex::Regex;
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::fs;
use std::path::{Component, Path, PathBuf};

#[derive(Debug, Clone, Serialize)]
pub struct GrepMatch {
    pub id: String,
    pub title: String,
    pub line_number: usize,
    pub line: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct PaginatedKnowledge {
    pub items: Vec<Knowledge>,
    pub total: usize,
    pub limit: usize,
    pub offset: usize,
    pub has_more: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct KnowledgeLinkCompletion {
    pub id: String,
    pub title: String,
    pub summary: Option<String>,
    pub category: Option<String>,
}

/// Preview result for delete operation
#[derive(Debug, Clone, Serialize)]
pub struct DeletePreview {
    /// Path of the file to be deleted
    pub path: String,
    /// Title of the knowledge
    pub title: String,
    /// Files that reference this knowledge (via [[links]] or related field)
    pub references: Vec<ReferenceInfo>,
}

/// Preview result for move operation
#[derive(Debug, Clone, Serialize)]
pub struct MovePreview {
    /// Original path
    pub old_path: String,
    /// New path after move
    pub new_path: String,
    /// Title of the knowledge
    pub title: String,
    /// Files that contain links to this knowledge that may need updating
    pub references: Vec<ReferenceInfo>,
}

/// Information about a reference to a knowledge
#[derive(Debug, Clone, Serialize)]
pub struct ReferenceInfo {
    /// Path of the file containing the reference
    pub path: String,
    /// Title of the referencing knowledge
    pub title: String,
    /// Line numbers where references occur
    pub lines: Vec<usize>,
}

/// Calculate a hash of content for staleness detection
/// Uses 16 bytes (32 hex chars) to minimize collision risk
fn calculate_content_hash(content: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(content.as_bytes());
    let result = hasher.finalize();
    hex::encode(&result[..16]) // First 16 bytes = 32 hex chars
}

fn is_ignored_dir(path: &Path) -> bool {
    path.file_name()
        .and_then(|name| name.to_str())
        .map(|name| matches!(name, ".git" | ".memoforge"))
        .unwrap_or(false)
}

fn io_error(message: &str, err: std::io::Error) -> MemoError {
    MemoError {
        code: ErrorCode::InvalidPath,
        message: format!("{}: {}", message, err),
        retry_after_ms: None,
        context: None,
    }
}

fn collect_markdown_files(dir: &Path) -> Result<Vec<PathBuf>, MemoError> {
    fn walk(dir: &Path, files: &mut Vec<PathBuf>) -> Result<(), MemoError> {
        let entries = fs::read_dir(dir).map_err(|e| io_error("Failed to read directory", e))?;
        for entry in entries {
            let entry = entry.map_err(|e| io_error("Failed to read directory entry", e))?;
            let path = entry.path();
            let file_type = entry
                .file_type()
                .map_err(|e| io_error("Failed to read file type", e))?;

            if file_type.is_dir() {
                if is_ignored_dir(&path) {
                    continue;
                }
                walk(&path, files)?;
            } else if file_type.is_file()
                && path.extension().and_then(|ext| ext.to_str()) == Some("md")
            {
                files.push(path);
            }
        }

        Ok(())
    }

    let mut files = Vec::new();
    walk(dir, &mut files)?;
    files.sort();
    Ok(files)
}

fn relative_knowledge_path(kb_path: &Path, full_path: &Path) -> Result<String, MemoError> {
    let relative = full_path.strip_prefix(kb_path).map_err(|_| MemoError {
        code: ErrorCode::InvalidPath,
        message: format!(
            "Knowledge file is outside of the knowledge base: {}",
            full_path.display()
        ),
        retry_after_ms: None,
        context: None,
    })?;

    Ok(relative.to_string_lossy().replace('\\', "/"))
}

fn normalize_key(key: &str) -> String {
    key.trim().trim_matches('/').replace('\\', "/")
}

fn infer_category_from_relative_path(relative_path: &str) -> Option<String> {
    let mut components = Path::new(relative_path).components();
    match (components.next(), components.next()) {
        (Some(Component::Normal(first)), Some(_)) => Some(first.to_string_lossy().to_string()),
        _ => None,
    }
}

fn hydrate_knowledge(
    kb_path: &Path,
    full_path: &Path,
    level: LoadLevel,
) -> Result<Knowledge, MemoError> {
    let mut knowledge = load_knowledge(full_path, level)?;
    let relative_path = relative_knowledge_path(kb_path, full_path)?;
    knowledge.id = relative_path.clone();
    if knowledge.category.is_none() {
        knowledge.category = infer_category_from_relative_path(&relative_path);
    }
    Ok(knowledge)
}

fn resolve_knowledge_path(kb_path: &Path, key: &str) -> Result<PathBuf, MemoError> {
    let normalized = normalize_key(key);
    if normalized.is_empty() {
        return Err(MemoError {
            code: ErrorCode::InvalidPath,
            message: "Knowledge identifier cannot be empty".to_string(),
            retry_after_ms: None,
            context: None,
        });
    }

    let mut candidates = vec![kb_path.join(&normalized)];
    if !normalized.ends_with(".md") {
        candidates.push(kb_path.join(format!("{}.md", normalized)));
    }

    for candidate in candidates {
        if candidate.exists() && candidate.extension().and_then(|ext| ext.to_str()) == Some("md") {
            return Ok(candidate);
        }
    }

    for path in collect_markdown_files(kb_path)? {
        let relative = relative_knowledge_path(kb_path, &path)?;
        let relative_no_ext = relative.strip_suffix(".md").unwrap_or(&relative);
        if relative == normalized || relative_no_ext == normalized {
            return Ok(path);
        }

        if let Ok(knowledge) = load_knowledge(&path, LoadLevel::L0) {
            if knowledge.id == normalized {
                return Ok(path);
            }
        }
    }

    Err(MemoError {
        code: ErrorCode::NotFoundKnowledge,
        message: format!("Knowledge not found: {}", normalized),
        retry_after_ms: None,
        context: None,
    })
}

fn normalize_category(category: Option<String>) -> Option<String> {
    category.and_then(|value| {
        let normalized = normalize_key(&value);
        if normalized.is_empty() {
            None
        } else {
            Some(normalized)
        }
    })
}

fn knowledge_matches_category(knowledge: &Knowledge, category_id: &str) -> bool {
    let category_id = normalize_key(category_id);
    if category_id.is_empty() {
        return true;
    }

    if let Some(category) = knowledge.category.as_deref() {
        if normalize_key(category) == category_id {
            return true;
        }
    }

    knowledge.id.starts_with(&format!("{}/", category_id))
}

fn slugify_title(title: &str) -> String {
    let mut slug = String::new();
    let mut last_dash = false;

    for ch in title.chars() {
        if ch.is_ascii_alphanumeric() {
            slug.push(ch.to_ascii_lowercase());
            last_dash = false;
        } else if ch.is_ascii_whitespace() || matches!(ch, '-' | '_') {
            if !last_dash && !slug.is_empty() {
                slug.push('-');
                last_dash = true;
            }
        } else if !last_dash && !slug.is_empty() {
            slug.push('-');
            last_dash = true;
        }
    }

    let slug = slug.trim_matches('-');
    if slug.is_empty() {
        "untitled".to_string()
    } else {
        slug.to_string()
    }
}

/// Find references to a knowledge in other files
fn find_references(kb_path: &Path, target_id: &str) -> Result<Vec<ReferenceInfo>, MemoError> {
    let mut references = Vec::new();
    let target_relative = normalize_key(target_id);
    let target_no_ext = target_relative
        .strip_suffix(".md")
        .unwrap_or(&target_relative);
    let target_file_name = Path::new(&target_relative)
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or(&target_relative);
    let target_name = Path::new(&target_relative)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or(&target_relative);

    for path in collect_markdown_files(kb_path)? {
        let relative = relative_knowledge_path(kb_path, &path)?;

        // Skip self-references
        if relative == target_relative || relative == format!("{}.md", target_relative) {
            continue;
        }

        let content = match fs::read_to_string(&path) {
            Ok(c) => c,
            Err(_) => continue,
        };

        let mut ref_lines = Vec::new();
        for (idx, line) in content.lines().enumerate() {
            let links = parse_wiki_links(line);
            if links.into_iter().any(|(link_text, _, _)| {
                let normalized = normalize_key(&link_text);
                normalized == target_relative
                    || normalized == target_no_ext
                    || normalized == target_file_name
                    || normalized == target_name
            }) {
                ref_lines.push(idx + 1);
            }
        }

        if !ref_lines.is_empty() {
            let title = parse_frontmatter(&content)
                .map(|(fm, _)| fm.title)
                .unwrap_or_else(|_| relative.clone());

            references.push(ReferenceInfo {
                path: relative,
                title,
                lines: ref_lines,
            });
        }
    }

    Ok(references)
}

fn unique_relative_path(kb_path: &Path, desired_relative: &str) -> String {
    let path = Path::new(desired_relative);
    let stem = path
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("untitled");
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("md");
    let parent = path
        .parent()
        .map(|value| value.to_string_lossy().replace('\\', "/"))
        .unwrap_or_default();

    let mut index = 1;
    loop {
        let file_name = if index == 1 {
            format!("{}.{}", stem, extension)
        } else {
            format!("{}-{}.{}", stem, index, extension)
        };
        let relative = if parent.is_empty() {
            file_name
        } else {
            format!("{}/{}", parent, file_name)
        };
        if !kb_path.join(&relative).exists() {
            return relative;
        }
        index += 1;
    }
}

fn registered_category_prefix(
    kb_path: &Path,
    relative_path: &str,
) -> Result<Option<String>, MemoError> {
    let normalized = normalize_key(relative_path);
    if normalized.is_empty() {
        return Ok(None);
    }

    let config = load_config(kb_path)?;
    let matched = config
        .categories
        .into_iter()
        .filter_map(|category| {
            let category_path = normalize_key(&category.path);
            if category_path.is_empty() {
                return None;
            }

            let is_match = normalized == category_path
                || normalized.starts_with(&format!("{}/", category_path));
            if is_match {
                Some(category_path)
            } else {
                None
            }
        })
        .max_by_key(|category_path| category_path.len());

    Ok(matched)
}

fn validate_target_relative_path(
    kb_path: &Path,
    target_relative: &str,
) -> Result<String, MemoError> {
    let normalized = normalize_key(target_relative);
    if normalized.is_empty() {
        return Err(MemoError {
            code: ErrorCode::InvalidPath,
            message: "Target path cannot be empty".to_string(),
            retry_after_ms: None,
            context: None,
        });
    }

    if !normalized.ends_with(".md") {
        return Err(MemoError {
            code: ErrorCode::InvalidPath,
            message: "Target path must be a markdown file".to_string(),
            retry_after_ms: None,
            context: None,
        });
    }

    let path = Path::new(&normalized);
    for component in path.components() {
        match component {
            Component::Normal(part) => {
                let part = part.to_string_lossy();
                if matches!(part.as_ref(), ".git" | ".memoforge") {
                    return Err(MemoError {
                        code: ErrorCode::InvalidPath,
                        message: format!(
                            "Target path cannot contain reserved directory '{}'",
                            part
                        ),
                        retry_after_ms: None,
                        context: None,
                    });
                }
            }
            Component::CurDir
            | Component::ParentDir
            | Component::RootDir
            | Component::Prefix(_) => {
                return Err(MemoError {
                    code: ErrorCode::InvalidPath,
                    message:
                        "Target path must be a normalized relative path inside the knowledge base"
                            .to_string(),
                    retry_after_ms: None,
                    context: None,
                });
            }
        }
    }

    if registered_category_prefix(kb_path, &normalized)?.is_none() {
        return Err(MemoError {
            code: ErrorCode::InvalidPath,
            message: format!(
                "Target path '{}' must start with a registered category",
                normalized
            ),
            retry_after_ms: None,
            context: None,
        });
    }

    Ok(normalized)
}

fn move_knowledge_to_relative_path_internal(
    kb_path: &Path,
    id: &str,
    target_relative: &str,
    dry_run: bool,
) -> Result<MovePreview, MemoError> {
    let target_relative = validate_target_relative_path(kb_path, target_relative)?;
    let old_path = resolve_knowledge_path(kb_path, id)?;
    let old_relative = relative_knowledge_path(kb_path, &old_path)?;

    if old_relative == target_relative {
        let content = fs::read_to_string(&old_path).map_err(|_| MemoError {
            code: ErrorCode::NotFoundKnowledge,
            message: "Knowledge not found".to_string(),
            retry_after_ms: None,
            context: None,
        })?;
        let title = parse_frontmatter(&content)
            .map(|(fm, _)| fm.title)
            .unwrap_or_else(|_| id.to_string());
        return Ok(MovePreview {
            old_path: old_relative,
            new_path: target_relative,
            title,
            references: Vec::new(),
        });
    }

    let target_path = kb_path.join(&target_relative);
    if target_path.exists() {
        return Err(MemoError {
            code: ErrorCode::InvalidPath,
            message: format!("Target path already exists: {}", target_relative),
            retry_after_ms: None,
            context: None,
        });
    }

    let content = fs::read_to_string(&old_path).map_err(|_| MemoError {
        code: ErrorCode::NotFoundKnowledge,
        message: "Knowledge not found".to_string(),
        retry_after_ms: None,
        context: None,
    })?;
    let title = parse_frontmatter(&content)
        .map(|(fm, _)| fm.title)
        .unwrap_or_else(|_| id.to_string());
    let references = find_references(kb_path, &old_relative)?;

    if dry_run {
        return Ok(MovePreview {
            old_path: old_relative,
            new_path: target_relative,
            title,
            references,
        });
    }

    let matched_category = registered_category_prefix(kb_path, &target_relative)?;
    let (mut fm, body) = parse_frontmatter(&content)?;
    fm.category = matched_category;
    fm.updated_at = chrono::Utc::now();

    if let Some(parent) = target_path.parent() {
        fs::create_dir_all(parent).map_err(|e| io_error("Failed to create target directory", e))?;
    }

    fs::rename(&old_path, &target_path).map_err(|e| io_error("Failed to move knowledge", e))?;

    let fm_yaml = serde_yaml::to_string(&fm).map_err(|e| MemoError {
        code: ErrorCode::InvalidPath,
        message: format!("Failed to serialize: {}", e),
        retry_after_ms: None,
        context: None,
    })?;
    let full_content = format!("---\n{}---\n{}", fm_yaml, body);
    write_knowledge_file(&target_path, &full_content)?;

    let _ = update_references(kb_path, &old_relative, &target_relative);

    Ok(MovePreview {
        old_path: old_relative,
        new_path: target_relative,
        title,
        references,
    })
}

/// List knowledge entries
pub fn list_knowledge(
    kb_path: &Path,
    level: LoadLevel,
    category_id: Option<&str>,
    tags: Option<&[String]>,
    limit: Option<usize>,
    offset: Option<usize>,
) -> Result<PaginatedKnowledge, MemoError> {
    let mut results = Vec::new();
    for path in collect_markdown_files(kb_path)? {
        if let Ok(knowledge) = hydrate_knowledge(kb_path, &path, level) {
            if let Some(category_id) = category_id {
                if !knowledge_matches_category(&knowledge, category_id) {
                    continue;
                }
            }

            if let Some(filter_tags) = tags {
                if !filter_tags.iter().any(|tag| knowledge.tags.contains(tag)) {
                    continue;
                }
            }

            results.push(knowledge);
        }
    }

    results.sort_by(|left, right| left.id.cmp(&right.id));

    let total = results.len();
    let offset = offset.unwrap_or(0);
    let limit = limit.unwrap_or(50);

    let items: Vec<Knowledge> = results.into_iter().skip(offset).take(limit).collect();
    let has_more = offset + items.len() < total;

    Ok(PaginatedKnowledge {
        items,
        total,
        limit,
        offset,
        has_more,
    })
}

/// Get single knowledge by ID (returns extended info with staleness)
pub fn get_knowledge_by_id(
    kb_path: &Path,
    id: &str,
    level: LoadLevel,
) -> Result<Knowledge, MemoError> {
    let path = resolve_knowledge_path(kb_path, id)?;
    let mut knowledge = hydrate_knowledge(kb_path, &path, level)?;

    // Calculate staleness if we have content and summary
    if level == LoadLevel::L2 {
        if let (Some(ref content), Some(ref summary)) = (&knowledge.content, &knowledge.summary) {
            if !summary.is_empty() {
                let current_hash = calculate_content_hash(content);
                // Load frontmatter to get summary_hash
                let file_content = fs::read_to_string(&path).map_err(|e| MemoError {
                    code: ErrorCode::NotFoundKnowledge,
                    message: format!("Failed to read file: {}", e),
                    retry_after_ms: None,
                    context: None,
                })?;
                if let Ok((fm, _)) = parse_frontmatter(&file_content) {
                    knowledge.summary_stale = Some(
                        fm.summary_hash
                            .map_or(true, |stored_hash| stored_hash != current_hash),
                    );
                }
            }
        }
    }

    Ok(knowledge)
}

/// Get single knowledge with full staleness info
pub fn get_knowledge_with_stale(kb_path: &Path, id: &str) -> Result<KnowledgeWithStale, MemoError> {
    let knowledge = get_knowledge_by_id(kb_path, id, LoadLevel::L2)?;
    let summary_stale = knowledge.summary_stale.unwrap_or(false);

    Ok(KnowledgeWithStale {
        knowledge,
        summary_stale,
    })
}

/// Get L1 summary payload for a single knowledge entry
pub fn get_summary(kb_path: &Path, id: &str) -> Result<Knowledge, MemoError> {
    get_knowledge_by_id(kb_path, id, LoadLevel::L1)
}

/// Get content with optional section filtering
pub fn get_content(kb_path: &Path, id: &str, section: Option<&str>) -> Result<String, MemoError> {
    let path = resolve_knowledge_path(kb_path, id)?;
    let k = hydrate_knowledge(kb_path, &path, LoadLevel::L2)?;

    let content = k.content.ok_or_else(|| MemoError {
        code: ErrorCode::NotFoundKnowledge,
        message: "No content available".to_string(),
        retry_after_ms: None,
        context: None,
    })?;

    if let Some(section_title) = section {
        let sections = split_sections(&content);
        sections
            .into_iter()
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
    let category = normalize_category(category);

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

    let id = slugify_title(title);
    let now = chrono::Utc::now();

    // Calculate summary_hash only if summary is provided and non-empty
    let summary_hash = summary
        .as_ref()
        .filter(|s| !s.is_empty())
        .map(|_| calculate_content_hash(content));

    let frontmatter = Frontmatter {
        id: id.clone(),
        title: title.to_string(),
        tags,
        category: category.clone(),
        summary,
        summary_hash,
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
    let desired_relative = match &category {
        Some(category) => format!("{}/{}.md", category, id),
        None => format!("{}.md", id),
    };
    let relative_path = unique_relative_path(kb_path, &desired_relative);
    let path = kb_path.join(&relative_path);
    write_knowledge_file(&path, &full_content)?;

    // Log event (ignore errors in event logging)
    let _ = log_create(kb_path, EventSource::Gui, &relative_path, title);

    Ok(relative_path)
}

/// Update knowledge (partial)
pub fn update_knowledge(
    kb_path: &Path,
    id: &str,
    title: Option<&str>,
    content: Option<&str>,
    tags: Option<Vec<String>>,
    category: Option<&str>,
    summary: Option<&str>,
) -> Result<(), MemoError> {
    let path = resolve_knowledge_path(kb_path, id)?;
    let relative_path = relative_knowledge_path(kb_path, &path)?;
    let current_category = infer_category_from_relative_path(&relative_path);
    let file_content = fs::read_to_string(&path).map_err(|e| MemoError {
        code: ErrorCode::NotFoundKnowledge,
        message: format!("Knowledge not found: {}", e),
        retry_after_ms: None,
        context: None,
    })?;

    let (mut fm, body) = parse_frontmatter(&file_content)?;

    let desired_category = normalize_category(category.map(|value| value.to_string()));
    if let Some(ref target_category) = desired_category {
        if !validate_category_path(kb_path, target_category)? {
            return Err(MemoError {
                code: ErrorCode::NotFoundCategory,
                message: format!("Category '{}' not registered in config", target_category),
                retry_after_ms: None,
                context: None,
            });
        }
    }

    let title_changed = title.is_some_and(|value| fm.title != value);
    let tags_changed = tags.as_ref().is_some_and(|value| fm.tags != *value);
    let content_changed = content.is_some_and(|value| body != value);
    let summary_changed = summary.is_some_and(|value| fm.summary.as_deref() != Some(value));
    let category_changed = desired_category.is_some()
        && (fm.category != desired_category || current_category != desired_category);

    if !title_changed && !tags_changed && !content_changed && !summary_changed && !category_changed
    {
        return Ok(());
    }

    if let Some(t) = title {
        fm.title = t.to_string();
    }
    if let Some(t) = tags {
        fm.tags = t;
    }
    if desired_category.is_some() {
        fm.category = desired_category.clone();
    }

    // Handle summary_hash updates:
    // - When content changes: keep old summary_hash (summary becomes stale)
    // - When summary changes: recalculate hash from current content
    let final_body = content.unwrap_or(&body);

    if let Some(s) = summary {
        fm.summary = Some(s.to_string());
        // Summary was updated, recalculate hash from current content
        fm.summary_hash = Some(calculate_content_hash(final_body));
    } else if content.is_some() {
        // Content was updated but summary wasn't, keep old hash
        // This makes the summary stale
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
    let mut target_path = path.clone();
    let mut final_relative_path = relative_path.clone();
    let mut moved = false;

    if let Some(target_category) = desired_category.as_deref() {
        if current_category.as_deref() != Some(target_category) {
            let file_name = path.file_name().ok_or_else(|| MemoError {
                code: ErrorCode::InvalidPath,
                message: "Knowledge file has no file name".to_string(),
                retry_after_ms: None,
                context: None,
            })?;
            let normalized_target = normalize_key(target_category);
            final_relative_path = format!("{}/{}", normalized_target, file_name.to_string_lossy());
            target_path = kb_path.join(&final_relative_path);

            if let Some(parent) = target_path.parent() {
                fs::create_dir_all(parent)
                    .map_err(|e| io_error("Failed to create category directory", e))?;
            }

            fs::rename(&path, &target_path).map_err(|e| io_error("Failed to move knowledge", e))?;
            moved = true;
        }
    }

    write_knowledge_file(&target_path, &full_content)?;

    if moved {
        let _ = update_references(kb_path, &relative_path, &final_relative_path);
    }

    // Log event (ignore errors in event logging)
    let _ = log_update(kb_path, EventSource::Gui, &final_relative_path, &fm.title);

    Ok(())
}

/// Update metadata only
pub fn update_metadata(
    kb_path: &Path,
    id: &str,
    title: Option<&str>,
    tags: Option<Vec<String>>,
    summary: Option<&str>,
) -> Result<(), MemoError> {
    update_knowledge(kb_path, id, title, None, tags, None, summary)
}

/// Delete knowledge
pub fn delete_knowledge(kb_path: &Path, id: &str) -> Result<(), MemoError> {
    let path = resolve_knowledge_path(kb_path, id)?;

    // Get title before deleting for event logging
    let title = fs::read_to_string(&path)
        .ok()
        .and_then(|content| parse_frontmatter(&content).ok())
        .map(|(fm, _)| fm.title)
        .unwrap_or_else(|| id.to_string());

    fs::remove_file(&path).map_err(|_| MemoError {
        code: ErrorCode::NotFoundKnowledge,
        message: "Knowledge not found".to_string(),
        retry_after_ms: None,
        context: None,
    })?;

    // Log event (ignore errors in event logging)
    let _ = log_delete(kb_path, EventSource::Gui, id, &title);

    Ok(())
}

/// Preview delete operation (dry run)
pub fn preview_delete_knowledge(kb_path: &Path, id: &str) -> Result<DeletePreview, MemoError> {
    let path = resolve_knowledge_path(kb_path, id)?;
    let relative_path = relative_knowledge_path(kb_path, &path)?;

    let content = fs::read_to_string(&path).map_err(|_| MemoError {
        code: ErrorCode::NotFoundKnowledge,
        message: "Knowledge not found".to_string(),
        retry_after_ms: None,
        context: None,
    })?;

    let title = parse_frontmatter(&content)
        .map(|(fm, _)| fm.title)
        .unwrap_or_else(|_| id.to_string());

    let references = find_references(kb_path, &relative_path)?;

    Ok(DeletePreview {
        path: relative_path,
        title,
        references,
    })
}

/// Move knowledge to different category
pub fn move_knowledge(kb_path: &Path, id: &str, new_category_id: &str) -> Result<(), MemoError> {
    if !validate_category_path(kb_path, new_category_id)? {
        return Err(MemoError {
            code: ErrorCode::NotFoundCategory,
            message: format!("Category '{}' not registered in config", new_category_id),
            retry_after_ms: None,
            context: None,
        });
    }
    let old_path = resolve_knowledge_path(kb_path, id)?;
    let file_name = old_path.file_name().ok_or_else(|| MemoError {
        code: ErrorCode::InvalidPath,
        message: "Knowledge file has no file name".to_string(),
        retry_after_ms: None,
        context: None,
    })?;
    let target_relative = format!(
        "{}/{}",
        normalize_key(new_category_id),
        file_name.to_string_lossy()
    );
    move_knowledge_to_relative_path_internal(kb_path, id, &target_relative, false)?;
    Ok(())
}

/// Preview move operation (dry run)
pub fn preview_move_knowledge(
    kb_path: &Path,
    id: &str,
    new_category_id: &str,
) -> Result<MovePreview, MemoError> {
    if !validate_category_path(kb_path, new_category_id)? {
        return Err(MemoError {
            code: ErrorCode::NotFoundCategory,
            message: format!("Category '{}' not registered in config", new_category_id),
            retry_after_ms: None,
            context: None,
        });
    }
    let old_path = resolve_knowledge_path(kb_path, id)?;
    let file_name = old_path.file_name().ok_or_else(|| MemoError {
        code: ErrorCode::InvalidPath,
        message: "Knowledge file has no file name".to_string(),
        retry_after_ms: None,
        context: None,
    })?;
    let target_relative = format!(
        "{}/{}",
        normalize_key(new_category_id),
        file_name.to_string_lossy()
    );
    move_knowledge_to_relative_path_internal(kb_path, id, &target_relative, true)
}

/// Move knowledge to an exact relative path
pub fn move_knowledge_to_path(
    kb_path: &Path,
    id: &str,
    target_relative: &str,
) -> Result<(), MemoError> {
    move_knowledge_to_relative_path_internal(kb_path, id, target_relative, false)?;
    Ok(())
}

/// Preview move to an exact relative path (dry run)
pub fn preview_move_knowledge_to_path(
    kb_path: &Path,
    id: &str,
    target_relative: &str,
) -> Result<MovePreview, MemoError> {
    move_knowledge_to_relative_path_internal(kb_path, id, target_relative, true)
}

/// Search knowledge
pub fn search_knowledge(
    kb_path: &Path,
    query: &str,
    tags: Option<&[String]>,
    category_id: Option<&str>,
    limit: Option<usize>,
) -> Result<Vec<Knowledge>, MemoError> {
    let paginated = list_knowledge(kb_path, LoadLevel::L2, category_id, tags, None, None)?;
    let query_lower = query.to_lowercase();

    let mut results: Vec<_> = paginated
        .items
        .into_iter()
        .filter(|k| {
            k.title.to_lowercase().contains(&query_lower)
                || k.content
                    .as_ref()
                    .map_or(false, |c| c.to_lowercase().contains(&query_lower))
        })
        .collect();

    if let Some(l) = limit {
        results.truncate(l);
    }
    Ok(results)
}

pub fn complete_knowledge_links(
    kb_path: &Path,
    query: &str,
    limit: Option<usize>,
) -> Result<Vec<KnowledgeLinkCompletion>, MemoError> {
    let paginated = list_knowledge(kb_path, LoadLevel::L1, None, None, None, None)?;
    let query = query.trim().to_lowercase();
    let limit = limit.unwrap_or(20);

    let mut matches: Vec<(i32, KnowledgeLinkCompletion)> = paginated
        .items
        .into_iter()
        .filter_map(|knowledge| {
            let id_lower = knowledge.id.to_lowercase();
            let title_lower = knowledge.title.to_lowercase();

            let score = if query.is_empty() {
                Some(0)
            } else if id_lower.starts_with(&query) {
                Some(400)
            } else if title_lower.starts_with(&query) {
                Some(300)
            } else if id_lower.contains(&query) {
                Some(200)
            } else if title_lower.contains(&query) {
                Some(100)
            } else {
                None
            }?;

            Some((
                score,
                KnowledgeLinkCompletion {
                    id: knowledge.id,
                    title: knowledge.title,
                    summary: knowledge.summary,
                    category: knowledge.category,
                },
            ))
        })
        .collect();

    matches.sort_by(|left, right| {
        right
            .0
            .cmp(&left.0)
            .then_with(|| left.1.id.cmp(&right.1.id))
            .then_with(|| left.1.title.cmp(&right.1.title))
    });

    matches.truncate(limit);

    Ok(matches.into_iter().map(|(_, item)| item).collect())
}

/// Regex or substring grep over knowledge content
pub fn grep(
    kb_path: &Path,
    query: &str,
    tags: Option<&[String]>,
    category_id: Option<&str>,
    limit: Option<usize>,
) -> Result<Vec<GrepMatch>, MemoError> {
    // Parse tags from query (tag:xxx syntax)
    let (parsed_tags, clean_query) = parse_tags_from_query(query);

    // Merge parsed tags with provided tags
    let effective_tags: Option<Vec<String>> = if let Some(existing) = tags {
        let mut merged = existing.to_vec();
        merged.extend(parsed_tags.clone());
        if merged.is_empty() {
            None
        } else {
            Some(merged)
        }
    } else if parsed_tags.is_empty() {
        None
    } else {
        Some(parsed_tags.clone())
    };

    let paginated = list_knowledge(
        kb_path,
        LoadLevel::L2,
        category_id,
        effective_tags.as_deref(),
        None,
        None,
    )?;
    if clean_query.is_empty() {
        let mut matches = Vec::new();
        for knowledge in paginated.items {
            matches.push(GrepMatch {
                id: knowledge.id.clone(),
                title: knowledge.title.clone(),
                line_number: 1,
                line: knowledge.summary.unwrap_or_else(|| knowledge.title.clone()),
            });
            if let Some(limit) = limit {
                if matches.len() >= limit {
                    break;
                }
            }
        }
        return Ok(matches);
    }

    let regex = Regex::new(&clean_query).unwrap_or_else(|_| {
        Regex::new(&regex::escape(&clean_query)).expect("escaped regex should compile")
    });

    let mut matches = Vec::new();
    for knowledge in paginated.items {
        let Some(content) = knowledge.content.as_ref() else {
            continue;
        };

        for (index, line) in content.lines().enumerate() {
            if regex.is_match(line) || line.to_lowercase().contains(&clean_query.to_lowercase()) {
                matches.push(GrepMatch {
                    id: knowledge.id.clone(),
                    title: knowledge.title.clone(),
                    line_number: index + 1,
                    line: line.to_string(),
                });

                if let Some(limit) = limit {
                    if matches.len() >= limit {
                        return Ok(matches);
                    }
                }
            }
        }
    }

    Ok(matches)
}

/// Parse tags from query string (tag:xxx syntax)
/// Returns (tags, clean_query)
fn parse_tags_from_query(query: &str) -> (Vec<String>, String) {
    let tag_pattern = Regex::new(r"tag:(\S+)").unwrap();
    let mut tags = Vec::new();

    // Extract all tag:xxx patterns
    for cap in tag_pattern.captures_iter(query) {
        if let Some(tag) = cap.get(1) {
            tags.push(tag.as_str().to_string());
        }
    }

    // Remove tag:xxx patterns from query
    let clean_query = tag_pattern.replace_all(query, "").trim().to_string();

    (tags, clean_query)
}

/// Load categories from config
pub fn list_categories(kb_path: &Path) -> Result<Vec<Category>, MemoError> {
    let config = load_config(kb_path)?;
    let knowledge = list_knowledge(kb_path, LoadLevel::L0, None, None, None, None)?;

    Ok(config
        .categories
        .iter()
        .map(|c| {
            let count = knowledge
                .items
                .iter()
                .filter(|entry| {
                    let category = entry.category.as_deref().unwrap_or_default();
                    category == c.name
                        || category == c.id
                        || entry.id.starts_with(&format!("{}/", c.name))
                })
                .count();

            Category {
                id: c.id.clone(),
                name: c.name.clone(),
                parent_id: c.parent_id.clone(),
                count: Some(count),
                description: c.description.clone(),
            }
        })
        .collect())
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
        count: None,
        description: description.clone(),
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
    let cat = config
        .categories
        .iter_mut()
        .find(|c| c.id == id)
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
    let paginated = list_knowledge(kb_path, LoadLevel::L0, None, None, None, None)?;
    let knowledge_count = paginated.total;
    let category_count = list_categories(kb_path)?.len();
    let git_initialized = kb_path.join(".git").exists();
    Ok((knowledge_count, category_count, git_initialized))
}

/// Get all tags from knowledge base
pub fn get_tags(kb_path: &Path, prefix: Option<&str>) -> Result<Vec<String>, MemoError> {
    use std::collections::HashSet;

    let mut tags = HashSet::new();
    for path in collect_markdown_files(kb_path)? {
        if let Ok(knowledge) = hydrate_knowledge(kb_path, &path, LoadLevel::L1) {
            for tag in knowledge.tags {
                if let Some(prefix) = prefix {
                    if tag.starts_with(prefix) {
                        tags.insert(tag);
                    }
                } else {
                    tags.insert(tag);
                }
            }
        }
    }

    let mut result: Vec<String> = tags.into_iter().collect();
    result.sort();
    Ok(result)
}

/// Get all tags with counts
pub fn get_tags_with_counts(kb_path: &Path) -> Result<Vec<(String, usize)>, MemoError> {
    use std::collections::HashMap;

    let mut tag_counts = HashMap::new();
    for path in collect_markdown_files(kb_path)? {
        if let Ok(knowledge) = hydrate_knowledge(kb_path, &path, LoadLevel::L1) {
            for tag in knowledge.tags {
                *tag_counts.entry(tag).or_insert(0) += 1;
            }
        }
    }

    let mut result: Vec<(String, usize)> = tag_counts.into_iter().collect();
    result.sort_by(|a, b| a.0.cmp(&b.0));
    Ok(result)
}

/// 获取知识图谱
///
/// 返回所有知识节点和它们之间的关系边
pub fn get_knowledge_graph(kb_path: &Path) -> Result<KnowledgeGraph, MemoError> {
    build_knowledge_graph(kb_path)
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

    #[test]
    fn test_update_knowledge_moves_file_when_category_changes() {
        let temp = tempfile::tempdir().unwrap();
        let kb_path = temp.path();

        crate::init::init_new(kb_path, false).unwrap();
        crate::config::save_config(
            kb_path,
            &crate::config::Config {
                version: "1.0".to_string(),
                categories: vec![
                    crate::config::CategoryConfig {
                        id: "programming".to_string(),
                        name: "编程技术".to_string(),
                        path: "programming".to_string(),
                        parent_id: None,
                        description: None,
                    },
                    crate::config::CategoryConfig {
                        id: "tools".to_string(),
                        name: "工具使用".to_string(),
                        path: "tools".to_string(),
                        parent_id: None,
                        description: None,
                    },
                ],
                metadata: None,
            },
        )
        .unwrap();

        let id = create_knowledge(
            kb_path,
            "Move Me",
            "# Original",
            vec![],
            Some("programming".to_string()),
            None,
        )
        .unwrap();

        update_knowledge(
            kb_path,
            &id,
            None,
            Some("# Updated"),
            None,
            Some("tools"),
            None,
        )
        .unwrap();

        assert!(!kb_path.join("programming/move-me.md").exists());
        assert!(kb_path.join("tools/move-me.md").exists());

        let knowledge = get_knowledge_by_id(kb_path, "tools/move-me.md", LoadLevel::L2).unwrap();
        assert_eq!(knowledge.category.as_deref(), Some("tools"));
        assert_eq!(knowledge.content.as_deref(), Some("# Updated"));
    }

    #[test]
    fn test_update_knowledge_noop_does_not_rewrite_file() {
        let temp = tempfile::tempdir().unwrap();
        let kb_path = temp.path();

        crate::init::init_new(kb_path, false).unwrap();
        crate::config::save_config(
            kb_path,
            &crate::config::Config {
                version: "1.0".to_string(),
                categories: vec![crate::config::CategoryConfig {
                    id: "programming".to_string(),
                    name: "编程技术".to_string(),
                    path: "programming".to_string(),
                    parent_id: None,
                    description: None,
                }],
                metadata: None,
            },
        )
        .unwrap();

        let id = create_knowledge(
            kb_path,
            "Stable Note",
            "# Stable",
            vec!["Rust".to_string()],
            Some("programming".to_string()),
            Some("summary".to_string()),
        )
        .unwrap();

        let path = kb_path.join(&id);
        let before = fs::read_to_string(&path).unwrap();

        update_knowledge(
            kb_path,
            &id,
            Some("Stable Note"),
            Some("# Stable"),
            Some(vec!["Rust".to_string()]),
            Some("programming"),
            Some("summary"),
        )
        .unwrap();

        let after = fs::read_to_string(&path).unwrap();
        assert_eq!(before, after);
    }

    #[test]
    fn test_move_knowledge_to_path_renames_file_and_updates_path_links() {
        let temp = tempfile::tempdir().unwrap();
        let kb_path = temp.path();

        crate::init::init_new(kb_path, false).unwrap();
        crate::config::save_config(
            kb_path,
            &crate::config::Config {
                version: "1.0".to_string(),
                categories: vec![
                    crate::config::CategoryConfig {
                        id: "programming".to_string(),
                        name: "编程技术".to_string(),
                        path: "programming".to_string(),
                        parent_id: None,
                        description: None,
                    },
                    crate::config::CategoryConfig {
                        id: "tools".to_string(),
                        name: "工具使用".to_string(),
                        path: "tools".to_string(),
                        parent_id: None,
                        description: None,
                    },
                ],
                metadata: None,
            },
        )
        .unwrap();

        fs::create_dir_all(kb_path.join("programming")).unwrap();
        fs::create_dir_all(kb_path.join("tools")).unwrap();

        fs::write(
            kb_path.join("programming/source.md"),
            r#"---
id: source
title: Source
tags: []
category: programming
created_at: 2026-03-23T10:00:00Z
updated_at: 2026-03-23T11:00:00Z
---
# Source

content"#,
        )
        .unwrap();

        fs::write(
            kb_path.join("programming/referrer.md"),
            r#"---
id: referrer
title: Referrer
tags: []
category: programming
created_at: 2026-03-23T10:00:00Z
updated_at: 2026-03-23T11:00:00Z
---
# Referrer

See [[programming/source.md]] and [[source]]."#,
        )
        .unwrap();

        let preview = preview_move_knowledge_to_path(
            kb_path,
            "programming/source.md",
            "tools/source-renamed.md",
        )
        .unwrap();
        assert_eq!(preview.old_path, "programming/source.md");
        assert_eq!(preview.new_path, "tools/source-renamed.md");
        assert_eq!(preview.references.len(), 1);

        move_knowledge_to_path(kb_path, "programming/source.md", "tools/source-renamed.md")
            .unwrap();

        assert!(!kb_path.join("programming/source.md").exists());
        assert!(kb_path.join("tools/source-renamed.md").exists());

        let moved = get_knowledge_by_id(kb_path, "tools/source-renamed.md", LoadLevel::L2).unwrap();
        assert_eq!(moved.category.as_deref(), Some("tools"));

        let referrer = fs::read_to_string(kb_path.join("programming/referrer.md")).unwrap();
        assert!(referrer.contains("[[tools/source-renamed.md]]"));
        assert!(referrer.contains("[[source-renamed]]"));
        assert!(!referrer.contains("[[programming/source.md]]"));
    }

    #[test]
    fn test_complete_knowledge_links_prioritizes_path_prefix() {
        let temp = tempfile::tempdir().unwrap();
        let kb_path = temp.path();

        crate::init::init_new(kb_path, false).unwrap();
        crate::config::save_config(
            kb_path,
            &crate::config::Config {
                version: "1.0".to_string(),
                categories: vec![
                    crate::config::CategoryConfig {
                        id: "programming/rust".to_string(),
                        name: "Rust".to_string(),
                        path: "programming/rust".to_string(),
                        parent_id: None,
                        description: None,
                    },
                    crate::config::CategoryConfig {
                        id: "notes".to_string(),
                        name: "Notes".to_string(),
                        path: "notes".to_string(),
                        parent_id: None,
                        description: None,
                    },
                ],
                metadata: None,
            },
        )
        .unwrap();

        fs::create_dir_all(kb_path.join("programming/rust")).unwrap();
        fs::create_dir_all(kb_path.join("notes")).unwrap();

        create_knowledge(
            kb_path,
            "Async Patterns",
            "# Async",
            vec![],
            Some("programming/rust".to_string()),
            Some("Rust async patterns".to_string()),
        )
        .unwrap();

        create_knowledge(
            kb_path,
            "Patterns Overview",
            "# Patterns",
            vec![],
            Some("notes".to_string()),
            Some("General patterns".to_string()),
        )
        .unwrap();

        let results =
            complete_knowledge_links(kb_path, "programming/rust/async", Some(10)).unwrap();

        assert!(!results.is_empty());
        assert!(results[0].id.contains("programming/rust/async-patterns"));
    }
}
