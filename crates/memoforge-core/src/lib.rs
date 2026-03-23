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

pub use error::{MemoError, ErrorCode};
pub use models::{Knowledge, Category, Frontmatter, LoadLevel};
pub use knowledge::load_knowledge;
pub use frontmatter::parse_frontmatter;
pub use fs::{read_knowledge_file, write_knowledge_file};
pub use lock::{FileLock, GlobalWriteLock, LockManager};
pub use cache::{KnowledgeCache, L0Data, L1Data, L2Data};
pub use store::{KnowledgeStore, StoreGuard, init_store, get_store, close_store};
pub use api::*;

/// MemoForge 版本
pub const VERSION: &str = env!("CARGO_PKG_VERSION");
