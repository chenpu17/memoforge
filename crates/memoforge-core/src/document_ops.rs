//! Section-level document operations
//!
//! Provides structured editing of markdown documents at the section level,
//! building on top of `split_sections` from knowledge.rs.

use crate::error::{ErrorCode, MemoError};
use crate::knowledge::split_sections;
use crate::models::Frontmatter;
use serde::Serialize;

/// Information about a section within a markdown document.
#[derive(Debug, Clone, Serialize)]
pub struct SectionInfo {
    /// Zero-based index in the section list
    pub index: usize,
    /// Section heading text (without the `#` prefix)
    pub title: String,
    /// Heading level (2 = `##`, 3 = `###`, etc.)
    pub level: usize,
    /// 1-based start line number in the original content
    pub start_line: usize,
    /// 1-based end line number in the original content
    pub end_line: usize,
}

/// Summary of a diff between two document versions.
#[derive(Debug, Clone, Serialize)]
pub struct DiffSummary {
    /// Number of sections that changed
    pub sections_changed: usize,
    /// Number of lines added
    pub lines_added: usize,
    /// Number of lines removed
    pub lines_removed: usize,
}

/// Parse a markdown heading line into (level, title).
///
/// Returns None if the line is not a heading or is an h1 heading (reserved for document title).
fn parse_heading(line: &str) -> Option<(usize, String)> {
    let trimmed = line.trim();
    let level = trimmed.chars().take_while(|&c| c == '#').count();
    if level < 2 {
        return None;
    }
    let title = trimmed[level..].trim_start().to_string();
    if title.is_empty() {
        return None;
    }
    Some((level, title))
}

/// Read section tree from content, returning structured info with line numbers.
pub fn read_sections(content: &str) -> Vec<SectionInfo> {
    let mut sections: Vec<SectionInfo> = Vec::new();
    let mut index = 0usize;

    for (line_idx, line) in content.lines().enumerate() {
        let line_num = line_idx + 1;

        if let Some((level, title)) = parse_heading(line) {
            // Close previous section
            if let Some(prev) = sections.last_mut() {
                prev.end_line = line_num - 1;
            }

            sections.push(SectionInfo {
                index,
                title,
                level,
                start_line: line_num,
                end_line: line_num,
            });
            index += 1;
        }
    }

    // Last section extends to end of content
    if let Some(last) = sections.last_mut() {
        last.end_line = content.lines().count().max(last.start_line);
    }

    sections
}

/// Append a new section to the end of the content.
///
/// The heading level determines the `#` prefix (e.g. level 2 -> `##`).
/// A blank line is inserted before the new section if the content is non-empty
/// and does not already end with one.
pub fn append_section(
    content: &str,
    heading: &str,
    level: usize,
    body: &str,
) -> Result<String, MemoError> {
    if level < 2 {
        return Err(MemoError {
            code: ErrorCode::InvalidArgument,
            message: "Section heading level must be >= 2 (## or deeper)".to_string(),
            retry_after_ms: None,
            context: None,
        });
    }

    if heading.is_empty() {
        return Err(MemoError {
            code: ErrorCode::InvalidArgument,
            message: "Section heading text cannot be empty".to_string(),
            retry_after_ms: None,
            context: None,
        });
    }

    let prefix = "#".repeat(level);
    let section_text = format!("{} {}\n{}", prefix, heading, body);

    if content.is_empty() {
        return Ok(section_text);
    }

    // Ensure a blank line separator before the new section
    let trimmed = content.trim_end_matches('\n');
    if trimmed.is_empty() {
        Ok(section_text)
    } else {
        Ok(format!("{}\n\n{}", trimmed, section_text))
    }
}

