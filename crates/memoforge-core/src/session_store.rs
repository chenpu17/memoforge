//! Session persistence layer
//!
//! Handles storage and retrieval of agent sessions using a file-based approach.

use crate::error::{ErrorCode, MemoError};
use crate::session::{AgentSession, ContextItem, SessionStatus};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::fs;

/// Index entry for sessions.
#[derive(Debug, Clone, Serialize, Deserialize)]
struct SessionIndexEntry {
    id: String,
    agent_name: String,
    status: SessionStatus,
    goal: String,
    started_at: String,
    finished_at: Option<String>,
}

/// Session index for efficient querying without loading all sessions.
#[derive(Debug, Clone, Serialize, Deserialize)]
struct SessionIndex {
    sessions: Vec<SessionIndexEntry>,
}

impl SessionIndex {
    fn new() -> Self {
        Self {
            sessions: Vec::new(),
        }
    }

    fn add(&mut self, session: &AgentSession) {
        let entry = SessionIndexEntry {
            id: session.id.clone(),
            agent_name: session.agent_name.clone(),
            status: session.status.clone(),
            goal: session.goal.clone(),
            started_at: session.started_at.clone(),
            finished_at: session.finished_at.clone(),
        };

        // Update existing entry or add new one
        if let Some(pos) = self.sessions.iter().position(|e| e.id == session.id) {
            self.sessions[pos] = entry;
        } else {
            self.sessions.push(entry);
        }
    }

    fn remove(&mut self, id: &str) {
        self.sessions.retain(|e| e.id != id);
    }
}

/// Session storage manager.
///
/// Manages persistence of agent sessions to `.memoforge/sessions/` directory.
#[allow(dead_code)]
pub struct SessionStore {
    kb_path: std::path::PathBuf,
    lock_manager: crate::lock::LockManager,
}

impl SessionStore {
    /// Create a new session store for the given knowledge base path.
    pub fn new(kb_path: std::path::PathBuf) -> Self {
        let kb_path_clone = kb_path.clone();
        Self {
            kb_path,
            lock_manager: crate::lock::LockManager::new(kb_path_clone),
        }
    }

    fn sessions_dir(&self) -> std::path::PathBuf {
        self.kb_path.join(".memoforge/sessions")
    }

    fn session_path(&self, id: &str) -> Result<std::path::PathBuf, MemoError> {
        crate::error::validate_storage_id(id, "session ID")?;
        Ok(self.sessions_dir().join(format!("{}.json", id)))
    }

    fn index_path(&self) -> std::path::PathBuf {
        self.sessions_dir().join("index.json")
    }

    /// Ensure the sessions directory exists.
    fn ensure_dir(&self) -> Result<(), MemoError> {
        fs::create_dir_all(self.sessions_dir()).map_err(|e| MemoError {
            code: ErrorCode::InvalidPath,
            message: format!("Failed to create sessions directory: {}", e),
            retry_after_ms: None,
            context: None,
        })?;

        // Ensure .memoforge/.gitignore includes sessions/
        let gitignore_path = self.kb_path.join(".memoforge/.gitignore");
        let gitignore_content = if gitignore_path.exists() {
            fs::read_to_string(&gitignore_path).unwrap_or_default()
        } else {
            String::new()
        };

        if !gitignore_content.lines().any(|l| l.trim() == "sessions/") {
            let new_content = if gitignore_content.is_empty() {
                "sessions/\n".to_string()
            } else if gitignore_content.ends_with('\n') {
                format!("{}sessions/\n", gitignore_content)
            } else {
                format!("{}\nsessions/\n", gitignore_content)
            };
            fs::write(&gitignore_path, new_content).map_err(|e| MemoError {
                code: ErrorCode::InvalidPath,
                message: format!("Failed to write .gitignore: {}", e),
                retry_after_ms: None,
                context: None,
            })?;
        }

        Ok(())
    }

    /// Load the index from disk.
    fn load_index(&self) -> Result<SessionIndex, MemoError> {
        let index_path = self.index_path();
        if !index_path.exists() {
            return Ok(SessionIndex::new());
        }

        let content = fs::read_to_string(&index_path).map_err(|e| MemoError {
            code: ErrorCode::InvalidData,
            message: format!("Failed to read session index: {}", e),
            retry_after_ms: None,
            context: None,
        })?;

        serde_json::from_str(&content).map_err(|e| MemoError {
            code: ErrorCode::InvalidData,
            message: format!("Failed to parse session index: {}", e),
            retry_after_ms: None,
            context: None,
        })
    }

