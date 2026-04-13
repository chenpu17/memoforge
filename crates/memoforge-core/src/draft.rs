//! Draft workflow for AI-assisted editing
//!
//! Provides a draft system that allows AI agents to stage changes to knowledge
//! files before committing them. Drafts support conflict detection via content
//! hashing and are stored in `.memoforge/drafts/`.

use crate::document_ops::{
    append_section, apply_metadata_patch, generate_diff_summary, read_sections, remove_section,
    replace_section, DiffSummary, SectionInfo,
};
use crate::error::{ErrorCode, MemoError};
use crate::events::{log_update, EventSource};
use crate::frontmatter::parse_frontmatter;
use crate::fs::write_knowledge_file;
use crate::inbox::InboxItem;
use crate::models::Frontmatter;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs;
use std::path::{Component, Path};

/// Unique identifier for a draft (format: `draft_{uuid}`).
pub type DraftId = String;

/// The target of a draft operation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DraftTarget {
    /// Path of the knowledge file this draft targets (None for new knowledge).
    pub path: Option<String>,
    /// Whether this draft is for a new (not yet existing) knowledge file.
    pub is_new: bool,
}

/// A single operation within a draft.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum DraftOperation {
    /// Set the entire content of the knowledge body.
    SetContent { content: String },
    /// Append a new section to the end of the content.
    AppendSection {
        heading: String,
        level: usize,
        body: String,
    },
    /// Replace the body of an existing section.
    ReplaceSection { heading: String, new_body: String },
    /// Remove a section by heading title.
    RemoveSection { heading: String },
    /// Update metadata fields (title, tags, summary).
    UpdateMetadata { patch: serde_json::Value },
}

/// Preview of what a draft commit would do.
#[derive(Debug, Clone, Serialize)]
pub struct DraftPreview {
    /// Number of sections that changed.
    pub sections_changed: usize,
    /// Whether the summary will become stale after commit.
    pub summary_will_be_stale: bool,
    /// Warnings about potential issues.
    pub warnings: Vec<String>,
    /// Detailed diff summary.
    pub diff_summary: DiffSummary,
}

/// A draft file stored in `.memoforge/drafts/`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DraftFile {
    /// Unique draft identifier.
    pub draft_id: DraftId,
    /// Target knowledge file.
    pub target: DraftTarget,
    /// SHA-256 hash of the base file content when the draft was created.
    /// Used for conflict detection during commit.
    pub base_revision: Option<String>,
    /// Metadata patch to apply on commit (title, tags, summary).
    pub metadata: Option<serde_json::Value>,
    /// Current working content (accumulated result of all ops).
    pub content: String,
    /// Operations applied so far (for audit trail).
    pub ops: Vec<DraftOperation>,
    /// When this draft was created.
    pub created_at: DateTime<Utc>,
    /// When this draft was last updated.
    pub updated_at: DateTime<Utc>,
    /// Agent that created this draft.
    pub source_agent: String,
}

/// Result of a successful draft commit.
#[derive(Debug, Clone, Serialize)]
pub struct CommitResult {
    /// The draft ID that was committed.
    pub draft_id: DraftId,
    /// The path of the committed knowledge file.
    pub path: String,
    /// Number of sections that changed.
    pub changed_sections: usize,
}

/// Result of reading knowledge with unified fields.
#[derive(Debug, Clone, Serialize)]
pub struct ReadKnowledgeResult {
    /// Knowledge metadata.
    pub metadata: Frontmatter,
    /// Knowledge body content.
    pub content: Option<String>,
    /// Section info list.
    pub sections: Vec<SectionInfo>,
    /// Whether the summary is stale.
    pub summary_stale: bool,
}

/// Default TTL for drafts in seconds (24 hours).
const DRAFT_TTL_SECS: i64 = 24 * 60 * 60;

pub(crate) fn drafts_dir(kb_path: &Path) -> std::path::PathBuf {
    kb_path.join(".memoforge/drafts")
}

pub(crate) fn draft_path(kb_path: &Path, draft_id: &str) -> Result<std::path::PathBuf, MemoError> {
    crate::error::validate_storage_id(draft_id, "draft ID")?;
    Ok(drafts_dir(kb_path).join(format!("{}.json", draft_id)))
}

fn normalize_target_path(path: &str) -> Result<String, MemoError> {
    let normalized = path.trim().trim_matches('/').replace('\\', "/");
    if normalized.is_empty() {
        return Err(MemoError {
            code: ErrorCode::InvalidPath,
            message: "Draft target path cannot be empty".to_string(),
            retry_after_ms: None,
            context: None,
        });
    }

    let candidate = Path::new(&normalized);
    if candidate.is_absolute() {
        return Err(MemoError {
            code: ErrorCode::InvalidPath,
            message: format!("Draft target path must be relative: {}", normalized),
            retry_after_ms: None,
            context: None,
        });
    }

    for component in candidate.components() {
        match component {
            Component::Normal(_) | Component::CurDir => {}
            Component::ParentDir | Component::RootDir | Component::Prefix(_) => {
                return Err(MemoError {
                    code: ErrorCode::InvalidPath,
                    message: format!("Invalid draft target path: {}", normalized),
                    retry_after_ms: None,
                    context: None,
                });
            }
        }
    }

    if normalized.ends_with(".md") {
        Ok(normalized)
    } else {
        Ok(format!("{}.md", normalized))
    }
}

fn relative_path_from_kb(kb_path: &Path, full_path: &Path) -> Result<String, MemoError> {
    full_path
        .strip_prefix(kb_path)
        .map(|path| path.to_string_lossy().replace('\\', "/"))
        .map_err(|_| MemoError {
            code: ErrorCode::InvalidPath,
            message: format!(
                "Knowledge file is outside of the knowledge base: {}",
                full_path.display()
            ),
            retry_after_ms: None,
            context: None,
        })
}

fn content_hash(content: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(content.as_bytes());
    let result = hasher.finalize();
    hex::encode(&result[..16])
}

fn new_draft_id() -> DraftId {
    format!("draft_{}", uuid::Uuid::new_v4())
}

