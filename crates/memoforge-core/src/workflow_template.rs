//! Workflow Template model
//! v0.3.0: Executable templates for high-frequency knowledge workflows

use crate::session::{ContextItem, ContextRefType};
use serde::{Deserialize, Serialize};

/// Context reference used by WorkflowTemplate and AgentSession
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContextRef {
    /// Context type
    pub ref_type: ContextRefType,
    /// Path / pack_id / url etc. as stable reference
    pub ref_id: String,
    /// Whether this context is mandatory
    pub required: bool,
    /// Recommended reason
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
    /// Snapshot summary for display at startup
    #[serde(skip_serializing_if = "Option::is_none")]
    pub snapshot_summary: Option<String>,
}

/// Workflow template
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkflowTemplate {
    /// Stable template ID
    pub template_id: String,
    /// Template name
    pub name: String,
    /// Workflow goal
    pub goal: String,
    /// Default context sources
    pub default_context_refs: Vec<ContextRef>,
    /// Suggested output target
    #[serde(skip_serializing_if = "Option::is_none")]
    pub suggested_output_target: Option<String>,
    /// Review policy description
    #[serde(skip_serializing_if = "Option::is_none")]
    pub review_policy: Option<String>,
    /// Success criteria
    pub success_criteria: Vec<String>,
    /// Whether the template is enabled
    #[serde(default = "default_enabled")]
    pub enabled: bool,
}

fn default_enabled() -> bool {
    true
}

impl WorkflowTemplate {
    /// Returns the list of built-in templates
    pub fn built_in_templates() -> Vec<WorkflowTemplate> {
        vec![
            // PR/Issue knowledge extraction
            WorkflowTemplate {
                template_id: "pr_issue_knowledge".into(),
                name: "PR/Issue 沉淀知识".into(),
                goal: "从 PR 或 Issue 中提取关键知识并沉淀到知识库".into(),
                default_context_refs: vec![ContextRef {
                    ref_type: ContextRefType::Url,
                    ref_id: "".into(),
                    required: false,
                    reason: Some("PR 或 Issue URL".into()),
                    snapshot_summary: None,
                }],
                suggested_output_target: Some("开发".into()),
                review_policy: Some("检查提取的知识是否准确、完整，是否与现有知识重复".into()),
                success_criteria: vec![
                    "知识条目包含来源 PR/Issue 链接".into(),
                    "知识条目有明确的 owner".into(),
                    "知识条目通过 Review 确认".into(),
                ],
                enabled: true,
            },
            // Runbook verification and repair
            WorkflowTemplate {
                template_id: "runbook_verify".into(),
                name: "Runbook 校验与修复".into(),
                goal: "检查 Runbook 文档的准确性和时效性，修复过期内容".into(),
                default_context_refs: vec![ContextRef {
                    ref_type: ContextRefType::Knowledge,
                    ref_id: "运维".into(),
                    required: true,
                    reason: Some("目标 Runbook 所在分类".into()),
                    snapshot_summary: None,
                }],
                suggested_output_target: None,
                review_policy: Some("修复后的 Runbook 需经原 owner 或技术负责人确认".into()),
                success_criteria: vec![
                    "检查所有 Runbook 步骤的可执行性".into(),
                    "更新过期的命令和路径".into(),
                    "补充验证信息 (verified_at, valid_for_version)".into(),
                ],
                enabled: true,
            },
            // Meeting notes organization
            WorkflowTemplate {
                template_id: "meeting_notes".into(),
                name: "会议纪要整理入库".into(),
                goal: "将会议纪要整理为结构化知识并入库".into(),
                default_context_refs: vec![],
                suggested_output_target: Some("会议".into()),
                review_policy: Some("确保关键决策和 action item 被准确记录".into()),
                success_criteria: vec![
                    "会议日期、参与者记录完整".into(),
                    "关键决策有明确的结论".into(),
                    "Action item 有 owner 和截止时间".into(),
                ],
                enabled: true,
            },
            // Release retrospective
            WorkflowTemplate {
                template_id: "release_retrospective".into(),
                name: "版本发布复盘".into(),
                goal: "对版本发布过程进行复盘，沉淀经验教训".into(),
                default_context_refs: vec![ContextRef {
                    ref_type: ContextRefType::Knowledge,
                    ref_id: "发布".into(),
                    required: false,
                    reason: Some("相关发布文档".into()),
                    snapshot_summary: None,
                }],
                suggested_output_target: Some("复盘".into()),
                review_policy: Some("复盘结论需经团队确认".into()),
                success_criteria: vec![
                    "发布过程时间线记录完整".into(),
                    "问题和解决方案有明确对应".into(),
                    "改进措施有 owner 和跟踪计划".into(),
                ],
                enabled: true,
            },
        ]
    }