    /// Save the index to disk.
    fn save_index(&self, index: &SessionIndex) -> Result<(), MemoError> {
        let index_path = self.index_path();
        let json = serde_json::to_string_pretty(index).map_err(|e| MemoError {
            code: ErrorCode::InvalidData,
            message: format!("Failed to serialize session index: {}", e),
            retry_after_ms: None,
            context: None,
        })?;

        fs::write(&index_path, json).map_err(|e| MemoError {
            code: ErrorCode::InvalidPath,
            message: format!("Failed to write session index: {}", e),
            retry_after_ms: None,
            context: None,
        })?;

        Ok(())
    }

    /// Create a new session.
    pub fn create_session(&self, session: AgentSession) -> Result<AgentSession, MemoError> {
        self.ensure_dir()?;

        let session_path = self.session_path(&session.id)?;
        if session_path.exists() {
            return Err(MemoError {
                code: ErrorCode::InvalidData,
                message: format!("Session already exists: {}", session.id),
                retry_after_ms: None,
                context: None,
            });
        }

        // Save session to disk
        let json = serde_json::to_string_pretty(&session).map_err(|e| MemoError {
            code: ErrorCode::InvalidData,
            message: format!("Failed to serialize session: {}", e),
            retry_after_ms: None,
            context: None,
        })?;

        fs::write(&session_path, json).map_err(|e| MemoError {
            code: ErrorCode::InvalidPath,
            message: format!("Failed to write session: {}", e),
            retry_after_ms: None,
            context: None,
        })?;

        // Update index
        let mut index = self.load_index()?;
        index.add(&session);
        self.save_index(&index)?;

        Ok(session)
    }

    /// Get a session by ID.
    pub fn get_session(&self, id: &str) -> Result<AgentSession, MemoError> {
        let session_path = self.session_path(id)?;
        if !session_path.exists() {
            return Err(MemoError {
                code: ErrorCode::NotFoundKnowledge,
                message: format!("Session not found: {}", id),
                retry_after_ms: None,
                context: None,
            });
        }

        let content = fs::read_to_string(&session_path).map_err(|e| MemoError {
            code: ErrorCode::NotFoundKnowledge,
            message: format!("Failed to read session: {}", e),
            retry_after_ms: None,
            context: None,
        })?;

        serde_json::from_str(&content).map_err(|e| MemoError {
            code: ErrorCode::InvalidData,
            message: format!("Failed to parse session: {}", e),
            retry_after_ms: None,
            context: None,
        })
    }

    /// List sessions with optional filtering.
    pub fn list_sessions(
        &self,
        status: Option<SessionStatus>,
        limit: Option<usize>,
    ) -> Result<Vec<AgentSession>, MemoError> {
        self.ensure_dir()?;

        let index = self.load_index()?;
        let mut filtered: Vec<_> = index
            .sessions
            .iter()
            .filter(|entry| {
                if let Some(ref s) = status {
                    &entry.status == s
                } else {
                    true
                }
            })
            .collect();

        // Sort by start time (newest first)
        filtered.sort_by(|a, b| b.started_at.cmp(&a.started_at));

        // Apply limit
        if let Some(l) = limit {
            filtered.truncate(l);
        }

        // Load full sessions
        let mut sessions = Vec::new();
        for entry in filtered {
            if let Ok(session) = self.get_session(&entry.id) {
                sessions.push(session);
            }
        }

        Ok(sessions)
    }

    /// Append a context item to a session.
    ///
    /// Only allowed when the session is running.
    pub fn append_context(
        &self,
        session_id: &str,
        context_item: ContextItem,
    ) -> Result<AgentSession, MemoError> {
        let mut session = self.get_session(session_id)?;

        if !session.can_append_context() {
            return Err(MemoError {
                code: ErrorCode::InvalidArgument,
                message: format!(
                    "Cannot append context to session in {:?} state",
                    session.status
                ),
                retry_after_ms: None,
                context: None,
            });
        }

        session.context_items.push(context_item);

        self.save_session(&session)?;
        Ok(session)
    }

    /// Add a draft ID to the session.
    pub fn add_draft_id(
        &self,
        session_id: &str,
        draft_id: String,
    ) -> Result<AgentSession, MemoError> {
        let mut session = self.get_session(session_id)?;

        if !session.draft_ids.contains(&draft_id) {
            session.draft_ids.push(draft_id);
        }

        self.save_session(&session)?;
        Ok(session)
    }

    /// Add an inbox item ID to the session.
    pub fn add_inbox_item_id(
        &self,
        session_id: &str,
        inbox_item_id: String,
    ) -> Result<AgentSession, MemoError> {
        let mut session = self.get_session(session_id)?;

        if !session.inbox_item_ids.contains(&inbox_item_id) {
            session.inbox_item_ids.push(inbox_item_id);
        }

        self.save_session(&session)?;
        Ok(session)
    }

