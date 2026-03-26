//! Desktop State Publisher for Tauri
//!
//! This module provides the state publisher for the desktop GUI to share
//! editor state with AI agents via the shared state file.
//!
//! ## Usage
//!
//! ```rust
//! let publisher = DesktopStatePublisher::new(false);
//! publisher.set_kb(path, name, count);
//! publisher.set_knowledge(path, title, category);
//! publisher.set_selection(1, 5, Some("text".to_string()));
//! ```
//!
//! 参考: 技术实现文档 §2.4

use memoforge_core::editor_state::{
    EditorState, EditorMode, CurrentKb, CurrentKnowledge, Selection, DesktopState,
    SELECTED_TEXT_MAX_LENGTH,
};
use std::path::PathBuf;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};
use std::thread;

/// Desktop application state publisher
///
/// Manages shared state publication from Tauri desktop app to AI agents.
/// Implements throttling to avoid excessive file writes.
pub struct DesktopStatePublisher {
    current_kb: Option<CurrentKb>,
    current_knowledge: Option<CurrentKnowledge>,
    selection: Option<Selection>,
    last_publish: Option<Instant>,
    throttle_interval: Duration,
    share_selected_text: bool,
    pending_publish: Arc<AtomicBool>,
}

impl DesktopStatePublisher {
    /// Create a new state publisher
    ///
    /// # Arguments
    ///
    /// * `share_selected_text` - Whether to include selected text in shared state
    pub fn new(share_selected_text: bool) -> Self {
        let pending_publish = Arc::new(AtomicBool::new(false));
        Self {
            current_kb: None,
            current_knowledge: None,
            selection: None,
            last_publish: None,
            throttle_interval: Duration::from_millis(300),
            share_selected_text,
            pending_publish,
        }
    }

    /// Set current knowledge base
    pub fn set_kb(&mut self, path: PathBuf, name: String, count: usize) {
        self.current_kb = Some(CurrentKb {
            path,
            name,
            knowledge_count: count,
        });
        self.publish();
    }

    /// Set current knowledge
    pub fn set_knowledge(&mut self, path: String, title: String, category: Option<String>) {
        self.current_knowledge = Some(CurrentKnowledge {
            path,
            title,
            category,
        });
        self.publish();
    }

    /// Clear current knowledge
    pub fn clear_knowledge(&mut self) {
        self.current_knowledge = None;
        self.selection = None;
        self.publish();
    }

    /// Set text selection
    ///
    /// # Arguments
    ///
    /// * `start_line` - Starting line number (1-based)
    /// * `end_line` - Ending line number (1-based)
    /// * `text` - Optional selected text content
    pub fn set_selection(&mut self, start_line: usize, end_line: usize, text_length: usize, text: Option<String>) {
        // 先保存原始文本的元数据
        let has_text = text_length > 0 || text.is_some();
        let original_text_length = if text_length > 0 {
            text_length
        } else {
            text.as_ref().map(|t| t.len()).unwrap_or(0)
        };

        // 然后过滤文本内容
        let selected_text = if self.share_selected_text {
            text.and_then(|t| {
                // 截断到最大长度（按字节正确处理 UTF-8）
                let truncated = truncate_text(&t, SELECTED_TEXT_MAX_LENGTH);

                // 检查敏感内容（独立于隐私设置）
                if contains_sensitive_content(&truncated) {
                    // 如果检测到敏感内容，替换为占位符
                    Some("[REDACTED: Sensitive content detected]".to_string())
                } else {
                    Some(truncated)
                }
            })
        } else {
            None
        };

        self.selection = Some(Selection {
            start_line,
            end_line,
            has_text,  // 基于原始文本
            text_length: original_text_length,  // 基于原始文本
            selected_text,  // 过滤后的文本
        });

        // Throttle: delay publication for frequent selection changes
        self.publish_throttled();
    }

    /// Clear text selection
    pub fn clear_selection(&mut self) {
        self.selection = None;
        self.publish();
    }

    /// Immediately publish (for important state changes)
    fn publish(&mut self) {
        self.last_publish = Some(Instant::now());
        self.do_publish();
    }

    /// Throttled publication (for frequent selection changes)
    fn publish_throttled(&mut self) {
        if let Some(last) = self.last_publish {
            if last.elapsed() < self.throttle_interval {
                // 记录待发布状态（使用原子操作，避免竞态条件）
                self.pending_publish.store(true, Ordering::Release);

                // 延迟发布：在节流结束后发布
                let pending = self.pending_publish.clone();
                let interval = self.throttle_interval;
                let publisher = self.clone_state();

                thread::spawn(move || {
                    thread::sleep(interval);
                    // 原子地检查并清除标志（使用 compare_exchange 避免竞态条件）
                    if pending.compare_exchange(true, false, Ordering::AcqRel, Ordering::Acquire).is_ok() {
                        publisher.do_publish();
                    }
                });
                return;
            }
        }
        self.publish();
    }

