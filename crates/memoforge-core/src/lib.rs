//! MemoForge Core - Knowledge Management Engine
//!
//! 参考文档: docs/design/技术实现文档.md §2

pub mod agent;
pub mod api;
pub mod cache;
pub mod config;
pub mod editor_state;
pub mod error;
pub mod events;
pub mod frontmatter;
pub mod fs;
pub mod git;
pub mod import;
pub mod init;
pub mod knowledge;
pub mod links;
pub mod lock;
pub mod models;
pub mod registry;
pub mod store;
pub mod template;
pub mod watcher;

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
pub use editor_state::{
    editor_state_path, load_editor_state, save_editor_state, CurrentKb, CurrentKnowledge,
    DesktopState, EditorMode, EditorState, Selection, SELECTED_TEXT_MAX_LENGTH,
    SELECTION_THROTTLE_MS,
};
pub use error::{ErrorCode, MemoError};
pub use events::{
    log_create, log_delete, log_event, log_git_commit, log_update, read_recent_events, Event,
    EventAction, EventSource,
};
pub use frontmatter::parse_frontmatter;
pub use fs::{read_knowledge_file, write_knowledge_file};
pub use import::{
    import_markdown_folder, preview_import, ImportOptions, ImportResult, ImportStats,
};
pub use knowledge::load_knowledge;
pub use links::{
    build_knowledge_graph, build_knowledge_graph_with_options, get_backlinks, get_outgoing_links,
    get_related, parse_wiki_links, update_references, AffectedFile, BacklinksResult, GraphEdge,
    GraphNode, GraphOptions, GraphRelationType, KnowledgeGraph, LinkInfo, RelatedKnowledge,
    RelatedResult, RelationType, UpdateReferencesResult,
};
pub use lock::{FileLock, GlobalWriteLock, LockManager};
pub use models::{Category, Frontmatter, Knowledge, KnowledgeWithStale, LoadLevel};
pub use registry::{
    get_current_kb, get_last_kb, get_recent_kbs, list_knowledge_bases, register_kb, switch_kb,
    unregister_kb, KnowledgeBaseInfo, KnowledgeBaseRegistry,
};
pub use store::{close_store, get_store, init_store, KnowledgeStore, StoreGuard};

/// MemoForge 版本
pub const VERSION: &str = env!("CARGO_PKG_VERSION");