    /// Complete a session.
    ///
    /// Transitions the session to Completed state and sets finished_at timestamp.
    pub fn complete_session(
        &self,
        session_id: &str,
        result_summary: Option<String>,
    ) -> Result<AgentSession, MemoError> {
        let mut session = self.get_session(session_id)?;

        if !session.can_transition_to(&SessionStatus::Completed) {
            return Err(MemoError {
                code: ErrorCode::InvalidArgument,
                message: format!("Cannot complete session in {:?} state", session.status),
                retry_after_ms: None,
                context: None,
            });
        }

        session.status = SessionStatus::Completed;
        session.finished_at = Some(Utc::now().to_rfc3339());
        if let Some(summary) = result_summary {
            session.result_summary = Some(summary);
        }

        self.save_session(&session)?;
        Ok(session)
    }

    /// Fail a session.
    ///
    /// Transitions the session to Failed state.
    pub fn fail_session(
        &self,
        session_id: &str,
        error_message: Option<String>,
    ) -> Result<AgentSession, MemoError> {
        let mut session = self.get_session(session_id)?;

        if !session.can_transition_to(&SessionStatus::Failed) {
            return Err(MemoError {
                code: ErrorCode::InvalidArgument,
                message: format!("Cannot fail session in {:?} state", session.status),
                retry_after_ms: None,
                context: None,
            });
        }

        session.status = SessionStatus::Failed;
        session.finished_at = Some(Utc::now().to_rfc3339());
        if let Some(error) = error_message {
            session.result_summary = Some(error);
        }

        self.save_session(&session)?;
        Ok(session)
    }

    /// Cancel a session.
    ///
    /// Transitions the session to Cancelled state.
    pub fn cancel_session(&self, session_id: &str) -> Result<AgentSession, MemoError> {
        let mut session = self.get_session(session_id)?;

        if !session.can_transition_to(&SessionStatus::Cancelled) {
            return Err(MemoError {
                code: ErrorCode::InvalidArgument,
                message: format!("Cannot cancel session in {:?} state", session.status),
                retry_after_ms: None,
                context: None,
            });
        }

        session.status = SessionStatus::Cancelled;
        session.finished_at = Some(Utc::now().to_rfc3339());

        self.save_session(&session)?;
        Ok(session)
    }

    /// Update a session with new data.
    pub fn update_session(&self, session: AgentSession) -> Result<AgentSession, MemoError> {
        self.ensure_dir()?;

        let session_path = self.session_path(&session.id)?;
        if !session_path.exists() {
            return Err(MemoError {
                code: ErrorCode::NotFoundKnowledge,
                message: format!("Session not found: {}", session.id),
                retry_after_ms: None,
                context: None,
            });
        }

        self.save_session(&session)?;
        Ok(session)
    }

    /// Save a session to disk and update index.
    fn save_session(&self, session: &AgentSession) -> Result<(), MemoError> {
        let session_path = self.session_path(&session.id)?;

        let json = serde_json::to_string_pretty(session).map_err(|e| MemoError {
            code: ErrorCode::InvalidData,
            message: format!("Failed to serialize session: {}", e),
            retry_after_ms: None,
            context: None,
        })?;

        fs::write(&session_path, json).map_err(|e| MemoError {
            code: ErrorCode::InvalidPath,
            message: format!("Failed to write session: {}", e),
            retry_after_ms: None,
            context: None,
        })?;

        // Update index
        let mut index = self.load_index()?;
        index.add(session);
        self.save_index(&index)?;

        Ok(())
    }

