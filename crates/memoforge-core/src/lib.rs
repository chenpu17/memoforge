//! MemoForge Core - Knowledge Management Engine
//!
//! 参考文档: docs/design/技术实现文档.md §2

pub mod error;

pub use error::{MemoError, ErrorCode};

/// MemoForge 版本
pub const VERSION: &str = env!("CARGO_PKG_VERSION");
