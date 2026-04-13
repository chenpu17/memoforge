//! Reliability Issue Storage
//!
//! Manages persistence of reliability issues to `.memoforge/reliability/` directory
//! with an index file for efficient querying.

use crate::error::{ErrorCode, MemoError};
use crate::reliability::{IssueSeverity, IssueStatus, ReliabilityIssue, RuleKey};
use serde::{Deserialize, Serialize};
use std::fs;

/// Index entry for reliability issues.
#[derive(Debug, Clone, Serialize, Deserialize)]
struct ReliabilityIndexEntry {
    id: String,
    rule_key: RuleKey,
    knowledge_path: String,
    severity: IssueSeverity,
    status: IssueStatus,
    summary: String,
    detected_at: String,
}

/// Index for efficient querying without loading all issues.
#[derive(Debug, Clone, Serialize, Deserialize)]
struct ReliabilityIndex {
    issues: Vec<ReliabilityIndexEntry>,
}

impl ReliabilityIndex {
    fn new() -> Self {
        Self { issues: Vec::new() }
    }

    fn add(&mut self, issue: &ReliabilityIssue) {
        let entry = ReliabilityIndexEntry {
            id: issue.id.clone(),
            rule_key: issue.rule_key.clone(),
            knowledge_path: issue.knowledge_path.clone(),
            severity: issue.severity,
            status: issue.status,
            summary: issue.summary.clone(),
            detected_at: issue.detected_at.clone(),
        };

        // Update existing entry or add new one
        if let Some(pos) = self.issues.iter().position(|e| e.id == issue.id) {
            self.issues[pos] = entry;
        } else {
            self.issues.push(entry);
        }
    }

    fn remove(&mut self, id: &str) {
        self.issues.retain(|e| e.id != id);
    }
}

/// Query filters for listing reliability issues.
#[derive(Debug, Clone, Default)]
pub struct ListFilter {
    /// Filter by severity
    pub severity: Option<IssueSeverity>,
    /// Filter by status
    pub status: Option<IssueStatus>,
    /// Filter by rule key
    pub rule_key: Option<RuleKey>,
    /// Filter by knowledge path (prefix match)
    pub knowledge_path_prefix: Option<String>,
    /// Maximum number of results
    pub limit: Option<usize>,
    /// Include resolved issues (default: false)
    pub include_resolved: bool,
}

/// Reliability storage manager.
///
/// Manages persistence of reliability issues to `.memoforge/reliability/` directory
/// with an index file for efficient querying.
pub struct ReliabilityStore {
    kb_path: std::path::PathBuf,
}

impl ReliabilityStore {
    /// Create a new reliability store for the given knowledge base path.
    pub fn new(kb_path: std::path::PathBuf) -> Self {
        Self { kb_path }
    }

    fn reliability_dir(&self) -> std::path::PathBuf {
        self.kb_path.join(".memoforge/reliability")
    }

    fn index_path(&self) -> std::path::PathBuf {
        self.reliability_dir().join("index.json")
    }

    fn issue_path(&self, id: &str) -> Result<std::path::PathBuf, MemoError> {
        crate::error::validate_storage_id(id, "issue ID")?;
        Ok(self.reliability_dir().join(format!("{}.json", id)))
    }

