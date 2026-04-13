//! Inbox persistence layer
//!
//! Handles storage and retrieval of inbox items using a file-based approach
//! with an in-memory index for efficient querying.

use crate::error::{ErrorCode, MemoError};
use crate::inbox::{InboxItem, InboxStatus};
use crate::lock::LockManager;
use crate::InboxSourceType;
use serde::{Deserialize, Serialize};
use std::fs;

/// Index entry for inbox items.
#[derive(Debug, Clone, Serialize, Deserialize)]
struct InboxIndexEntry {
    id: String,
    source_type: InboxSourceType,
    status: InboxStatus,
    title: String,
    created_at: String,
}

/// Inbox index for efficient querying without loading all items.
#[derive(Debug, Clone, Serialize, Deserialize)]
struct InboxIndex {
    items: Vec<InboxIndexEntry>,
}

impl InboxIndex {
    fn new() -> Self {
        Self { items: Vec::new() }
    }

    fn add(&mut self, item: &InboxItem) {
        let entry = InboxIndexEntry {
            id: item.id.clone(),
            source_type: item.source_type.clone(),
            status: item.status.clone(),
            title: item.title.clone(),
            created_at: item.created_at.clone(),
        };

        // Update existing entry or add new one
        if let Some(pos) = self.items.iter().position(|e| e.id == item.id) {
            self.items[pos] = entry;
        } else {
            self.items.push(entry);
        }
    }

    fn remove(&mut self, id: &str) {
        self.items.retain(|e| e.id != id);
    }
}

/// Inbox storage manager.
///
/// Manages persistence of inbox items to `.memoforge/inbox/` directory
/// with an index file for efficient querying.
#[allow(dead_code)]
pub struct InboxStore {
    kb_path: std::path::PathBuf,
    lock_manager: LockManager,
}

impl InboxStore {
    /// Create a new inbox store for the given knowledge base path.
    pub fn new(kb_path: std::path::PathBuf) -> Self {
        let kb_path_clone = kb_path.clone();
        Self {
            kb_path,
            lock_manager: LockManager::new(kb_path_clone),
        }
    }

    fn inbox_dir(&self) -> std::path::PathBuf {
        self.kb_path.join(".memoforge/inbox")
    }

    fn index_path(&self) -> std::path::PathBuf {
        self.inbox_dir().join("index.json")
    }

    fn item_path(&self, id: &str) -> Result<std::path::PathBuf, MemoError> {
        crate::error::validate_storage_id(id, "inbox item ID")?;
        Ok(self.inbox_dir().join(format!("{}.json", id)))
    }

