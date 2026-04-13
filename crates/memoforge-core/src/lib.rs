//! MemoForge Core - Knowledge Management Engine
//!
//! 参考文档: docs/design/技术实现文档.md §2

pub mod agent;
pub mod api;
pub mod cache;
pub mod config;
pub mod context_pack;
pub mod context_pack_store;
pub mod document_ops;
pub mod draft;
pub mod editor_state;
pub mod error;
pub mod events;
pub mod frontmatter;
pub mod fs;
pub mod git;
pub mod governance;
pub mod governance_api;
pub mod import;
pub mod inbox;
pub mod inbox_store;
pub mod init;
pub mod knowledge;
pub mod links;
pub mod lock;
pub mod models;
pub mod registry;
pub mod reliability;
pub mod reliability_rules;
pub mod reliability_store;
pub mod review;
pub mod review_projection;
pub mod session;
pub mod session_store;
pub mod store;
pub mod template;
pub mod watcher;
pub mod workflow_template;
pub mod workflow_template_store;

pub use agent::{
    cleanup_dead_agents, get_active_agents, get_agent_count, infer_agent_name, register_agent,
    unregister_agent, AgentInfo,
};
pub use api::*;
pub use api::{
    get_knowledge_with_stale, move_knowledge_to_path, preview_delete_knowledge,
    preview_move_knowledge, preview_move_knowledge_to_path, DeletePreview, GrepMatch, MovePreview,
    ReferenceInfo,
};
pub use cache::{KnowledgeCache, L0Data, L1Data, L2Data};
pub use context_pack::{ContextPack, ContextPackScope};
pub use context_pack_store::ContextPackStore;
pub use document_ops::{
    append_section, apply_metadata_patch, generate_diff_summary, read_sections, remove_section,
    replace_section, DiffSummary, SectionInfo,
};
pub use draft::{
    cleanup_expired_drafts, commit_draft, discard_draft, preview_draft, read_knowledge_unified,
    start_draft, start_draft_from_inbox_item, update_draft, update_draft_review_state,
    CommitResult, DraftFile, DraftId, DraftOperation, DraftPreview, DraftTarget,
    ReadKnowledgeResult,
};
pub use editor_state::{
    editor_state_path, load_editor_state, save_editor_state, CurrentKb, CurrentKnowledge,
    DesktopState, EditorMode, EditorState, Selection, SELECTED_TEXT_MAX_LENGTH,
    SELECTION_THROTTLE_MS,
};
pub use error::{validate_storage_id, ErrorCode, MemoError};
pub use events::{
    log_create, log_delete, log_event, log_git_commit, log_update, read_recent_events, Event,
    EventAction, EventSource,
};
pub use frontmatter::parse_frontmatter;
pub use fs::{read_knowledge_file, write_knowledge_file};
pub use import::{
    import_markdown_folder, preview_import, ImportOptions, ImportResult, ImportStats,
};
pub use inbox::{InboxItem, InboxSourceType, InboxStatus};
pub use inbox_store::InboxStore;
pub use knowledge::load_knowledge;
pub use links::{
    build_knowledge_graph, build_knowledge_graph_with_options, get_backlinks, get_outgoing_links,
    get_related, parse_wiki_links, resolve_link_to_knowledge_id, update_references, AffectedFile,
    BacklinksResult, GraphEdge, GraphNode, GraphOptions, GraphRelationType, KnowledgeGraph,
    LinkInfo, RelatedKnowledge, RelatedResult, RelationType, UpdateReferencesResult,
};
pub use lock::{FileLock, GlobalWriteLock, LockManager};
pub use governance::{
    effective_sla_days, EvidenceMeta, FreshnessPolicy, FreshnessReviewStatus, DEFAULT_SLA_DAYS,
};
pub use governance_api::{
    effective_freshness, list_due_for_review, read_evidence, read_freshness, verify_knowledge,
    write_evidence, write_freshness,
};
pub use models::{Category, Frontmatter, Knowledge, KnowledgeWithStale, LoadLevel};
pub use registry::{
    get_current_kb, get_last_kb, get_recent_kbs, list_knowledge_bases, register_kb, switch_kb,
    unregister_kb, KnowledgeBaseInfo, KnowledgeBaseRegistry,
};
pub use reliability::{IssueSeverity, IssueStatus, ReliabilityIssue, RuleKey};
pub use reliability_rules::{scan_file, scan_kb, scan_kb_with_options, ScanOptions};
pub use reliability_store::{ListFilter, ReliabilityStats, ReliabilityStore};
pub use review::{ReviewDecision, ReviewItem, ReviewSourceType, ReviewStatus};
pub use review_projection::{
    apply_review_decision, get_review_item, list_review_items, start_review, ReviewListFilter,
};
pub use session::{AgentSession, ContextItem, ContextRefType, SessionStatus};
pub use session_store::SessionStore;
pub use store::{close_store, get_store, init_store, KnowledgeStore, StoreGuard};
pub use workflow_template::{ContextRef, WorkflowTemplate, WorkflowRun, StartWorkflowRunParams, start_workflow_run};
pub use workflow_template_store::WorkflowTemplateStore;

/// MemoForge 版本
pub const VERSION: &str = env!("CARGO_PKG_VERSION");