fn merge_metadata_patch(
    existing: Option<serde_json::Value>,
    patch: &serde_json::Value,
) -> serde_json::Value {
    let mut merged = match existing {
        Some(serde_json::Value::Object(map)) => map,
        _ => serde_json::Map::new(),
    };

    if let serde_json::Value::Object(patch_map) = patch {
        for (key, value) in patch_map {
            merged.insert(key.clone(), value.clone());
        }
    }

    serde_json::Value::Object(merged)
}

fn merge_metadata_object(
    existing: Option<serde_json::Value>,
    patch: serde_json::Value,
) -> Option<serde_json::Value> {
    Some(merge_metadata_patch(existing, &patch))
}

fn apply_review_metadata(
    draft: &mut DraftFile,
    state: &str,
    notes: Option<String>,
    source_inbox_item_id: Option<String>,
    source_session_id: Option<String>,
) {
    let review = serde_json::json!({
        "state": state,
        "notes": notes,
        "source_inbox_item_id": source_inbox_item_id,
        "source_session_id": source_session_id,
    });
    draft.metadata = merge_metadata_object(
        draft.metadata.take(),
        serde_json::json!({ "review": review }),
    );
}

fn write_new_knowledge_at_target(
    kb_path: &Path,
    target_path: &str,
    draft: &DraftFile,
    metadata: &serde_json::Value,
) -> Result<String, MemoError> {
    let relative_path = normalize_target_path(target_path)?;
    let full_path = kb_path.join(&relative_path);
    if full_path.exists() {
        return Err(MemoError {
            code: ErrorCode::ConflictFileLocked,
            message: format!(
                "Conflict detected: '{}' already exists. The draft has been preserved.",
                relative_path
            ),
            retry_after_ms: None,
            context: Some(serde_json::json!({
                "draft_id": draft.draft_id,
                "path": relative_path,
            })),
        });
    }

    let title = metadata
        .get("title")
        .and_then(|value| value.as_str())
        .unwrap_or("Untitled")
        .to_string();
    let tags = metadata
        .get("tags")
        .and_then(|value| value.as_array())
        .map(|items| {
            items
                .iter()
                .filter_map(|item| item.as_str().map(String::from))
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    let category = Path::new(&relative_path).parent().and_then(|parent| {
        let normalized = parent.to_string_lossy().replace('\\', "/");
        if normalized.is_empty() {
            None
        } else {
            Some(normalized)
        }
    });
    if let Some(ref category_id) = category {
        if !crate::config::validate_category_path(kb_path, category_id)? {
            return Err(MemoError {
                code: ErrorCode::NotFoundCategory,
                message: format!("Category '{}' not registered in config", category_id),
                retry_after_ms: None,
                context: None,
            });
        }
    }

    let summary = metadata
        .get("summary")
        .and_then(|value| value.as_str())
        .map(String::from);
    let summary_hash = summary
        .as_ref()
        .filter(|value| !value.is_empty())
        .map(|_| content_hash(&draft.content));
    let id = Path::new(&relative_path)
        .file_stem()
        .and_then(|stem| stem.to_str())
        .unwrap_or("untitled")
        .to_string();
    let now = Utc::now();
    let frontmatter = Frontmatter {
        id,
        title: title.clone(),
        tags,
        category,
        summary,
        summary_hash,
        created_at: now,
        updated_at: now,
        evidence: None,
        freshness: None,
    };
    let fm_yaml = serde_yaml::to_string(&frontmatter).map_err(|e| MemoError {
        code: ErrorCode::InvalidPath,
        message: format!("Failed to serialize frontmatter: {}", e),
        retry_after_ms: None,
        context: None,
    })?;
    let full_content = format!("---\n{}---\n{}", fm_yaml, draft.content);
    write_knowledge_file(&full_path, &full_content)?;
    let _ = crate::events::log_create(kb_path, EventSource::Mcp, &relative_path, &title);
    Ok(relative_path)
}

/// Ensure the drafts directory exists and is in .gitignore.
fn ensure_drafts_dir(kb_path: &Path) -> Result<(), MemoError> {
    let dir = drafts_dir(kb_path);
    fs::create_dir_all(&dir).map_err(|e| MemoError {
        code: ErrorCode::InvalidPath,
        message: format!("Failed to create drafts directory: {}", e),
        retry_after_ms: None,
        context: None,
    })?;

    // Ensure .memoforge/.gitignore includes drafts/
    let gitignore_path = kb_path.join(".memoforge/.gitignore");
    let gitignore_content = if gitignore_path.exists() {
        fs::read_to_string(&gitignore_path).unwrap_or_default()
    } else {
        String::new()
    };

    if !gitignore_content.lines().any(|l| l.trim() == "drafts/") {
        let new_content = if gitignore_content.is_empty() {
            "drafts/\n".to_string()
        } else if gitignore_content.ends_with('\n') {
            format!("{}drafts/\n", gitignore_content)
        } else {
            format!("{}\ndrafts/\n", gitignore_content)
        };
        fs::write(&gitignore_path, new_content).map_err(|e| MemoError {
            code: ErrorCode::InvalidPath,
            message: format!("Failed to write .gitignore: {}", e),
            retry_after_ms: None,
            context: None,
        })?;
    }

    Ok(())
}

fn load_draft(kb_path: &Path, draft_id: &str) -> Result<DraftFile, MemoError> {
    let path = draft_path(kb_path, draft_id)?;
    if !path.exists() {
        return Err(MemoError {
            code: ErrorCode::NotFoundKnowledge,
            message: format!("Draft '{}' not found", draft_id),
            retry_after_ms: None,
            context: None,
        });
    }
    let content = fs::read_to_string(&path).map_err(|e| MemoError {
        code: ErrorCode::NotFoundKnowledge,
        message: format!("Failed to read draft: {}", e),
        retry_after_ms: None,
        context: None,
    })?;
    serde_json::from_str(&content).map_err(|e| MemoError {
        code: ErrorCode::InvalidData,
        message: format!("Failed to parse draft: {}", e),
        retry_after_ms: None,
        context: None,
    })
}

fn save_draft(kb_path: &Path, draft: &DraftFile) -> Result<(), MemoError> {
    ensure_drafts_dir(kb_path)?;
    let path = draft_path(kb_path, &draft.draft_id)?;
    let json = serde_json::to_string_pretty(draft).map_err(|e| MemoError {
        code: ErrorCode::InvalidData,
        message: format!("Failed to serialize draft: {}", e),
        retry_after_ms: None,
        context: None,
    })?;
    fs::write(&path, json).map_err(|e| MemoError {
        code: ErrorCode::InvalidPath,
        message: format!("Failed to write draft: {}", e),
        retry_after_ms: None,
        context: None,
    })
}

fn delete_draft_file(kb_path: &Path, draft_id: &str) -> Result<(), MemoError> {
    let path = draft_path(kb_path, draft_id)?;
    if path.exists() {
        fs::remove_file(&path).map_err(|e| MemoError {
            code: ErrorCode::InvalidPath,
            message: format!("Failed to delete draft: {}", e),
            retry_after_ms: None,
            context: None,
        })?;
    }
    Ok(())
}

/// Read knowledge with unified fields including metadata, content, sections, and staleness.
pub fn read_knowledge_unified(
    kb_path: &Path,
    path: &str,
    level: crate::models::LoadLevel,
    section: Option<&str>,
    include_metadata: bool,
    include_stale: bool,
) -> Result<ReadKnowledgeResult, MemoError> {
    let resolved = crate::api::get_knowledge_by_id(kb_path, path, level)?;
    let content = resolved.content.clone();

    // If a specific section is requested, filter content
    let effective_content =
        if let (Some(section_title), Some(ref full_content)) = (section, &content) {
            let sections = crate::knowledge::split_sections(full_content);
            sections
                .into_iter()
                .find(|s| s.title == section_title)
                .map(|s| s.content)
                .ok_or_else(|| MemoError {
                    code: ErrorCode::NotFoundKnowledge,
                    message: format!("Section '{}' not found", section_title),
                    retry_after_ms: None,
                    context: None,
                })?
        } else {
            content.clone().unwrap_or_default()
        };

    let sections = read_sections(content.as_deref().unwrap_or(&effective_content));

    let summary_stale = if include_stale {
        resolved.summary_stale.unwrap_or(false)
    } else {
        false
    };

    let metadata = if include_metadata {
        // Load full frontmatter from file
        let resolved_path = resolve_knowledge_file_path(kb_path, path)?;
        let file_content = fs::read_to_string(&resolved_path).map_err(|e| MemoError {
            code: ErrorCode::NotFoundKnowledge,
            message: format!("Failed to read file: {}", e),
            retry_after_ms: None,
            context: None,
        })?;
        let (fm, _) = parse_frontmatter(&file_content)?;
        fm
    } else {
        // Build a minimal frontmatter from the knowledge struct
        Frontmatter {
            id: resolved.id.clone(),
            title: resolved.title.clone(),
            tags: resolved.tags.clone(),
            category: resolved.category.clone(),
            summary: resolved.summary.clone(),
            summary_hash: None,
            created_at: resolved.created_at,
            updated_at: resolved.updated_at,
            evidence: None,
            freshness: None,
        }
    };

    Ok(ReadKnowledgeResult {
        metadata,
        content: if level == crate::models::LoadLevel::L2 {
            Some(effective_content)
        } else {
            None
        },
        sections,
        summary_stale,
    })
}

/// Resolve knowledge file path from a relative path or ID.
fn resolve_knowledge_file_path(kb_path: &Path, id: &str) -> Result<std::path::PathBuf, MemoError> {
    let normalized = id.trim().trim_matches('/').replace('\\', "/");
    if normalized.is_empty() {
        return Err(MemoError {
            code: ErrorCode::InvalidPath,
            message: "Knowledge identifier cannot be empty".to_string(),
            retry_after_ms: None,
            context: None,
        });
    }

    // Try direct path first
    let mut candidates = vec![kb_path.join(&normalized)];
    if !normalized.ends_with(".md") {
        candidates.push(kb_path.join(format!("{}.md", normalized)));
    }

    for candidate in &candidates {
        if candidate.exists() {
            return Ok(candidate.clone());
        }
    }

    // Fall back to api's resolution
    crate::api::get_knowledge_by_id(kb_path, id, crate::models::LoadLevel::L0)?;
    // If we got here without error, try to find the actual file
    Err(MemoError {
        code: ErrorCode::NotFoundKnowledge,
        message: format!("Knowledge file not found: {}", id),
        retry_after_ms: None,
        context: None,
    })
}

/// Create a new draft for editing a knowledge file.
///
/// If `path` is Some, the draft targets an existing knowledge file.
/// If `path` is None, the draft is for a new knowledge file.
pub fn start_draft(
    kb_path: &Path,
    path: Option<&str>,
    metadata: Option<serde_json::Value>,
    source_agent: &str,
) -> Result<DraftId, MemoError> {
    ensure_drafts_dir(kb_path)?;

    let draft_id = new_draft_id();
    let now = Utc::now();

    let (target, base_revision, initial_content) = if let Some(p) = path {
        match resolve_knowledge_file_path(kb_path, p) {
            Ok(resolved) => {
                let file_content = fs::read_to_string(&resolved).map_err(|e| MemoError {
                    code: ErrorCode::NotFoundKnowledge,
                    message: format!("Failed to read knowledge file: {}", e),
                    retry_after_ms: None,
                    context: None,
                })?;
                let (_, body) = parse_frontmatter(&file_content)?;
                let hash = content_hash(&file_content);

                (
                    DraftTarget {
                        path: Some(relative_path_from_kb(kb_path, &resolved)?),
                        is_new: false,
                    },
                    Some(hash),
                    body,
                )
            }
            Err(err) if err.code == ErrorCode::NotFoundKnowledge => (
                DraftTarget {
                    path: Some(normalize_target_path(p)?),
                    is_new: true,
                },
                None,
                String::new(),
            ),
            Err(err) => return Err(err),
        }
    } else {
        (
            DraftTarget {
                path: None,
                is_new: true,
            },
            None,
            String::new(),
        )
    };

    let draft = DraftFile {
        draft_id: draft_id.clone(),
        target,
        base_revision,
        metadata,
        content: initial_content,
        ops: Vec::new(),
        created_at: now,
        updated_at: now,
        source_agent: source_agent.to_string(),
    };

    save_draft(kb_path, &draft)?;
    Ok(draft_id)
}

/// Update a draft by applying an operation.
///
/// The operation is applied to the draft's working content immediately,
/// and recorded in the ops list for audit trail.
pub fn update_draft(
    kb_path: &Path,
    draft_id: &str,
    operation: DraftOperation,
) -> Result<DraftFile, MemoError> {
    let mut draft = load_draft(kb_path, draft_id)?;

    let new_content = match &operation {
        DraftOperation::SetContent { content } => content.clone(),
        DraftOperation::AppendSection {
            heading,
            level,
            body,
        } => append_section(&draft.content, heading, *level, body)?,
        DraftOperation::ReplaceSection { heading, new_body } => {
            replace_section(&draft.content, heading, new_body)?
        }
        DraftOperation::RemoveSection { heading } => remove_section(&draft.content, heading)?,
        DraftOperation::UpdateMetadata { patch } => {
            // Merge metadata incrementally so later patches don't discard
            // values supplied at draft creation time or by prior updates.
            draft.metadata = Some(merge_metadata_patch(draft.metadata.take(), patch));
            draft.content.clone() // content unchanged
        }
    };

    draft.content = new_content;
    draft.ops.push(operation);
    draft.updated_at = Utc::now();

    save_draft(kb_path, &draft)?;
    Ok(draft)
}

/// Preview what a draft commit would do.
///
/// Shows section changes, staleness, and warnings without modifying anything.
pub fn preview_draft(kb_path: &Path, draft_id: &str) -> Result<DraftPreview, MemoError> {
    let draft = load_draft(kb_path, draft_id)?;

    let mut warnings = Vec::new();

    // Get original content for comparison
    let (original_content, _) = if let Some(ref path) = draft.target.path {
        match resolve_knowledge_file_path(kb_path, path) {
            Ok(resolved) => match fs::read_to_string(&resolved) {
                Ok(file_content) => {
                    let hash = content_hash(&file_content);
                    match parse_frontmatter(&file_content) {
                        Ok((_, body)) => (body, Some(hash)),
                        Err(_) => (String::new(), None),
                    }
                }
                Err(_) => (String::new(), None),
            },
            Err(_) => (String::new(), None),
        }
    } else {
        (String::new(), None)
    };

    // Check for conflicts
    if let (Some(ref base_rev), Some(ref path)) = (&draft.base_revision, &draft.target.path) {
        if let Ok(resolved) = resolve_knowledge_file_path(kb_path, path) {
            if let Ok(file_content) = fs::read_to_string(&resolved) {
                let current_hash = content_hash(&file_content);
                if &current_hash != base_rev {
                    warnings.push(
                        "Source file has been modified since this draft was created. \
                         Commit may fail due to conflict."
                            .to_string(),
                    );
                }
            }
        }
    }

    let diff_summary = generate_diff_summary(&original_content, &draft.content);

    // Determine if summary will be stale
    let summary_will_be_stale = if let Some(ref path) = draft.target.path {
        if let Ok(resolved) = resolve_knowledge_file_path(kb_path, path) {
            if let Ok(file_content) = fs::read_to_string(&resolved) {
                if let Ok((fm, _)) = parse_frontmatter(&file_content) {
                    // Summary is stale if content changed and summary exists
                    fm.summary.is_some() && diff_summary.sections_changed > 0
                } else {
                    false
                }
            } else {
                false
            }
        } else {
            false
        }
    } else {
        false
    };

    Ok(DraftPreview {
        sections_changed: diff_summary.sections_changed,
        summary_will_be_stale,
        warnings,
        diff_summary,
    })
}

/// Commit a draft, applying all staged changes to the knowledge file.
///
/// For existing knowledge: performs conflict detection via base_revision hash.
/// For new knowledge: creates the file using metadata from the draft.
pub fn commit_draft(kb_path: &Path, draft_id: &str) -> Result<CommitResult, MemoError> {
    let draft = load_draft(kb_path, draft_id)?;

    match (draft.target.is_new, &draft.target.path) {
        (true, Some(target_path)) => {
            let metadata = draft.metadata.clone().unwrap_or(serde_json::json!({}));
            let path = write_new_knowledge_at_target(kb_path, target_path, &draft, &metadata)?;
            let changed = read_sections(&draft.content).len();
            delete_draft_file(kb_path, draft_id)?;

            Ok(CommitResult {
                draft_id: draft_id.to_string(),
                path,
                changed_sections: changed,
            })
        }
        (true, None) => {
            // New knowledge: create from scratch
            let metadata = draft.metadata.unwrap_or(serde_json::json!({}));
            let title = metadata
                .get("title")
                .and_then(|v| v.as_str())
                .unwrap_or("Untitled")
                .to_string();
            let tags = metadata
                .get("tags")
                .and_then(|v| v.as_array())
                .map(|arr| {
                    arr.iter()
                        .filter_map(|v| v.as_str().map(String::from))
                        .collect()
                })
                .unwrap_or_default();
            let category = metadata
                .get("category")
                .and_then(|v| v.as_str())
                .map(String::from);
            let summary = metadata
                .get("summary")
                .and_then(|v| v.as_str())
                .map(String::from);

            let path = crate::api::create_knowledge(
                kb_path,
                &title,
                &draft.content,
                tags,
                category,
                summary,
            )?;

            let changed = read_sections(&draft.content).len();
            delete_draft_file(kb_path, draft_id)?;

            Ok(CommitResult {
                draft_id: draft_id.to_string(),
                path,
                changed_sections: changed,
            })
        }
        (false, Some(ref path)) => {
            // Existing knowledge: check for conflicts
            let resolved = resolve_knowledge_file_path(kb_path, path)?;
            let file_content = fs::read_to_string(&resolved).map_err(|e| MemoError {
                code: ErrorCode::NotFoundKnowledge,
                message: format!("Failed to read knowledge file: {}", e),
                retry_after_ms: None,
                context: None,
            })?;

            // Conflict detection
            if let Some(ref base_rev) = draft.base_revision {
                let current_hash = content_hash(&file_content);
                if current_hash != *base_rev {
                    return Err(MemoError {
                        code: ErrorCode::ConflictFileLocked,
                        message: format!(
                            "Conflict detected: '{}' has been modified since draft was created. \
                             The draft has been preserved. Use preview_draft to see details.",
                            path
                        ),
                        retry_after_ms: None,
                        context: Some(serde_json::json!({
                            "draft_id": draft_id,
                            "base_revision": base_rev,
                            "current_revision": current_hash,
                        })),
                    });
                }
            }

            let (mut fm, _old_body) = parse_frontmatter(&file_content)?;

            // Apply metadata patch if present
            if let Some(ref patch) = draft.metadata {
                apply_metadata_patch(&mut fm, patch);

                if let Some(summary_value) = patch.get("summary") {
                    match summary_value {
                        serde_json::Value::Null => {
                            fm.summary_hash = None;
                        }
                        serde_json::Value::String(_) => {
                            fm.summary_hash = Some(content_hash(&draft.content));
                        }
                        _ => {}
                    }
                }
            }

            fm.updated_at = Utc::now();

            let fm_yaml = serde_yaml::to_string(&fm).map_err(|e| MemoError {
                code: ErrorCode::InvalidPath,
                message: format!("Failed to serialize frontmatter: {}", e),
                retry_after_ms: None,
                context: None,
            })?;

            let new_content = format!("---\n{}---\n{}", fm_yaml, draft.content);
            let changed = read_sections(&draft.content).len();

            write_knowledge_file(&resolved, &new_content)?;

            // Log event
            let _ = log_update(kb_path, EventSource::Mcp, path, &fm.title);

            delete_draft_file(kb_path, draft_id)?;

            Ok(CommitResult {
                draft_id: draft_id.to_string(),
                path: path.clone(),
                changed_sections: changed,
            })
        }
        _ => Err(MemoError {
            code: ErrorCode::InvalidData,
            message: "Invalid draft state: missing target path for existing knowledge".to_string(),
            retry_after_ms: None,
            context: None,
        }),
    }
}

/// Discard a draft without applying changes.
pub fn discard_draft(kb_path: &Path, draft_id: &str) -> Result<(), MemoError> {
    // Verify draft exists
    load_draft(kb_path, draft_id)?;
    delete_draft_file(kb_path, draft_id)
}

pub fn start_draft_from_inbox_item(
    kb_path: &Path,
    item: &InboxItem,
    draft_title: Option<&str>,
    source_agent: &str,
) -> Result<DraftId, MemoError> {
    let metadata = serde_json::json!({
        "title": draft_title.unwrap_or(item.title.as_str()),
        "summary": item.snippet,
    });
    let draft_id = start_draft(
        kb_path,
        item.proposed_path.as_deref(),
        Some(metadata),
        source_agent,
    )?;

    if let Some(content_markdown) = item.content_markdown.as_deref() {
        if !content_markdown.trim().is_empty() {
            update_draft(
                kb_path,
                &draft_id,
                DraftOperation::SetContent {
                    content: content_markdown.to_string(),
                },
            )?;
        }
    }

    update_draft_review_state(
        kb_path,
        &draft_id,
        "pending",
        None,
        Some(item.id.clone()),
        item.linked_session_id.clone(),
    )?;

    Ok(draft_id)
}

pub fn update_draft_review_state(
    kb_path: &Path,
    draft_id: &str,
    state: &str,
    notes: Option<String>,
    source_inbox_item_id: Option<String>,
    source_session_id: Option<String>,
) -> Result<DraftFile, MemoError> {
    let mut draft = load_draft(kb_path, draft_id)?;
    apply_review_metadata(
        &mut draft,
        state,
        notes,
        source_inbox_item_id,
        source_session_id,
    );
    draft.updated_at = Utc::now();
    save_draft(kb_path, &draft)?;
    Ok(draft)
}

/// Clean up expired drafts based on TTL.
///
/// Deletes drafts whose `updated_at` is older than `ttl_secs` seconds ago.
/// Uses the default 24-hour TTL if `ttl_secs` is None.
pub fn cleanup_expired_drafts(
    kb_path: &Path,
    ttl_secs: Option<i64>,
) -> Result<Vec<DraftId>, MemoError> {
    ensure_drafts_dir(kb_path)?;

    let ttl = ttl_secs.unwrap_or(DRAFT_TTL_SECS);
    let cutoff = Utc::now() - chrono::Duration::seconds(ttl);
    let dir = drafts_dir(kb_path);

    if !dir.exists() {
        return Ok(Vec::new());
    }

    let mut expired = Vec::new();
    let entries = fs::read_dir(&dir).map_err(|e| MemoError {
        code: ErrorCode::InvalidPath,
        message: format!("Failed to read drafts directory: {}", e),
        retry_after_ms: None,
        context: None,
    })?;

    for entry in entries {
        let entry = entry.map_err(|e| MemoError {
            code: ErrorCode::InvalidPath,
            message: format!("Failed to read directory entry: {}", e),
            retry_after_ms: None,
            context: None,
        })?;

        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }

        if let Ok(content) = fs::read_to_string(&path) {
            if let Ok(draft) = serde_json::from_str::<DraftFile>(&content) {
                if draft.updated_at < cutoff {
                    let id = draft.draft_id.clone();
                    drop(draft);
                    fs::remove_file(&path).ok();
                    expired.push(id);
                }
            }
        }
    }

    Ok(expired)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::init;
    use tempfile::TempDir;

    fn setup_kb() -> (TempDir, std::path::PathBuf) {
        let temp = TempDir::new().unwrap();
        let kb_path = temp.path().to_path_buf();
        init::init_new(&kb_path, false).unwrap();
        crate::config::save_config(
            &kb_path,
            &crate::config::Config {
                version: "1.0".to_string(),
                categories: vec![crate::config::CategoryConfig {
                    id: "notes".to_string(),
                    name: "Notes".to_string(),
                    path: "notes".to_string(),
                    parent_id: None,
                    description: None,
                    default_sla_days: None,
                }],
                metadata: None,
                knowledge_policy: None,
            },
        )
        .unwrap();
        (temp, kb_path)
    }

    fn create_test_knowledge(kb_path: &Path) -> String {
        crate::api::create_knowledge(
            kb_path,
            "Test Knowledge",
            "## Section 1\nContent 1\n\n## Section 2\nContent 2",
            vec!["test".to_string()],
            Some("notes".to_string()),
            Some("A test".to_string()),
        )
        .unwrap()
    }

    #[test]
    fn test_start_draft_existing() {
        let (_temp, kb_path) = setup_kb();
        let path = create_test_knowledge(&kb_path);

        let draft_id = start_draft(&kb_path, Some(&path), None, "test-agent").unwrap();

        assert!(draft_id.starts_with("draft_"));
        let draft = load_draft(&kb_path, &draft_id).unwrap();
        assert_eq!(draft.target.path, Some(path));
        assert!(!draft.target.is_new);
        assert!(draft.base_revision.is_some());
        assert!(draft.content.contains("Section 1"));
    }

    #[test]
    fn test_start_draft_new() {
        let (_temp, kb_path) = setup_kb();

        let draft_id = start_draft(&kb_path, None, None, "test-agent").unwrap();

        let draft = load_draft(&kb_path, &draft_id).unwrap();
        assert!(draft.target.path.is_none());
        assert!(draft.target.is_new);
        assert!(draft.base_revision.is_none());
        assert!(draft.content.is_empty());
    }

    #[test]
    fn test_start_draft_new_with_target_path() {
        let (_temp, kb_path) = setup_kb();

        let draft_id = start_draft(
            &kb_path,
            Some("notes/new-draft-target.md"),
            Some(serde_json::json!({ "title": "New Draft Target" })),
            "test-agent",
        )
        .unwrap();

        let draft = load_draft(&kb_path, &draft_id).unwrap();
        assert_eq!(
            draft.target.path,
            Some("notes/new-draft-target.md".to_string())
        );
        assert!(draft.target.is_new);
        assert!(draft.content.is_empty());
    }

    #[test]
    fn test_update_draft_append_section() {
        let (_temp, kb_path) = setup_kb();
        let path = create_test_knowledge(&kb_path);
        let draft_id = start_draft(&kb_path, Some(&path), None, "test-agent").unwrap();

        let draft = update_draft(
            &kb_path,
            &draft_id,
            DraftOperation::AppendSection {
                heading: "Section 3".to_string(),
                level: 2,
                body: "Content 3".to_string(),
            },
        )
        .unwrap();

        assert!(draft.content.contains("## Section 3"));
        assert!(draft.content.contains("Content 3"));
        assert!(draft.content.contains("## Section 1")); // original preserved
        assert_eq!(draft.ops.len(), 1);
    }

    #[test]
    fn test_update_draft_replace_section() {
        let (_temp, kb_path) = setup_kb();
        let path = create_test_knowledge(&kb_path);
        let draft_id = start_draft(&kb_path, Some(&path), None, "test-agent").unwrap();

        let draft = update_draft(
            &kb_path,
            &draft_id,
            DraftOperation::ReplaceSection {
                heading: "Section 1".to_string(),
                new_body: "Updated content".to_string(),
            },
        )
        .unwrap();

        assert!(draft.content.contains("## Section 1\nUpdated content"));
        assert!(draft.content.contains("## Section 2\nContent 2")); // other section preserved
    }

    #[test]
    fn test_update_draft_remove_section() {
        let (_temp, kb_path) = setup_kb();
        let path = create_test_knowledge(&kb_path);
        let draft_id = start_draft(&kb_path, Some(&path), None, "test-agent").unwrap();

        let draft = update_draft(
            &kb_path,
            &draft_id,
            DraftOperation::RemoveSection {
                heading: "Section 1".to_string(),
            },
        )
        .unwrap();

        assert!(!draft.content.contains("Section 1"));
        assert!(!draft.content.contains("Content 1"));
        assert!(draft.content.contains("## Section 2"));
    }

    #[test]
    fn test_update_draft_metadata() {
        let (_temp, kb_path) = setup_kb();
        let path = create_test_knowledge(&kb_path);
        let draft_id = start_draft(&kb_path, Some(&path), None, "test-agent").unwrap();

        let draft = update_draft(
            &kb_path,
            &draft_id,
            DraftOperation::UpdateMetadata {
                patch: serde_json::json!({"title": "New Title", "tags": ["updated"]}),
            },
        )
        .unwrap();

        assert_eq!(
            draft.metadata,
            Some(serde_json::json!({"title": "New Title", "tags": ["updated"]}))
        );
        assert_eq!(draft.ops.len(), 1);
    }

    #[test]
    fn test_update_draft_metadata_merges_incrementally() {
        let (_temp, kb_path) = setup_kb();
        let draft_id = start_draft(
            &kb_path,
            None,
            Some(serde_json::json!({
                "title": "Merged Draft",
                "category": "notes",
                "tags": ["draft"],
            })),
            "test-agent",
        )
        .unwrap();

        let draft = update_draft(
            &kb_path,
            &draft_id,
            DraftOperation::UpdateMetadata {
                patch: serde_json::json!({"summary": "Merged summary"}),
            },
        )
        .unwrap();

        assert_eq!(
            draft.metadata,
            Some(serde_json::json!({
                "title": "Merged Draft",
                "category": "notes",
                "tags": ["draft"],
                "summary": "Merged summary",
            }))
        );
    }

    #[test]
    fn test_commit_draft_existing() {
        let (_temp, kb_path) = setup_kb();
        let path = create_test_knowledge(&kb_path);
        let draft_id = start_draft(&kb_path, Some(&path), None, "test-agent").unwrap();

        update_draft(
            &kb_path,
            &draft_id,
            DraftOperation::AppendSection {
                heading: "Section 3".to_string(),
                level: 2,
                body: "New content".to_string(),
            },
        )
        .unwrap();

        let result = commit_draft(&kb_path, &draft_id).unwrap();
        assert_eq!(result.path, path);
        assert!(result.changed_sections >= 3);

        // Verify file was updated
        let knowledge =
            crate::api::get_knowledge_by_id(&kb_path, &path, crate::models::LoadLevel::L2).unwrap();
        let content = knowledge.content.unwrap();
        assert!(content.contains("## Section 3"));
        assert!(content.contains("New content"));

        // Verify draft was deleted after commit
        assert!(!draft_path(&kb_path, &draft_id).unwrap().exists());
    }

    #[test]
    fn test_commit_draft_new_knowledge() {
        let (_temp, kb_path) = setup_kb();
        let draft_id = start_draft(
            &kb_path,
            None,
            Some(serde_json::json!({
                "title": "Brand New",
                "tags": ["new"],
                "category": "notes"
            })),
            "test-agent",
        )
        .unwrap();

        update_draft(
            &kb_path,
            &draft_id,
            DraftOperation::SetContent {
                content: "## Hello\nWorld".to_string(),
            },
        )
        .unwrap();

        let result = commit_draft(&kb_path, &draft_id).unwrap();
        assert!(
            result.path.contains("brand-new"),
            "path was: {}",
            result.path
        );

        let knowledge =
            crate::api::get_knowledge_by_id(&kb_path, &result.path, crate::models::LoadLevel::L2)
                .unwrap();
        assert_eq!(knowledge.title, "Brand New");
        assert_eq!(knowledge.tags, vec!["new"]);
        assert_eq!(knowledge.category.as_deref(), Some("notes"));
    }

    #[test]
    fn test_commit_draft_new_knowledge_with_target_path() {
        let (_temp, kb_path) = setup_kb();
        let draft_id = start_draft(
            &kb_path,
            Some("notes/from-inbox.md"),
            Some(serde_json::json!({
                "title": "From Inbox",
                "summary": "Created from inbox flow"
            })),
            "test-agent",
        )
        .unwrap();

        update_draft(
            &kb_path,
            &draft_id,
            DraftOperation::SetContent {
                content: "# From Inbox\n\nBody".to_string(),
            },
        )
        .unwrap();

        let result = commit_draft(&kb_path, &draft_id).unwrap();
        assert_eq!(result.path, "notes/from-inbox.md");
        assert!(kb_path.join("notes/from-inbox.md").exists());
    }

    #[test]
    fn test_start_draft_from_inbox_item_sets_review_metadata() {
        let (_temp, kb_path) = setup_kb();

        let mut item = InboxItem::new(crate::InboxSourceType::Agent, "Inbox Draft".to_string());
        item.content_markdown = Some("# Inbox Draft\n\nBody".to_string());
        item.proposed_path = Some("notes/inbox-draft.md".to_string());
        item.linked_session_id = Some("session-123".to_string());

        let draft_id = start_draft_from_inbox_item(&kb_path, &item, None, "test-agent").unwrap();
        let draft = load_draft(&kb_path, &draft_id).unwrap();

        assert_eq!(draft.content, "# Inbox Draft\n\nBody");
        assert_eq!(
            draft
                .metadata
                .as_ref()
                .and_then(|meta| meta.get("review"))
                .and_then(|review| review.get("state"))
                .and_then(|value| value.as_str()),
            Some("pending")
        );
        assert_eq!(
            draft
                .metadata
                .as_ref()
                .and_then(|meta| meta.get("review"))
                .and_then(|review| review.get("source_session_id"))
                .and_then(|value| value.as_str()),
            Some("session-123")
        );
    }

    #[test]
    fn test_commit_draft_existing_updates_summary_hash() {
        let (_temp, kb_path) = setup_kb();
        let path = create_test_knowledge(&kb_path);
        let draft_id = start_draft(&kb_path, Some(&path), None, "test-agent").unwrap();

        update_draft(
            &kb_path,
            &draft_id,
            DraftOperation::ReplaceSection {
                heading: "Section 1".to_string(),
                new_body: "Fresh content with updated summary".to_string(),
            },
        )
        .unwrap();
        update_draft(
            &kb_path,
            &draft_id,
            DraftOperation::UpdateMetadata {
                patch: serde_json::json!({"summary": "Summary aligned with draft"}),
            },
        )
        .unwrap();

        commit_draft(&kb_path, &draft_id).unwrap();

        let knowledge = crate::api::get_knowledge_with_stale(&kb_path, &path).unwrap();
        assert!(!knowledge.summary_stale);
        assert_eq!(
            knowledge.knowledge.summary.as_deref(),
            Some("Summary aligned with draft")
        );
    }

    #[test]
    fn test_commit_draft_conflict_detection() {
        let (_temp, kb_path) = setup_kb();
        let path = create_test_knowledge(&kb_path);
        let draft_id = start_draft(&kb_path, Some(&path), None, "test-agent").unwrap();

        // Modify the file directly, changing the base revision
        let resolved = resolve_knowledge_file_path(&kb_path, &path).unwrap();
        let file_content = fs::read_to_string(&resolved).unwrap();
        let (mut fm, body) = parse_frontmatter(&file_content).unwrap();
        fm.title = "Externally Modified".to_string();
        let fm_yaml = serde_yaml::to_string(&fm).unwrap();
        let new_content = format!("---\n{}---\n{}\nExtra line", fm_yaml, body);
        write_knowledge_file(&resolved, &new_content).unwrap();

        // Try to commit the draft — should detect conflict
        let result = commit_draft(&kb_path, &draft_id);
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert_eq!(err.code, ErrorCode::ConflictFileLocked);
        assert!(err.message.contains("Conflict"));

        // Draft should still exist
        assert!(draft_path(&kb_path, &draft_id).unwrap().exists());
    }

    #[test]
    fn test_discard_draft() {
        let (_temp, kb_path) = setup_kb();
        let path = create_test_knowledge(&kb_path);
        let draft_id = start_draft(&kb_path, Some(&path), None, "test-agent").unwrap();

        discard_draft(&kb_path, &draft_id).unwrap();
        assert!(!draft_path(&kb_path, &draft_id).unwrap().exists());
    }

    #[test]
    fn test_preview_draft() {
        let (_temp, kb_path) = setup_kb();
        let path = create_test_knowledge(&kb_path);
        let draft_id = start_draft(&kb_path, Some(&path), None, "test-agent").unwrap();

        update_draft(
            &kb_path,
            &draft_id,
            DraftOperation::ReplaceSection {
                heading: "Section 1".to_string(),
                new_body: "Modified content".to_string(),
            },
        )
        .unwrap();

        let preview = preview_draft(&kb_path, &draft_id).unwrap();
        assert_eq!(preview.sections_changed, 1);
        assert!(preview.warnings.is_empty());
    }

    #[test]
    fn test_cleanup_expired_drafts() {
        let (_temp, kb_path) = setup_kb();
        let path = create_test_knowledge(&kb_path);

        // Create a draft and backdate it
        let draft_id = start_draft(&kb_path, Some(&path), None, "test-agent").unwrap();
        let mut draft = load_draft(&kb_path, &draft_id).unwrap();
        draft.updated_at = Utc::now() - chrono::Duration::hours(25);
        let path_buf = draft_path(&kb_path, &draft_id).unwrap();
        let json = serde_json::to_string_pretty(&draft).unwrap();
        fs::write(&path_buf, json).unwrap();

        // Create a recent draft that should survive
        let recent_id = start_draft(&kb_path, Some(&path), None, "test-agent").unwrap();

        let expired = cleanup_expired_drafts(&kb_path, None).unwrap();
        assert_eq!(expired.len(), 1);
        assert_eq!(expired[0], draft_id);
        assert!(!draft_path(&kb_path, &draft_id).unwrap().exists());
        assert!(draft_path(&kb_path, &recent_id).unwrap().exists());
    }

    #[test]
    fn test_drafts_gitignore() {
        let (_temp, kb_path) = setup_kb();
        let path = create_test_knowledge(&kb_path);

        let _ = start_draft(&kb_path, Some(&path), None, "test-agent").unwrap();

        let gitignore = fs::read_to_string(kb_path.join(".memoforge/.gitignore")).unwrap();
        assert!(gitignore.contains("drafts/"));
    }

    #[test]
    fn test_update_draft_set_content() {
        let (_temp, kb_path) = setup_kb();
        let draft_id = start_draft(&kb_path, None, None, "test-agent").unwrap();

        let draft = update_draft(
            &kb_path,
            &draft_id,
            DraftOperation::SetContent {
                content: "## New\nBrand new content".to_string(),
            },
        )
        .unwrap();

        assert_eq!(draft.content, "## New\nBrand new content");
        assert_eq!(draft.ops.len(), 1);
    }

    #[test]
    fn test_preview_draft_shows_conflict_warning() {
        let (_temp, kb_path) = setup_kb();
        let path = create_test_knowledge(&kb_path);
        let draft_id = start_draft(&kb_path, Some(&path), None, "test-agent").unwrap();

        // Modify the source file externally after creating draft
        let resolved = resolve_knowledge_file_path(&kb_path, &path).unwrap();
        let file_content = fs::read_to_string(&resolved).unwrap();
        let (mut fm, body) = parse_frontmatter(&file_content).unwrap();
        fm.title = "Changed".to_string();
        let fm_yaml = serde_yaml::to_string(&fm).unwrap();
        let new_content = format!("---\n{}---\n{}\nExtra", fm_yaml, body);
        write_knowledge_file(&resolved, &new_content).unwrap();

        let preview = preview_draft(&kb_path, &draft_id).unwrap();
        assert!(preview.warnings.iter().any(|w| w.contains("modified")));
    }

    #[test]
    fn test_discard_nonexistent_draft() {
        let (_temp, kb_path) = setup_kb();
        let result = discard_draft(&kb_path, "draft_nonexistent");
        assert!(result.is_err());
    }

    #[test]
    fn test_commit_draft_with_metadata_update() {
        let (_temp, kb_path) = setup_kb();
        let path = create_test_knowledge(&kb_path);
        let draft_id = start_draft(&kb_path, Some(&path), None, "test-agent").unwrap();

        update_draft(
            &kb_path,
            &draft_id,
            DraftOperation::UpdateMetadata {
                patch: serde_json::json!({"title": "Renamed", "tags": ["updated"]}),
            },
        )
        .unwrap();

        let result = commit_draft(&kb_path, &draft_id).unwrap();
        assert_eq!(result.path, path);

        let knowledge =
            crate::api::get_knowledge_by_id(&kb_path, &path, crate::models::LoadLevel::L2).unwrap();
        assert_eq!(knowledge.title, "Renamed");
        assert_eq!(knowledge.tags, vec!["updated"]);
    }

    #[test]
    fn test_multiple_operations_on_draft() {
        let (_temp, kb_path) = setup_kb();
        let path = create_test_knowledge(&kb_path);
        let draft_id = start_draft(&kb_path, Some(&path), None, "test-agent").unwrap();

        // Append a section
        update_draft(
            &kb_path,
            &draft_id,
            DraftOperation::AppendSection {
                heading: "Section 3".to_string(),
                level: 2,
                body: "Added content".to_string(),
            },
        )
        .unwrap();

        // Replace a section
        update_draft(
            &kb_path,
            &draft_id,
            DraftOperation::ReplaceSection {
                heading: "Section 1".to_string(),
                new_body: "Replaced content".to_string(),
            },
        )
        .unwrap();

        let draft = load_draft(&kb_path, &draft_id).unwrap();
        assert_eq!(draft.ops.len(), 2);
        assert!(draft.content.contains("Replaced content"));
        assert!(draft.content.contains("## Section 3"));
    }

    #[test]
    fn test_cleanup_with_custom_ttl() {
        let (_temp, kb_path) = setup_kb();
        let path = create_test_knowledge(&kb_path);

        // Create a draft and backdate it by 10 seconds
        let draft_id = start_draft(&kb_path, Some(&path), None, "test-agent").unwrap();
        let mut draft = load_draft(&kb_path, &draft_id).unwrap();
        draft.updated_at = Utc::now() - chrono::Duration::seconds(10);
        let path_buf = draft_path(&kb_path, &draft_id).unwrap();
        let json = serde_json::to_string_pretty(&draft).unwrap();
        fs::write(&path_buf, json).unwrap();

        // With a 5-second TTL, it should be expired
        let expired = cleanup_expired_drafts(&kb_path, Some(5)).unwrap();
        assert_eq!(expired.len(), 1);
        assert_eq!(expired[0], draft_id);
    }
}
