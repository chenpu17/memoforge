//! Reliability Rules Engine
//!
//! Implements rule-based scanning for knowledge base reliability issues.

use crate::config::load_config;
use crate::frontmatter::parse_frontmatter;
use crate::links::{
    collect_markdown_files, get_backlinks, parse_wiki_links, resolve_link_to_knowledge_id,
};
use crate::reliability::{ReliabilityIssue, RuleKey};
use crate::MemoError;
use chrono::{Duration, Utc};
use std::collections::HashMap;
use std::fs;
use std::path::Path;

/// Configuration for reliability scanning
#[derive(Debug, Clone)]
pub struct ScanOptions {
    /// Number of days to consider content stale (default: 90)
    pub stale_days: u64,
}

impl Default for ScanOptions {
    fn default() -> Self {
        Self { stale_days: 90 }
    }
}

/// Scan a knowledge base for reliability issues
pub fn scan_kb(kb_path: &Path) -> Result<Vec<ReliabilityIssue>, MemoError> {
    scan_kb_with_options(kb_path, ScanOptions::default())
}

/// Scan a knowledge base with custom options
pub fn scan_kb_with_options(
    kb_path: &std::path::Path,
    options: ScanOptions,
) -> Result<Vec<ReliabilityIssue>, MemoError> {
    let mut issues = Vec::new();

    // Load config for category validation
    let config = load_config(kb_path)?;

    // Collect all markdown files
    let files = collect_markdown_files(kb_path)?;

    // Build backlinks map for orphan detection
    let mut backlinks_map: HashMap<String, usize> = HashMap::new();
    for file_path in &files {
        let _relative = file_path
            .strip_prefix(kb_path)
            .ok()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_default();

        let content = match fs::read_to_string(file_path) {
            Ok(c) => c,
            Err(_) => continue,
        };

        let wiki_links = parse_wiki_links(&content);
        for (link_text, _, _) in wiki_links {
            // Resolve the link to the actual knowledge path
            if let Some(resolved_path) = resolve_link_to_knowledge_id(&link_text, kb_path) {
                *backlinks_map.entry(resolved_path).or_insert(0) += 1;
            }
        }
    }

    // Scan each file for issues
    for file_path in &files {
        let relative = file_path
            .strip_prefix(kb_path)
            .ok()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_default();

        let content = match fs::read_to_string(file_path) {
            Ok(c) => c,
            Err(_) => continue,
        };

        let (fm, _body) = match parse_frontmatter(&content) {
            Ok(result) => result,
            Err(_) => continue,
        };

        // Rule: NoSummary
        if fm.summary.is_none() || fm.summary.as_ref().map_or(true, |s| s.trim().is_empty()) {
            issues.push(ReliabilityIssue::new(
                RuleKey::NoSummary,
                relative.clone(),
                format!("Knowledge '{}' lacks a summary", fm.title),
            ));
        }

        // Rule: NoTags
        if fm.tags.is_empty() {
            issues.push(ReliabilityIssue::new(
                RuleKey::NoTags,
                relative.clone(),
                format!("Knowledge '{}' has no tags", fm.title),
            ));
        }

        // Rule: NoCategory
        let category_valid = fm.category.as_ref().map_or(false, |cat| {
            config
                .categories
                .iter()
                .any(|c| c.id == *cat || c.path == *cat)
        });
        if !category_valid {
            issues.push(ReliabilityIssue::new(
                RuleKey::NoCategory,
                relative.clone(),
                format!(
                    "Knowledge '{}' has invalid or missing category: {:?}",
                    fm.title, fm.category
                ),
            ));
        }

        // Rule: StaleContent
        let stale_threshold = Utc::now() - Duration::days(options.stale_days as i64);
        if fm.updated_at < stale_threshold {
            issues.push(ReliabilityIssue::new(
                RuleKey::StaleContent,
                relative.clone(),
                format!(
                    "Knowledge '{}' has not been updated for >{} days (last: {})",
                    fm.title,
                    options.stale_days,
                    fm.updated_at.format("%Y-%m-%d")
                ),
            ));
        }

        // Rule: BrokenLink
        let wiki_links = parse_wiki_links(&content);
        for (link_text, display_text, _line) in wiki_links {
            let display_text = display_text.unwrap_or_else(|| link_text.clone());

            // Check if the linked file exists using the resolution function
            let link_exists = resolve_link_to_knowledge_id(&link_text, kb_path).is_some();

            if !link_exists {
                issues.push(ReliabilityIssue::new(
                    RuleKey::BrokenLink,
                    relative.clone(),
                    format!(
                        "Broken link [[{}]] in knowledge '{}'",
                        display_text, fm.title
                    ),
                ));
            }
        }

        // Rule: OrphanedKnowledge
        let stem = relative.trim_end_matches(".md").to_string();
        let has_backlinks = backlinks_map.get(stem.as_str()).copied().unwrap_or(0) > 0
            || backlinks_map.get(relative.as_str()).copied().unwrap_or(0) > 0;

        if !has_backlinks {
            issues.push(ReliabilityIssue::new(
                RuleKey::OrphanedKnowledge,
                relative.clone(),
                format!("Knowledge '{}' has no incoming links", fm.title),
            ));
        }
    }

    Ok(issues)
}