/// Replace the body of a section identified by its heading title.
///
/// The heading line itself is preserved; only the content after the heading
/// is replaced with `new_body`. Other sections remain untouched.
pub fn replace_section(content: &str, heading: &str, new_body: &str) -> Result<String, MemoError> {
    let lines: Vec<&str> = content.lines().collect();

    // Find the heading line
    let start = lines
        .iter()
        .position(|line| parse_heading(line).is_some_and(|(_, title)| title == heading));

    let start = match start {
        Some(idx) => idx,
        None => {
            return Err(MemoError {
                code: ErrorCode::NotFoundKnowledge,
                message: format!("Section '{}' not found", heading),
                retry_after_ms: None,
                context: None,
            });
        }
    };

    // Determine the heading level
    let heading_level = parse_heading(lines[start]).unwrap().0;

    // Find end: next heading at same or lower level, or end of content
    let mut end = lines.len();
    for i in (start + 1)..lines.len() {
        if let Some((lvl, _)) = parse_heading(lines[i]) {
            if lvl <= heading_level {
                end = i;
                break;
            }
        }
    }

    // Rebuild: content before section + new section body + content after section
    let mut result = String::new();

    // Everything before the section
    if start > 0 {
        for line in &lines[..start] {
            result.push_str(line);
            result.push('\n');
        }
    }

    // The section heading + new body
    result.push_str(lines[start]);
    result.push('\n');
    result.push_str(new_body);

    // Everything after the section
    if end < lines.len() {
        // Ensure separation
        if !new_body.is_empty() && !new_body.ends_with('\n') {
            result.push('\n');
        }
        for line in &lines[end..] {
            result.push('\n');
            result.push_str(line);
        }
    }

    // Preserve trailing newline if original had one
    if content.ends_with('\n') && !result.ends_with('\n') {
        result.push('\n');
    }

    Ok(result)
}

/// Remove a section identified by its heading title.
///
/// Returns the content with the section (heading + body) removed.
/// Returns an error if no section with that heading exists.
pub fn remove_section(content: &str, heading: &str) -> Result<String, MemoError> {
    let lines: Vec<&str> = content.lines().collect();

    // Find the heading line
    let start = lines
        .iter()
        .position(|line| parse_heading(line).is_some_and(|(_, title)| title == heading));

    let start = match start {
        Some(idx) => idx,
        None => {
            return Err(MemoError {
                code: ErrorCode::NotFoundKnowledge,
                message: format!("Section '{}' not found", heading),
                retry_after_ms: None,
                context: None,
            });
        }
    };

    // Determine the heading level
    let heading_level = parse_heading(lines[start]).unwrap().0;

    // Find end: next heading at same or lower level, or end of content
    let mut end = lines.len();
    for i in (start + 1)..lines.len() {
        if let Some((lvl, _)) = parse_heading(lines[i]) {
            if lvl <= heading_level {
                end = i;
                break;
            }
        }
    }

    // Remove lines from start to end
    let mut result_lines: Vec<&str> = lines.clone();
    result_lines.drain(start..end);

    // Rebuild, preserving trailing newline if original had one
    let mut result = result_lines.join("\n");
    if content.ends_with('\n') && !result.ends_with('\n') {
        result.push('\n');
    }

    Ok(result)
}

/// Apply a metadata patch to a Frontmatter struct.
///
/// Supports patching the following fields:
/// - `title`: string replacement
/// - `tags`: array of strings (replaced, not merged)
/// - `summary`: string or null
/// - `evidence`: object or null (v0.3.0 governance)
/// - `freshness`: object or null (v0.3.0 governance)
///
/// The patch is applied in-place.
pub fn apply_metadata_patch(frontmatter: &mut Frontmatter, patch: &serde_json::Value) {
    if let Some(title) = patch.get("title").and_then(|v| v.as_str()) {
        frontmatter.title = title.to_string();
    }

    if let Some(tags) = patch.get("tags").and_then(|v| v.as_array()) {
        let new_tags: Vec<String> = tags
            .iter()
            .filter_map(|v| v.as_str().map(|s| s.to_string()))
            .collect();
        frontmatter.tags = new_tags;
    }

    if let Some(summary_val) = patch.get("summary") {
        match summary_val {
            serde_json::Value::Null => {
                frontmatter.summary = None;
                frontmatter.summary_hash = None;
            }
            serde_json::Value::String(s) => {
                frontmatter.summary = Some(s.clone());
            }
            _ => {}
        }
    }

    // Evidence metadata (v0.3.0 governance)
    if let Some(evidence_val) = patch.get("evidence") {
        match evidence_val {
            serde_json::Value::Null => {
                frontmatter.evidence = None;
            }
            serde_json::Value::Object(_) => {
                if let Ok(evidence) = serde_json::from_value::<crate::governance::EvidenceMeta>(evidence_val.clone()) {
                    frontmatter.evidence = Some(evidence);
                }
            }
            _ => {}
        }
    }

    // Freshness policy (v0.3.0 governance)
    if let Some(freshness_val) = patch.get("freshness") {
        match freshness_val {
            serde_json::Value::Null => {
                frontmatter.freshness = None;
            }
            serde_json::Value::Object(_) => {
                if let Ok(freshness) = serde_json::from_value::<crate::governance::FreshnessPolicy>(freshness_val.clone()) {
                    frontmatter.freshness = Some(freshness);
                }
            }
            _ => {}
        }
    }
}

