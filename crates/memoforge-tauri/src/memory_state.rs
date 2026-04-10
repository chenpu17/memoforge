//! 内存编辑器状态管理器
//! v2.0 架构：不再使用文件同步，直接内存访问
//!
//! 此模块提供了用于 Tauri 桌面应用和内嵌 MCP Server 之间的
//! 共享状态管理。使用 Arc<Mutex<EditorState>> 实现线程安全的内存共享。
//!
//! ## 架构说明
//!
//! - Tauri 前端通过 Tauri Commands 更新状态
//! - MCP Server 通过 Arc<Mutex<>> 读取状态
//! - 状态变化通过 watch channel 通知 SSE 客户端
//!
//! 参考: 技术实现文档 §2.5

use chrono::{DateTime, Utc};
use memoforge_core::editor_state::{CurrentKb, CurrentKnowledge, EditorState, Selection};
use serde::Serialize;
use std::sync::{Arc, Mutex};
use tokio::sync::watch;

/// 内存中的编辑器状态
#[derive(Debug, Clone, Serialize)]
pub struct MemoryEditorState {
    /// 当前知识库
    pub current_kb: Option<CurrentKb>,
    /// 当前选中的知识点
    pub current_knowledge: Option<CurrentKnowledge>,
    /// 文本选择范围
    pub selection: Option<Selection>,
    /// 桌面窗口是否聚焦
    pub desktop_focused: bool,
    /// 最后更新时间
    pub updated_at: DateTime<Utc>,
    /// 状态是否有效
    pub state_valid: bool,
}

impl Default for MemoryEditorState {
    fn default() -> Self {
        Self {
            current_kb: None,
            current_knowledge: None,
            selection: None,
            desktop_focused: true,
            updated_at: Utc::now(),
            state_valid: false,
        }
    }
}

impl From<MemoryEditorState> for EditorState {
    fn from(mem: MemoryEditorState) -> Self {
        EditorState {
            mode: memoforge_core::editor_state::EditorMode::Follow,
            desktop: Some(memoforge_core::editor_state::DesktopState {
                running: true,
                pid: std::process::id(),
                focused: mem.desktop_focused,
            }),
            current_kb: mem.current_kb,
            current_knowledge: mem.current_knowledge,
            selection: mem.selection,
            active_agents: vec![],
            state_valid: mem.state_valid,
            updated_at: mem.updated_at,
            error: None,
        }
    }
}

/// 全局状态管理器
pub struct StateManager {
    /// 内部状态（Mutex 保护）
    state: Arc<Mutex<MemoryEditorState>>,
    /// 状态变化通知通道
    state_tx: watch::Sender<MemoryEditorState>,
}

impl StateManager {
    /// 创建新的状态管理器
    pub fn new() -> Self {
        let initial_state = MemoryEditorState::default();
        let (state_tx, _) = watch::channel(initial_state.clone());

        Self {
            state: Arc::new(Mutex::new(initial_state)),
            state_tx,
        }
    }

    /// 获取当前状态（用于 MCP 工具调用）
    pub fn get_state(&self) -> MemoryEditorState {
        self.state.lock().unwrap().clone()
    }

    /// 获取状态的 Arc（用于 MCP Server 共享）
    pub fn get_arc(&self) -> Arc<Mutex<MemoryEditorState>> {
        self.state.clone()
    }

    /// 获取 watch channel 发送器
    pub fn get_watcher(&self) -> watch::Receiver<MemoryEditorState> {
        self.state_tx.subscribe()
    }

    /// 更新知识库
    pub fn set_kb(&self, path: std::path::PathBuf, name: String, count: usize) {
        let mut state = self.state.lock().unwrap();
        state.current_kb = Some(CurrentKb {
            path,
            name,
            knowledge_count: count,
        });
        state.updated_at = Utc::now();
        state.state_valid = true;
        drop(state); // 释放锁

        // 通知观察者
        let current = self.state.lock().unwrap().clone();
        let _ = self.state_tx.send(current);
    }

    /// 更新当前知识点
    pub fn set_knowledge(&self, path: String, title: String, category: Option<String>) {
        let mut state = self.state.lock().unwrap();
        state.current_knowledge = Some(CurrentKnowledge {
            path,
            title,
            category,
        });
        state.updated_at = Utc::now();
        drop(state);

        // 通知观察者
        let current = self.state.lock().unwrap().clone();
        let _ = self.state_tx.send(current);
    }

    /// 更新选区
    pub fn set_selection(
        &self,
        start_line: usize,
        end_line: usize,
        text_length: usize,
        text: Option<String>,
    ) {
        let mut state = self.state.lock().unwrap();
        let has_text = text_length > 0 || text.is_some();

        state.selection = Some(Selection {
            start_line,
            end_line,
            has_text,
            text_length,
            selected_text: text,
        });
        state.updated_at = Utc::now();
        drop(state);

        // 通知观察者
        let current = self.state.lock().unwrap().clone();
        let _ = self.state_tx.send(current);
    }

    /// 清除知识点选择
    pub fn clear_knowledge(&self) {
        let mut state = self.state.lock().unwrap();
        state.current_knowledge = None;
        state.selection = None;
        state.updated_at = Utc::now();
        drop(state);

        // 通知观察者
        let current = self.state.lock().unwrap().clone();
        let _ = self.state_tx.send(current);
    }

