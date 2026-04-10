//! Agent session model
//!
//! Represents a session of AI agent interaction that generates knowledge candidates.
//! Tracks context, drafts, and inbox items produced during the session.

use chrono::Utc;
use serde::{Deserialize, Serialize};

/// Status of an agent session.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SessionStatus {
    /// Session is currently running and actively consuming context
    Running,
    /// Session completed successfully
    Completed,
    /// Session failed due to an error
    Failed,
    /// Session was cancelled before completion
    Cancelled,
}

/// Type of reference for context items.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ContextRefType {
    /// Reference to a knowledge entry
    Knowledge,
    /// Reference to a context pack
    Pack,
    /// Reference to a URL
    Url,
    /// Reference to a local file
    File,
}

/// Represents a single context item consumed during a session.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContextItem {
    /// Type of the referenced object
    pub ref_type: ContextRefType,

    /// Stable reference (path, pack_id, url, etc.)
    pub ref_id: String,

    /// When this context was accessed (ISO 8601)
    pub accessed_at: String,

    /// Optional summary of the context
    pub summary: Option<String>,
}

impl ContextItem {
    /// Create a new context item.
    pub fn new(ref_type: ContextRefType, ref_id: String) -> Self {
        Self {
            ref_type,
            ref_id,
            accessed_at: Utc::now().to_rfc3339(),
            summary: None,
        }
    }

    /// Create a new context item with a summary.
    pub fn with_summary(ref_type: ContextRefType, ref_id: String, summary: String) -> Self {
        Self {
            ref_type,
            ref_id,
            accessed_at: Utc::now().to_rfc3339(),
            summary: Some(summary),
        }
    }
}

/// Represents an agent session.
///
/// A session tracks the lifecycle of an AI agent's interaction with the knowledge base,
/// including all context consumed and artifacts produced.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentSession {
    /// Unique identifier (ULID format)
    pub id: String,

    /// Agent identifier (e.g., "claude-code", "opencode")
    pub agent_name: String,

    /// Agent source system (optional)
    pub agent_source: Option<String>,

    /// Goal/objective of this session
    pub goal: String,

    /// Current status of the session
    pub status: SessionStatus,

    /// Context items consumed during the session
    pub context_items: Vec<ContextItem>,

    /// IDs of drafts produced during the session
    pub draft_ids: Vec<String>,

    /// IDs of inbox items produced during the session
    pub inbox_item_ids: Vec<String>,

    /// Summary of the session result
    pub result_summary: Option<String>,

    /// IDs of context packs referenced
    pub context_pack_ids: Vec<String>,

    /// When the session started
    pub started_at: String,

    /// When the session finished (null if running)
    pub finished_at: Option<String>,

    /// Additional metadata for extensibility
    pub metadata: serde_json::Value,
}

impl AgentSession {
    /// Create a new agent session.
    pub fn new(agent_name: String, goal: String) -> Self {
        let now = Utc::now().to_rfc3339();
        Self {
            id: ulid::Ulid::new().to_string(),
            agent_name,
            agent_source: None,
            goal,
            status: SessionStatus::Running,
            context_items: Vec::new(),
            draft_ids: Vec::new(),
            inbox_item_ids: Vec::new(),
            result_summary: None,
            context_pack_ids: Vec::new(),
            started_at: now.clone(),
            finished_at: None,
            metadata: serde_json::json!({}),
        }
    }

    /// Check if the session is in a terminal state.
    pub fn is_terminal(&self) -> bool {
        matches!(
            self.status,
            SessionStatus::Completed | SessionStatus::Failed | SessionStatus::Cancelled
        )
    }

    /// Check if context can be appended (only when running).
    pub fn can_append_context(&self) -> bool {
        self.status == SessionStatus::Running
    }