    /// Ensure the reliability directory exists.
    fn ensure_dir(&self) -> Result<(), MemoError> {
        fs::create_dir_all(self.reliability_dir()).map_err(|e| MemoError {
            code: ErrorCode::InvalidPath,
            message: format!("Failed to create reliability directory: {}", e),
            retry_after_ms: None,
            context: None,
        })?;

        // Ensure .memoforge/.gitignore includes reliability/
        let gitignore_path = self.kb_path.join(".memoforge/.gitignore");
        let gitignore_content = if gitignore_path.exists() {
            fs::read_to_string(&gitignore_path).unwrap_or_default()
        } else {
            String::new()
        };

        if !gitignore_content
            .lines()
            .any(|l| l.trim() == "reliability/")
        {
            let new_content = if gitignore_content.is_empty() {
                "reliability/\n".to_string()
            } else if gitignore_content.ends_with('\n') {
                format!("{}reliability/\n", gitignore_content)
            } else {
                format!("{}\nreliability/\n", gitignore_content)
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

    /// Load the index from disk.
    fn load_index(&self) -> Result<ReliabilityIndex, MemoError> {
        let index_path = self.index_path();
        if !index_path.exists() {
            return Ok(ReliabilityIndex::new());
        }

        let content = fs::read_to_string(&index_path).map_err(|e| MemoError {
            code: ErrorCode::InvalidData,
            message: format!("Failed to read reliability index: {}", e),
            retry_after_ms: None,
            context: None,
        })?;

        serde_json::from_str(&content).map_err(|e| MemoError {
            code: ErrorCode::InvalidData,
            message: format!("Failed to parse reliability index: {}", e),
            retry_after_ms: None,
            context: None,
        })
    }

    /// Save the index to disk.
    fn save_index(&self, index: &ReliabilityIndex) -> Result<(), MemoError> {
        let index_path = self.index_path();
        let json = serde_json::to_string_pretty(index).map_err(|e| MemoError {
            code: ErrorCode::InvalidData,
            message: format!("Failed to serialize reliability index: {}", e),
            retry_after_ms: None,
            context: None,
        })?;

        fs::write(&index_path, json).map_err(|e| MemoError {
            code: ErrorCode::InvalidPath,
            message: format!("Failed to write reliability index: {}", e),
            retry_after_ms: None,
            context: None,
        })?;

        Ok(())
    }

    /// Save reliability issues (overwrites existing issues)
    pub fn save_issues(&self, issues: Vec<ReliabilityIssue>) -> Result<(), MemoError> {
        self.ensure_dir()?;

        // Clear existing issues
        let reliability_dir = self.reliability_dir();
        if reliability_dir.exists() {
            for entry in fs::read_dir(&reliability_dir).map_err(|e| MemoError {
                code: ErrorCode::InvalidPath,
                message: format!("Failed to read reliability directory: {}", e),
                retry_after_ms: None,
                context: None,
            })? {
                let entry = entry.map_err(|e| MemoError {
                    code: ErrorCode::InvalidPath,
                    message: format!("Failed to read directory entry: {}", e),
                    retry_after_ms: None,
                    context: None,
                })?;

                let path = entry.path();
                if path.is_file()
                    && path.extension().and_then(|ext| ext.to_str()) == Some("json")
                    && path.file_name().and_then(|n| n.to_str()) != Some("index.json")
                {
                    fs::remove_file(&path).map_err(|e| MemoError {
                        code: ErrorCode::InvalidPath,
                        message: format!("Failed to remove old issue file: {}", e),
                        retry_after_ms: None,
                        context: None,
                    })?;
                }
            }
        }

        // Save new issues
        let mut index = ReliabilityIndex::new();
        for issue in &issues {
            let issue_path = self.issue_path(&issue.id)?;
            let json = serde_json::to_string_pretty(issue).map_err(|e| MemoError {
                code: ErrorCode::InvalidData,
                message: format!("Failed to serialize reliability issue: {}", e),
                retry_after_ms: None,
                context: None,
            })?;

            fs::write(&issue_path, json).map_err(|e| MemoError {
                code: ErrorCode::InvalidPath,
                message: format!("Failed to write reliability issue: {}", e),
                retry_after_ms: None,
                context: None,
            })?;

            index.add(issue);
        }

        self.save_index(&index)?;

        Ok(())
    }

    /// Get a reliability issue by ID.
    pub fn get_issue(&self, id: &str) -> Result<ReliabilityIssue, MemoError> {
        let issue_path = self.issue_path(id)?;
        if !issue_path.exists() {
            return Err(MemoError {
                code: ErrorCode::NotFoundKnowledge,
                message: format!("Reliability issue not found: {}", id),
                retry_after_ms: None,
                context: None,
            });
        }

        let content = fs::read_to_string(&issue_path).map_err(|e| MemoError {
            code: ErrorCode::NotFoundKnowledge,
            message: format!("Failed to read reliability issue: {}", e),
            retry_after_ms: None,
            context: None,
        })?;

        serde_json::from_str(&content).map_err(|e| MemoError {
            code: ErrorCode::InvalidData,
            message: format!("Failed to parse reliability issue: {}", e),
            retry_after_ms: None,
            context: None,
        })
    }

    /// List reliability issues with optional filtering.
    pub fn list_issues(&self, filter: ListFilter) -> Result<Vec<ReliabilityIssue>, MemoError> {
        self.ensure_dir()?;

        let index = self.load_index()?;
        let mut filtered: Vec<_> = index
            .issues
            .iter()
            .filter(|entry| {
                // Apply status filter
                if let Some(ref status) = filter.status {
                    if &entry.status != status {
                        return false;
                    }
                }

                // Apply severity filter
                if let Some(ref severity) = filter.severity {
                    if &entry.severity != severity {
                        return false;
                    }
                }

                // Apply rule key filter
                if let Some(ref rule_key) = filter.rule_key {
                    if &entry.rule_key != rule_key {
                        return false;
                    }
                }

                // Apply knowledge path prefix filter
                if let Some(ref prefix) = filter.knowledge_path_prefix {
                    if !entry.knowledge_path.starts_with(prefix) {
                        return false;
                    }
                }

                // Apply resolved filter
                if !filter.include_resolved && entry.status == IssueStatus::Resolved {
                    return false;
                }

                true
            })
            .collect();

        // Sort by severity (High > Medium > Low) and then by detection time (newest first)
        filtered.sort_by(|a, b| {
            let severity_order = |s: &IssueSeverity| match s {
                IssueSeverity::High => 0,
                IssueSeverity::Medium => 1,
                IssueSeverity::Low => 2,
            };
            severity_order(&b.severity)
                .cmp(&severity_order(&a.severity))
                .then_with(|| b.detected_at.cmp(&a.detected_at))
        });

        // Apply limit
        if let Some(limit) = filter.limit {
            filtered.truncate(limit);
        }

        // Load full issues
        let mut issues = Vec::new();
        for entry in filtered {
            if let Ok(issue) = self.get_issue(&entry.id) {
                issues.push(issue);
            }
        }

        Ok(issues)
    }

    /// Update the status of a reliability issue.
    pub fn update_issue_status(
        &self,
        id: &str,
        new_status: IssueStatus,
    ) -> Result<ReliabilityIssue, MemoError> {
        let mut issue = self.get_issue(id)?;

        issue.update_status(new_status).map_err(|e| MemoError {
            code: ErrorCode::InvalidArgument,
            message: e,
            retry_after_ms: None,
            context: None,
        })?;

        // Save updated issue
        let issue_path = self.issue_path(id)?;
        let json = serde_json::to_string_pretty(&issue).map_err(|e| MemoError {
            code: ErrorCode::InvalidData,
            message: format!("Failed to serialize reliability issue: {}", e),
            retry_after_ms: None,
            context: None,
        })?;

        fs::write(&issue_path, json).map_err(|e| MemoError {
            code: ErrorCode::InvalidPath,
            message: format!("Failed to write reliability issue: {}", e),
            retry_after_ms: None,
            context: None,
        })?;

        // Update index
        let mut index = self.load_index()?;
        index.add(&issue);
        self.save_index(&index)?;

        Ok(issue)
    }

    /// Link a draft to a reliability issue.
    pub fn link_draft(
        &self,
        issue_id: &str,
        draft_id: String,
    ) -> Result<ReliabilityIssue, MemoError> {
        let mut issue = self.get_issue(issue_id)?;
        issue.link_draft(draft_id);

        // Save updated issue
        let issue_path = self.issue_path(issue_id)?;
        let json = serde_json::to_string_pretty(&issue).map_err(|e| MemoError {
            code: ErrorCode::InvalidData,
            message: format!("Failed to serialize reliability issue: {}", e),
            retry_after_ms: None,
            context: None,
        })?;

        fs::write(&issue_path, json).map_err(|e| MemoError {
            code: ErrorCode::InvalidPath,
            message: format!("Failed to write reliability issue: {}", e),
            retry_after_ms: None,
            context: None,
        })?;

        // Update index
        let mut index = self.load_index()?;
        index.add(&issue);
        self.save_index(&index)?;

        Ok(issue)
    }

    /// Unlink the draft from a reliability issue.
    pub fn unlink_draft(&self, issue_id: &str) -> Result<ReliabilityIssue, MemoError> {
        let mut issue = self.get_issue(issue_id)?;
        issue.unlink_draft();

        // Save updated issue
        let issue_path = self.issue_path(issue_id)?;
        let json = serde_json::to_string_pretty(&issue).map_err(|e| MemoError {
            code: ErrorCode::InvalidData,
            message: format!("Failed to serialize reliability issue: {}", e),
            retry_after_ms: None,
            context: None,
        })?;

        fs::write(&issue_path, json).map_err(|e| MemoError {
            code: ErrorCode::InvalidPath,
            message: format!("Failed to write reliability issue: {}", e),
            retry_after_ms: None,
            context: None,
        })?;

        // Update index
        let mut index = self.load_index()?;
        index.add(&issue);
        self.save_index(&index)?;

        Ok(issue)
    }

    /// Delete a reliability issue.
    pub fn delete_issue(&self, id: &str) -> Result<(), MemoError> {
        let issue_path = self.issue_path(id)?;
        if !issue_path.exists() {
            return Err(MemoError {
                code: ErrorCode::NotFoundKnowledge,
                message: format!("Reliability issue not found: {}", id),
                retry_after_ms: None,
                context: None,
            });
        }

        fs::remove_file(&issue_path).map_err(|e| MemoError {
            code: ErrorCode::InvalidPath,
            message: format!("Failed to delete reliability issue: {}", e),
            retry_after_ms: None,
            context: None,
        })?;

        // Remove from index
        let mut index = self.load_index()?;
        index.remove(id);
        self.save_index(&index)?;

        Ok(())
    }

    /// Get statistics about reliability issues.
    pub fn get_stats(&self) -> Result<ReliabilityStats, MemoError> {
        let index = self.load_index()?;

        let mut stats = ReliabilityStats::default();

        for entry in &index.issues {
            stats.total += 1;

            match entry.status {
                IssueStatus::Open => stats.open += 1,
                IssueStatus::Ignored => stats.ignored += 1,
                IssueStatus::Resolved => stats.resolved += 1,
            }

            match entry.severity {
                IssueSeverity::High => stats.high_severity += 1,
                IssueSeverity::Medium => stats.medium_severity += 1,
                IssueSeverity::Low => stats.low_severity += 1,
            }
        }

        Ok(stats)
    }
}

/// Statistics about reliability issues.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ReliabilityStats {
    pub total: usize,
    pub open: usize,
    pub ignored: usize,
    pub resolved: usize,
    pub high_severity: usize,
    pub medium_severity: usize,
    pub low_severity: usize,
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn setup_store() -> (TempDir, ReliabilityStore) {
        let temp = TempDir::new().unwrap();
        let kb_path = temp.path().to_path_buf();

        // Initialize KB structure
        fs::create_dir_all(kb_path.join(".memoforge")).unwrap();

        let store = ReliabilityStore::new(kb_path);
        store.ensure_dir().unwrap();

        (temp, store)
    }

    #[test]
    fn test_save_and_get_issue() {
        let (_temp, store) = setup_store();

        let issue = ReliabilityIssue::new(
            RuleKey::NoSummary,
            "knowledge/test.md".to_string(),
            "Test issue".to_string(),
        );

        store.save_issues(vec![issue.clone()]).unwrap();

        let retrieved = store.get_issue(&issue.id).unwrap();
        assert_eq!(retrieved.id, issue.id);
        assert_eq!(retrieved.rule_key, issue.rule_key);
        assert_eq!(retrieved.knowledge_path, issue.knowledge_path);
    }

    #[test]
    fn test_list_issues_no_filter() {
        let (_temp, store) = setup_store();

        // Create all issues and save them together
        let issues: Vec<ReliabilityIssue> = (0..5)
            .map(|i| {
                ReliabilityIssue::new(
                    RuleKey::NoTags,
                    format!("knowledge/file-{}.md", i),
                    format!("Issue {}", i),
                )
            })
            .collect();

        store.save_issues(issues).unwrap();

        let issues = store.list_issues(ListFilter::default()).unwrap();
        assert_eq!(issues.len(), 5);
    }

    #[test]
    fn test_list_issues_with_status_filter() {
        let (_temp, store) = setup_store();

        let mut issue1 = ReliabilityIssue::new(
            RuleKey::NoSummary,
            "knowledge/test1.md".to_string(),
            "Issue 1".to_string(),
        );
        let issue2 = ReliabilityIssue::new(
            RuleKey::NoTags,
            "knowledge/test2.md".to_string(),
            "Issue 2".to_string(),
        );

        issue1.status = IssueStatus::Ignored;
        store.save_issues(vec![issue1, issue2]).unwrap();

        // Filter by Open status
        let open_issues = store
            .list_issues(ListFilter {
                status: Some(IssueStatus::Open),
                ..Default::default()
            })
            .unwrap();
        assert_eq!(open_issues.len(), 1);

        // Filter by Ignored status
        let ignored_issues = store
            .list_issues(ListFilter {
                status: Some(IssueStatus::Ignored),
                ..Default::default()
            })
            .unwrap();
        assert_eq!(ignored_issues.len(), 1);
    }

    #[test]
    fn test_list_issues_with_severity_filter() {
        let (_temp, store) = setup_store();

        let issue1 = ReliabilityIssue::new(
            RuleKey::BrokenLink,
            "knowledge/high.md".to_string(),
            "High severity".to_string(),
        );
        let issue2 = ReliabilityIssue::new(
            RuleKey::NoTags,
            "knowledge/low.md".to_string(),
            "Low severity".to_string(),
        );

        store.save_issues(vec![issue1, issue2]).unwrap();

        // Filter by High severity
        let high_issues = store
            .list_issues(ListFilter {
                severity: Some(IssueSeverity::High),
                ..Default::default()
            })
            .unwrap();
        assert_eq!(high_issues.len(), 1);
        assert_eq!(high_issues[0].severity, IssueSeverity::High);
    }

    #[test]
    fn test_list_issues_with_rule_key_filter() {
        let (_temp, store) = setup_store();

        let issue1 = ReliabilityIssue::new(
            RuleKey::NoSummary,
            "knowledge/test1.md".to_string(),
            "No summary".to_string(),
        );
        let issue2 = ReliabilityIssue::new(
            RuleKey::NoTags,
            "knowledge/test2.md".to_string(),
            "No tags".to_string(),
        );

        store.save_issues(vec![issue1, issue2]).unwrap();

        // Filter by NoTags rule
        let no_tags_issues = store
            .list_issues(ListFilter {
                rule_key: Some(RuleKey::NoTags),
                ..Default::default()
            })
            .unwrap();
        assert_eq!(no_tags_issues.len(), 1);
        assert_eq!(no_tags_issues[0].rule_key, RuleKey::NoTags);
    }

    #[test]
    fn test_list_issues_with_limit() {
        let (_temp, store) = setup_store();

        let issues: Vec<ReliabilityIssue> = (0..10)
            .map(|i| {
                ReliabilityIssue::new(
                    RuleKey::NoTags,
                    format!("knowledge/file-{}.md", i),
                    format!("Issue {}", i),
                )
            })
            .collect();

        store.save_issues(issues).unwrap();

        let issues = store
            .list_issues(ListFilter {
                limit: Some(3),
                ..Default::default()
            })
            .unwrap();
        assert_eq!(issues.len(), 3);
    }

    #[test]
    fn test_list_issues_include_resolved() {
        let (_temp, store) = setup_store();

        let mut issue1 = ReliabilityIssue::new(
            RuleKey::NoSummary,
            "knowledge/test1.md".to_string(),
            "Issue 1".to_string(),
        );
        let issue2 = ReliabilityIssue::new(
            RuleKey::NoTags,
            "knowledge/test2.md".to_string(),
            "Issue 2".to_string(),
        );

        issue1.status = IssueStatus::Resolved;
        store.save_issues(vec![issue1, issue2]).unwrap();

        // Without include_resolved (default)
        let active_issues = store.list_issues(ListFilter::default()).unwrap();
        assert_eq!(active_issues.len(), 1);

        // With include_resolved
        let all_issues = store
            .list_issues(ListFilter {
                include_resolved: true,
                ..Default::default()
            })
            .unwrap();
        assert_eq!(all_issues.len(), 2);
    }

    #[test]
    fn test_update_issue_status() {
        let (_temp, store) = setup_store();

        let issue = ReliabilityIssue::new(
            RuleKey::NoSummary,
            "knowledge/test.md".to_string(),
            "Test issue".to_string(),
        );
        store.save_issues(vec![issue.clone()]).unwrap();

        let updated = store
            .update_issue_status(&issue.id, IssueStatus::Ignored)
            .unwrap();
        assert_eq!(updated.status, IssueStatus::Ignored);

        let retrieved = store.get_issue(&issue.id).unwrap();
        assert_eq!(retrieved.status, IssueStatus::Ignored);
    }

    #[test]
    fn test_invalid_status_transition() {
        let (_temp, store) = setup_store();

        let mut issue = ReliabilityIssue::new(
            RuleKey::NoSummary,
            "knowledge/test.md".to_string(),
            "Test issue".to_string(),
        );
        issue.status = IssueStatus::Ignored;
        let issue_id = issue.id.clone();
        store.save_issues(vec![issue]).unwrap();

        // Try invalid transition from Ignored to Resolved
        let result = store.update_issue_status(&issue_id, IssueStatus::Resolved);
        assert!(result.is_err());
        assert_eq!(result.unwrap_err().code, ErrorCode::InvalidArgument);
    }

    #[test]
    fn test_link_draft() {
        let (_temp, store) = setup_store();

        let issue = ReliabilityIssue::new(
            RuleKey::BrokenLink,
            "knowledge/test.md".to_string(),
            "Broken link issue".to_string(),
        );
        store.save_issues(vec![issue.clone()]).unwrap();

        let linked = store
            .link_draft(&issue.id, "draft-123".to_string())
            .unwrap();
        assert_eq!(linked.linked_draft_id, Some("draft-123".to_string()));

        let retrieved = store.get_issue(&issue.id).unwrap();
        assert_eq!(retrieved.linked_draft_id, Some("draft-123".to_string()));
    }

    #[test]
    fn test_unlink_draft() {
        let (_temp, store) = setup_store();

        let mut issue = ReliabilityIssue::new(
            RuleKey::BrokenLink,
            "knowledge/test.md".to_string(),
            "Broken link issue".to_string(),
        );
        issue.link_draft("draft-123".to_string());
        let issue_id = issue.id.clone();
        store.save_issues(vec![issue]).unwrap();

        let unlinked = store.unlink_draft(&issue_id).unwrap();
        assert!(unlinked.linked_draft_id.is_none());

        let retrieved = store.get_issue(&issue_id).unwrap();
        assert!(retrieved.linked_draft_id.is_none());
    }

    #[test]
    fn test_delete_issue() {
        let (_temp, store) = setup_store();

        let issue = ReliabilityIssue::new(
            RuleKey::NoSummary,
            "knowledge/test.md".to_string(),
            "Test issue".to_string(),
        );
        store.save_issues(vec![issue.clone()]).unwrap();

        assert!(store.issue_path(&issue.id).unwrap().exists());

        store.delete_issue(&issue.id).unwrap();
        assert!(!store.issue_path(&issue.id).unwrap().exists());

        // Should also be removed from index
        let issues = store.list_issues(ListFilter::default()).unwrap();
        assert!(issues.iter().all(|i| i.id != issue.id));
    }

    #[test]
    fn test_get_stats() {
        let (_temp, store) = setup_store();

        let mut issue1 = ReliabilityIssue::new(
            RuleKey::BrokenLink,
            "knowledge/high.md".to_string(),
            "High severity".to_string(),
        );
        let issue2 = ReliabilityIssue::new(
            RuleKey::NoSummary,
            "knowledge/medium.md".to_string(),
            "Medium severity".to_string(),
        );
        let issue3 = ReliabilityIssue::new(
            RuleKey::NoTags,
            "knowledge/low.md".to_string(),
            "Low severity".to_string(),
        );
        let mut issue4 = ReliabilityIssue::new(
            RuleKey::NoCategory,
            "knowledge/ignored.md".to_string(),
            "Ignored".to_string(),
        );

        issue1.status = IssueStatus::Resolved;
        issue4.status = IssueStatus::Ignored;

        store
            .save_issues(vec![issue1, issue2, issue3, issue4])
            .unwrap();

        let stats = store.get_stats().unwrap();
        assert_eq!(stats.total, 4);
        assert_eq!(stats.open, 2);
        assert_eq!(stats.ignored, 1);
        assert_eq!(stats.resolved, 1);
        assert_eq!(stats.high_severity, 1);
        assert_eq!(stats.medium_severity, 2); // NoSummary and NoCategory are both Medium
        assert_eq!(stats.low_severity, 1);
    }

    #[test]
    fn test_reliability_gitignore() {
        let (_temp, store) = setup_store();

        let issue = ReliabilityIssue::new(
            RuleKey::NoSummary,
            "knowledge/test.md".to_string(),
            "Gitignore test".to_string(),
        );
        store.save_issues(vec![issue]).unwrap();

        let gitignore = fs::read_to_string(store.kb_path.join(".memoforge/.gitignore")).unwrap();
        assert!(gitignore.contains("reliability/"));
    }

    #[test]
    fn test_save_issues_overwrites() {
        let (_temp, store) = setup_store();

        // Save initial issues
        let initial_issues: Vec<ReliabilityIssue> = (0..5)
            .map(|i| {
                ReliabilityIssue::new(
                    RuleKey::NoTags,
                    format!("knowledge/file-{}.md", i),
                    format!("Issue {}", i),
                )
            })
            .collect();

        store.save_issues(initial_issues).unwrap();

        let issues_before = store.list_issues(ListFilter::default()).unwrap();
        assert_eq!(issues_before.len(), 5);

        // Save new issues (should overwrite)
        let new_issues: Vec<ReliabilityIssue> = (10..15)
            .map(|i| {
                ReliabilityIssue::new(
                    RuleKey::NoSummary,
                    format!("knowledge/file-{}.md", i),
                    format!("New Issue {}", i),
                )
            })
            .collect();

        store.save_issues(new_issues).unwrap();

        let issues_after = store.list_issues(ListFilter::default()).unwrap();
        assert_eq!(issues_after.len(), 5);
        assert!(issues_after
            .iter()
            .all(|i| i.knowledge_path.starts_with("knowledge/file-1")));
    }
}
