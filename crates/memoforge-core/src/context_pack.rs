//! Context Pack model
//!
//! Context Packs allow grouping of knowledge items by various scopes (tag, folder, topic, manual).
//! They are used by AI agents to efficiently provide context for conversations.

use chrono::Utc;
use serde::{Deserialize, Serialize};

/// Scope type for a Context Pack.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum ContextPackScope {
    Tag,
    Folder,
    Topic,
    Manual,
}

/// Context Pack model.
///
/// Represents a collection of knowledge items grouped by scope.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContextPack {
    /// ULID-based unique identifier
    pub id: String,
    /// Pack name
    pub name: String,
    /// Scope type (Tag/Folder/Topic/Manual)
    pub scope_type: ContextPackScope,
    /// Scope value (e.g., tag name, folder path, topic name)
    pub scope_value: String,
    /// Included knowledge paths
    pub item_paths: Vec<String>,
    /// Optional summary
    pub summary: Option<String>,
    /// Version string
    pub version: String,
    /// ISO 8601 timestamp
    pub created_at: String,
    /// ISO 8601 timestamp
    pub updated_at: String,
}

impl ContextPack {
    /// Create a new Context Pack.
    pub fn new(name: String, scope_type: ContextPackScope, scope_value: String) -> Self {
        let now = Utc::now().to_rfc3339();
        Self {
            id: ulid::Ulid::new().to_string(),
            name,
            scope_type,
            scope_value,
            item_paths: Vec::new(),
            summary: None,
            version: "1.0.0".to_string(),
            created_at: now.clone(),
            updated_at: now,
        }
    }

    /// Add an item path to the pack.
    pub fn add_item_path(&mut self, path: String) {
        if !self.item_paths.contains(&path) {
            self.item_paths.push(path);
            self.touch();
        }
    }

    /// Remove an item path from the pack.
    pub fn remove_item_path(&mut self, path: &str) {
        if self.item_paths.iter().any(|p| p == path) {
            self.item_paths.retain(|p| p != path);
            self.touch();
        }
    }

    /// Update the summary.
    pub fn update_summary(&mut self, summary: Option<String>) {
        self.summary = summary;
        self.touch();
    }

    /// Update the updated_at timestamp.
    pub fn touch(&mut self) {
        self.updated_at = Utc::now().to_rfc3339();
    }

    /// Increment the version.
    pub fn bump_version(&mut self) {
        self.version = Self::increment_version(&self.version);
        self.touch();
    }

