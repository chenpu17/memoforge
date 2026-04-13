//! Knowledge governance model
//! v0.3.0: Evidence Meta + Freshness Policy

use serde::{Deserialize, Serialize};

/// Minimal evidence layer for knowledge trustworthiness
/// Storage: frontmatter.evidence
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct EvidenceMeta {
    /// Owner (responsible person)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub owner: Option<String>,
    /// Source URL
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_url: Option<String>,
    /// Linked issue IDs
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub linked_issue_ids: Vec<String>,
    /// Linked PR IDs
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub linked_pr_ids: Vec<String>,
    /// Linked commit SHAs
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub linked_commit_shas: Vec<String>,
    /// Command output references
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub command_output_refs: Vec<String>,
    /// Last verification time
    #[serde(skip_serializing_if = "Option::is_none")]
    pub verified_at: Option<String>,
    /// Verifier
    #[serde(skip_serializing_if = "Option::is_none")]
    pub verified_by: Option<String>,
    /// Applicable version
    #[serde(skip_serializing_if = "Option::is_none")]
    pub valid_for_version: Option<String>,
}

/// Freshness review status
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum FreshnessReviewStatus {
    #[default]
    Unknown,
    Ok,
    Due,
    Overdue,
}

/// Knowledge freshness review and governance policy
/// Storage: frontmatter.freshness
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FreshnessPolicy {
    /// Review cycle in days
    pub sla_days: u32,
    /// Last verification time
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_verified_at: Option<String>,
    /// Next review time
    #[serde(skip_serializing_if = "Option::is_none")]
    pub next_review_at: Option<String>,
    /// Review responsible person
    #[serde(skip_serializing_if = "Option::is_none")]
    pub review_owner: Option<String>,
    /// Current review status
    #[serde(default)]
    pub review_status: FreshnessReviewStatus,
}

/// Default SLA days
pub const DEFAULT_SLA_DAYS: u32 = 90;

/// Calculate effective SLA days with inheritance chain:
/// knowledge > category > global > default (90 days)
pub fn effective_sla_days(
    knowledge_sla: Option<u32>,
    category_sla: Option<u32>,
    global_sla: Option<u32>,
) -> u32 {
    knowledge_sla
        .or(category_sla)
        .or(global_sla)
        .unwrap_or(DEFAULT_SLA_DAYS)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn evidence_meta_default_is_empty() {
        let meta = EvidenceMeta::default();
        assert!(meta.owner.is_none());
        assert!(meta.source_url.is_none());
        assert!(meta.linked_issue_ids.is_empty());
        assert!(meta.linked_pr_ids.is_empty());
        assert!(meta.linked_commit_shas.is_empty());
        assert!(meta.command_output_refs.is_empty());
        assert!(meta.verified_at.is_none());
        assert!(meta.verified_by.is_none());
        assert!(meta.valid_for_version.is_none());
    }

    #[test]
    fn evidence_meta_serialization_roundtrip() {
        let meta = EvidenceMeta {
            owner: Some("alice".into()),
            source_url: Some("https://github.com/org/repo/pull/42".into()),
            linked_issue_ids: vec!["ISSUE-1".into()],
            linked_pr_ids: vec!["PR-42".into()],
            linked_commit_shas: vec!["abc123".into()],
            command_output_refs: vec![],
            verified_at: Some("2026-01-15T10:00:00Z".into()),
            verified_by: Some("bob".into()),
            valid_for_version: Some("2.0.0".into()),
        };
        let json = serde_json::to_string(&meta).unwrap();
        let deserialized: EvidenceMeta = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.owner.unwrap(), "alice");
        assert_eq!(deserialized.linked_issue_ids.len(), 1);
        assert_eq!(deserialized.linked_pr_ids[0], "PR-42");
        assert!(deserialized.command_output_refs.is_empty());
    }

    #[test]
    fn evidence_meta_skips_empty_and_none_fields() {
        let meta = EvidenceMeta {
            owner: None,
            source_url: None,
            linked_issue_ids: vec![],
            linked_pr_ids: vec![],
            linked_commit_shas: vec![],
            command_output_refs: vec![],
            verified_at: None,
            verified_by: None,
            valid_for_version: None,
        };
        let json = serde_json::to_string(&meta).unwrap();
        // Default/empty EvidenceMeta should serialize to `{}`
        assert_eq!(json, "{}");
    }

    #[test]
    fn freshness_policy_serialization_roundtrip() {
        let policy = FreshnessPolicy {
            sla_days: 30,
            last_verified_at: Some("2026-01-01T00:00:00Z".into()),
            next_review_at: Some("2026-02-01T00:00:00Z".into()),
            review_owner: Some("alice".into()),
            review_status: FreshnessReviewStatus::Ok,
        };
        let json = serde_json::to_string(&policy).unwrap();
        let deserialized: FreshnessPolicy = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.sla_days, 30);
        assert_eq!(deserialized.review_status, FreshnessReviewStatus::Ok);
        assert_eq!(deserialized.review_owner.unwrap(), "alice");
    }

    #[test]
    fn freshness_review_status_serialization() {
        assert_eq!(
            serde_json::to_string(&FreshnessReviewStatus::Unknown).unwrap(),
            "\"unknown\""
        );
        assert_eq!(
            serde_json::to_string(&FreshnessReviewStatus::Ok).unwrap(),
            "\"ok\""
        );
        assert_eq!(
            serde_json::to_string(&FreshnessReviewStatus::Due).unwrap(),
            "\"due\""
        );
        assert_eq!(
            serde_json::to_string(&FreshnessReviewStatus::Overdue).unwrap(),
            "\"overdue\""
        );
    }

    #[test]
    fn freshness_review_status_default_is_unknown() {
        assert_eq!(FreshnessReviewStatus::default(), FreshnessReviewStatus::Unknown);
    }

    #[test]
    fn effective_sla_days_uses_knowledge_first() {
        assert_eq!(effective_sla_days(Some(10), Some(20), Some(30)), 10);
    }

    #[test]
    fn effective_sla_days_falls_back_to_category() {
        assert_eq!(effective_sla_days(None, Some(20), Some(30)), 20);
    }

    #[test]
    fn effective_sla_days_falls_back_to_global() {
        assert_eq!(effective_sla_days(None, None, Some(30)), 30);
    }

    #[test]
    fn effective_sla_days_uses_default() {
        assert_eq!(effective_sla_days(None, None, None), DEFAULT_SLA_DAYS);
        assert_eq!(effective_sla_days(None, None, None), 90);
    }

    #[test]
    fn default_sla_days_is_90() {
        assert_eq!(DEFAULT_SLA_DAYS, 90);
    }
}
