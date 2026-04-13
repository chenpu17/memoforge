//! Workflow Template persistence layer
//!
//! Handles storage and retrieval of custom workflow templates using a file-based
//! approach, mirroring the inbox_store.rs / session_store.rs pattern.
//!
//! Storage location: `.memoforge/templates/` — each template is one JSON file.

use crate::error::{ErrorCode, MemoError};
use crate::workflow_template::WorkflowTemplate;
use std::fs;

/// Workflow template storage manager.
///
/// Manages persistence of custom workflow templates to `.memoforge/templates/`.
/// Built-in templates are not persisted; they live in code (`WorkflowTemplate::built_in_templates`).
pub struct WorkflowTemplateStore {
    kb_path: std::path::PathBuf,
}

impl WorkflowTemplateStore {
    /// Create a new store for the given knowledge base path.
    pub fn new(kb_path: std::path::PathBuf) -> Self {
        Self { kb_path }
    }

    fn templates_dir(&self) -> std::path::PathBuf {
        self.kb_path.join(".memoforge/templates")
    }

    fn template_path(&self, id: &str) -> Result<std::path::PathBuf, MemoError> {
        crate::error::validate_storage_id(id, "template ID")?;
        Ok(self.templates_dir().join(format!("{}.json", id)))
    }

    /// Ensure the templates directory exists.
    fn ensure_dir(&self) -> Result<(), MemoError> {
        fs::create_dir_all(self.templates_dir()).map_err(|e| MemoError {
            code: ErrorCode::InvalidPath,
            message: format!("Failed to create templates directory: {}", e),
            retry_after_ms: None,
            context: None,
        })
    }

    /// List all custom templates stored on disk.
    pub fn list_templates(&self) -> Result<Vec<WorkflowTemplate>, MemoError> {
        self.ensure_dir()?;

        let dir = self.templates_dir();
        let mut templates = Vec::new();

        let entries = fs::read_dir(&dir).map_err(|e| MemoError {
            code: ErrorCode::InvalidPath,
            message: format!("Failed to read templates directory: {}", e),
            retry_after_ms: None,
            context: None,
        })?;

        for entry in entries {
            let entry = entry.map_err(|e| MemoError {
                code: ErrorCode::InvalidData,
                message: format!("Failed to read directory entry: {}", e),
                retry_after_ms: None,
                context: None,
            })?;
            let path = entry.path();

            if path.extension().and_then(|ext| ext.to_str()) == Some("json") {
                if let Ok(content) = fs::read_to_string(&path) {
                    if let Ok(template) = serde_json::from_str::<WorkflowTemplate>(&content) {
                        templates.push(template);
                    }
                }
            }
        }

        // Sort by template_id for deterministic ordering
        templates.sort_by(|a, b| a.template_id.cmp(&b.template_id));
        Ok(templates)
    }

    /// Get a single custom template by ID.
    pub fn get_template(&self, id: &str) -> Result<WorkflowTemplate, MemoError> {
        let path = self.template_path(id)?;
        if !path.exists() {
            return Err(MemoError {
                code: ErrorCode::NotFoundKnowledge,
                message: format!("Template not found: {}", id),
                retry_after_ms: None,
                context: None,
            });
        }

        let content = fs::read_to_string(&path).map_err(|e| MemoError {
            code: ErrorCode::NotFoundKnowledge,
            message: format!("Failed to read template: {}", e),
            retry_after_ms: None,
            context: None,
        })?;

        serde_json::from_str(&content).map_err(|e| MemoError {
            code: ErrorCode::InvalidData,
            message: format!("Failed to parse template: {}", e),
            retry_after_ms: None,
            context: None,
        })
    }

    /// Create a new custom template.
    pub fn create_template(&self, template: WorkflowTemplate) -> Result<WorkflowTemplate, MemoError> {
        self.ensure_dir()?;

        let path = self.template_path(&template.template_id)?;
        if path.exists() {
            return Err(MemoError {
                code: ErrorCode::InvalidData,
                message: format!("Template already exists: {}", template.template_id),
                retry_after_ms: None,
                context: None,
            });
        }

        // Reject if a built-in template uses the same ID
        if WorkflowTemplate::find_by_id(&template.template_id).is_some() {
            return Err(MemoError {
                code: ErrorCode::InvalidData,
                message: format!(
                    "Template ID '{}' conflicts with a built-in template",
                    template.template_id
                ),
                retry_after_ms: None,
                context: None,
            });
        }

        let json = serde_json::to_string_pretty(&template).map_err(|e| MemoError {
            code: ErrorCode::InvalidData,
            message: format!("Failed to serialize template: {}", e),
            retry_after_ms: None,
            context: None,
        })?;

        fs::write(&path, json).map_err(|e| MemoError {
            code: ErrorCode::InvalidPath,
            message: format!("Failed to write template: {}", e),
            retry_after_ms: None,
            context: None,
        })?;

        Ok(template)
    }

