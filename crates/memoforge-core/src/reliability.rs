//! Reliability Issue Model
//!
//! Defines the core data structures for tracking knowledge base reliability issues.

use chrono::Utc;
use serde::{Deserialize, Serialize};
use ulid::Ulid;

/// Reliability issue severity levels
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum IssueSeverity {
    Low,
    Medium,
    High,
}

impl IssueSeverity {
    pub fn as_str(&self) -> &'static str {
        match self {
            IssueSeverity::Low => "low",
            IssueSeverity::Medium => "medium",
            IssueSeverity::High => "high",
        }
    }
}

/// Reliability issue status
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum IssueStatus {
    Open,
    Ignored,
    Resolved,
}

impl IssueStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            IssueStatus::Open => "open",
            IssueStatus::Ignored => "ignored",
            IssueStatus::Resolved => "resolved",
        }
    }

    pub fn can_transition_to(&self, new_status: IssueStatus) -> bool {
        match (self, new_status) {
            (IssueStatus::Open, IssueStatus::Ignored) => true,
            (IssueStatus::Open, IssueStatus::Resolved) => true,
            (IssueStatus::Ignored, IssueStatus::Open) => true,
            (IssueStatus::Resolved, IssueStatus::Open) => true,
            _ => false,
        }
    }
}

/// Rule keys for different types of reliability checks
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RuleKey {
    NoSummary,
    NoTags,
    NoCategory,
    StaleContent,
    BrokenLink,
    OrphanedKnowledge,
}

impl RuleKey {
    pub fn as_str(&self) -> &'static str {
        match self {
            RuleKey::NoSummary => "no_summary",
            RuleKey::NoTags => "no_tags",
            RuleKey::NoCategory => "no_category",
            RuleKey::StaleContent => "stale_content",
            RuleKey::BrokenLink => "broken_link",
            RuleKey::OrphanedKnowledge => "orphaned_knowledge",
        }
    }

    pub fn default_severity(&self) -> IssueSeverity {
        match self {
            RuleKey::NoSummary => IssueSeverity::Medium,
            RuleKey::NoTags => IssueSeverity::Low,
            RuleKey::NoCategory => IssueSeverity::Medium,
            RuleKey::StaleContent => IssueSeverity::Medium,
            RuleKey::BrokenLink => IssueSeverity::High,
            RuleKey::OrphanedKnowledge => IssueSeverity::Low,
        }
    }
}

/// A reliability issue detected in the knowledge base
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReliabilityIssue {
    /// Unique issue identifier
    pub id: String,
    /// Rule that triggered this issue
    pub rule_key: RuleKey,
    /// Path to the knowledge file
    pub knowledge_path: String,
    /// Severity level
    pub severity: IssueSeverity,
    /// Current status
    pub status: IssueStatus,
    /// Issue summary
    pub summary: String,
    /// ID of linked draft that addresses this issue
    #[serde(skip_serializing_if = "Option::is_none")]
    pub linked_draft_id: Option<String>,
    /// When the issue was detected
    pub detected_at: String,
    /// When the issue was last updated
    #[serde(skip_serializing_if = "Option::is_none")]
    pub updated_at: Option<String>,
}

impl ReliabilityIssue {
    /// Create a new reliability issue
    pub fn new(rule_key: RuleKey, knowledge_path: String, summary: String) -> Self {
        let id = Ulid::new().to_string();
        let severity = rule_key.default_severity();
        let detected_at = Utc::now().to_rfc3339();

        Self {
            id,
            rule_key,
            knowledge_path,
            severity,
            status: IssueStatus::Open,
            summary,
            linked_draft_id: None,
            detected_at: detected_at.clone(),
            updated_at: Some(detected_at),
        }
    }

    /// Update the issue status
    pub fn update_status(&mut self, new_status: IssueStatus) -> Result<(), String> {
        if !self.status.can_transition_to(new_status) {
            return Err(format!(
                "Cannot transition from {:?} to {:?}",
                self.status, new_status
            ));
        }
        self.status = new_status;
        self.updated_at = Some(Utc::now().to_rfc3339());
        Ok(())
    }

    /// Link a draft to this issue
    pub fn link_draft(&mut self, draft_id: String) {
        self.linked_draft_id = Some(draft_id);
        self.updated_at = Some(Utc::now().to_rfc3339());
    }

    /// Unlink the draft from this issue
    pub fn unlink_draft(&mut self) {
        self.linked_draft_id = None;
        self.updated_at = Some(Utc::now().to_rfc3339());
    }

    /// Check if the issue is considered resolved
    pub fn is_resolved(&self) -> bool {
        matches!(self.status, IssueStatus::Resolved)
    }