    /// Ensure the inbox directory exists.
    fn ensure_dir(&self) -> Result<(), MemoError> {
        fs::create_dir_all(self.inbox_dir()).map_err(|e| MemoError {
            code: ErrorCode::InvalidPath,
            message: format!("Failed to create inbox directory: {}", e),
            retry_after_ms: None,
            context: None,
        })?;

        // Ensure .memoforge/.gitignore includes inbox/
        let gitignore_path = self.kb_path.join(".memoforge/.gitignore");
        let gitignore_content = if gitignore_path.exists() {
            fs::read_to_string(&gitignore_path).unwrap_or_default()
        } else {
            String::new()
        };

        if !gitignore_content.lines().any(|l| l.trim() == "inbox/") {
            let new_content = if gitignore_content.is_empty() {
                "inbox/\n".to_string()
            } else if gitignore_content.ends_with('\n') {
                format!("{}inbox/\n", gitignore_content)
            } else {
                format!("{}\ninbox/\n", gitignore_content)
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
    fn load_index(&self) -> Result<InboxIndex, MemoError> {
        let index_path = self.index_path();
        if !index_path.exists() {
            return Ok(InboxIndex::new());
        }

        let content = fs::read_to_string(&index_path).map_err(|e| MemoError {
            code: ErrorCode::InvalidData,
            message: format!("Failed to read inbox index: {}", e),
            retry_after_ms: None,
            context: None,
        })?;

        serde_json::from_str(&content).map_err(|e| MemoError {
            code: ErrorCode::InvalidData,
            message: format!("Failed to parse inbox index: {}", e),
            retry_after_ms: None,
            context: None,
        })
    }

    /// Save the index to disk.
    fn save_index(&self, index: &InboxIndex) -> Result<(), MemoError> {
        let index_path = self.index_path();
        let json = serde_json::to_string_pretty(index).map_err(|e| MemoError {
            code: ErrorCode::InvalidData,
            message: format!("Failed to serialize inbox index: {}", e),
            retry_after_ms: None,
            context: None,
        })?;

        fs::write(&index_path, json).map_err(|e| MemoError {
            code: ErrorCode::InvalidPath,
            message: format!("Failed to write inbox index: {}", e),
            retry_after_ms: None,
            context: None,
        })?;

        Ok(())
    }

    /// Create a new inbox item.
    pub fn create_inbox_item(&self, item: InboxItem) -> Result<InboxItem, MemoError> {
        self.ensure_dir()?;

        let item_path = self.item_path(&item.id)?;
        if item_path.exists() {
            return Err(MemoError {
                code: ErrorCode::InvalidData,
                message: format!("Inbox item already exists: {}", item.id),
                retry_after_ms: None,
                context: None,
            });
        }

        // Save item to disk
        let json = serde_json::to_string_pretty(&item).map_err(|e| MemoError {
            code: ErrorCode::InvalidData,
            message: format!("Failed to serialize inbox item: {}", e),
            retry_after_ms: None,
            context: None,
        })?;

        fs::write(&item_path, json).map_err(|e| MemoError {
            code: ErrorCode::InvalidPath,
            message: format!("Failed to write inbox item: {}", e),
            retry_after_ms: None,
            context: None,
        })?;

        // Update index
        let mut index = self.load_index()?;
        index.add(&item);
        self.save_index(&index)?;

        Ok(item)
    }

    /// Get an inbox item by ID.
    pub fn get_inbox_item(&self, id: &str) -> Result<InboxItem, MemoError> {
        let item_path = self.item_path(id)?;
        if !item_path.exists() {
            return Err(MemoError {
                code: ErrorCode::NotFoundKnowledge,
                message: format!("Inbox item not found: {}", id),
                retry_after_ms: None,
                context: None,
            });
        }

        let content = fs::read_to_string(&item_path).map_err(|e| MemoError {
            code: ErrorCode::NotFoundKnowledge,
            message: format!("Failed to read inbox item: {}", e),
            retry_after_ms: None,
            context: None,
        })?;

        serde_json::from_str(&content).map_err(|e| MemoError {
            code: ErrorCode::InvalidData,
            message: format!("Failed to parse inbox item: {}", e),
            retry_after_ms: None,
            context: None,
        })
    }

    /// List inbox items with optional filtering.
    pub fn list_inbox_items(
        &self,
        status: Option<InboxStatus>,
        limit: Option<usize>,
    ) -> Result<Vec<InboxItem>, MemoError> {
        self.ensure_dir()?;

        let index = self.load_index()?;
        let mut filtered: Vec<_> = index
            .items
            .iter()
            .filter(|entry| {
                if let Some(ref s) = status {
                    &entry.status == s
                } else {
                    true
                }
            })
            .collect();

        // Sort by creation time (newest first)
        filtered.sort_by(|a, b| b.created_at.cmp(&a.created_at));

        // Apply limit
        if let Some(l) = limit {
            filtered.truncate(l);
        }

        // Load full items
        let mut items = Vec::new();
        for entry in filtered {
            if let Ok(item) = self.get_inbox_item(&entry.id) {
                items.push(item);
            }
        }

        Ok(items)
    }

    /// Update the status of an inbox item.
    pub fn update_inbox_status(
        &self,
        id: &str,
        new_status: InboxStatus,
    ) -> Result<InboxItem, MemoError> {
        let mut item = self.get_inbox_item(id)?;

        if !item.can_transition_to(&new_status) {
            return Err(MemoError {
                code: ErrorCode::InvalidArgument,
                message: format!(
                    "Invalid status transition from {:?} to {:?}",
                    item.status, new_status
                ),
                retry_after_ms: None,
                context: None,
            });
        }

        item.status = new_status;
        item.touch();

        // Save updated item
        let item_path = self.item_path(id)?;
        let json = serde_json::to_string_pretty(&item).map_err(|e| MemoError {
            code: ErrorCode::InvalidData,
            message: format!("Failed to serialize inbox item: {}", e),
            retry_after_ms: None,
            context: None,
        })?;

        fs::write(&item_path, json).map_err(|e| MemoError {
            code: ErrorCode::InvalidPath,
            message: format!("Failed to write inbox item: {}", e),
            retry_after_ms: None,
            context: None,
        })?;

        // Update index
        let mut index = self.load_index()?;
        index.add(&item);
        self.save_index(&index)?;

        Ok(item)
    }

    /// Dismiss an inbox item by setting its status to ignored.
    pub fn dismiss_inbox_item(&self, id: &str) -> Result<InboxItem, MemoError> {
        self.update_inbox_status(id, InboxStatus::Ignored)
    }

    /// Update an inbox item with new data.
    pub fn update_inbox_item(&self, mut item: InboxItem) -> Result<InboxItem, MemoError> {
        self.ensure_dir()?;

        let item_path = self.item_path(&item.id)?;
        if !item_path.exists() {
            return Err(MemoError {
                code: ErrorCode::NotFoundKnowledge,
                message: format!("Inbox item not found: {}", item.id),
                retry_after_ms: None,
                context: None,
            });
        }

        item.touch();

        // Save updated item
        let json = serde_json::to_string_pretty(&item).map_err(|e| MemoError {
            code: ErrorCode::InvalidData,
            message: format!("Failed to serialize inbox item: {}", e),
            retry_after_ms: None,
            context: None,
        })?;

        fs::write(&item_path, json).map_err(|e| MemoError {
            code: ErrorCode::InvalidPath,
            message: format!("Failed to write inbox item: {}", e),
            retry_after_ms: None,
            context: None,
        })?;

        // Update index
        let mut index = self.load_index()?;
        index.add(&item);
        self.save_index(&index)?;

        Ok(item)
    }

    /// Delete an inbox item.
    pub fn delete_inbox_item(&self, id: &str) -> Result<(), MemoError> {
        let item_path = self.item_path(id)?;
        if !item_path.exists() {
            return Err(MemoError {
                code: ErrorCode::NotFoundKnowledge,
                message: format!("Inbox item not found: {}", id),
                retry_after_ms: None,
                context: None,
            });
        }

        fs::remove_file(&item_path).map_err(|e| MemoError {
            code: ErrorCode::InvalidPath,
            message: format!("Failed to delete inbox item: {}", e),
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

    fn setup_store() -> (TempDir, InboxStore) {
        let temp = TempDir::new().unwrap();
        let kb_path = temp.path().to_path_buf();

        // Initialize KB structure
        fs::create_dir_all(kb_path.join(".memoforge")).unwrap();

        let store = InboxStore::new(kb_path);
        store.ensure_dir().unwrap();

        (temp, store)
    }

    #[test]
    fn test_create_inbox_item() {
        let (_temp, store) = setup_store();

        let item = InboxItem::new(InboxSourceType::Agent, "Test Item".to_string());
        let created = store.create_inbox_item(item.clone()).unwrap();

        assert_eq!(created.id, item.id);
        assert_eq!(created.status, InboxStatus::New);

        // Verify file exists
        assert!(store.item_path(&item.id).unwrap().exists());

        // Verify index exists
        assert!(store.index_path().exists());
    }

    #[test]
    fn test_get_inbox_item() {
        let (_temp, store) = setup_store();

        let item = InboxItem::new(InboxSourceType::Manual, "Get Test".to_string());
        store.create_inbox_item(item.clone()).unwrap();

        let retrieved = store.get_inbox_item(&item.id).unwrap();
        assert_eq!(retrieved.id, item.id);
        assert_eq!(retrieved.title, "Get Test");
    }

    #[test]
    fn test_get_nonexistent_item() {
        let (_temp, store) = setup_store();

        let result = store.get_inbox_item("nonexistent");
        assert!(result.is_err());
        assert_eq!(result.unwrap_err().code, ErrorCode::NotFoundKnowledge);
    }

    #[test]
    fn test_list_inbox_items() {
        let (_temp, store) = setup_store();

        // Create multiple items
        for i in 0..5 {
            let item = InboxItem::new(InboxSourceType::Agent, format!("Item {}", i));
            store.create_inbox_item(item).unwrap();
        }

        let items = store.list_inbox_items(None, None).unwrap();
        assert_eq!(items.len(), 5);
    }

    #[test]
    fn test_list_inbox_items_with_limit() {
        let (_temp, store) = setup_store();

        // Create multiple items
        for i in 0..10 {
            let item = InboxItem::new(InboxSourceType::Agent, format!("Item {}", i));
            store.create_inbox_item(item).unwrap();
        }

        let items = store.list_inbox_items(None, Some(3)).unwrap();
        assert_eq!(items.len(), 3);
    }

    #[test]
    fn test_list_inbox_items_with_status_filter() {
        let (_temp, store) = setup_store();

        // Create items with different statuses
        let item1 = InboxItem::new(InboxSourceType::Agent, "New Item".to_string());
        let mut item2 = InboxItem::new(InboxSourceType::Manual, "Triaged Item".to_string());
        let mut item3 = InboxItem::new(InboxSourceType::Import, "Ignored Item".to_string());

        store.create_inbox_item(item1).unwrap();

        item2.status = InboxStatus::Triaged;
        store.create_inbox_item(item2).unwrap();

        item3.status = InboxStatus::Ignored;
        store.create_inbox_item(item3).unwrap();

        // Filter by New status
        let new_items = store
            .list_inbox_items(Some(InboxStatus::New), None)
            .unwrap();
        assert_eq!(new_items.len(), 1);
        assert_eq!(new_items[0].title, "New Item");

        // Filter by Ignored status
        let ignored_items = store
            .list_inbox_items(Some(InboxStatus::Ignored), None)
            .unwrap();
        assert_eq!(ignored_items.len(), 1);
        assert_eq!(ignored_items[0].title, "Ignored Item");
    }

    #[test]
    fn test_update_inbox_status() {
        let (_temp, store) = setup_store();

        let item = InboxItem::new(InboxSourceType::Agent, "Status Test".to_string());
        let created = store.create_inbox_item(item).unwrap();

        let updated = store
            .update_inbox_status(&created.id, InboxStatus::Triaged)
            .unwrap();
        assert_eq!(updated.status, InboxStatus::Triaged);
        assert_ne!(updated.updated_at, created.updated_at);
    }

    #[test]
    fn test_invalid_status_transition() {
        let (_temp, store) = setup_store();

        let item = InboxItem::new(InboxSourceType::Agent, "Invalid Test".to_string());
        let created = store.create_inbox_item(item).unwrap();

        // New items can draft directly, but cannot skip all the way to promoted.
        let result = store.update_inbox_status(&created.id, InboxStatus::Promoted);
        assert!(result.is_err());
        assert_eq!(result.unwrap_err().code, ErrorCode::InvalidArgument);
    }

    #[test]
    fn test_dismiss_inbox_item() {
        let (_temp, store) = setup_store();

        let item = InboxItem::new(InboxSourceType::Agent, "Dismiss Test".to_string());
        let created = store.create_inbox_item(item).unwrap();

        let dismissed = store.dismiss_inbox_item(&created.id).unwrap();
        assert_eq!(dismissed.status, InboxStatus::Ignored);
    }

    #[test]
    fn test_restore_from_ignored() {
        let (_temp, store) = setup_store();

        let mut item = InboxItem::new(InboxSourceType::Agent, "Restore Test".to_string());
        item.status = InboxStatus::Ignored;
        let created = store.create_inbox_item(item).unwrap();

        let restored = store
            .update_inbox_status(&created.id, InboxStatus::Triaged)
            .unwrap();
        assert_eq!(restored.status, InboxStatus::Triaged);
    }

    #[test]
    fn test_update_inbox_item() {
        let (_temp, store) = setup_store();

        let mut item = InboxItem::new(InboxSourceType::Agent, "Update Test".to_string());
        item.snippet = Some("Original snippet".to_string());
        let created = store.create_inbox_item(item).unwrap();

        let mut updated = created;
        updated.snippet = Some("Updated snippet".to_string());
        updated.proposed_path = Some("proposed/path.md".to_string());

        let saved = store.update_inbox_item(updated).unwrap();
        assert_eq!(saved.snippet, Some("Updated snippet".to_string()));
        assert_eq!(saved.proposed_path, Some("proposed/path.md".to_string()));
    }

    #[test]
    fn test_delete_inbox_item() {
        let (_temp, store) = setup_store();

        let item = InboxItem::new(InboxSourceType::Agent, "Delete Test".to_string());
        let created = store.create_inbox_item(item).unwrap();

        assert!(store.item_path(&created.id).unwrap().exists());

        store.delete_inbox_item(&created.id).unwrap();
        assert!(!store.item_path(&created.id).unwrap().exists());

        // Should also be removed from index
        let items = store.list_inbox_items(None, None).unwrap();
        assert!(items.iter().all(|i| i.id != created.id));
    }

    #[test]
    fn test_inbox_gitignore() {
        let (_temp, store) = setup_store();

        let item = InboxItem::new(InboxSourceType::Agent, "Gitignore Test".to_string());
        store.create_inbox_item(item).unwrap();

        let gitignore = fs::read_to_string(store.kb_path.join(".memoforge/.gitignore")).unwrap();
        assert!(gitignore.contains("inbox/"));
    }
}
