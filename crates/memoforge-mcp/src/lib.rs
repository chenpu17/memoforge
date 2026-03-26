//! MemoForge MCP Library
//!
//! This crate provides both stdio and SSE based MCP server implementations.

pub mod sse;
pub mod tools;

// Re-export commonly used types for Tauri integration
pub use sse::{
    start_sse_server, McpServerConfig, McpServerState,
    EditorStateSnapshot, DesktopInfo, ActiveAgent, CurrentKb, CurrentKnowledge, Selection,
};
