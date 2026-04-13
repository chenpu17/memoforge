//! Governance API: Evidence/Freshness read-write operations
//!
//! Sprint 4 implementation of the Evidence-backed Knowledge and Freshness features.
//! All truth is stored in frontmatter — no separate files are created.

use crate::config::load_config;
use crate::frontmatter::parse_frontmatter;
use crate::fs::{read_knowledge_file, write_knowledge_file};
use crate::governance::{
    effective_sla_days, EvidenceMeta, FreshnessPolicy, FreshnessReviewStatus,
};
use crate::links::collect_markdown_files;
use crate::{ErrorCode, MemoError};
use chrono::Utc;
use std::fs;
use std::path::Path;

/// Read evidence metadata from a knowledge entry.
///
/// Returns `Ok(None)` if the knowledge file exists but has no `evidence` field
/// in its frontmatter (i.e. legacy knowledge files).
pub fn read_evidence(kb_path: &Path, knowledge_path: &str) -> Result<Option<EvidenceMeta>, MemoError> {
    let file_path = kb_path.join(knowledge_path);
    let content = read_knowledge_file(&file_path)?;
    let (fm, _body) = parse_frontmatter(&content)?;
    Ok(fm.evidence)
}

/// Write evidence metadata to a knowledge entry's frontmatter.
///
/// This replaces the entire `evidence` field. To merge partial updates,
/// callers should `read_evidence` first, modify, then `write_evidence`.
pub fn write_evidence(
    kb_path: &Path,
    knowledge_path: &str,
    evidence: &EvidenceMeta,
) -> Result<(), MemoError> {
    let file_path = kb_path.join(knowledge_path);
    let content = read_knowledge_file(&file_path)?;
    let (mut fm, body) = parse_frontmatter(&content)?;

    fm.evidence = Some(evidence.clone());

    let new_content = serialize_knowledge_file(&fm, &body)?;
    write_knowledge_file(&file_path, &new_content)
}

/// Read freshness policy from a knowledge entry.
///
/// Returns `Ok(None)` if the knowledge file exists but has no `freshness` field.
pub fn read_freshness(
    kb_path: &Path,
    knowledge_path: &str,
) -> Result<Option<FreshnessPolicy>, MemoError> {
    let file_path = kb_path.join(knowledge_path);
    let content = read_knowledge_file(&file_path)?;
    let (fm, _body) = parse_frontmatter(&content)?;
    Ok(fm.freshness)
}

/// Write freshness policy to a knowledge entry's frontmatter.
///
/// This replaces the entire `freshness` field.
pub fn write_freshness(
    kb_path: &Path,
    knowledge_path: &str,
    freshness: &FreshnessPolicy,
) -> Result<(), MemoError> {
    let file_path = kb_path.join(knowledge_path);
    let content = read_knowledge_file(&file_path)?;
    let (mut fm, body) = parse_frontmatter(&content)?;

    fm.freshness = Some(freshness.clone());

    let new_content = serialize_knowledge_file(&fm, &body)?;
    write_knowledge_file(&file_path, &new_content)
}

/// Compute the effective freshness policy for a knowledge entry.
///
/// Inheritance chain: knowledge frontmatter > category config > global config > default (90 days).
///
/// If the knowledge has an explicit `freshness` field, it is returned as-is.
/// Otherwise, a synthetic `FreshnessPolicy` is built using the inherited `sla_days`.
pub fn effective_freshness(
    kb_path: &Path,
    knowledge_path: &str,
) -> Result<FreshnessPolicy, MemoError> {
    let file_path = kb_path.join(knowledge_path);
    let content = read_knowledge_file(&file_path)?;
    let (fm, _body) = parse_frontmatter(&content)?;

    // If knowledge has an explicit freshness policy, return it directly
    if let Some(ref freshness) = fm.freshness {
        return Ok(freshness.clone());
    }

    // Otherwise, compute effective SLA from inheritance chain
    let knowledge_sla = None; // no explicit freshness on the knowledge itself
    let category_sla = fm.category.as_ref().and_then(|cat| {
        let config = load_config(kb_path).ok()?;
        config
            .categories
            .iter()
            .find(|c| c.id == *cat || c.path == *cat)
            .and_then(|c| c.default_sla_days)
    });
    let global_sla = load_config(kb_path)
        .ok()
        .and_then(|c| c.knowledge_policy.map(|p| p.default_sla_days));

    let sla = effective_sla_days(knowledge_sla, category_sla, global_sla);

    Ok(FreshnessPolicy {
        sla_days: sla,
        last_verified_at: None,
        next_review_at: None,
        review_owner: None,
        review_status: FreshnessReviewStatus::Unknown,
    })
}