    /// Check if the issue is active (not ignored or resolved)
    pub fn is_active(&self) -> bool {
        matches!(self.status, IssueStatus::Open)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_issue_severity_as_str() {
        assert_eq!(IssueSeverity::Low.as_str(), "low");
        assert_eq!(IssueSeverity::Medium.as_str(), "medium");
        assert_eq!(IssueSeverity::High.as_str(), "high");
    }

    #[test]
    fn test_issue_status_as_str() {
        assert_eq!(IssueStatus::Open.as_str(), "open");
        assert_eq!(IssueStatus::Ignored.as_str(), "ignored");
        assert_eq!(IssueStatus::Resolved.as_str(), "resolved");
    }

    #[test]
    fn test_issue_status_transitions() {
        // Valid transitions
        assert!(IssueStatus::Open.can_transition_to(IssueStatus::Ignored));
        assert!(IssueStatus::Open.can_transition_to(IssueStatus::Resolved));
        assert!(IssueStatus::Ignored.can_transition_to(IssueStatus::Open));
        assert!(IssueStatus::Resolved.can_transition_to(IssueStatus::Open));

        // Invalid transitions
        assert!(!IssueStatus::Ignored.can_transition_to(IssueStatus::Resolved));
        assert!(!IssueStatus::Resolved.can_transition_to(IssueStatus::Ignored));
    }

    #[test]
    fn test_rule_key_as_str() {
        assert_eq!(RuleKey::NoSummary.as_str(), "no_summary");
        assert_eq!(RuleKey::NoTags.as_str(), "no_tags");
        assert_eq!(RuleKey::NoCategory.as_str(), "no_category");
        assert_eq!(RuleKey::StaleContent.as_str(), "stale_content");
        assert_eq!(RuleKey::BrokenLink.as_str(), "broken_link");
        assert_eq!(RuleKey::OrphanedKnowledge.as_str(), "orphaned_knowledge");
    }

    #[test]
    fn test_rule_key_default_severity() {
        assert_eq!(RuleKey::NoSummary.default_severity(), IssueSeverity::Medium);
        assert_eq!(RuleKey::NoTags.default_severity(), IssueSeverity::Low);
        assert_eq!(
            RuleKey::NoCategory.default_severity(),
            IssueSeverity::Medium
        );
        assert_eq!(
            RuleKey::StaleContent.default_severity(),
            IssueSeverity::Medium
        );
        assert_eq!(RuleKey::BrokenLink.default_severity(), IssueSeverity::High);
        assert_eq!(
            RuleKey::OrphanedKnowledge.default_severity(),
            IssueSeverity::Low
        );
    }

    #[test]
    fn test_create_issue() {
        let issue = ReliabilityIssue::new(
            RuleKey::NoSummary,
            "knowledge/test.md".to_string(),
            "Knowledge lacks a summary".to_string(),
        );

        assert!(!issue.id.is_empty());
        assert_eq!(issue.rule_key, RuleKey::NoSummary);
        assert_eq!(issue.knowledge_path, "knowledge/test.md");
        assert_eq!(issue.severity, IssueSeverity::Medium);
        assert_eq!(issue.status, IssueStatus::Open);
        assert!(!issue.is_resolved());
        assert!(issue.is_active());
        assert!(issue.linked_draft_id.is_none());
    }

    #[test]
    fn test_update_status() {
        let mut issue = ReliabilityIssue::new(
            RuleKey::NoTags,
            "knowledge/test.md".to_string(),
            "No tags".to_string(),
        );

        // Valid transition
        assert!(issue.update_status(IssueStatus::Ignored).is_ok());
        assert_eq!(issue.status, IssueStatus::Ignored);
        assert!(!issue.is_active());

        // Invalid transition
        assert!(issue.update_status(IssueStatus::Resolved).is_err());
    }

    #[test]
    fn test_link_draft() {
        let mut issue = ReliabilityIssue::new(
            RuleKey::BrokenLink,
            "knowledge/test.md".to_string(),
            "Broken link".to_string(),
        );

        assert!(issue.linked_draft_id.is_none());

        issue.link_draft("draft-123".to_string());
        assert_eq!(issue.linked_draft_id, Some("draft-123".to_string()));

        issue.unlink_draft();
        assert!(issue.linked_draft_id.is_none());
    }

    #[test]
    fn test_serialization() {
        let issue = ReliabilityIssue::new(
            RuleKey::NoSummary,
            "knowledge/test.md".to_string(),
            "Test issue".to_string(),
        );

        let json = serde_json::to_string(&issue).unwrap();
        let deserialized: ReliabilityIssue = serde_json::from_str(&json).unwrap();

        assert_eq!(deserialized.id, issue.id);
        assert_eq!(deserialized.rule_key, issue.rule_key);
        assert_eq!(deserialized.knowledge_path, issue.knowledge_path);
    }
}
