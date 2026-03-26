//! MemoForge Core - Knowledge Management Engine
//!
//! 参考文档: docs/design/技术实现文档.md §2

pub mod error;
pub mod models;
pub mod frontmatter;
pub mod fs;
pub mod knowledge;
pub mod lock;
pub mod cache;
pub mod store;
pub mod git;
pub mod init;
pub mod watcher;
pub mod template;
pub mod config;
pub mod api;
pub mod events;
pub mod import;
pub mod registry;
pub mod links;
pub mod agent;
pub mod editor_state;

pub use error::{MemoError, ErrorCode};
pub use models::{Knowledge, KnowledgeWithStale, Category, Frontmatter, LoadLevel};
pub use knowledge::load_knowledge;
pub use frontmatter::parse_frontmatter;
pub use fs::{read_knowledge_file, write_knowledge_file};
pub use lock::{FileLock, GlobalWriteLock, LockManager};
pub use cache::{KnowledgeCache, L0Data, L1Data, L2Data};
pub use store::{KnowledgeStore, StoreGuard, init_store, get_store, close_store};
pub use api::*;
pub use api::{GrepMatch, DeletePreview, MovePreview, ReferenceInfo, preview_delete_knowledge, preview_move_knowledge, preview_move_knowledge_to_path, move_knowledge_to_path, get_knowledge_with_stale};
pub use events::{Event, EventAction, EventSource, log_event, log_create, log_update, log_delete, log_git_commit, read_recent_events};
pub use import::{import_markdown_folder, preview_import, ImportOptions, ImportStats, ImportResult};
pub use registry::{KnowledgeBaseInfo, KnowledgeBaseRegistry, list_knowledge_bases, get_current_kb, switch_kb, register_kb, unregister_kb, get_recent_kbs, get_last_kb};
pub use links::{LinkInfo, BacklinksResult, RelatedResult, RelatedKnowledge, RelationType, parse_wiki_links, get_outgoing_links, get_backlinks, get_related, update_references, UpdateReferencesResult, AffectedFile, GraphNode, GraphEdge, GraphRelationType, KnowledgeGraph, build_knowledge_graph, build_knowledge_graph_with_options, GraphOptions};
pub use agent::{AgentInfo, register_agent, unregister_agent, get_active_agents, get_agent_count, infer_agent_name, cleanup_dead_agents};
pub use editor_state::{EditorState, EditorMode, DesktopState, CurrentKb, CurrentKnowledge, Selection, editor_state_path, load_editor_state, save_editor_state, SELECTION_THROTTLE_MS, SELECTED_TEXT_MAX_LENGTH};

/// MemoForge 版本
pub const VERSION: &str = env!("CARGO_PKG_VERSION");