/// Verify a knowledge entry.
///
/// Updates `verified_at` and `verified_by` in the evidence metadata, and
/// computes/updates `next_review_at` and `review_status` in the freshness policy.
/// Returns the updated `FreshnessPolicy`.
pub fn verify_knowledge(
    kb_path: &Path,
    knowledge_path: &str,
    verified_by: &str,
) -> Result<FreshnessPolicy, MemoError> {
    let file_path = kb_path.join(knowledge_path);
    let content = read_knowledge_file(&file_path)?;
    let (mut fm, body) = parse_frontmatter(&content)?;

    let now = Utc::now().to_rfc3339();

    // Update evidence metadata
    let mut evidence = fm.evidence.unwrap_or_default();
    evidence.verified_at = Some(now.clone());
    evidence.verified_by = Some(verified_by.to_string());
    fm.evidence = Some(evidence);

    // Compute effective SLA for next_review_at
    let knowledge_sla = fm.freshness.as_ref().map(|f| f.sla_days);
    let category_sla = fm.category.as_ref().and_then(|cat| {
        let config = load_config(kb_path).ok()?;
        config
            .categories
            .iter()
            .find(|c| c.id == *cat || c.path == *cat)
            .and_then(|c| c.default_sla_days)
    });
    let global_sla = load_config(kb_path)
        .ok()
        .and_then(|c| c.knowledge_policy.map(|p| p.default_sla_days));
    let sla = effective_sla_days(knowledge_sla, category_sla, global_sla);

    // Compute next_review_at
    let next_review_at = chrono::Utc::now() + chrono::Duration::days(sla as i64);

    // Update or create freshness policy
    let mut freshness = fm.freshness.unwrap_or(FreshnessPolicy {
        sla_days: sla,
        last_verified_at: None,
        next_review_at: None,
        review_owner: None,
        review_status: FreshnessReviewStatus::Unknown,
    });
    freshness.sla_days = sla;
    freshness.last_verified_at = Some(now);
    freshness.next_review_at = Some(next_review_at.to_rfc3339());
    freshness.review_status = FreshnessReviewStatus::Ok;
    fm.freshness = Some(freshness.clone());

    let new_content = serialize_knowledge_file(&fm, &body)?;
    write_knowledge_file(&file_path, &new_content)?;

    Ok(freshness)
}

/// List knowledge entries that are due or overdue for review.
///
/// Scans all knowledge files and checks their effective freshness policy.
/// Returns a list of `(relative_path, effective_freshness_policy)` tuples
/// for entries where `review_status` is `Due` or `Overdue`.
pub fn list_due_for_review(kb_path: &Path) -> Result<Vec<(String, FreshnessPolicy)>, MemoError> {
    let config = load_config(kb_path)?;
    let files = collect_markdown_files(kb_path)?;
    let mut due_entries = Vec::new();

    for file_path in &files {
        let relative = file_path
            .strip_prefix(kb_path)
            .ok()
            .map(|p| p.to_string_lossy().replace('\\', "/"))
            .unwrap_or_default();

        // Skip non-.md files and hidden paths
        if !relative.ends_with(".md") || relative.starts_with('.') {
            continue;
        }

        let content = match fs::read_to_string(file_path) {
            Ok(c) => c,
            Err(_) => continue,
        };

        let (fm, _body) = match parse_frontmatter(&content) {
            Ok(result) => result,
            Err(_) => continue,
        };

        // Compute effective SLA
        let knowledge_sla = fm.freshness.as_ref().map(|f| f.sla_days);
        let category_sla = fm.category.as_ref().and_then(|cat| {
            config
                .categories
                .iter()
                .find(|c| c.id == *cat || c.path == *cat)
                .and_then(|c| c.default_sla_days)
        });
        let global_sla = config
            .knowledge_policy
            .as_ref()
            .map(|p| p.default_sla_days);
        let sla = effective_sla_days(knowledge_sla, category_sla, global_sla);

        // Compute effective freshness status
        let freshness = match &fm.freshness {
            Some(f) => {
                // Use the stored freshness but compute current status
                let mut f = f.clone();
                f.sla_days = sla;
                let status = compute_review_status(&f);
                f.review_status = status;
                f
            }
            None => {
                // No explicit freshness policy — synthesize from inheritance
                let last_verified = fm
                    .evidence
                    .as_ref()
                    .and_then(|e| e.verified_at.clone());

                // Use updated_at as a fallback for "last touched" time
                let last_verified_at = last_verified
                    .or_else(|| Some(fm.updated_at.to_rfc3339()));

                let mut f = FreshnessPolicy {
                    sla_days: sla,
                    last_verified_at,
                    next_review_at: None,
                    review_owner: None,
                    review_status: FreshnessReviewStatus::Unknown,
                };
                let status = compute_review_status(&f);
                f.review_status = status;
                f
            }
        };

        match freshness.review_status {
            FreshnessReviewStatus::Due | FreshnessReviewStatus::Overdue => {
                due_entries.push((relative, freshness));
            }
            _ => {}
        }
    }

    Ok(due_entries)
}