    /// Delete a session.
    pub fn delete_session(&self, id: &str) -> Result<(), MemoError> {
        let session_path = self.session_path(id)?;
        if !session_path.exists() {
            return Err(MemoError {
                code: ErrorCode::NotFoundKnowledge,
                message: format!("Session not found: {}", id),
                retry_after_ms: None,
                context: None,
            });
        }

        fs::remove_file(&session_path).map_err(|e| MemoError {
            code: ErrorCode::InvalidPath,
            message: format!("Failed to delete session: {}", e),
            retry_after_ms: None,
            context: None,
        })?;

        // Remove from index
        let mut index = self.load_index()?;
        index.remove(id);
        self.save_index(&index)?;

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn setup_store() -> (TempDir, SessionStore) {
        let temp = TempDir::new().unwrap();
        let kb_path = temp.path().to_path_buf();

        // Initialize KB structure
        fs::create_dir_all(kb_path.join(".memoforge")).unwrap();

        let store = SessionStore::new(kb_path);
        store.ensure_dir().unwrap();

        (temp, store)
    }

    #[test]
    fn test_create_session() {
        let (_temp, store) = setup_store();

        let session = AgentSession::new("claude-code".to_string(), "Test goal".to_string());
        let created = store.create_session(session.clone()).unwrap();

        assert_eq!(created.id, session.id);
        assert_eq!(created.status, SessionStatus::Running);

        // Verify file exists
        assert!(store.session_path(&session.id).unwrap().exists());

        // Verify index exists
        assert!(store.index_path().exists());
    }

    #[test]
    fn test_get_session() {
        let (_temp, store) = setup_store();

        let session = AgentSession::new("test-agent".to_string(), "Get test".to_string());
        store.create_session(session.clone()).unwrap();

        let retrieved = store.get_session(&session.id).unwrap();
        assert_eq!(retrieved.id, session.id);
        assert_eq!(retrieved.agent_name, "test-agent");
        assert_eq!(retrieved.goal, "Get test");
    }

    #[test]
    fn test_get_nonexistent_session() {
        let (_temp, store) = setup_store();

        let result = store.get_session("nonexistent");
        assert!(result.is_err());
        assert_eq!(result.unwrap_err().code, ErrorCode::NotFoundKnowledge);
    }

    #[test]
    fn test_list_sessions() {
        let (_temp, store) = setup_store();

        // Create multiple sessions
        for i in 0..5 {
            let session = AgentSession::new(format!("agent-{}", i), format!("Goal {}", i));
            store.create_session(session).unwrap();
        }

        let sessions = store.list_sessions(None, None).unwrap();
        assert_eq!(sessions.len(), 5);
    }

    #[test]
    fn test_list_sessions_with_limit() {
        let (_temp, store) = setup_store();

        // Create multiple sessions
        for i in 0..10 {
            let session = AgentSession::new(format!("agent-{}", i), format!("Goal {}", i));
            store.create_session(session).unwrap();
        }

        let sessions = store.list_sessions(None, Some(3)).unwrap();
        assert_eq!(sessions.len(), 3);
    }

    #[test]
    fn test_list_sessions_with_status_filter() {
        let (_temp, store) = setup_store();

        // Create sessions with different statuses
        let session1 = AgentSession::new("agent-1".to_string(), "Running goal".to_string());
        let mut session2 = AgentSession::new("agent-2".to_string(), "Completed goal".to_string());
        let mut session3 = AgentSession::new("agent-3".to_string(), "Failed goal".to_string());

        store.create_session(session1).unwrap();

        session2.status = SessionStatus::Completed;
        session2.finished_at = Some(Utc::now().to_rfc3339());
        store.create_session(session2).unwrap();

        session3.status = SessionStatus::Failed;
        session3.finished_at = Some(Utc::now().to_rfc3339());
        store.create_session(session3).unwrap();

        // Filter by Running status
        let running = store
            .list_sessions(Some(SessionStatus::Running), None)
            .unwrap();
        assert_eq!(running.len(), 1);
        assert_eq!(running[0].agent_name, "agent-1");

        // Filter by Completed status
        let completed = store
            .list_sessions(Some(SessionStatus::Completed), None)
            .unwrap();
        assert_eq!(completed.len(), 1);
        assert_eq!(completed[0].agent_name, "agent-2");

        // Filter by Failed status
        let failed = store
            .list_sessions(Some(SessionStatus::Failed), None)
            .unwrap();
        assert_eq!(failed.len(), 1);
        assert_eq!(failed[0].agent_name, "agent-3");
    }

    #[test]
    fn test_append_context() {
        let (_temp, store) = setup_store();

        let session = AgentSession::new("claude-code".to_string(), "Context test".to_string());
        let created = store.create_session(session).unwrap();

        let context_item = ContextItem::new(
            crate::session::ContextRefType::Knowledge,
            "docs/test.md".to_string(),
        );

        let updated = store.append_context(&created.id, context_item).unwrap();
        assert_eq!(updated.context_items.len(), 1);
    }

    #[test]
    fn test_append_context_to_completed_session() {
        let (_temp, store) = setup_store();

        let mut session = AgentSession::new("claude-code".to_string(), "Context test".to_string());
        session.status = SessionStatus::Completed;
        session.finished_at = Some(Utc::now().to_rfc3339());
        let created = store.create_session(session).unwrap();

        let context_item = ContextItem::new(
            crate::session::ContextRefType::Knowledge,
            "docs/test.md".to_string(),
        );

        let result = store.append_context(&created.id, context_item);
        assert!(result.is_err());
    }

    #[test]
    fn test_add_draft_id() {
        let (_temp, store) = setup_store();

        let session = AgentSession::new("claude-code".to_string(), "Draft test".to_string());
        let created = store.create_session(session).unwrap();

        let updated = store
            .add_draft_id(&created.id, "draft_test_123".to_string())
            .unwrap();
        assert_eq!(updated.draft_ids.len(), 1);
        assert_eq!(updated.draft_ids[0], "draft_test_123");
    }

    #[test]
    fn test_add_inbox_item_id() {
        let (_temp, store) = setup_store();

        let session = AgentSession::new("claude-code".to_string(), "Inbox test".to_string());
        let created = store.create_session(session).unwrap();

        let updated = store
            .add_inbox_item_id(&created.id, "inbox_item_123".to_string())
            .unwrap();
        assert_eq!(updated.inbox_item_ids.len(), 1);
        assert_eq!(updated.inbox_item_ids[0], "inbox_item_123");
    }

    #[test]
    fn test_complete_session() {
        let (_temp, store) = setup_store();

        let session = AgentSession::new("claude-code".to_string(), "Complete test".to_string());
        let created = store.create_session(session).unwrap();

        let completed = store
            .complete_session(&created.id, Some("Successfully completed".to_string()))
            .unwrap();

        assert_eq!(completed.status, SessionStatus::Completed);
        assert!(completed.finished_at.is_some());
        assert_eq!(
            completed.result_summary,
            Some("Successfully completed".to_string())
        );
    }

    #[test]
    fn test_complete_already_completed_session() {
        let (_temp, store) = setup_store();

        let mut session = AgentSession::new("claude-code".to_string(), "Complete test".to_string());
        session.status = SessionStatus::Completed;
        session.finished_at = Some(Utc::now().to_rfc3339());
        let created = store.create_session(session).unwrap();

        let result = store.complete_session(&created.id, None);
        assert!(result.is_err());
    }

    #[test]
    fn test_fail_session() {
        let (_temp, store) = setup_store();

        let session = AgentSession::new("claude-code".to_string(), "Fail test".to_string());
        let created = store.create_session(session).unwrap();

        let failed = store
            .fail_session(&created.id, Some("Internal error occurred".to_string()))
            .unwrap();

        assert_eq!(failed.status, SessionStatus::Failed);
        assert!(failed.finished_at.is_some());
        assert_eq!(
            failed.result_summary,
            Some("Internal error occurred".to_string())
        );
    }

    #[test]
    fn test_cancel_session() {
        let (_temp, store) = setup_store();

        let session = AgentSession::new("claude-code".to_string(), "Cancel test".to_string());
        let created = store.create_session(session).unwrap();

        let cancelled = store.cancel_session(&created.id).unwrap();

        assert_eq!(cancelled.status, SessionStatus::Cancelled);
        assert!(cancelled.finished_at.is_some());
    }

    #[test]
    fn test_update_session() {
        let (_temp, store) = setup_store();

        let mut session = AgentSession::new("claude-code".to_string(), "Update test".to_string());
        session.context_pack_ids = vec!["pack1".to_string()];
        let created = store.create_session(session).unwrap();

        let mut updated = created;
        updated.result_summary = Some("Updated summary".to_string());
        updated.metadata = serde_json::json!({"key": "value"});

        let saved = store.update_session(updated.clone()).unwrap();
        assert_eq!(saved.result_summary, Some("Updated summary".to_string()));
        assert_eq!(saved.context_pack_ids, vec!["pack1".to_string()]);
    }

    #[test]
    fn test_delete_session() {
        let (_temp, store) = setup_store();

        let session = AgentSession::new("claude-code".to_string(), "Delete test".to_string());
        let created = store.create_session(session).unwrap();

        assert!(store.session_path(&created.id).unwrap().exists());

        store.delete_session(&created.id).unwrap();
        assert!(!store.session_path(&created.id).unwrap().exists());

        // Should also be removed from index
        let sessions = store.list_sessions(None, None).unwrap();
        assert!(sessions.iter().all(|s| s.id != created.id));
    }

    #[test]
    fn test_sessions_gitignore() {
        let (_temp, store) = setup_store();

        let session = AgentSession::new("claude-code".to_string(), "Gitignore test".to_string());
        store.create_session(session).unwrap();

        let gitignore = fs::read_to_string(store.kb_path.join(".memoforge/.gitignore")).unwrap();
        assert!(gitignore.contains("sessions/"));
    }
}