    /// Find a built-in template by its template_id
    pub fn find_by_id(id: &str) -> Option<WorkflowTemplate> {
        Self::built_in_templates()
            .into_iter()
            .find(|t| t.template_id == id)
    }

    /// Find a template by ID from both built-in and custom templates.
    ///
    /// Looks up built-in templates first, then falls back to the custom store.
    pub fn find_any(
        id: &str,
        custom_store: &crate::workflow_template_store::WorkflowTemplateStore,
    ) -> Option<WorkflowTemplate> {
        Self::find_by_id(id).or_else(|| custom_store.get_template(id).ok())
    }

    /// Suggest context packs that might be relevant to this template.
    ///
    /// Returns pack IDs whose paths overlap with the template's context or output targets.
    pub fn suggest_context_packs(
        &self,
        store: &crate::context_pack_store::ContextPackStore,
    ) -> Vec<String> {
        // Collect paths from default_context_refs and suggested_output_target
        let mut target_paths: Vec<String> = self
            .default_context_refs
            .iter()
            .filter(|r| matches!(r.ref_type, ContextRefType::Knowledge))
            .map(|r| r.ref_id.clone())
            .collect();

        if let Some(ref output) = self.suggested_output_target {
            target_paths.push(output.clone());
        }

        // Match against context pack item paths
        let Ok(packs) = store.list(None, None) else {
            return Vec::new();
        };

        packs
            .into_iter()
            .filter(|pack| {
                // Match if any pack item_path starts with or equals any target path
                pack.item_paths.iter().any(|item| {
                    target_paths
                        .iter()
                        .any(|target| item.starts_with(target) || target.starts_with(item))
                }) || pack
                    .scope_value
                    .split(',')
                    .any(|sv| target_paths.iter().any(|t| t.trim() == sv.trim()))
            })
            .map(|pack| pack.id)
            .collect()
    }
}

// ---------------------------------------------------------------------------
// WorkflowRun
// ---------------------------------------------------------------------------

/// Represents a running workflow instance started from a template.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkflowRun {
    /// Unique run identifier (ULID format)
    pub run_id: String,
    /// The template that launched this run
    pub template_id: String,
    /// Associated agent session (if created)
    pub session_id: Option<String>,
    /// Associated draft (if created via suggested_output_target)
    pub draft_id: Option<String>,
    /// Inbox items created during this run
    pub inbox_item_ids: Vec<String>,
    /// ISO 8601 timestamp when the run started
    pub started_at: String,
}

/// Parameters for starting a workflow run.
pub struct StartWorkflowRunParams<'a> {
    /// Template ID to run
    pub template_id: &'a str,
    /// Override the template's default goal
    pub goal_override: Option<&'a str>,
    /// Additional context references to pass to the session
    pub context_refs: Option<Vec<ContextRef>>,
    /// Override the template's suggested output target
    pub suggested_output_target: Option<&'a str>,
    /// Agent name for the created session
    pub agent_name: &'a str,
}

/// Start a workflow run from a template.
///
/// This function:
/// 1. Resolves the template (built-in or custom)
/// 2. Creates an AgentSession with the template's goal and context
/// 3. Optionally creates a Draft if the template (or override) specifies an output target
/// 4. Returns a WorkflowRun tracking all created resources
pub fn start_workflow_run(
    kb_path: &std::path::Path,
    params: StartWorkflowRunParams<'_>,
) -> Result<WorkflowRun, crate::error::MemoError> {
    let store = crate::workflow_template_store::WorkflowTemplateStore::new(kb_path.to_path_buf());

    // 1. Resolve template
    let template = WorkflowTemplate::find_any(params.template_id, &store).ok_or_else(|| {
        crate::error::MemoError {
            code: crate::error::ErrorCode::NotFoundKnowledge,
            message: format!("Workflow template not found: {}", params.template_id),
            retry_after_ms: None,
            context: None,
        }
    })?;

    let run_id = ulid::Ulid::new().to_string();
    let started_at = chrono::Utc::now().to_rfc3339();

    // Effective goal: override takes precedence
    let goal = params
        .goal_override
        .unwrap_or(&template.goal)
        .to_string();

    // 2. Create an AgentSession
    let mut session = crate::session::AgentSession::new(
        params.agent_name.to_string(),
        goal.clone(),
    );

    // Add context items from the template's default_context_refs
    let effective_context_refs = params
        .context_refs
        .unwrap_or_else(|| template.default_context_refs.clone());

    for ctx_ref in &effective_context_refs {
        let mut context_item = ContextItem::new(ctx_ref.ref_type.clone(), ctx_ref.ref_id.clone());

        // For Knowledge-type refs, attempt to read a brief summary as snapshot
        if matches!(ctx_ref.ref_type, ContextRefType::Knowledge) {
            if let Ok(summary) = try_read_knowledge_summary(kb_path, &ctx_ref.ref_id) {
                context_item.summary = Some(summary);
            }
        }

        session.context_items.push(context_item);
    }

    let session_store = crate::session_store::SessionStore::new(kb_path.to_path_buf());
    let created_session = session_store.create_session(session)?;
    let session_id = created_session.id.clone();

    // 3. Optionally create a Draft
    let output_target = params
        .suggested_output_target
        .or(template.suggested_output_target.as_deref());

    let draft_id = if let Some(target) = output_target {
        // Create a draft targeting the suggested output path
        let draft_path = if target.contains('/') || target.contains('\\') {
            target.to_string()
        } else {
            // Treat bare category name as a new file in that category
            format!(
                "{}/{}.md",
                target,
                slugify_for_draft(&goal)
            )
        };

        match crate::draft::start_draft(
            kb_path,
            Some(&draft_path),
            None,
            params.agent_name,
        ) {
            Ok(id) => {
                // Link draft to session
                let _ = session_store.add_draft_id(&session_id, id.clone());
                // Inject review metadata so the draft appears in the unified review queue
                let _ = crate::draft::update_draft_review_state(
                    kb_path,
                    &id,
                    "pending",
                    Some("agent_draft".to_string()),
                    None,
                    Some(session_id.clone()),
                );
                Some(id)
            }
            Err(_) => {
                // Draft creation failure should not prevent the run from starting.
                // The agent can always create a draft later.
                None
            }
        }
    } else {
        None
    };

    Ok(WorkflowRun {
        run_id,
        template_id: params.template_id.to_string(),
        session_id: Some(session_id),
        draft_id,
        inbox_item_ids: Vec::new(),
        started_at,
    })
}

