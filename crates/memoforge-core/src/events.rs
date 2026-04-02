//! Event Logging for Cross-Process Notifications
//!
//! All write operations are logged to `.memoforge/events.jsonl` for:
//! - Cross-process notifications (MCP → GUI)
//! - Audit trail

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::fs::OpenOptions;
use std::io::Write;
use std::path::Path;

/// Event types for logging
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum EventAction {
    Create,
    Update,
    UpdateMetadata,
    Delete,
    Move,
    GitCommit,
    GitPull,
    GitPush,
    GitMerge,
}

/// Event source identification
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum EventSource {
    #[serde(rename = "gui")]
    Gui,
    #[serde(rename = "cli")]
    Cli,
    #[serde(rename = "mcp")]
    Mcp,
    #[serde(rename = "mcp:claude-code")]
    McpClaudeCode,
    #[serde(rename = "mcp:codex")]
    McpCodex,
    #[serde(rename = "mcp:other")]
    McpOther,
}

/// Event log entry
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Event {
    /// ISO 8601 timestamp
    pub time: DateTime<Utc>,
    /// Operation source (gui, cli, mcp, mcp:claude-code, etc.)
    pub source: EventSource,
    /// Action type
    pub action: EventAction,
    /// Affected knowledge path (null for global operations)
    pub path: Option<String>,
    /// Human-readable description
    pub detail: String,
}

impl Default for EventSource {
    fn default() -> Self {
        EventSource::Gui
    }
}

/// Append an event to the events log file
pub fn log_event(kb_path: &Path, event: Event) -> std::io::Result<()> {
    let events_dir = kb_path.join(".memoforge");
    if !events_dir.exists() {
        std::fs::create_dir_all(&events_dir)?;
    }

    let events_file = events_dir.join("events.jsonl");
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(events_file)?;

    let json = serde_json::to_string(&event)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;
    writeln!(file, "{}", json)?;

    Ok(())
}

/// Convenience function to log a create event
pub fn log_create(
    kb_path: &Path,
    source: EventSource,
    path: &str,
    title: &str,
) -> std::io::Result<()> {
    log_event(
        kb_path,
        Event {
            time: Utc::now(),
            source,
            action: EventAction::Create,
            path: Some(path.to_string()),
            detail: format!("创建了新知识: {}", title),
        },
    )
}

/// Convenience function to log an update event
pub fn log_update(
    kb_path: &Path,
    source: EventSource,
    path: &str,
    title: &str,
) -> std::io::Result<()> {
    log_event(
        kb_path,
        Event {
            time: Utc::now(),
            source,
            action: EventAction::Update,
            path: Some(path.to_string()),
            detail: format!("更新了知识: {}", title),
        },
    )
}

/// Convenience function to log an update metadata event
pub fn log_update_metadata(
    kb_path: &Path,
    source: EventSource,
    path: &str,
    title: &str,
) -> std::io::Result<()> {
    log_event(
        kb_path,
        Event {
            time: Utc::now(),
            source,
            action: EventAction::UpdateMetadata,
            path: Some(path.to_string()),
            detail: format!("更新了知识元数据: {}", title),
        },
    )
}

/// Convenience function to log a delete event
pub fn log_delete(
    kb_path: &Path,
    source: EventSource,
    path: &str,
    title: &str,
) -> std::io::Result<()> {
    log_event(
        kb_path,
        Event {
            time: Utc::now(),
            source,
            action: EventAction::Delete,
            path: Some(path.to_string()),
            detail: format!("删除了知识: {}", title),
        },
    )
}

/// Convenience function to log a move event
pub fn log_move(kb_path: &Path, source: EventSource, from: &str, to: &str) -> std::io::Result<()> {
    log_event(
        kb_path,
        Event {
            time: Utc::now(),
            source,
            action: EventAction::Move,
            path: Some(from.to_string()),
            detail: format!("移动知识: {} → {}", from, to),
        },
    )
}

/// Convenience function to log a git commit event
pub fn log_git_commit(
    kb_path: &Path,
    source: EventSource,
    message: &str,
    file_count: usize,
) -> std::io::Result<()> {
    log_event(
        kb_path,
        Event {
            time: Utc::now(),
            source,
            action: EventAction::GitCommit,
            path: None,
            detail: format!("提交了 {} 个文件的修改: {}", file_count, message),
        },
    )
}

/// Convenience function to log a git pull event
pub fn log_git_pull(kb_path: &Path, source: EventSource) -> std::io::Result<()> {
    log_event(
        kb_path,
        Event {
            time: Utc::now(),
            source,
            action: EventAction::GitPull,
            path: None,
            detail: "拉取了远程变更".to_string(),
        },
    )
}

/// Convenience function to log a git push event
pub fn log_git_push(kb_path: &Path, source: EventSource) -> std::io::Result<()> {
    log_event(
        kb_path,
        Event {
            time: Utc::now(),
            source,
            action: EventAction::GitPush,
            path: None,
            detail: "推送了本地提交".to_string(),
        },
    )
}

/// Read recent events from the log file
pub fn read_recent_events(kb_path: &Path, limit: usize) -> std::io::Result<Vec<Event>> {
    let events_file = kb_path.join(".memoforge/events.jsonl");
    if !events_file.exists() {
        return Ok(Vec::new());
    }

    let content = std::fs::read_to_string(events_file)?;
    let events: Vec<Event> = content
        .lines()
        .filter_map(|line| serde_json::from_str(line).ok())
        .collect();

    // Return the most recent events
    let start = if events.len() > limit {
        events.len() - limit
    } else {
        0
    };
    Ok(events[start..].to_vec())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn read_recent_events_returns_latest_entries_only() {
        let temp = TempDir::new().unwrap();
        let kb = temp.path();

        log_event(
            kb,
            Event {
                time: Utc::now(),
                source: EventSource::Gui,
                action: EventAction::Create,
                path: Some("one.md".to_string()),
                detail: "one".to_string(),
            },
        )
        .unwrap();
        log_event(
            kb,
            Event {
                time: Utc::now(),
                source: EventSource::Gui,
                action: EventAction::Update,
                path: Some("two.md".to_string()),
                detail: "two".to_string(),
            },
        )
        .unwrap();
        log_event(
            kb,
            Event {
                time: Utc::now(),
                source: EventSource::Gui,
                action: EventAction::Delete,
                path: Some("three.md".to_string()),
                detail: "three".to_string(),
            },
        )
        .unwrap();

        let events = read_recent_events(kb, 2).unwrap();

        assert_eq!(events.len(), 2);
        assert_eq!(events[0].path.as_deref(), Some("two.md"));
        assert_eq!(events[1].path.as_deref(), Some("three.md"));
    }
}