/// Scan a single knowledge file for issues
pub fn scan_file(
    kb_path: &std::path::Path,
    file_path: &std::path::Path,
) -> Result<Vec<ReliabilityIssue>, MemoError> {
    let options = ScanOptions::default();
    let mut issues = Vec::new();

    // Load config for category validation
    let config = load_config(kb_path)?;

    let relative = file_path
        .strip_prefix(kb_path)
        .map(|p| p.to_string_lossy().replace('\\', "/"))
        .unwrap_or_else(|_| file_path.to_string_lossy().to_string());

    let content = fs::read_to_string(file_path).map_err(|e| MemoError {
        code: crate::ErrorCode::InvalidPath,
        message: format!("Failed to read file: {}", e),
        retry_after_ms: None,
        context: None,
    })?;

    let (fm, _body) = parse_frontmatter(&content)?;

    // Rule: NoSummary
    if fm.summary.is_none() || fm.summary.as_ref().map_or(true, |s| s.trim().is_empty()) {
        issues.push(ReliabilityIssue::new(
            RuleKey::NoSummary,
            relative.clone(),
            format!("Knowledge '{}' lacks a summary", fm.title),
        ));
    }

    // Rule: NoTags
    if fm.tags.is_empty() {
        issues.push(ReliabilityIssue::new(
            RuleKey::NoTags,
            relative.clone(),
            format!("Knowledge '{}' has no tags", fm.title),
        ));
    }

    // Rule: NoCategory
    let category_valid = fm.category.as_ref().map_or(false, |cat| {
        config
            .categories
            .iter()
            .any(|c| c.id == *cat || c.path == *cat)
    });
    if !category_valid {
        issues.push(ReliabilityIssue::new(
            RuleKey::NoCategory,
            relative.clone(),
            format!(
                "Knowledge '{}' has invalid or missing category: {:?}",
                fm.title, fm.category
            ),
        ));
    }

    // Rule: StaleContent
    let stale_threshold = Utc::now() - Duration::days(options.stale_days as i64);
    if fm.updated_at < stale_threshold {
        issues.push(ReliabilityIssue::new(
            RuleKey::StaleContent,
            relative.clone(),
            format!(
                "Knowledge '{}' has not been updated for >{} days (last: {})",
                fm.title,
                options.stale_days,
                fm.updated_at.format("%Y-%m-%d")
            ),
        ));
    }

    // Rule: BrokenLink
    let wiki_links = parse_wiki_links(&content);
    for (link_text, display_text, _line) in wiki_links {
        let display_text = display_text.unwrap_or_else(|| link_text.clone());

        let link_exists = resolve_link_to_knowledge_id(&link_text, kb_path).is_some();

        if !link_exists {
            issues.push(ReliabilityIssue::new(
                RuleKey::BrokenLink,
                relative.clone(),
                format!(
                    "Broken link [[{}]] in knowledge '{}'",
                    display_text, fm.title
                ),
            ));
        }
    }

    // Rule: OrphanedKnowledge
    let stem = relative.trim_end_matches(".md");
    let backlinks = get_backlinks(kb_path, &stem)?;
    if backlinks.backlinks.is_empty() {
        issues.push(ReliabilityIssue::new(
            RuleKey::OrphanedKnowledge,
            relative.clone(),
            format!("Knowledge '{}' has no incoming links", fm.title),
        ));
    }

    Ok(issues)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::Config;
    use crate::reliability::{IssueSeverity, RuleKey};
    use std::fs;
    use tempfile::TempDir;

    fn create_test_kb() -> (TempDir, std::path::PathBuf) {
        let temp = TempDir::new().unwrap();
        let kb_path = temp.path().to_path_buf();

        // Create .memoforge directory
        fs::create_dir_all(kb_path.join(".memoforge")).unwrap();

        // Create config with categories
        let config = Config {
            version: "1.0".to_string(),
            categories: vec![
                crate::config::CategoryConfig {
                    id: "tech".to_string(),
                    name: "Technology".to_string(),
                    path: "tech".to_string(),
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
        };

        let config_yaml = serde_yaml::to_string(&config).unwrap();
        fs::write(kb_path.join(".memoforge/config.yaml"), config_yaml).unwrap();

        // Create tech category directory
        fs::create_dir_all(kb_path.join("tech")).unwrap();

        (temp, kb_path)
    }

    fn create_knowledge_file(
        kb_path: &Path,
        path: &str,
        title: &str,
        category: Option<&str>,
        tags: &[&str],
        summary: Option<&str>,
        updated_days_ago: Option<i64>,
        body: Option<&str>,
    ) {
        let file_path = kb_path.join(path);
        if let Some(parent) = file_path.parent() {
            fs::create_dir_all(parent).unwrap();
        }

        let updated_at = match updated_days_ago {
            Some(days) => Utc::now() - Duration::days(days),
            None => Utc::now(),
        };

        let content = format!(
            r#"---
id: {}
title: {}
tags: [{}]{}{}{}
created_at: {}
updated_at: {}
---
{}"#,
            title.to_lowercase().replace(' ', "-"),
            title,
            tags.join(", "),
            if category.is_some() { "\n" } else { "" },
            category
                .map(|c| format!("category: {}", c))
                .unwrap_or_else(|| String::new()),
            summary
                .map(|s| format!("\nsummary: {}", s))
                .unwrap_or_else(|| String::new()),
            Utc::now().to_rfc3339(),
            updated_at.to_rfc3339(),
            body.unwrap_or("Content body")
        );

        fs::write(&file_path, content).unwrap();
    }

    #[test]
    fn test_no_summary_positive() {
        let (_temp, kb_path) = create_test_kb();
        create_knowledge_file(
            &kb_path,
            "tech/no-summary.md",
            "No Summary",
            Some("tech"),
            &["test"],
            None,
            None,
            None,
        );

        let issues = scan_kb(&kb_path).unwrap();
        let no_summary_issue = issues.iter().find(|i| i.rule_key == RuleKey::NoSummary);

        assert!(no_summary_issue.is_some());
        assert_eq!(no_summary_issue.unwrap().severity, IssueSeverity::Medium);
    }

    #[test]
    fn test_no_summary_negative() {
        let (_temp, kb_path) = create_test_kb();
        create_knowledge_file(
            &kb_path,
            "tech/with-summary.md",
            "With Summary",
            Some("tech"),
            &["test"],
            Some("A proper summary"),
            None,
            None,
        );

        let issues = scan_kb(&kb_path).unwrap();
        let no_summary_issue = issues.iter().find(|i| i.rule_key == RuleKey::NoSummary);

        assert!(no_summary_issue.is_none());
    }

    #[test]
    fn test_no_tags_positive() {
        let (_temp, kb_path) = create_test_kb();
        create_knowledge_file(
            &kb_path,
            "tech/no-tags.md",
            "No Tags",
            Some("tech"),
            &[],
            Some("A summary"),
            None,
            None,
        );

        let issues = scan_kb(&kb_path).unwrap();
        let no_tags_issue = issues.iter().find(|i| i.rule_key == RuleKey::NoTags);

        assert!(no_tags_issue.is_some());
        assert_eq!(no_tags_issue.unwrap().severity, IssueSeverity::Low);
    }

    #[test]
    fn test_no_tags_negative() {
        let (_temp, kb_path) = create_test_kb();
        create_knowledge_file(
            &kb_path,
            "tech/with-tags.md",
            "With Tags",
            Some("tech"),
            &["rust", "test"],
            Some("A summary"),
            None,
            None,
        );

        let issues = scan_kb(&kb_path).unwrap();
        let no_tags_issue = issues.iter().find(|i| i.rule_key == RuleKey::NoTags);

        assert!(no_tags_issue.is_none());
    }

    #[test]
    fn test_no_category_positive() {
        let (_temp, kb_path) = create_test_kb();
        create_knowledge_file(
            &kb_path,
            "uncategorized/test.md",
            "Uncategorized",
            None,
            &["test"],
            Some("A summary"),
            None,
            None,
        );

        let issues = scan_kb(&kb_path).unwrap();
        let no_category_issue = issues.iter().find(|i| i.rule_key == RuleKey::NoCategory);

        assert!(no_category_issue.is_some());
        assert_eq!(no_category_issue.unwrap().severity, IssueSeverity::Medium);
    }

    #[test]
    fn test_no_category_negative() {
        let (_temp, kb_path) = create_test_kb();
        create_knowledge_file(
            &kb_path,
            "tech/categorized.md",
            "Categorized",
            Some("tech"),
            &["test"],
            Some("A summary"),
            None,
            None,
        );

        let issues = scan_kb(&kb_path).unwrap();
        let no_category_issue = issues.iter().find(|i| i.rule_key == RuleKey::NoCategory);

        assert!(no_category_issue.is_none());
    }

    #[test]
    fn test_stale_content_positive() {
        let (_temp, kb_path) = create_test_kb();
        create_knowledge_file(
            &kb_path,
            "tech/stale.md",
            "Stale Content",
            Some("tech"),
            &["test"],
            Some("A summary"),
            Some(100), // 100 days ago
            None,
        );

        let issues = scan_kb(&kb_path).unwrap();
        let stale_issue = issues.iter().find(|i| i.rule_key == RuleKey::StaleContent);

        assert!(stale_issue.is_some());
        assert_eq!(stale_issue.unwrap().severity, IssueSeverity::Medium);
    }

    #[test]
    fn test_stale_content_negative() {
        let (_temp, kb_path) = create_test_kb();
        create_knowledge_file(
            &kb_path,
            "tech/fresh.md",
            "Fresh Content",
            Some("tech"),
            &["test"],
            Some("A summary"),
            Some(10), // 10 days ago
            None,
        );

        let issues = scan_kb(&kb_path).unwrap();
        let stale_issue = issues.iter().find(|i| i.rule_key == RuleKey::StaleContent);

        assert!(stale_issue.is_none());
    }

    #[test]
    fn test_broken_link_positive() {
        let (_temp, kb_path) = create_test_kb();
        create_knowledge_file(
            &kb_path,
            "tech/broken-link.md",
            "Broken Link",
            Some("tech"),
            &["test"],
            Some("A summary"),
            None,
            Some("See [[non-existent-file]] for more info."),
        );

        let issues = scan_kb(&kb_path).unwrap();
        let broken_link_issue = issues.iter().find(|i| i.rule_key == RuleKey::BrokenLink);

        assert!(broken_link_issue.is_some());
        assert_eq!(broken_link_issue.unwrap().severity, IssueSeverity::High);
    }

    #[test]
    fn test_broken_link_negative() {
        let (_temp, kb_path) = create_test_kb();
        // Create the linked file first
        create_knowledge_file(
            &kb_path,
            "tech/linked-file.md",
            "Linked File",
            Some("tech"),
            &["test"],
            Some("A summary"),
            None,
            None,
        );

        create_knowledge_file(
            &kb_path,
            "tech/valid-link.md",
            "Valid Link",
            Some("tech"),
            &["test"],
            Some("A summary"),
            None,
            Some("See [[linked-file]] for more info."),
        );

        let issues = scan_kb(&kb_path).unwrap();
        let broken_link_issues: Vec<_> = issues
            .iter()
            .filter(|i| i.rule_key == RuleKey::BrokenLink)
            .collect();

        // Should have no broken link issues
        assert!(broken_link_issues.is_empty());
    }

    #[test]
    fn test_orphaned_knowledge_positive() {
        let (_temp, kb_path) = create_test_kb();
        create_knowledge_file(
            &kb_path,
            "tech/orphan.md",
            "Orphan Knowledge",
            Some("tech"),
            &["test"],
            Some("A summary"),
            None,
            None,
        );

        let issues = scan_kb(&kb_path).unwrap();
        let orphan_issue = issues
            .iter()
            .find(|i| i.rule_key == RuleKey::OrphanedKnowledge);

        assert!(orphan_issue.is_some());
        assert_eq!(orphan_issue.unwrap().severity, IssueSeverity::Low);
    }

    #[test]
    fn test_orphaned_knowledge_negative() {
        let (_temp, kb_path) = create_test_kb();
        // Create the linked file first
        create_knowledge_file(
            &kb_path,
            "tech/linked-file.md",
            "Linked File",
            Some("tech"),
            &["test"],
            Some("A summary"),
            None,
            None,
        );

        create_knowledge_file(
            &kb_path,
            "tech/not-orphan.md",
            "Not Orphan Knowledge",
            Some("tech"),
            &["test"],
            Some("A summary"),
            None,
            Some("See [[linked-file]] for more info."),
        );

        let issues = scan_kb(&kb_path).unwrap();
        // Check that linked-file.md is NOT orphaned (since not-orphan.md links to it)
        let orphan_issue = issues.iter().find(|i| {
            i.rule_key == RuleKey::OrphanedKnowledge && i.knowledge_path == "tech/linked-file.md"
        });

        assert!(orphan_issue.is_none());
    }

    #[test]
    fn test_scan_kb_with_options() {
        let (_temp, kb_path) = create_test_kb();
        create_knowledge_file(
            &kb_path,
            "tech/old.md",
            "Old Content",
            Some("tech"),
            &["test"],
            Some("A summary"),
            Some(100), // 100 days ago
            None,
        );

        // Default threshold (90 days) - should be stale
        let default_issues = scan_kb(&kb_path).unwrap();
        assert!(default_issues
            .iter()
            .any(|i| i.rule_key == RuleKey::StaleContent));

        // Custom threshold (120 days) - should not be stale
        let custom_issues =
            scan_kb_with_options(&kb_path, ScanOptions { stale_days: 120 }).unwrap();
        assert!(!custom_issues
            .iter()
            .any(|i| i.rule_key == RuleKey::StaleContent));
    }

    #[test]
    fn test_scan_file() {
        let (_temp, kb_path) = create_test_kb();
        let file_path = kb_path.join("tech/test-file.md");

        create_knowledge_file(
            &kb_path,
            "tech/test-file.md",
            "Test File",
            Some("tech"),
            &[],
            None,
            None,
            None,
        );

        let issues = scan_file(&kb_path, &file_path).unwrap();

        // Should have issues for no tags, no summary, and orphaned knowledge
        assert_eq!(issues.len(), 3);
        assert!(issues.iter().any(|i| i.rule_key == RuleKey::NoTags));
        assert!(issues.iter().any(|i| i.rule_key == RuleKey::NoSummary));
        assert!(issues
            .iter()
            .any(|i| i.rule_key == RuleKey::OrphanedKnowledge));
    }
}
