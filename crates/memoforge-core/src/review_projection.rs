//! Review Item projection aggregation
//! v0.3.0 Sprint 3: Unified review queue
//!
//! ReviewItem is a projection layer -- it is NOT persisted independently.
//! Instead, items are dynamically aggregated from Draft files that carry
//! review context metadata (draft.metadata.review).

use crate::draft::{draft_path, drafts_dir, DraftFile};
use crate::error::{ErrorCode, MemoError};
use crate::review::{ReviewDecision, ReviewItem, ReviewSourceType, ReviewStatus};
use std::fs;
use std::path::Path;

// ---------------------------------------------------------------------------
// Filter
// ---------------------------------------------------------------------------

/// Filter criteria for listing review items.
///
/// By default, only non-terminal items (pending, in_review, returned) are
/// returned. Set `include_terminal` to `true` to also include approved and
/// discarded items.
pub struct ReviewListFilter {
    /// Filter by a specific review status.
    pub status: Option<ReviewStatus>,
    /// Filter by source type.
    pub source_type: Option<ReviewSourceType>,
    /// Include terminal items (approved, discarded). Defaults to `false`.
    pub include_terminal: bool,
    /// Maximum number of items to return.
    pub limit: Option<usize>,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Derive a stable projection ID from a draft ID.
///
/// Convention: `ri_{draft_id}`. Since draft IDs already contain a UUID, this
/// is globally unique without an extra round of ID generation.
fn review_item_id_from_draft(draft_id: &str) -> String {
    format!("ri_{}", draft_id)
}

/// Extract the `review` sub-object from draft metadata.
fn extract_review_meta(draft: &DraftFile) -> Option<&serde_json::Value> {
    draft
        .metadata
        .as_ref()
        .and_then(|m| m.get("review"))
}

/// Derive source_type from the draft's review metadata.
///
/// Priority:
///   1. Explicit `review.source_type` field (if present)
///   2. Infer from `review.source_inbox_item_id` -> InboxPromotion
///   3. Infer from `review.source_session_id` -> AgentDraft
///   4. Default -> AgentDraft
fn infer_source_type(review_meta: &serde_json::Value) -> ReviewSourceType {
    // 1. Explicit source_type
    if let Some(st) = review_meta.get("source_type").and_then(|v| v.as_str()) {
        match st {
            "agent_draft" => return ReviewSourceType::AgentDraft,
            "inbox_promotion" => return ReviewSourceType::InboxPromotion,
            "reliability_fix" => return ReviewSourceType::ReliabilityFix,
            "import_cleanup" => return ReviewSourceType::ImportCleanup,
            _ => {}
        }
    }

    // 2. Has inbox item reference -> InboxPromotion
    if review_meta
        .get("source_inbox_item_id")
        .and_then(|v| v.as_str())
        .is_some()
    {
        return ReviewSourceType::InboxPromotion;
    }

    // 3. Default
    ReviewSourceType::AgentDraft
}

/// Derive source_ref_id from review metadata.
fn infer_source_ref_id(review_meta: &serde_json::Value, draft: &DraftFile) -> String {
    if let Some(id) = review_meta
        .get("source_inbox_item_id")
        .and_then(|v| v.as_str())
    {
        return id.to_string();
    }
    if let Some(id) = review_meta
        .get("source_session_id")
        .and_then(|v| v.as_str())
    {
        return id.to_string();
    }
    // Fallback: use the draft_id itself as ref
    draft.draft_id.clone()
}

/// Parse review status string into ReviewStatus enum.
fn parse_review_status(state: &str) -> Option<ReviewStatus> {
    match state {
        "pending" => Some(ReviewStatus::Pending),
        "in_review" => Some(ReviewStatus::InReview),
        "approved" => Some(ReviewStatus::Approved),
        "returned" => Some(ReviewStatus::Returned),
        "discarded" => Some(ReviewStatus::Discarded),
        _ => None,
    }
}

/// Compute risk flags for a draft.
///
/// Current heuristics:
///   - Draft has no content -> "empty_content"
///   - Draft is new (target.is_new) -> "new_knowledge"
///   - No summary in metadata -> "missing_summary"
///
/// The design doc reserves risk_flags for future enrichment
/// (e.g. EvidenceMeta gaps, Reliability issue association).
fn compute_risk_flags(draft: &DraftFile) -> Vec<String> {
    let mut flags = Vec::new();

    if draft.content.trim().is_empty() {
        flags.push("empty_content".to_string());
    }

    if draft.target.is_new {
        flags.push("new_knowledge".to_string());
    }

    let has_summary = draft
        .metadata
        .as_ref()
        .and_then(|m| m.get("summary"))
        .and_then(|v| v.as_str())
        .is_some();
    if !has_summary {
        flags.push("missing_summary".to_string());
    }

    flags
}

/// Build a ReviewItem from a DraftFile.
///
/// Returns `None` if the draft has no review metadata (i.e. it was created
/// outside of a review workflow).
fn draft_to_review_item(draft: &DraftFile) -> Option<ReviewItem> {
    let review_meta = extract_review_meta(draft)?;
    let state_str = review_meta.get("state").and_then(|v| v.as_str())?;

    // Skip terminal states whose underlying draft is already gone or not
    // relevant for the active queue. We still construct the item so callers
    // can retrieve historical decisions.
    let status = parse_review_status(state_str)?;

    let source_type = infer_source_type(review_meta);
    let source_ref_id = infer_source_ref_id(review_meta, draft);

    let title = draft
        .metadata
        .as_ref()
        .and_then(|m| m.get("title"))
        .and_then(|v| v.as_str())
        .unwrap_or(&draft.draft_id)
        .to_string();

    let decided_by = review_meta
        .get("decided_by")
        .and_then(|v| v.as_str())
        .map(String::from);

    let decided_at = review_meta
        .get("decided_at")
        .and_then(|v| v.as_str())
        .map(String::from);

    Some(ReviewItem {
        review_item_id: review_item_id_from_draft(&draft.draft_id),
        source_type,
        source_ref_id,
        draft_id: draft.draft_id.clone(),
        title,
        risk_flags: compute_risk_flags(draft),
        status,
        decided_by,
        decided_at,
        created_at: draft.created_at.to_rfc3339(),
        updated_at: draft.updated_at.to_rfc3339(),
    })
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/// List review items aggregated from drafts.
///
/// Scans `.memoforge/drafts/` for drafts that carry review metadata,
/// converts each to a ReviewItem, applies optional filters, and returns
/// results sorted by `created_at` descending (newest first).
pub fn list_review_items(
    kb_path: &Path,
    filter: ReviewListFilter,
) -> Result<Vec<ReviewItem>, MemoError> {
    let dir = drafts_dir(kb_path);
    if !dir.exists() {
        return Ok(Vec::new());
    }

    let entries = fs::read_dir(&dir).map_err(|e| MemoError {
        code: ErrorCode::InvalidPath,
        message: format!("Failed to read drafts directory: {}", e),
        retry_after_ms: None,
        context: None,
    })?;

    let mut items: Vec<ReviewItem> = Vec::new();

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

        let content = match fs::read_to_string(&path) {
            Ok(c) => c,
            Err(_) => continue,
        };

        let draft: DraftFile = match serde_json::from_str(&content) {
            Ok(d) => d,
            Err(_) => continue,
        };

        if let Some(item) = draft_to_review_item(&draft) {
            items.push(item);
        }
    }

    // Apply filters
    // Default: exclude terminal states (approved, discarded) unless explicitly
    // requested via include_terminal or a specific status filter.
    if let Some(ref status) = filter.status {
        items.retain(|i| &i.status == status);
    } else if !filter.include_terminal {
        items.retain(|i| !matches!(i.status, ReviewStatus::Approved | ReviewStatus::Discarded));
    }
    if let Some(ref source_type) = filter.source_type {
        items.retain(|i| &i.source_type == source_type);
    }

    // Sort by created_at descending (newest first)
    items.sort_by(|a, b| b.created_at.cmp(&a.created_at));

    // Apply limit
    if let Some(limit) = filter.limit {
        items.truncate(limit);
    }

    Ok(items)
}

/// Get a single review item by its projection ID.
///
/// The `review_item_id` must follow the `ri_{draft_id}` convention.
pub fn get_review_item(
    kb_path: &Path,
    review_item_id: &str,
) -> Result<ReviewItem, MemoError> {
    // Strip "ri_" prefix to recover the draft_id
    let draft_id = review_item_id
        .strip_prefix("ri_")
        .ok_or_else(|| MemoError {
            code: ErrorCode::NotFoundKnowledge,
            message: format!(
                "Invalid review_item_id format: '{}'. Expected 'ri_{{draft_id}}'.",
                review_item_id
            ),
            retry_after_ms: None,
            context: None,
        })?;

    let path = draft_path(kb_path, draft_id)?;
    if !path.exists() {
        return Err(MemoError {
            code: ErrorCode::NotFoundKnowledge,
            message: format!("Review item '{}' not found (underlying draft missing)", review_item_id),
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

    let draft: DraftFile = serde_json::from_str(&content).map_err(|e| MemoError {
        code: ErrorCode::InvalidData,
        message: format!("Failed to parse draft: {}", e),
        retry_after_ms: None,
        context: None,
    })?;

    draft_to_review_item(&draft).ok_or_else(|| MemoError {
        code: ErrorCode::NotFoundKnowledge,
        message: format!(
            "Draft '{}' exists but has no review context. Not a reviewable item.",
            draft_id
        ),
        retry_after_ms: None,
        context: None,
    })
}

/// Apply a review decision to an item.
///
/// This updates the underlying draft's review metadata and, depending on the
/// decision:
///
/// - **approve**: commits the draft (content lands in the knowledge base)
/// - **discard**: discards the draft
/// - **return**: updates review state to "returned"
/// - **reopen**: updates review state to "pending"
pub fn apply_review_decision(
    kb_path: &Path,
    review_item_id: &str,
    decision: ReviewDecision,
    decided_by: Option<String>,
    notes: Option<String>,
) -> Result<ReviewItem, MemoError> {
    let draft_id = review_item_id
        .strip_prefix("ri_")
        .ok_or_else(|| MemoError {
            code: ErrorCode::NotFoundKnowledge,
            message: format!(
                "Invalid review_item_id format: '{}'. Expected 'ri_{{draft_id}}'.",
                review_item_id
            ),
            retry_after_ms: None,
            context: None,
        })?;

    // Load current item to validate state transition
    let mut item = get_review_item(kb_path, review_item_id)?;

    // Validate transition using the state machine
    if !item.can_transition_to(&decision) {
        return Err(MemoError {
            code: ErrorCode::InvalidData,
            message: format!(
                "Cannot apply {:?} to review item in {:?} state",
                decision, item.status
            ),
            retry_after_ms: None,
            context: None,
        });
    }

    let now = chrono::Utc::now().to_rfc3339();

    // Decide what to do with the underlying draft
    match decision {
        ReviewDecision::Approve => {
            // Commit the draft -- this also deletes the draft file
            crate::draft::commit_draft(kb_path, draft_id)?;

            // After commit the draft is gone; build a terminal ReviewItem
            item.status = ReviewStatus::Approved;
            item.decided_by = decided_by;
            item.decided_at = Some(now);
            item.updated_at = chrono::Utc::now().to_rfc3339();
        }
        ReviewDecision::Discard => {
            // Discard the draft file
            crate::draft::discard_draft(kb_path, draft_id)?;

            item.status = ReviewStatus::Discarded;
            item.decided_by = decided_by;
            item.decided_at = Some(now.clone());
            item.updated_at = now;
        }
        ReviewDecision::Return => {
            // Update draft metadata only
            let mut draft = load_draft_for_review(kb_path, draft_id)?;
            update_draft_review_meta(
                &mut draft,
                "returned",
                notes.clone(),
                decided_by.as_deref(),
                now.clone(),
            );
            save_draft_review(kb_path, &draft)?;

            item.status = ReviewStatus::Returned;
            item.decided_by = decided_by;
            item.decided_at = Some(now.clone());
            item.updated_at = now;
        }
        ReviewDecision::Reopen => {
            let mut draft = load_draft_for_review(kb_path, draft_id)?;
            update_draft_review_meta(
                &mut draft,
                "pending",
                notes.clone(),
                decided_by.as_deref(),
                now.clone(),
            );
            save_draft_review(kb_path, &draft)?;

            item.status = ReviewStatus::Pending;
            item.decided_by = decided_by;
            item.decided_at = Some(now.clone());
            item.updated_at = now;
        }
    }

    Ok(item)
}

/// Start a review on an item, transitioning it from Pending to InReview.
///
/// This loads the underlying draft, updates its review metadata to
/// "in_review", and returns the updated ReviewItem.
pub fn start_review(
    kb_path: &Path,
    review_item_id: &str,
    reviewer: Option<String>,
) -> Result<ReviewItem, MemoError> {
    let draft_id = review_item_id
        .strip_prefix("ri_")
        .ok_or_else(|| MemoError {
            code: ErrorCode::NotFoundKnowledge,
            message: format!(
                "Invalid review_item_id format: '{}'. Expected 'ri_{{draft_id}}'.",
                review_item_id
            ),
            retry_after_ms: None,
            context: None,
        })?;

    // Load current item and transition to InReview
    let mut item = get_review_item(kb_path, review_item_id)?;
    item.start_review(reviewer.clone())?;

    let now = chrono::Utc::now().to_rfc3339();

    // Update the underlying draft's review metadata
    let mut draft = load_draft_for_review(kb_path, draft_id)?;
    update_draft_review_meta(
        &mut draft,
        "in_review",
        None,
        reviewer.as_deref(),
        now,
    );
    save_draft_review(kb_path, &draft)?;

    item.updated_at = chrono::Utc::now().to_rfc3339();
    Ok(item)
}

// ---------------------------------------------------------------------------
// Internal helpers for reading/writing draft review metadata
// ---------------------------------------------------------------------------

/// Load a draft file, providing a review-specific error if it has no review
/// context.
fn load_draft_for_review(kb_path: &Path, draft_id: &str) -> Result<DraftFile, MemoError> {
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
    let draft: DraftFile = serde_json::from_str(&content).map_err(|e| MemoError {
        code: ErrorCode::InvalidData,
        message: format!("Failed to parse draft: {}", e),
        retry_after_ms: None,
        context: None,
    })?;
    Ok(draft)
}

/// Update the review sub-object inside a DraftFile's metadata.
fn update_draft_review_meta(
    draft: &mut DraftFile,
    state: &str,
    notes: Option<String>,
    decided_by: Option<&str>,
    decided_at: String,
) {
    // Preserve existing review fields (source_inbox_item_id, source_session_id, etc.)
    let mut review_obj = draft
        .metadata
        .as_ref()
        .and_then(|m| m.get("review"))
        .and_then(|v| v.as_object())
        .cloned()
        .unwrap_or_default();

    review_obj.insert("state".to_string(), serde_json::json!(state));
    if let Some(n) = notes {
        review_obj.insert("notes".to_string(), serde_json::json!(n));
    }
    review_obj.insert("decided_by".to_string(), serde_json::json!(decided_by));
    review_obj.insert("decided_at".to_string(), serde_json::json!(decided_at));

    let mut meta = draft.metadata.take().unwrap_or(serde_json::json!({}));
    if let Some(obj) = meta.as_object_mut() {
        obj.insert("review".to_string(), serde_json::Value::Object(review_obj));
    }
    draft.metadata = Some(meta);
    draft.updated_at = chrono::Utc::now();
}

/// Persist a draft back to disk.
fn save_draft_review(kb_path: &Path, draft: &DraftFile) -> Result<(), MemoError> {
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::draft::{
        start_draft, update_draft, update_draft_review_state, DraftOperation,
    };
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

    /// Create a draft with review context for testing.
    fn create_reviewable_draft(kb_path: &Path, title: &str) -> String {
        let draft_id = start_draft(
            kb_path,
            None,
            Some(serde_json::json!({
                "title": title,
                "category": "notes",
            })),
            "test-agent",
        )
        .unwrap();

        update_draft(
            kb_path,
            &draft_id,
            DraftOperation::SetContent {
                content: format!("## Content for {}\nSome body text.", title),
            },
        )
        .unwrap();

        update_draft_review_state(
            kb_path,
            &draft_id,
            "pending",
            None,
            None,
            None,
        )
        .unwrap();

        draft_id
    }

    #[test]
    fn list_review_items_returns_empty_when_no_drafts() {
        let (_temp, kb_path) = setup_kb();
        let items = list_review_items(
            &kb_path,
            ReviewListFilter {
                status: None,
                source_type: None,
                include_terminal: false,
                limit: None,
            },
        )
        .unwrap();
        assert!(items.is_empty());
    }

    #[test]
    fn list_review_items_returns_drafts_with_review_context() {
        let (_temp, kb_path) = setup_kb();
        create_reviewable_draft(&kb_path, "Review Test");

        let items = list_review_items(
            &kb_path,
            ReviewListFilter {
                status: None,
                source_type: None,
                include_terminal: false,
                limit: None,
            },
        )
        .unwrap();

        assert_eq!(items.len(), 1);
        assert_eq!(items[0].title, "Review Test");
        assert_eq!(items[0].status, ReviewStatus::Pending);
        assert!(items[0].review_item_id.starts_with("ri_draft_"));
    }

    #[test]
    fn list_review_items_skips_drafts_without_review_context() {
        let (_temp, kb_path) = setup_kb();
        // Create a draft without review metadata
        start_draft(&kb_path, None, None, "test-agent").unwrap();

        let items = list_review_items(
            &kb_path,
            ReviewListFilter {
                status: None,
                source_type: None,
                include_terminal: false,
                limit: None,
            },
        )
        .unwrap();

        assert!(items.is_empty());
    }

    #[test]
    fn list_review_items_filters_by_status() {
        let (_temp, kb_path) = setup_kb();
        create_reviewable_draft(&kb_path, "Still Pending");

        // Return the first draft via the helper to create a second state
        let draft_id_2 = create_reviewable_draft(&kb_path, "To Be Returned");
        apply_review_response(&kb_path, &draft_id_2, "returned", None, None).unwrap();

        let pending_items = list_review_items(
            &kb_path,
            ReviewListFilter {
                status: Some(ReviewStatus::Pending),
                source_type: None,
                include_terminal: false,
                limit: None,
            },
        )
        .unwrap();
        assert_eq!(pending_items.len(), 1);
        assert_eq!(pending_items[0].title, "Still Pending");

        let returned_items = list_review_items(
            &kb_path,
            ReviewListFilter {
                status: Some(ReviewStatus::Returned),
                source_type: None,
                include_terminal: false,
                limit: None,
            },
        )
        .unwrap();
        assert_eq!(returned_items.len(), 1);
    }

    #[test]
    fn list_review_items_default_excludes_terminal_states() {
        let (_temp, kb_path) = setup_kb();
        let draft_id = create_reviewable_draft(&kb_path, "Will Be Approved");

        // Approve the draft -- this commits and deletes the draft file.
        // We need a different approach: mark it as "approved" via review meta
        // without deleting the file.
        apply_review_response(&kb_path, &draft_id, "approved", Some("reviewer"), None).unwrap();

        // Create another pending draft so the list is not empty
        create_reviewable_draft(&kb_path, "Still Active");

        // Default filter (include_terminal=false): should only show the pending one
        let items = list_review_items(
            &kb_path,
            ReviewListFilter {
                status: None,
                source_type: None,
                include_terminal: false,
                limit: None,
            },
        )
        .unwrap();
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].title, "Still Active");

        // With include_terminal=true: should show both
        let all_items = list_review_items(
            &kb_path,
            ReviewListFilter {
                status: None,
                source_type: None,
                include_terminal: true,
                limit: None,
            },
        )
        .unwrap();
        assert_eq!(all_items.len(), 2);
    }

    #[test]
    fn list_review_items_status_filter_overrides_terminal_default() {
        let (_temp, kb_path) = setup_kb();
        let draft_id = create_reviewable_draft(&kb_path, "Will Be Approved");

        // Mark as approved
        apply_review_response(&kb_path, &draft_id, "approved", Some("reviewer"), None).unwrap();

        // Filtering by Approved status should return it even without include_terminal
        let items = list_review_items(
            &kb_path,
            ReviewListFilter {
                status: Some(ReviewStatus::Approved),
                source_type: None,
                include_terminal: false,
                limit: None,
            },
        )
        .unwrap();
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].status, ReviewStatus::Approved);
    }