    /// Update an existing custom template.
    pub fn update_template(&self, template: WorkflowTemplate) -> Result<WorkflowTemplate, MemoError> {
        self.ensure_dir()?;

        let path = self.template_path(&template.template_id)?;
        if !path.exists() {
            return Err(MemoError {
                code: ErrorCode::NotFoundKnowledge,
                message: format!("Template not found: {}", template.template_id),
                retry_after_ms: None,
                context: None,
            });
        }

        let json = serde_json::to_string_pretty(&template).map_err(|e| MemoError {
            code: ErrorCode::InvalidData,
            message: format!("Failed to serialize template: {}", e),
            retry_after_ms: None,
            context: None,
        })?;

        fs::write(&path, json).map_err(|e| MemoError {
            code: ErrorCode::InvalidPath,
            message: format!("Failed to write template: {}", e),
            retry_after_ms: None,
            context: None,
        })?;

        Ok(template)
    }

    /// Delete a custom template by ID.
    pub fn delete_template(&self, id: &str) -> Result<(), MemoError> {
        let path = self.template_path(id)?;
        if !path.exists() {
            return Err(MemoError {
                code: ErrorCode::NotFoundKnowledge,
                message: format!("Template not found: {}", id),
                retry_after_ms: None,
                context: None,
            });
        }

        fs::remove_file(&path).map_err(|e| MemoError {
            code: ErrorCode::InvalidPath,
            message: format!("Failed to delete template: {}", e),
            retry_after_ms: None,
            context: None,
        })
    }