/// Generate a summary diff between original and modified content.
///
/// Compares at the section level and line level.
pub fn generate_diff_summary(original: &str, modified: &str) -> DiffSummary {
    let orig_sections = split_sections(original);
    let mod_sections = split_sections(modified);

    // Build maps by title
    let orig_map: std::collections::HashMap<&str, &str> = orig_sections
        .iter()
        .map(|s| (s.title.as_str(), s.content.as_str()))
        .collect();

    let mod_map: std::collections::HashMap<&str, &str> = mod_sections
        .iter()
        .map(|s| (s.title.as_str(), s.content.as_str()))
        .collect();

    // Count sections that differ or were added/removed
    let mut all_titles: std::collections::HashSet<&str> = std::collections::HashSet::new();
    for s in &orig_sections {
        all_titles.insert(s.title.as_str());
    }
    for s in &mod_sections {
        all_titles.insert(s.title.as_str());
    }

    let mut sections_changed = 0;
    for title in &all_titles {
        let orig_content = orig_map.get(title).copied().unwrap_or("");
        let mod_content = mod_map.get(title).copied().unwrap_or("");
        if orig_content != mod_content {
            sections_changed += 1;
        }
    }

    // Simple line-level diff using set difference
    let orig_lines: Vec<&str> = original.lines().collect();
    let mod_lines: Vec<&str> = modified.lines().collect();

    let orig_set: std::collections::HashSet<&str> = orig_lines.iter().copied().collect();
    let mod_set: std::collections::HashSet<&str> = mod_lines.iter().copied().collect();

    let lines_added = mod_lines.iter().filter(|l| !orig_set.contains(*l)).count();
    let lines_removed = orig_lines.iter().filter(|l| !mod_set.contains(*l)).count();

    DiffSummary {
        sections_changed,
        lines_added,
        lines_removed,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_heading() {
        assert_eq!(parse_heading("## Hello"), Some((2, "Hello".to_string())));
        assert_eq!(parse_heading("### World"), Some((3, "World".to_string())));
        assert_eq!(parse_heading("# Title"), None); // h1 ignored
        assert_eq!(parse_heading("plain text"), None);
        assert_eq!(parse_heading("##"), None); // empty title
    }

    #[test]
    fn test_read_sections_basic() {
        let content =
            "## Section 1\nContent 1\n\n### Subsection 1.1\nContent 1.1\n\n## Section 2\nContent 2";
        let sections = read_sections(content);

        assert_eq!(sections.len(), 3);
        assert_eq!(sections[0].title, "Section 1");
        assert_eq!(sections[0].level, 2);
        assert_eq!(sections[0].start_line, 1);

        assert_eq!(sections[1].title, "Subsection 1.1");
        assert_eq!(sections[1].level, 3);
        assert_eq!(sections[1].start_line, 4);

        assert_eq!(sections[2].title, "Section 2");
        assert_eq!(sections[2].level, 2);
        assert_eq!(sections[2].start_line, 7);
    }

    #[test]
    fn test_read_sections_empty() {
        let sections = read_sections("No headings here");
        assert!(sections.is_empty());
    }

    #[test]
    fn test_append_section_to_existing() {
        let content = "## Existing\nSome text";
        let result = append_section(content, "New Section", 2, "New body").unwrap();
        assert!(result.contains("## Existing\nSome text"));
        assert!(result.contains("## New Section\nNew body"));
    }

    #[test]
    fn test_append_section_to_empty() {
        let result = append_section("", "Section Title", 2, "Hello world").unwrap();
        assert_eq!(result, "## Section Title\nHello world");
    }

    #[test]
    fn test_append_section_h3() {
        let content = "## Overview\nSome overview";
        let result = append_section(content, "Details", 3, "Detail content").unwrap();
        assert!(result.contains("### Details\nDetail content"));
    }

    #[test]
    fn test_append_section_rejects_h1() {
        let result = append_section("content", "Title", 1, "body");
        assert!(result.is_err());
    }

    #[test]
    fn test_append_section_rejects_empty_heading() {
        let result = append_section("content", "", 2, "body");
        assert!(result.is_err());
    }

    #[test]
    fn test_replace_section_basic() {
        let content = "## Alpha\nOld content\n\n## Beta\nBeta content";
        let result = replace_section(content, "Alpha", "New content").unwrap();
        assert!(result.contains("## Alpha\nNew content"));
        assert!(result.contains("## Beta\nBeta content"));
        assert!(!result.contains("Old content"));
    }

    #[test]
    fn test_replace_section_preserves_subsections() {
        let content = "## Alpha\nAlpha body\n### Sub\nSub content\n\n## Beta\nBeta body";
        let result = replace_section(content, "Alpha", "New alpha body").unwrap();
        // Since Sub is h3 and Alpha is h2, replace should cover Sub too
        assert!(result.contains("## Alpha\nNew alpha body"));
        assert!(result.contains("## Beta\nBeta body"));
        assert!(!result.contains("Sub content"));
    }

    #[test]
    fn test_replace_section_not_found() {
        let result = replace_section("## Existing\nContent", "NonExistent", "New content");
        assert!(result.is_err());
    }

    #[test]
    fn test_remove_section_basic() {
        let content = "## Alpha\nAlpha content\n\n## Beta\nBeta content";
        let result = remove_section(content, "Alpha").unwrap();
        assert_eq!(result, "## Beta\nBeta content");
    }

    #[test]
    fn test_remove_section_last() {
        let content = "## Alpha\nAlpha content\n\n## Beta\nBeta content";
        let result = remove_section(content, "Beta").unwrap();
        assert_eq!(result, "## Alpha\nAlpha content\n");
    }

    #[test]
    fn test_remove_section_not_found() {
        let result = remove_section("## Beta\nContent", "Alpha");
        assert!(result.is_err());
    }

    #[test]
    fn test_apply_metadata_patch_title() {
        use chrono::Utc;

        let mut fm = Frontmatter {
            id: "test".to_string(),
            title: "Original".to_string(),
            tags: vec!["old".to_string()],
            category: None,
            summary: None,
            summary_hash: None,
            created_at: Utc::now(),
            updated_at: Utc::now(),
            evidence: None,
            freshness: None,
        };

        let patch = serde_json::json!({"title": "Updated"});
        apply_metadata_patch(&mut fm, &patch);
        assert_eq!(fm.title, "Updated");
        assert_eq!(fm.tags, vec!["old"]); // unchanged
    }

    #[test]
    fn test_apply_metadata_patch_tags() {
        use chrono::Utc;

        let mut fm = Frontmatter {
            id: "test".to_string(),
            title: "Test".to_string(),
            tags: vec!["old".to_string()],
            category: None,
            summary: None,
            summary_hash: None,
            created_at: Utc::now(),
            updated_at: Utc::now(),
            evidence: None,
            freshness: None,
        };

        let patch = serde_json::json!({"tags": ["rust", "async"]});
        apply_metadata_patch(&mut fm, &patch);
        assert_eq!(fm.tags, vec!["rust", "async"]);
    }

    #[test]
    fn test_apply_metadata_patch_summary_set_and_clear() {
        use chrono::Utc;

        let mut fm = Frontmatter {
            id: "test".to_string(),
            title: "Test".to_string(),
            tags: vec![],
            category: None,
            summary: None,
            summary_hash: None,
            created_at: Utc::now(),
            updated_at: Utc::now(),
            evidence: None,
            freshness: None,
        };

        // Set summary
        let patch = serde_json::json!({"summary": "A summary"});
        apply_metadata_patch(&mut fm, &patch);
        assert_eq!(fm.summary, Some("A summary".to_string()));

        // Clear summary
        let patch = serde_json::json!({"summary": null});
        apply_metadata_patch(&mut fm, &patch);
        assert_eq!(fm.summary, None);
    }

    #[test]
    fn test_generate_diff_summary_changes() {
        let original = "## Alpha\nOld line 1\n\n## Beta\nBeta original";
        let modified = "## Alpha\nNew line 1\n\n## Beta\nBeta modified\nExtra line";

        let diff = generate_diff_summary(original, modified);
        assert_eq!(diff.sections_changed, 2);
        assert!(diff.lines_added > 0);
        assert!(diff.lines_removed > 0);
    }

    #[test]
    fn test_generate_diff_summary_no_changes() {
        let content = "## Hello\nWorld";
        let diff = generate_diff_summary(content, content);
        assert_eq!(diff.sections_changed, 0);
        assert_eq!(diff.lines_added, 0);
        assert_eq!(diff.lines_removed, 0);
    }

    #[test]
    fn test_read_sections_plain_text_only() {
        // No headings at all, just plain paragraphs
        let content = "This is plain text.\n\nAnother paragraph.\nNo headings here.";
        let sections = read_sections(content);
        assert!(sections.is_empty());
    }

    #[test]
    fn test_read_sections_deep_heading_levels() {
        let content = "## Level 2\nBody\n### Level 3\nBody\n#### Level 4\nBody";
        let sections = read_sections(content);
        assert_eq!(sections.len(), 3);
        assert_eq!(sections[0].level, 2);
        assert_eq!(sections[1].level, 3);
        assert_eq!(sections[2].level, 4);
    }

    #[test]
    fn test_remove_section_middle() {
        let content = "## Alpha\nAlpha body\n\n## Beta\nBeta body\n\n## Gamma\nGamma body";
        let result = remove_section(content, "Beta").unwrap();
        assert!(result.contains("## Alpha\nAlpha body"));
        assert!(result.contains("## Gamma\nGamma body"));
        assert!(!result.contains("Beta"));
    }

    #[test]
    fn test_apply_metadata_patch_partial_update() {
        use chrono::Utc;

        let mut fm = Frontmatter {
            id: "test".to_string(),
            title: "Original".to_string(),
            tags: vec!["keep".to_string()],
            category: None,
            summary: Some("old summary".to_string()),
            summary_hash: None,
            created_at: Utc::now(),
            updated_at: Utc::now(),
            evidence: None,
            freshness: None,
        };

        // Patch only title, tags and summary should stay unchanged
        let patch = serde_json::json!({"title": "New Title"});
        apply_metadata_patch(&mut fm, &patch);
        assert_eq!(fm.title, "New Title");
        assert_eq!(fm.tags, vec!["keep"]);
        assert_eq!(fm.summary, Some("old summary".to_string()));
    }

    #[test]
    fn test_apply_metadata_patch_empty_patch() {
        use chrono::Utc;

        let mut fm = Frontmatter {
            id: "test".to_string(),
            title: "Unchanged".to_string(),
            tags: vec!["tag".to_string()],
            category: None,
            summary: Some("summary".to_string()),
            summary_hash: None,
            created_at: Utc::now(),
            updated_at: Utc::now(),
            evidence: None,
            freshness: None,
        };

        let patch = serde_json::json!({});
        apply_metadata_patch(&mut fm, &patch);
        assert_eq!(fm.title, "Unchanged");
        assert_eq!(fm.tags, vec!["tag"]);
        assert_eq!(fm.summary, Some("summary".to_string()));
    }

    #[test]
    fn test_apply_metadata_patch_evidence() {
        use chrono::Utc;

        let mut fm = Frontmatter {
            id: "test".to_string(),
            title: "Test".to_string(),
            tags: vec![],
            category: None,
            summary: None,
            summary_hash: None,
            created_at: Utc::now(),
            updated_at: Utc::now(),
            evidence: None,
            freshness: None,
        };

        // Set evidence
        let patch = serde_json::json!({
            "evidence": {
                "owner": "alice",
                "source_url": "https://example.com",
                "linked_issue_ids": ["ISSUE-1"],
            }
        });
        apply_metadata_patch(&mut fm, &patch);
        let evidence = fm.evidence.take().unwrap();
        assert_eq!(evidence.owner.unwrap(), "alice");
        assert_eq!(evidence.source_url.unwrap(), "https://example.com");
        assert_eq!(evidence.linked_issue_ids.len(), 1);

        // Clear evidence
        let clear_patch = serde_json::json!({"evidence": null});
        apply_metadata_patch(&mut fm, &clear_patch);
        assert!(fm.evidence.is_none());
    }

    #[test]
    fn test_apply_metadata_patch_freshness() {
        use chrono::Utc;

        let mut fm = Frontmatter {
            id: "test".to_string(),
            title: "Test".to_string(),
            tags: vec![],
            category: None,
            summary: None,
            summary_hash: None,
            created_at: Utc::now(),
            updated_at: Utc::now(),
            evidence: None,
            freshness: None,
        };

        // Set freshness
        let patch = serde_json::json!({
            "freshness": {
                "sla_days": 30,
                "review_status": "ok",
            }
        });
        apply_metadata_patch(&mut fm, &patch);
        let freshness = fm.freshness.take().unwrap();
        assert_eq!(freshness.sla_days, 30);
        assert_eq!(freshness.review_status, crate::governance::FreshnessReviewStatus::Ok);

        // Clear freshness
        let clear_patch = serde_json::json!({"freshness": null});
        apply_metadata_patch(&mut fm, &clear_patch);
        assert!(fm.freshness.is_none());
    }

    #[test]
    fn test_apply_metadata_patch_evidence_and_freshness_together() {
        use chrono::Utc;

        let mut fm = Frontmatter {
            id: "test".to_string(),
            title: "Test".to_string(),
            tags: vec!["keep".to_string()],
            category: None,
            summary: Some("summary".to_string()),
            summary_hash: None,
            created_at: Utc::now(),
            updated_at: Utc::now(),
            evidence: None,
            freshness: None,
        };

        let patch = serde_json::json!({
            "title": "Updated",
            "evidence": {
                "owner": "bob",
            },
            "freshness": {
                "sla_days": 60,
            }
        });
        apply_metadata_patch(&mut fm, &patch);
        assert_eq!(fm.title, "Updated");
        assert_eq!(fm.tags, vec!["keep"]);
        assert_eq!(fm.summary, Some("summary".to_string()));
        assert_eq!(fm.evidence.unwrap().owner.unwrap(), "bob");
        assert_eq!(fm.freshness.unwrap().sla_days, 60);
    }

    #[test]
    fn test_generate_diff_summary_removed_section() {
        let original = "## Alpha\nContent A\n\n## Beta\nContent B";
        let modified = "## Alpha\nContent A";

        let diff = generate_diff_summary(original, modified);
        assert_eq!(diff.sections_changed, 1); // Beta removed
        assert!(diff.lines_removed > 0);
        assert_eq!(diff.lines_added, 0);
    }

    #[test]
    fn test_replace_section_preserves_other_sections() {
        let content = "## Alpha\nAlpha body\n\n## Beta\nBeta body\n\n## Gamma\nGamma body";
        let result = replace_section(content, "Beta", "New beta body").unwrap();
        assert!(result.contains("## Alpha\nAlpha body"));
        assert!(result.contains("## Beta\nNew beta body"));
        assert!(result.contains("## Gamma\nGamma body"));
        assert!(!result.contains("Beta body"));
    }

    #[test]
    fn test_generate_diff_summary_new_section() {
        let original = "## Alpha\nContent A";
        let modified = "## Alpha\nContent A\n\n## Beta\nContent B";

        let diff = generate_diff_summary(original, modified);
        assert_eq!(diff.sections_changed, 1); // Beta is new
        assert!(diff.lines_added > 0);
        assert_eq!(diff.lines_removed, 0);
    }

    // --- Additional edge-case tests ---

    #[test]
    fn test_append_to_single_section_document() {
        // Start with one section, append a second
        let content = "## Solo\nOnly section";
        let result = append_section(content, "Added", 2, "Added body").unwrap();
        assert!(result.contains("## Solo\nOnly section"));
        assert!(result.contains("## Added\nAdded body"));
        // Ensure blank-line separator between sections
        assert!(result.contains("Only section\n\n## Added"));
    }

    #[test]
    fn test_multiple_appends_accumulate() {
        let mut content = String::new();
        for i in 1..=5 {
            content = append_section(
                &content,
                &format!("Section {}", i),
                2,
                &format!("Body {}", i),
            )
            .unwrap();
        }
        let sections = read_sections(&content);
        assert_eq!(sections.len(), 5);
        for i in 0..5 {
            assert_eq!(sections[i].title, format!("Section {}", i + 1));
        }
    }

    #[test]
    fn test_replace_section_cycles() {
        // Replace the same section multiple times in sequence
        let mut content = "## Target\nOriginal".to_string();
        for i in 1..=4 {
            content = replace_section(&content, "Target", &format!("Replace #{}", i)).unwrap();
        }
        assert!(content.contains("## Target\nReplace #4"));
        assert!(!content.contains("Original"));
        assert!(!content.contains("Replace #1"));
    }

    #[test]
    fn test_remove_section_then_append_same_heading() {
        // Remove a section, then append one with the same name
        let content = "## Alpha\nAlpha body\n\n## Beta\nBeta body";
        let after_remove = remove_section(content, "Alpha").unwrap();
        assert_eq!(after_remove, "## Beta\nBeta body");

        let after_append = append_section(&after_remove, "Alpha", 2, "Reborn alpha").unwrap();
        assert!(after_append.contains("## Beta\nBeta body"));
        assert!(after_append.contains("## Alpha\nReborn alpha"));
    }

    #[test]
    fn test_read_sections_trailing_newlines() {
        let content = "## Heading\nBody\n\n";
        let sections = read_sections(content);
        assert_eq!(sections.len(), 1);
        assert_eq!(sections[0].title, "Heading");
        assert_eq!(sections[0].end_line, 3);
    }

    #[test]
    fn test_read_sections_single_line_headings() {
        let content = "## A\n## B\n## C";
        let sections = read_sections(content);
        assert_eq!(sections.len(), 3);
        // Each heading is a separate section with no body
        assert_eq!(sections[0].title, "A");
        assert_eq!(sections[1].title, "B");
        assert_eq!(sections[2].title, "C");
    }

    #[test]
    fn test_replace_not_found_preserves_content() {
        let content = "## Exists\nSome body";
        let result = replace_section(content, "Does Not Exist", "new");
        assert!(result.is_err());
        // Original content should not have been modified
        assert_eq!(content, "## Exists\nSome body");
    }

    #[test]
    fn test_remove_not_found_preserves_content() {
        let content = "## Exists\nSome body";
        let result = remove_section(content, "Ghost");
        assert!(result.is_err());
        assert_eq!(content, "## Exists\nSome body");
    }

    #[test]
    fn test_append_empty_body() {
        let result = append_section("## Existing\nText", "Empty Body", 2, "").unwrap();
        assert!(result.contains("## Empty Body\n"));
        // The section heading exists, body is empty
        let sections = read_sections(&result);
        assert!(sections.iter().any(|s| s.title == "Empty Body"));
    }

    #[test]
    fn test_generate_diff_both_empty() {
        let diff = generate_diff_summary("", "");
        assert_eq!(diff.sections_changed, 0);
        assert_eq!(diff.lines_added, 0);
        assert_eq!(diff.lines_removed, 0);
    }

    #[test]
    fn test_generate_diff_empty_to_content() {
        let diff = generate_diff_summary("", "## New\nContent");
        assert_eq!(diff.sections_changed, 1);
        assert!(diff.lines_added > 0);
        assert_eq!(diff.lines_removed, 0);
    }

    #[test]
    fn test_generate_diff_content_to_empty() {
        let diff = generate_diff_summary("## Old\nContent", "");
        assert_eq!(diff.sections_changed, 1);
        assert_eq!(diff.lines_added, 0);
        assert!(diff.lines_removed > 0);
    }
}