    /// 清除选区
    pub fn clear_selection(&self) {
        let mut state = self.state.lock().unwrap();
        state.selection = None;
        state.updated_at = Utc::now();
        drop(state);

        // 通知观察者
        let current = self.state.lock().unwrap().clone();
        let _ = self.state_tx.send(current);
    }

    /// 更新桌面窗口聚焦状态
    pub fn set_focus(&self, focused: bool) {
        let mut state = self.state.lock().unwrap();
        state.desktop_focused = focused;
        state.updated_at = Utc::now();
        drop(state);

        let current = self.state.lock().unwrap().clone();
        let _ = self.state_tx.send(current);
    }

    /// 设置状态有效性
    pub fn set_valid(&self, valid: bool) {
        let mut state = self.state.lock().unwrap();
        state.state_valid = valid;
        state.updated_at = Utc::now();
        drop(state);

        // 通知观察者
        let current = self.state.lock().unwrap().clone();
        let _ = self.state_tx.send(current);
    }

    /// 转换为 SSE 状态快照（与 PRD canonical schema 保持一致）
    pub fn to_sse_snapshot(&self) -> memoforge_mcp::EditorStateSnapshot {
        let state = self.get_state();
        let has_valid_state = state.current_kb.is_some();
        memoforge_mcp::EditorStateSnapshot {
            mode: "sse".to_string(),
            desktop: Some(memoforge_mcp::DesktopInfo {
                running: true,
                pid: Some(std::process::id()),
                focused: Some(state.desktop_focused),
            }),
            current_kb: state.current_kb.map(|kb| memoforge_mcp::CurrentKb {
                path: kb.path.to_string_lossy().to_string(),
                name: kb.name,
                knowledge_count: kb.knowledge_count,
            }),
            current_knowledge: state
                .current_knowledge
                .map(|k| memoforge_mcp::CurrentKnowledge {
                    path: k.path,
                    title: k.title,
                    category: k.category,
                }),
            selection: state.selection.map(|s| memoforge_mcp::Selection {
                start_line: s.start_line,
                end_line: s.end_line,
                has_text: s.has_text,
                text_length: s.text_length,
                selected_text: s.selected_text,
            }),
            active_agents: vec![], // SSE 模式下暂不跟踪其他 agent
            state_valid: has_valid_state,
            updated_at: state.updated_at.to_rfc3339(),
            error: None,
        }
    }
}

impl Default for StateManager {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn test_state_manager_creation() {
        let manager = StateManager::new();
        let state = manager.get_state();

        assert!(state.current_kb.is_none());
        assert!(state.current_knowledge.is_none());
        assert!(state.selection.is_none());
        assert!(state.desktop_focused);
    }

    #[test]
    fn test_set_kb() {
        let manager = StateManager::new();
        let path = PathBuf::from("/test/kb");

        manager.set_kb(path.clone(), "Test KB".to_string(), 100);

        let state = manager.get_state();
        assert!(state.current_kb.is_some());
        let kb = state.current_kb.unwrap();
        assert_eq!(kb.path, path);
        assert_eq!(kb.name, "Test KB");
        assert_eq!(kb.knowledge_count, 100);
    }

    #[test]
    fn test_set_knowledge() {
        let manager = StateManager::new();

        manager.set_knowledge(
            "test.md".to_string(),
            "Test Title".to_string(),
            Some("Category".to_string()),
        );

        let state = manager.get_state();
        assert!(state.current_knowledge.is_some());
        let knowledge = state.current_knowledge.unwrap();
        assert_eq!(knowledge.path, "test.md");
        assert_eq!(knowledge.title, "Test Title");
        assert_eq!(knowledge.category, Some("Category".to_string()));
    }

    #[test]
    fn test_set_selection() {
        let manager = StateManager::new();

        manager.set_selection(1, 5, 9, Some("test text".to_string()));

        let state = manager.get_state();
        assert!(state.selection.is_some());
        let selection = state.selection.unwrap();
        assert_eq!(selection.start_line, 1);
        assert_eq!(selection.end_line, 5);
        assert_eq!(selection.has_text, true);
        assert_eq!(selection.text_length, 9);
    }

    #[test]
    fn test_clear_knowledge() {
        let manager = StateManager::new();

        manager.set_knowledge("test.md".to_string(), "Test".to_string(), None);
        manager.set_selection(1, 5, 0, None);

        manager.clear_knowledge();

        let state = manager.get_state();
        assert!(state.current_knowledge.is_none());
        assert!(state.selection.is_none());
    }

    #[test]
    fn test_watcher() {
        let manager = StateManager::new();
        let mut watcher = manager.get_watcher();

        // 初始状态
        let initial = watcher.borrow().clone();
        assert!(initial.current_kb.is_none());

        // 更新状态
        manager.set_kb(PathBuf::from("/test"), "Test".to_string(), 10);

        // 等待通知
        let _ = watcher.changed();

        let updated = watcher.borrow().clone();
        assert!(updated.current_kb.is_some());
    }

    #[test]
    fn test_set_selection_without_text_still_preserves_metadata() {
        let manager = StateManager::new();

        manager.set_selection(2, 4, 12, None);

        let state = manager.get_state();
        let selection = state.selection.unwrap();
        assert!(selection.has_text);
        assert_eq!(selection.text_length, 12);
        assert!(selection.selected_text.is_none());
    }

    #[test]
    fn test_set_focus() {
        let manager = StateManager::new();

        manager.set_focus(false);

        let state = manager.get_state();
        assert!(!state.desktop_focused);
    }
}