    /// 克隆当前状态（用于延迟发布）
    fn clone_state(&self) -> Self {
        Self {
            current_kb: self.current_kb.clone(),
            current_knowledge: self.current_knowledge.clone(),
            selection: self.selection.clone(),
            last_publish: self.last_publish,
            throttle_interval: self.throttle_interval,
            share_selected_text: self.share_selected_text,
            pending_publish: Arc::clone(&self.pending_publish),
        }
    }

    /// Publish to shared state file (atomic write)
    fn do_publish(&self) {
        let state = EditorState {
            mode: EditorMode::Follow,
            desktop: Some(DesktopState {
                running: true,
                pid: std::process::id(),
                focused: true, // TODO: Actually get window focus state
            }),
            current_kb: self.current_kb.clone(),
            current_knowledge: self.current_knowledge.clone(),
            selection: self.selection.clone(),
            active_agents: vec![], // Filled by MCP Server
            state_valid: true,
            updated_at: chrono::Utc::now(),
            error: None,
        };

        if let Err(e) = state.save() {
            // 记录错误到日志
            eprintln!("[DesktopStatePublisher] Failed to publish shared state: {}", e);
            eprintln!("[DesktopStatePublisher] KB: {:?}, Knowledge: {:?}",
                self.current_kb.as_ref().map(|kb| &kb.path),
                self.current_knowledge.as_ref().map(|k| &k.path)
            );

            // 考虑使用更正式的日志系统（如 tracing）
            // tracing::error!("Failed to publish shared state: {}", e);
        }
    }

    /// Cleanup on desktop app exit
    pub fn cleanup(&self) {
        if let Err(e) = EditorState::clear() {
            eprintln!("Failed to clear shared state: {}", e);
        }
    }
}

/// Detect sensitive content
///
/// Checks for API keys, passwords, private keys, etc.
/// Returns true if sensitive content is detected.
fn contains_sensitive_content(text: &str) -> bool {
    let sensitive_patterns = [
        // API Keys - 更精确的模式以减少误报
        r"(?i)sk-[a-zA-Z0-9]{20,}",  // OpenAI API keys
        r"(?i)ghp_[a-zA-Z0-9]{36}",   // GitHub personal access tokens
        r"(?i)AKIA[0-9A-Z]{16}",      // AWS access keys
        r"(?i)gho_[a-zA-Z0-9]{36}",   // GitHub OAuth tokens
        r"(?i)ghu_[a-zA-Z0-9]{36}",   // GitHub user-to-server tokens
        r"(?i)ghs_[a-zA-Z0-9]{36}",   // GitHub server-to-server tokens
        r"(?i)ghr_[a-zA-Z0-9]{36}",   // GitHub refresh tokens
        // Passwords - 更严格的模式
        r"(?i)password\s*[:=]\s*[^\s]{8,}",  // password: value with >=8 chars
        r"(?i)passwd\s*[:=]\s*[^\s]{8,}",
        r"(?i)pwd\s*[:=]\s*[^\s]{8,}",
        // Private keys - 明确的标记
        r"-----BEGIN (RSA |EC |DSA |OPENSSH |PRIVATE )?PRIVATE KEY-----",
        // 更长的随机字符串（likely tokens）- 增加长度限制
        r"[a-zA-Z0-9/_-]{64,}",  // 64+ chars likely a token
    ];

    for pattern in &sensitive_patterns {
        if let Ok(re) = regex::Regex::new(pattern) {
            if re.is_match(text) {
                return true;
            }
        }
    }
    false
}

/// 截断文本到指定字节数（正确处理 UTF-8）
fn truncate_text(text: &str, max_bytes: usize) -> String {
    if text.len() <= max_bytes {
        return text.to_string();
    }

    // 找到不超过 max_bytes 的最后一个 UTF-8 字符边界
    let mut end = max_bytes;
    while !text.is_char_boundary(end) && end > 0 {
        end -= 1;
    }

    if end == 0 {
        // 如果无法找到字符边界，返回空字符串
        return String::new();
    }

    format!("{}...", &text[..end])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_desktop_state_publisher_creation() {
        let publisher = DesktopStatePublisher::new(false);
        assert!(!publisher.share_selected_text);
    }

    #[test]
    fn test_sensitive_content_detection() {
        // Should detect API keys
        assert!(contains_sensitive_content("sk-12345678901234567890"));
        assert!(contains_sensitive_content("password: secret123"));
        assert!(contains_sensitive_content("-----BEGIN RSA PRIVATE KEY-----"));

        // Should allow normal text
        assert!(!contains_sensitive_content("This is normal text"));
        assert!(!contains_sensitive_content("function hello() { return true; }"));
    }
}