/// Compute the review status for a freshness policy based on current time.
fn compute_review_status(freshness: &FreshnessPolicy) -> FreshnessReviewStatus {
    let now = chrono::Utc::now();

    // If next_review_at is set, use it directly
    if let Some(ref next_review_str) = freshness.next_review_at {
        if let Ok(next_review) = next_review_str.parse::<chrono::DateTime<chrono::Utc>>() {
            if now >= next_review {
                // Overdue: past the next_review_at by more than sla_days
                let overdue_threshold =
                    next_review + chrono::Duration::days(freshness.sla_days as i64);
                return if now >= overdue_threshold {
                    FreshnessReviewStatus::Overdue
                } else {
                    FreshnessReviewStatus::Due
                };
            } else {
                return FreshnessReviewStatus::Ok;
            }
        }
    }

    // If no next_review_at, compute from last_verified_at + sla_days
    if let Some(ref last_verified_str) = freshness.last_verified_at {
        if let Ok(last_verified) = last_verified_str.parse::<chrono::DateTime<chrono::Utc>>() {
            let due_time = last_verified + chrono::Duration::days(freshness.sla_days as i64);
            if now >= due_time {
                let overdue_threshold =
                    due_time + chrono::Duration::days(freshness.sla_days as i64);
                return if now >= overdue_threshold {
                    FreshnessReviewStatus::Overdue
                } else {
                    FreshnessReviewStatus::Due
                };
            } else {
                return FreshnessReviewStatus::Ok;
            }
        }
    }

    // No verification info at all — unknown
    FreshnessReviewStatus::Unknown
}