    /// Check if the session status can be updated to a new state.
    pub fn can_transition_to(&self, new_status: &SessionStatus) -> bool {
        match (&self.status, new_status) {
            // Normal flow: running -> completed
            (SessionStatus::Running, SessionStatus::Completed)
            // Failure flow: running -> failed
            | (SessionStatus::Running, SessionStatus::Failed)
            // Cancellation flow: running -> cancelled
            | (SessionStatus::Running, SessionStatus::Cancelled) => true,

            // Terminal states cannot transition
            (SessionStatus::Completed, _)
            | (SessionStatus::Failed, _)
            | (SessionStatus::Cancelled, _) => false,

            // Self-transition (no-op) - must come after other patterns
            (current, new) if current == new => true,

            // All other transitions are invalid
            _ => false,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_create_new_session() {
        let session = AgentSession::new("claude-code".to_string(), "Test goal".to_string());

        assert!(session.id.len() > 0);
        assert_eq!(session.agent_name, "claude-code");
        assert_eq!(session.goal, "Test goal");
        assert_eq!(session.status, SessionStatus::Running);
        assert!(session.agent_source.is_none());
        assert!(session.context_items.is_empty());
        assert!(session.draft_ids.is_empty());
        assert!(session.inbox_item_ids.is_empty());
        assert!(session.result_summary.is_none());
        assert!(session.context_pack_ids.is_empty());
        assert!(session.finished_at.is_none());
    }

    #[test]
    fn test_context_item_creation() {
        let item = ContextItem::new(ContextRefType::Knowledge, "docs/reference.md".to_string());

        assert_eq!(item.ref_type, ContextRefType::Knowledge);
        assert_eq!(item.ref_id, "docs/reference.md");
        assert!(item.summary.is_none());
        assert!(item.accessed_at.len() > 0);
    }

    #[test]
    fn test_context_item_with_summary() {
        let item = ContextItem::with_summary(
            ContextRefType::Url,
            "https://example.com".to_string(),
            "Example website".to_string(),
        );

        assert_eq!(item.ref_type, ContextRefType::Url);
        assert_eq!(item.ref_id, "https://example.com");
        assert_eq!(item.summary, Some("Example website".to_string()));
    }

    #[test]
    fn test_session_status_transitions() {
        let mut session = AgentSession::new("test-agent".to_string(), "Test goal".to_string());

        // Can transition from Running to Completed
        assert!(session.can_transition_to(&SessionStatus::Completed));
        session.status = SessionStatus::Completed;

        // Terminal state cannot transition
        assert!(!session.can_transition_to(&SessionStatus::Running));
    }

    #[test]
    fn test_session_failure_transition() {
        let session = AgentSession::new("test-agent".to_string(), "Test goal".to_string());

        assert!(session.can_transition_to(&SessionStatus::Failed));
    }

    #[test]
    fn test_session_cancellation_transition() {
        let session = AgentSession::new("test-agent".to_string(), "Test goal".to_string());

        assert!(session.can_transition_to(&SessionStatus::Cancelled));
    }

    #[test]
    fn test_invalid_status_transition() {
        let mut session = AgentSession::new("test-agent".to_string(), "Test goal".to_string());
        session.status = SessionStatus::Failed;

        // Cannot transition from Failed to Completed
        assert!(!session.can_transition_to(&SessionStatus::Completed));
    }

    #[test]
    fn test_session_is_terminal() {
        let mut session = AgentSession::new("test-agent".to_string(), "Test goal".to_string());

        assert!(!session.is_terminal());

        session.status = SessionStatus::Completed;
        assert!(session.is_terminal());

        session.status = SessionStatus::Failed;
        assert!(session.is_terminal());

        session.status = SessionStatus::Cancelled;
        assert!(session.is_terminal());
    }

    #[test]
    fn test_can_append_context() {
        let mut session = AgentSession::new("test-agent".to_string(), "Test goal".to_string());

        assert!(session.can_append_context());

        session.status = SessionStatus::Completed;
        assert!(!session.can_append_context());
    }

    #[test]
    fn test_context_ref_types() {
        let types = vec![
            ContextRefType::Knowledge,
            ContextRefType::Pack,
            ContextRefType::Url,
            ContextRefType::File,
        ];

        for ref_type in types {
            let item = ContextItem::new(ref_type.clone(), "test-id".to_string());
            assert_eq!(item.ref_type, ref_type);
        }
    }
}