    /// Helper to increment semver-like version.
    fn increment_version(version: &str) -> String {
        let parts: Vec<&str> = version.split('.').collect();
        if parts.len() >= 3 {
            let patch: u32 = parts[2].parse().unwrap_or(0);
            format!("{}.{}.{}", parts[0], parts[1], patch + 1)
        } else {
            format!("{}.0.1", version)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_create_context_pack() {
        let pack = ContextPack::new(
            "Test Pack".to_string(),
            ContextPackScope::Tag,
            "important".to_string(),
        );

        assert_eq!(pack.name, "Test Pack");
        assert!(matches!(pack.scope_type, ContextPackScope::Tag));
        assert_eq!(pack.scope_value, "important");
        assert!(pack.item_paths.is_empty());
        assert!(pack.summary.is_none());
        assert_eq!(pack.version, "1.0.0");
        assert!(!pack.id.is_empty());
        assert!(!pack.created_at.is_empty());
        assert!(!pack.updated_at.is_empty());
    }

    #[test]
    fn test_add_item_path() {
        let mut pack =
            ContextPack::new("Pack".to_string(), ContextPackScope::Manual, "".to_string());

        pack.add_item_path("docs/test.md".to_string());
        assert_eq!(pack.item_paths.len(), 1);
        assert_eq!(pack.item_paths[0], "docs/test.md");

        // Adding the same path should not duplicate
        pack.add_item_path("docs/test.md".to_string());
        assert_eq!(pack.item_paths.len(), 1);

        // Adding a different path
        pack.add_item_path("docs/other.md".to_string());
        assert_eq!(pack.item_paths.len(), 2);
    }

    #[test]
    fn test_remove_item_path() {
        let mut pack =
            ContextPack::new("Pack".to_string(), ContextPackScope::Manual, "".to_string());

        pack.add_item_path("docs/test.md".to_string());
        pack.add_item_path("docs/other.md".to_string());

        assert_eq!(pack.item_paths.len(), 2);

        pack.remove_item_path("docs/test.md");
        assert_eq!(pack.item_paths.len(), 1);
        assert_eq!(pack.item_paths[0], "docs/other.md");

        // Removing non-existent path should be safe
        pack.remove_item_path("docs/missing.md");
        assert_eq!(pack.item_paths.len(), 1);
    }

    #[test]
    fn test_update_summary() {
        let mut pack =
            ContextPack::new("Pack".to_string(), ContextPackScope::Manual, "".to_string());

        let old_updated_at = pack.updated_at.clone();

        // Give a small delay to ensure timestamp changes
        std::thread::sleep(std::time::Duration::from_millis(10));

        pack.update_summary(Some("Test summary".to_string()));
        assert_eq!(pack.summary, Some("Test summary".to_string()));
        assert_ne!(pack.updated_at, old_updated_at);
    }

    #[test]
    fn test_touch() {
        let mut pack =
            ContextPack::new("Pack".to_string(), ContextPackScope::Manual, "".to_string());

        let old_updated_at = pack.updated_at.clone();

        std::thread::sleep(std::time::Duration::from_millis(10));

        pack.touch();
        assert_ne!(pack.updated_at, old_updated_at);
    }

    #[test]
    fn test_bump_version() {
        let mut pack =
            ContextPack::new("Pack".to_string(), ContextPackScope::Manual, "".to_string());

        assert_eq!(pack.version, "1.0.0");

        pack.bump_version();
        assert_eq!(pack.version, "1.0.1");

        pack.bump_version();
        assert_eq!(pack.version, "1.0.2");
    }

    #[test]
    fn test_serialization() {
        let mut pack = ContextPack::new(
            "Test Pack".to_string(),
            ContextPackScope::Folder,
            "docs".to_string(),
        );

        pack.add_item_path("docs/test.md".to_string());
        pack.update_summary(Some("A test pack".to_string()));

        let json = serde_json::to_string(&pack).unwrap();
        let deserialized: ContextPack = serde_json::from_str(&json).unwrap();

        assert_eq!(pack.id, deserialized.id);
        assert_eq!(pack.name, deserialized.name);
        assert!(matches!(pack.scope_type, ContextPackScope::Folder));
        assert_eq!(pack.scope_value, deserialized.scope_value);
        assert_eq!(pack.item_paths, deserialized.item_paths);
        assert_eq!(pack.summary, deserialized.summary);
        assert_eq!(pack.version, deserialized.version);
    }

    #[test]
    fn test_scope_types() {
        let tag_pack = ContextPack::new(
            "Tags".to_string(),
            ContextPackScope::Tag,
            "important".to_string(),
        );
        assert!(matches!(tag_pack.scope_type, ContextPackScope::Tag));

        let folder_pack = ContextPack::new(
            "Folder".to_string(),
            ContextPackScope::Folder,
            "docs".to_string(),
        );
        assert!(matches!(folder_pack.scope_type, ContextPackScope::Folder));

        let topic_pack = ContextPack::new(
            "Topic".to_string(),
            ContextPackScope::Topic,
            "rust".to_string(),
        );
        assert!(matches!(topic_pack.scope_type, ContextPackScope::Topic));

        let manual_pack = ContextPack::new(
            "Manual".to_string(),
            ContextPackScope::Manual,
            "".to_string(),
        );
        assert!(matches!(manual_pack.scope_type, ContextPackScope::Manual));
    }
}