/// Attempt to read a brief knowledge summary for a ref_id (path or category).
/// Returns the summary string on success, or silently fails.
fn try_read_knowledge_summary(kb_path: &std::path::Path, ref_id: &str) -> Result<String, ()> {
    // Resolve the ref_id to a candidate file path
    let normalized = ref_id.trim().trim_matches('/').replace('\\', "/");
    if normalized.is_empty() {
        return Err(());
    }

    let mut candidates = vec![];
    if normalized.ends_with(".md") {
        candidates.push(kb_path.join(&normalized));
    } else {
        candidates.push(kb_path.join(format!("{}.md", normalized)));
        candidates.push(kb_path.join(&normalized));
    }

    for candidate in &candidates {
        if candidate.exists()
            && candidate.extension().and_then(|ext| ext.to_str()) == Some("md")
        {
            if let Ok(knowledge) = crate::knowledge::load_knowledge(candidate, crate::models::LoadLevel::L1) {
                if let Some(summary) = knowledge.summary {
                    return Ok(summary);
                }
            }
        }
    }

    Err(())
}

/// Generate a slug from a goal string for use as a draft file name.
fn slugify_for_draft(goal: &str) -> String {
    let slug: String = goal
        .chars()
        .take(40)
        .filter_map(|ch| {
            if ch.is_ascii_alphanumeric() {
                Some(ch.to_ascii_lowercase())
            } else if ch.is_whitespace() || ch == '-' || ch == '_' {
                Some('-')
            } else {
                None
            }
        })
        .collect();

    let slug = slug.trim_matches('-').to_string();
    if slug.is_empty() {
        "untitled".to_string()
    } else {
        slug
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::workflow_template::ContextRef;
    use tempfile::TempDir;

    #[test]
    fn built_in_templates_returns_four() {
        let templates = WorkflowTemplate::built_in_templates();
        assert_eq!(templates.len(), 4);
    }

    #[test]
    fn find_by_id_returns_correct_template() {
        let t = WorkflowTemplate::find_by_id("pr_issue_knowledge").unwrap();
        assert_eq!(t.template_id, "pr_issue_knowledge");
        assert_eq!(t.name, "PR/Issue 沉淀知识");
        assert!(t.enabled);

        let t2 = WorkflowTemplate::find_by_id("runbook_verify").unwrap();
        assert_eq!(t2.template_id, "runbook_verify");
        assert!(t2.default_context_refs[0].required);

        let t3 = WorkflowTemplate::find_by_id("meeting_notes").unwrap();
        assert!(t3.default_context_refs.is_empty());

        let t4 = WorkflowTemplate::find_by_id("release_retrospective").unwrap();
        assert_eq!(t4.goal, "对版本发布过程进行复盘，沉淀经验教训");
    }

    #[test]
    fn find_by_id_returns_none_for_unknown() {
        assert!(WorkflowTemplate::find_by_id("nonexistent").is_none());
    }

    #[test]
    fn context_ref_serialization_roundtrip() {
        let ctx = ContextRef {
            ref_type: ContextRefType::Url,
            ref_id: "https://example.com/pr/1".into(),
            required: true,
            reason: Some("test reason".into()),
            snapshot_summary: Some("summary".into()),
        };
        let json = serde_json::to_string(&ctx).unwrap();
        let deserialized: ContextRef = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.ref_type, ContextRefType::Url);
        assert_eq!(deserialized.ref_id, "https://example.com/pr/1");
        assert!(deserialized.required);
        assert_eq!(deserialized.reason.unwrap(), "test reason");
        assert_eq!(deserialized.snapshot_summary.unwrap(), "summary");
    }

    #[test]
    fn context_ref_skips_none_fields() {
        let ctx = ContextRef {
            ref_type: ContextRefType::Knowledge,
            ref_id: "test".into(),
            required: false,
            reason: None,
            snapshot_summary: None,
        };
        let json = serde_json::to_string(&ctx).unwrap();
        assert!(!json.contains("reason"));
        assert!(!json.contains("snapshot_summary"));
    }

    #[test]
    fn workflow_template_serialization_roundtrip() {
        let templates = WorkflowTemplate::built_in_templates();
        for template in &templates {
            let json = serde_json::to_string(template).unwrap();
            let deserialized: WorkflowTemplate = serde_json::from_str(&json).unwrap();
            assert_eq!(deserialized.template_id, template.template_id);
            assert_eq!(deserialized.name, template.name);
            assert_eq!(deserialized.goal, template.goal);
            assert_eq!(deserialized.success_criteria.len(), template.success_criteria.len());
            assert_eq!(deserialized.enabled, template.enabled);
        }
    }

    #[test]
    fn all_built_in_templates_have_unique_ids() {
        let templates = WorkflowTemplate::built_in_templates();
        let ids: Vec<&str> = templates.iter().map(|t| t.template_id.as_str()).collect();
        let unique_ids: std::collections::HashSet<&str> = ids.iter().copied().collect();
        assert_eq!(ids.len(), unique_ids.len());
    }

    #[test]
    fn test_start_workflow_run_builtin_template() {
        let temp = TempDir::new().unwrap();
        let kb_path = temp.path();
        crate::init::init_new(kb_path, false).unwrap();

        // Register a category so drafts can target it
        crate::config::save_config(
            kb_path,
            &crate::config::Config {
                version: "1.0".to_string(),
                categories: vec![crate::config::CategoryConfig {
                    id: "meeting".to_string(),
                    name: "会议".to_string(),
                    path: "会议".to_string(),
                    parent_id: None,
                    description: None,
                    default_sla_days: None,
                }],
                metadata: None,
                knowledge_policy: None,
            },
        )
        .unwrap();

        let result = start_workflow_run(
            kb_path,
            StartWorkflowRunParams {
                template_id: "meeting_notes",
                goal_override: None,
                context_refs: None,
                suggested_output_target: None,
                agent_name: "test-agent",
            },
        )
        .unwrap();

        assert!(!result.run_id.is_empty());
        assert_eq!(result.template_id, "meeting_notes");
        assert!(result.session_id.is_some());
        // meeting_notes has suggested_output_target: Some("会议"), so a draft should be created
        assert!(result.draft_id.is_some());
        assert!(result.inbox_item_ids.is_empty());
    }

    #[test]
    fn test_start_workflow_run_with_goal_override() {
        let temp = TempDir::new().unwrap();
        let kb_path = temp.path();
        crate::init::init_new(kb_path, false).unwrap();

        let result = start_workflow_run(
            kb_path,
            StartWorkflowRunParams {
                template_id: "runbook_verify",
                goal_override: Some("Custom goal for this run"),
                context_refs: None,
                suggested_output_target: None,
                agent_name: "test-agent",
            },
        )
        .unwrap();

        assert!(result.session_id.is_some());
        // runbook_verify has no suggested_output_target, so no draft
        assert!(result.draft_id.is_none());
    }

    #[test]
    fn test_start_workflow_run_unknown_template() {
        let temp = TempDir::new().unwrap();
        let kb_path = temp.path();
        std::fs::create_dir_all(kb_path.join(".memoforge")).unwrap();

        let result = start_workflow_run(
            kb_path,
            StartWorkflowRunParams {
                template_id: "nonexistent_template",
                goal_override: None,
                context_refs: None,
                suggested_output_target: None,
                agent_name: "test-agent",
            },
        );

        assert!(result.is_err());
        assert_eq!(
            result.unwrap_err().code,
            crate::error::ErrorCode::NotFoundKnowledge
        );
    }

    #[test]
    fn test_slugify_for_draft() {
        assert_eq!(slugify_for_draft("Hello World"), "hello-world");
        assert_eq!(slugify_for_draft("Rust Async Programming Guide"), "rust-async-programming-guide");
        assert_eq!(slugify_for_draft(""), "untitled");
        assert_eq!(slugify_for_draft("---"), "untitled");
    }
}