    #[test]
    fn list_review_items_respects_limit() {
        let (_temp, kb_path) = setup_kb();
        create_reviewable_draft(&kb_path, "Draft A");
        create_reviewable_draft(&kb_path, "Draft B");
        create_reviewable_draft(&kb_path, "Draft C");

        let items = list_review_items(
            &kb_path,
            ReviewListFilter {
                status: None,
                source_type: None,
                include_terminal: false,
                limit: Some(2),
            },
        )
        .unwrap();

        assert_eq!(items.len(), 2);
    }

    #[test]
    fn get_review_item_returns_item() {
        let (_temp, kb_path) = setup_kb();
        let draft_id = create_reviewable_draft(&kb_path, "Get Test");
        let ri_id = format!("ri_{}", draft_id);

        let item = get_review_item(&kb_path, &ri_id).unwrap();
        assert_eq!(item.title, "Get Test");
        assert_eq!(item.draft_id, draft_id);
        assert_eq!(item.status, ReviewStatus::Pending);
    }

    #[test]
    fn get_review_item_rejects_invalid_id_format() {
        let (_temp, kb_path) = setup_kb();
        let result = get_review_item(&kb_path, "invalid-id");
        assert!(result.is_err());
        assert_eq!(result.unwrap_err().code, ErrorCode::NotFoundKnowledge);
    }