/// Serialize a frontmatter + body back into a complete Markdown file.
fn serialize_knowledge_file(fm: &crate::models::Frontmatter, body: &str) -> Result<String, MemoError> {
    let fm_value = serde_json::to_value(fm).map_err(|e| MemoError {
        code: ErrorCode::InvalidData,
        message: format!("Failed to serialize frontmatter: {}", e),
        retry_after_ms: None,
        context: None,
    })?;
    let yaml = serde_yaml::to_string(&fm_value).map_err(|e| MemoError {
        code: ErrorCode::InvalidData,
        message: format!("Failed to convert frontmatter to YAML: {}", e),
        retry_after_ms: None,
        context: None,
    })?;
    let yaml_content = yaml.trim_start_matches("---\n").trim_end();
    Ok(format!("---\n{}\n---\n{}", yaml_content, body))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::{CategoryConfig, Config, KnowledgePolicy};
    use crate::fs::write_knowledge_file;
    use crate::governance::DEFAULT_SLA_DAYS;
    use chrono::{Duration, Utc};
    use tempfile::TempDir;

    /// Helper: create a minimal test KB with config
    fn create_test_kb() -> (TempDir, std::path::PathBuf) {
        let temp = TempDir::new().unwrap();
        let kb_path = temp.path().to_path_buf();

        // Create .memoforge directory
        fs::create_dir_all(kb_path.join(".memoforge")).unwrap();

        let config = Config {
            version: "1.0".to_string(),
            categories: vec![CategoryConfig {
                id: "tech".to_string(),
                name: "Technology".to_string(),
                path: "tech".to_string(),
                parent_id: None,
                description: None,
                default_sla_days: Some(30),
            }],
            metadata: None,
            knowledge_policy: Some(KnowledgePolicy {
                default_sla_days: 60,
            }),
        };

        let config_yaml = serde_yaml::to_string(&config).unwrap();
        fs::write(kb_path.join(".memoforge/config.yaml"), config_yaml).unwrap();

        // Create category directory
        fs::create_dir_all(kb_path.join("tech")).unwrap();

        (temp, kb_path)
    }

    /// Helper: create a knowledge file with optional evidence/freshness fields
    fn create_knowledge_file(
        kb_path: &Path,
        path: &str,
        evidence: Option<&EvidenceMeta>,
        freshness: Option<&FreshnessPolicy>,
    ) {
        let file_path = kb_path.join(path);
        if let Some(parent) = file_path.parent() {
            fs::create_dir_all(parent).unwrap();
        }

        let now = Utc::now().to_rfc3339();

        // Build a JSON value representing the frontmatter and convert to YAML
        let mut fm_json = serde_json::json!({
            "id": "test-001",
            "title": "Test Knowledge",
            "tags": ["test"],
            "category": "tech",
            "summary": "A test summary",
            "created_at": now,
            "updated_at": now,
        });

        if let Some(e) = evidence {
            fm_json["evidence"] = serde_json::to_value(e).unwrap();
        }
        if let Some(f) = freshness {
            fm_json["freshness"] = serde_json::to_value(f).unwrap();
        }

        // Convert JSON value to YAML (this handles nesting correctly)
        let yaml_str = serde_yaml::to_string(&fm_json).unwrap();
        // serde_yaml produces "---\n<yaml>" — strip the leading "---\n"
        let yaml_content = yaml_str.trim_start_matches("---\n");

        let content = format!("---\n{}---\nTest content", yaml_content);

        write_knowledge_file(&file_path, &content).unwrap();
    }

    #[test]
    fn test_read_evidence_none() {
        let (_temp, kb_path) = create_test_kb();
        create_knowledge_file(&kb_path, "tech/no-evidence.md", None, None);

        let result = read_evidence(&kb_path, "tech/no-evidence.md").unwrap();
        assert!(result.is_none());
    }

    #[test]
    fn test_read_write_evidence_roundtrip() {
        let (_temp, kb_path) = create_test_kb();
        create_knowledge_file(&kb_path, "tech/evidence-test.md", None, None);

        let evidence = EvidenceMeta {
            owner: Some("alice".to_string()),
            source_url: Some("https://example.com".to_string()),
            linked_issue_ids: vec!["ISSUE-1".to_string()],
            linked_pr_ids: vec![],
            linked_commit_shas: vec!["abc123".to_string()],
            command_output_refs: vec![],
            verified_at: Some("2026-01-01T00:00:00Z".to_string()),
            verified_by: Some("bob".to_string()),
            valid_for_version: None,
        };

        write_evidence(&kb_path, "tech/evidence-test.md", &evidence).unwrap();
        let read_back = read_evidence(&kb_path, "tech/evidence-test.md")
            .unwrap()
            .unwrap();
        assert_eq!(read_back.owner.unwrap(), "alice");
        assert_eq!(read_back.verified_by.unwrap(), "bob");
        assert_eq!(read_back.linked_issue_ids.len(), 1);
    }

    #[test]
    fn test_read_freshness_none() {
        let (_temp, kb_path) = create_test_kb();
        create_knowledge_file(&kb_path, "tech/no-freshness.md", None, None);

        let result = read_freshness(&kb_path, "tech/no-freshness.md").unwrap();
        assert!(result.is_none());
    }

    #[test]
    fn test_read_write_freshness_roundtrip() {
        let (_temp, kb_path) = create_test_kb();
        create_knowledge_file(&kb_path, "tech/freshness-test.md", None, None);

        let freshness = FreshnessPolicy {
            sla_days: 30,
            last_verified_at: Some("2026-01-01T00:00:00Z".to_string()),
            next_review_at: Some("2026-02-01T00:00:00Z".to_string()),
            review_owner: Some("alice".to_string()),
            review_status: FreshnessReviewStatus::Ok,
        };

        write_freshness(&kb_path, "tech/freshness-test.md", &freshness).unwrap();
        let read_back = read_freshness(&kb_path, "tech/freshness-test.md")
            .unwrap()
            .unwrap();
        assert_eq!(read_back.sla_days, 30);
        assert_eq!(read_back.review_status, FreshnessReviewStatus::Ok);
        assert_eq!(read_back.review_owner.unwrap(), "alice");
    }

    #[test]
    fn test_effective_freshness_with_explicit_policy() {
        let (_temp, kb_path) = create_test_kb();
        let freshness = FreshnessPolicy {
            sla_days: 7,
            last_verified_at: None,
            next_review_at: None,
            review_owner: None,
            review_status: FreshnessReviewStatus::Unknown,
        };
        create_knowledge_file(&kb_path, "tech/explicit.md", None, Some(&freshness));

        let effective = effective_freshness(&kb_path, "tech/explicit.md").unwrap();
        assert_eq!(effective.sla_days, 7);
    }

    #[test]
    fn test_effective_freshness_inherits_category_sla() {
        let (_temp, kb_path) = create_test_kb();
        // Category "tech" has default_sla_days = 30
        create_knowledge_file(&kb_path, "tech/inherited.md", None, None);

        let effective = effective_freshness(&kb_path, "tech/inherited.md").unwrap();
        assert_eq!(effective.sla_days, 30);
    }

    #[test]
    fn test_effective_freshness_inherits_global_sla() {
        let temp = TempDir::new().unwrap();
        let kb_path = temp.path().to_path_buf();
        fs::create_dir_all(kb_path.join(".memoforge")).unwrap();

        let config = Config {
            version: "1.0".to_string(),
            categories: vec![CategoryConfig {
                id: "notes".to_string(),
                name: "Notes".to_string(),
                path: "notes".to_string(),
                parent_id: None,
                description: None,
                default_sla_days: None, // no category-level SLA
            }],
            metadata: None,
            knowledge_policy: Some(KnowledgePolicy {
                default_sla_days: 45,
            }),
        };
        let config_yaml = serde_yaml::to_string(&config).unwrap();
        fs::write(kb_path.join(".memoforge/config.yaml"), config_yaml).unwrap();
        fs::create_dir_all(kb_path.join("notes")).unwrap();

        create_knowledge_file(&kb_path, "notes/global.md", None, None);

        let effective = effective_freshness(&kb_path, "notes/global.md").unwrap();
        assert_eq!(effective.sla_days, 45);
    }

    #[test]
    fn test_effective_freshness_default_90() {
        let temp = TempDir::new().unwrap();
        let kb_path = temp.path().to_path_buf();
        fs::create_dir_all(kb_path.join(".memoforge")).unwrap();

        let config = Config {
            version: "1.0".to_string(),
            categories: vec![CategoryConfig {
                id: "misc".to_string(),
                name: "Misc".to_string(),
                path: "misc".to_string(),
                parent_id: None,
                description: None,
                default_sla_days: None,
            }],
            metadata: None,
            knowledge_policy: None, // no global policy either
        };
        let config_yaml = serde_yaml::to_string(&config).unwrap();
        fs::write(kb_path.join(".memoforge/config.yaml"), config_yaml).unwrap();
        fs::create_dir_all(kb_path.join("misc")).unwrap();

        create_knowledge_file(&kb_path, "misc/default.md", None, None);

        let effective = effective_freshness(&kb_path, "misc/default.md").unwrap();
        assert_eq!(effective.sla_days, DEFAULT_SLA_DAYS);
    }

    #[test]
    fn test_verify_knowledge() {
        let (_temp, kb_path) = create_test_kb();
        create_knowledge_file(&kb_path, "tech/verify.md", None, None);

        let result = verify_knowledge(&kb_path, "tech/verify.md", "reviewer").unwrap();

        assert_eq!(result.review_status, FreshnessReviewStatus::Ok);
        assert!(result.last_verified_at.is_some());
        assert!(result.next_review_at.is_some());
        // Category SLA is 30
        assert_eq!(result.sla_days, 30);

        // Check evidence was also updated
        let evidence = read_evidence(&kb_path, "tech/verify.md")
            .unwrap()
            .unwrap();
        assert_eq!(evidence.verified_by.unwrap(), "reviewer");
        assert!(evidence.verified_at.is_some());
    }

    #[test]
    fn test_verify_knowledge_with_explicit_freshness() {
        let (_temp, kb_path) = create_test_kb();
        let freshness = FreshnessPolicy {
            sla_days: 7,
            last_verified_at: None,
            next_review_at: None,
            review_owner: Some("alice".to_string()),
            review_status: FreshnessReviewStatus::Unknown,
        };
        create_knowledge_file(&kb_path, "tech/explicit-verify.md", None, Some(&freshness));

        let result = verify_knowledge(&kb_path, "tech/explicit-verify.md", "bob").unwrap();
        assert_eq!(result.sla_days, 7); // Uses knowledge-level SLA
        assert_eq!(result.review_owner.unwrap(), "alice");
    }

    #[test]
    fn test_list_due_for_review() {
        let (_temp, kb_path) = create_test_kb();

        // Create a knowledge entry that was verified long ago (overdue)
        let old_verified = Utc::now() - Duration::days(100);
        let freshness = FreshnessPolicy {
            sla_days: 30,
            last_verified_at: Some(old_verified.to_rfc3339()),
            next_review_at: None,
            review_owner: None,
            review_status: FreshnessReviewStatus::Ok,
        };
        create_knowledge_file(&kb_path, "tech/overdue.md", None, Some(&freshness));

        // Create a fresh knowledge entry (not due)
        let freshness_ok = FreshnessPolicy {
            sla_days: 30,
            last_verified_at: Some(Utc::now().to_rfc3339()),
            next_review_at: Some((Utc::now() + Duration::days(30)).to_rfc3339()),
            review_owner: None,
            review_status: FreshnessReviewStatus::Ok,
        };
        create_knowledge_file(&kb_path, "tech/fresh.md", None, Some(&freshness_ok));

        let due = list_due_for_review(&kb_path).unwrap();
        assert_eq!(due.len(), 1);
        assert!(due[0].0.contains("overdue"));
    }

    #[test]
    fn test_compute_review_status_ok() {
        let freshness = FreshnessPolicy {
            sla_days: 30,
            last_verified_at: Some(Utc::now().to_rfc3339()),
            next_review_at: Some((Utc::now() + Duration::days(30)).to_rfc3339()),
            review_owner: None,
            review_status: FreshnessReviewStatus::Ok,
        };
        assert_eq!(compute_review_status(&freshness), FreshnessReviewStatus::Ok);
    }

    #[test]
    fn test_compute_review_status_due() {
        let due_time = Utc::now() - Duration::days(5);
        let freshness = FreshnessPolicy {
            sla_days: 30,
            last_verified_at: Some((Utc::now() - Duration::days(35)).to_rfc3339()),
            next_review_at: Some(due_time.to_rfc3339()),
            review_owner: None,
            review_status: FreshnessReviewStatus::Ok,
        };
        assert_eq!(compute_review_status(&freshness), FreshnessReviewStatus::Due);
    }

    #[test]
    fn test_compute_review_status_overdue() {
        let due_time = Utc::now() - Duration::days(35);
        let freshness = FreshnessPolicy {
            sla_days: 30,
            last_verified_at: Some((Utc::now() - Duration::days(65)).to_rfc3339()),
            next_review_at: Some(due_time.to_rfc3339()),
            review_owner: None,
            review_status: FreshnessReviewStatus::Ok,
        };
        assert_eq!(
            compute_review_status(&freshness),
            FreshnessReviewStatus::Overdue
        );
    }

    #[test]
    fn test_compute_review_status_from_last_verified() {
        // No next_review_at, but last_verified_at is long ago
        let freshness = FreshnessPolicy {
            sla_days: 30,
            last_verified_at: Some((Utc::now() - Duration::days(45)).to_rfc3339()),
            next_review_at: None,
            review_owner: None,
            review_status: FreshnessReviewStatus::Unknown,
        };
        assert_eq!(compute_review_status(&freshness), FreshnessReviewStatus::Due);
    }

    #[test]
    fn test_compute_review_status_unknown() {
        let freshness = FreshnessPolicy {
            sla_days: 30,
            last_verified_at: None,
            next_review_at: None,
            review_owner: None,
            review_status: FreshnessReviewStatus::Unknown,
        };
        assert_eq!(
            compute_review_status(&freshness),
            FreshnessReviewStatus::Unknown
        );
    }
}