    /// List all templates: built-in first, then custom templates.
    ///
    /// If a custom template shares a `template_id` with a built-in one,
    /// the built-in version wins (custom templates are validated on create
    /// to prevent this).
    pub fn list_all_templates(&self) -> Result<Vec<WorkflowTemplate>, MemoError> {
        let mut templates = WorkflowTemplate::built_in_templates();

        // Append custom templates (they are guaranteed unique by create_template)
        let custom = self.list_templates()?;
        templates.extend(custom);

        Ok(templates)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::workflow_template::ContextRef;
    use crate::session::ContextRefType;
    use tempfile::TempDir;

    fn setup_store() -> (TempDir, WorkflowTemplateStore) {
        let temp = TempDir::new().unwrap();
        let kb_path = temp.path().to_path_buf();
        fs::create_dir_all(kb_path.join(".memoforge")).unwrap();
        let store = WorkflowTemplateStore::new(kb_path);
        (temp, store)
    }

    fn sample_template(id: &str) -> WorkflowTemplate {
        WorkflowTemplate {
            template_id: id.to_string(),
            name: format!("Test Template {}", id),
            goal: "Test goal".to_string(),
            default_context_refs: vec![ContextRef {
                ref_type: ContextRefType::Knowledge,
                ref_id: "test".to_string(),
                required: false,
                reason: None,
                snapshot_summary: None,
            }],
            suggested_output_target: Some("test-category".to_string()),
            review_policy: None,
            success_criteria: vec!["Criterion 1".to_string()],
            enabled: true,
        }
    }

    #[test]
    fn test_create_and_get_template() {
        let (_temp, store) = setup_store();

        let template = sample_template("custom_001");
        store.create_template(template.clone()).unwrap();

        let retrieved = store.get_template("custom_001").unwrap();
        assert_eq!(retrieved.template_id, "custom_001");
        assert_eq!(retrieved.name, "Test Template custom_001");
        assert_eq!(retrieved.goal, "Test goal");
        assert_eq!(retrieved.success_criteria.len(), 1);
    }

    #[test]
    fn test_get_nonexistent_template() {
        let (_temp, store) = setup_store();
        let result = store.get_template("nonexistent");
        assert!(result.is_err());
        assert_eq!(result.unwrap_err().code, ErrorCode::NotFoundKnowledge);
    }

    #[test]
    fn test_create_duplicate_template() {
        let (_temp, store) = setup_store();

        let template = sample_template("custom_dup");
        store.create_template(template.clone()).unwrap();

        let result = store.create_template(template);
        assert!(result.is_err());
        assert_eq!(result.unwrap_err().code, ErrorCode::InvalidData);
    }

    #[test]
    fn test_create_template_conflicting_with_builtin() {
        let (_temp, store) = setup_store();

        let template = sample_template("pr_issue_knowledge");
        let result = store.create_template(template);
        assert!(result.is_err());
        assert!(result.unwrap_err().message.contains("conflicts with a built-in"));
    }

    #[test]
    fn test_list_templates_empty() {
        let (_temp, store) = setup_store();
        let templates = store.list_templates().unwrap();
        assert!(templates.is_empty());
    }

    #[test]
    fn test_list_templates_multiple() {
        let (_temp, store) = setup_store();

        store.create_template(sample_template("custom_b")).unwrap();
        store.create_template(sample_template("custom_a")).unwrap();
        store.create_template(sample_template("custom_c")).unwrap();

        let templates = store.list_templates().unwrap();
        assert_eq!(templates.len(), 3);
        // Should be sorted by template_id
        assert_eq!(templates[0].template_id, "custom_a");
        assert_eq!(templates[1].template_id, "custom_b");
        assert_eq!(templates[2].template_id, "custom_c");
    }

    #[test]
    fn test_update_template() {
        let (_temp, store) = setup_store();

        let template = sample_template("custom_upd");
        store.create_template(template).unwrap();

        let mut updated = store.get_template("custom_upd").unwrap();
        updated.name = "Updated Name".to_string();
        updated.goal = "Updated goal".to_string();
        store.update_template(updated).unwrap();

        let retrieved = store.get_template("custom_upd").unwrap();
        assert_eq!(retrieved.name, "Updated Name");
        assert_eq!(retrieved.goal, "Updated goal");
    }

    #[test]
    fn test_update_nonexistent_template() {
        let (_temp, store) = setup_store();
        let template = sample_template("nonexistent");
        let result = store.update_template(template);
        assert!(result.is_err());
        assert_eq!(result.unwrap_err().code, ErrorCode::NotFoundKnowledge);
    }

    #[test]
    fn test_delete_template() {
        let (_temp, store) = setup_store();

        store.create_template(sample_template("custom_del")).unwrap();
        assert!(store.template_path("custom_del").unwrap().exists());

        store.delete_template("custom_del").unwrap();
        assert!(!store.template_path("custom_del").unwrap().exists());
    }

    #[test]
    fn test_delete_nonexistent_template() {
        let (_temp, store) = setup_store();
        let result = store.delete_template("nonexistent");
        assert!(result.is_err());
        assert_eq!(result.unwrap_err().code, ErrorCode::NotFoundKnowledge);
    }

    #[test]
    fn test_list_all_templates_merges_builtin_and_custom() {
        let (_temp, store) = setup_store();

        let builtin_count = WorkflowTemplate::built_in_templates().len();
        store.create_template(sample_template("custom_all")).unwrap();

        let all = store.list_all_templates().unwrap();
        assert_eq!(all.len(), builtin_count + 1);

        // Built-in templates come first
        assert!(all.iter().take(builtin_count).all(|t| {
            [
                "pr_issue_knowledge",
                "runbook_verify",
                "meeting_notes",
                "release_retrospective",
            ]
            .contains(&t.template_id.as_str())
        }));

        // Custom template is present
        assert!(all.iter().any(|t| t.template_id == "custom_all"));
    }

    #[test]
    fn test_list_all_templates_builtin_only() {
        let (_temp, store) = setup_store();

        let all = store.list_all_templates().unwrap();
        assert_eq!(all.len(), WorkflowTemplate::built_in_templates().len());
    }

    #[test]
    fn test_template_serialization_roundtrip_via_store() {
        let (_temp, store) = setup_store();

        let template = WorkflowTemplate {
            template_id: "custom_serial".to_string(),
            name: "Serialization Test".to_string(),
            goal: "Verify roundtrip".to_string(),
            default_context_refs: vec![
                ContextRef {
                    ref_type: ContextRefType::Url,
                    ref_id: "https://example.com".to_string(),
                    required: true,
                    reason: Some("test reason".to_string()),
                    snapshot_summary: Some("summary".to_string()),
                },
                ContextRef {
                    ref_type: ContextRefType::Knowledge,
                    ref_id: "path/to/knowledge".to_string(),
                    required: false,
                    reason: None,
                    snapshot_summary: None,
                },
            ],
            suggested_output_target: Some("output/category".to_string()),
            review_policy: Some("Review by owner".to_string()),
            success_criteria: vec![
                "First criterion".to_string(),
                "Second criterion".to_string(),
            ],
            enabled: false,
        };

        store.create_template(template).unwrap();
        let retrieved = store.get_template("custom_serial").unwrap();

        assert_eq!(retrieved.template_id, "custom_serial");
        assert_eq!(retrieved.name, "Serialization Test");
        assert_eq!(retrieved.enabled, false);
        assert_eq!(retrieved.default_context_refs.len(), 2);
        assert_eq!(retrieved.success_criteria.len(), 2);
        assert_eq!(
            retrieved.review_policy,
            Some("Review by owner".to_string())
        );
    }
}