    #[test]
    fn get_review_item_returns_not_found_for_missing() {
        let (_temp, kb_path) = setup_kb();
        let result = get_review_item(&kb_path, "ri_draft_nonexistent");
        assert!(result.is_err());
        assert_eq!(result.unwrap_err().code, ErrorCode::NotFoundKnowledge);
    }

    // --- Decision tests ---

    #[test]
    fn apply_decision_approve_commits_draft() {
        let (_temp, kb_path) = setup_kb();
        let draft_id = create_reviewable_draft(&kb_path, "Approve Me");
        let ri_id = format!("ri_{}", draft_id);

        let item = apply_review_decision(
            &kb_path,
            &ri_id,
            ReviewDecision::Approve,
            Some("reviewer".to_string()),
            Some("LGTM".to_string()),
        )
        .unwrap();

        assert_eq!(item.status, ReviewStatus::Approved);
        assert_eq!(item.decided_by.as_deref(), Some("reviewer"));

        // Draft should be gone after commit
        assert!(!draft_path(&kb_path, &draft_id).unwrap().exists());
    }

    #[test]
    fn apply_decision_discard_removes_draft() {
        let (_temp, kb_path) = setup_kb();
        let draft_id = create_reviewable_draft(&kb_path, "Discard Me");
        let ri_id = format!("ri_{}", draft_id);

        let item = apply_review_decision(
            &kb_path,
            &ri_id,
            ReviewDecision::Discard,
            None,
            None,
        )
        .unwrap();

        assert_eq!(item.status, ReviewStatus::Discarded);

        // Draft should be gone
        assert!(!draft_path(&kb_path, &draft_id).unwrap().exists());
    }

    #[test]
    fn apply_decision_return_updates_metadata() {
        let (_temp, kb_path) = setup_kb();
        let draft_id = create_reviewable_draft(&kb_path, "Return Me");
        let ri_id = format!("ri_{}", draft_id);

        let item = apply_review_decision(
            &kb_path,
            &ri_id,
            ReviewDecision::Return,
            Some("reviewer".to_string()),
            Some("Needs work".to_string()),
        )
        .unwrap();

        assert_eq!(item.status, ReviewStatus::Returned);
        assert_eq!(item.decided_by.as_deref(), Some("reviewer"));

        // Draft should still exist
        assert!(draft_path(&kb_path, &draft_id).unwrap().exists());
    }

    #[test]
    fn apply_decision_reopen_from_returned() {
        let (_temp, kb_path) = setup_kb();
        let draft_id = create_reviewable_draft(&kb_path, "Reopen Me");
        let ri_id = format!("ri_{}", draft_id);

        // Return first
        apply_review_decision(&kb_path, &ri_id, ReviewDecision::Return, None, None).unwrap();

        // Reopen
        let item =
            apply_review_decision(&kb_path, &ri_id, ReviewDecision::Reopen, None, None).unwrap();

        assert_eq!(item.status, ReviewStatus::Pending);
        assert!(draft_path(&kb_path, &draft_id).unwrap().exists());
    }

    #[test]
    fn apply_decision_rejects_invalid_transition() {
        let (_temp, kb_path) = setup_kb();
        let draft_id = create_reviewable_draft(&kb_path, "Bad Transition");
        let ri_id = format!("ri_{}", draft_id);

        // Cannot reopen from pending
        let result = apply_review_decision(
            &kb_path,
            &ri_id,
            ReviewDecision::Reopen,
            None,
            None,
        );
        assert!(result.is_err());
        assert_eq!(result.unwrap_err().code, ErrorCode::InvalidData);
    }

    #[test]
    fn full_lifecycle_pending_return_reopen_approve() {
        let (_temp, kb_path) = setup_kb();
        let draft_id = create_reviewable_draft(&kb_path, "Lifecycle");
        let ri_id = format!("ri_{}", draft_id);

        // pending -> returned
        let item = apply_review_decision(
            &kb_path,
            &ri_id,
            ReviewDecision::Return,
            Some("reviewer".to_string()),
            Some("Please revise".to_string()),
        )
        .unwrap();
        assert_eq!(item.status, ReviewStatus::Returned);

        // returned -> pending (reopen)
        let item = apply_review_decision(
            &kb_path,
            &ri_id,
            ReviewDecision::Reopen,
            Some("author".to_string()),
            Some("Revised".to_string()),
        )
        .unwrap();
        assert_eq!(item.status, ReviewStatus::Pending);

        // pending -> approved
        let item = apply_review_decision(
            &kb_path,
            &ri_id,
            ReviewDecision::Approve,
            Some("reviewer".to_string()),
            Some("Looks good now".to_string()),
        )
        .unwrap();
        assert_eq!(item.status, ReviewStatus::Approved);
        assert!(!draft_path(&kb_path, &draft_id).unwrap().exists());
    }

    // Helper: directly update the draft review state for test setup
    fn apply_review_response(
        kb_path: &Path,
        draft_id: &str,
        state: &str,
        decided_by: Option<&str>,
        notes: Option<&str>,
    ) -> Result<(), MemoError> {
        let mut draft = {
            let path = draft_path(kb_path, draft_id)?;
            let content = fs::read_to_string(&path).map_err(|e| MemoError {
                code: ErrorCode::NotFoundKnowledge,
                message: format!("Failed to read draft: {}", e),
                retry_after_ms: None,
                context: None,
            })?;
            serde_json::from_str::<DraftFile>(&content).map_err(|e| MemoError {
                code: ErrorCode::InvalidData,
                message: format!("Failed to parse draft: {}", e),
                retry_after_ms: None,
                context: None,
            })?
        };

        update_draft_review_meta(
            &mut draft,
            state,
            notes.map(String::from),
            decided_by,
            chrono::Utc::now().to_rfc3339(),
        );
        save_draft_review(kb_path, &draft)
    }
}
