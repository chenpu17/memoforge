//! Context Pack persistence layer
//!
//! Handles storage and retrieval of context packs using a file-based approach
//! with an in-memory index for efficient querying.

use crate::context_pack::{ContextPack, ContextPackScope};
use crate::error::{ErrorCode, MemoError};
use crate::lock::LockManager;
use serde::{Deserialize, Serialize};
use std::fs;

/// Index entry for context packs.
#[derive(Debug, Clone, Serialize, Deserialize)]
struct PackIndexEntry {
    id: String,
    name: String,
    scope_type: ContextPackScope,
    scope_value: String,
    item_count: usize,
    created_at: String,
}

/// Context Pack index for efficient querying without loading all packs.
#[derive(Debug, Clone, Serialize, Deserialize)]
struct PackIndex {
    packs: Vec<PackIndexEntry>,
}

impl PackIndex {
    fn new() -> Self {
        Self { packs: Vec::new() }
    }

    fn add(&mut self, pack: &ContextPack) {
        let entry = PackIndexEntry {
            id: pack.id.clone(),
            name: pack.name.clone(),
            scope_type: pack.scope_type.clone(),
            scope_value: pack.scope_value.clone(),
            item_count: pack.item_paths.len(),
            created_at: pack.created_at.clone(),
        };

        // Update existing entry or add new one
        if let Some(pos) = self.packs.iter().position(|e| e.id == pack.id) {
            self.packs[pos] = entry;
        } else {
            self.packs.push(entry);
        }
    }

    fn remove(&mut self, id: &str) {
        self.packs.retain(|e| e.id != id);
    }
}

/// Context Pack storage manager.
///
/// Manages persistence of context packs to `.memoforge/packs/` directory
/// with an index file for efficient querying.
#[allow(dead_code)]
pub struct ContextPackStore {
    kb_path: std::path::PathBuf,
    lock_manager: LockManager,
}

impl ContextPackStore {
    /// Create a new context pack store for the given knowledge base path.
    pub fn new(kb_path: &std::path::Path) -> Self {
        Self {
            kb_path: kb_path.to_path_buf(),
            lock_manager: LockManager::new(kb_path.to_path_buf()),
        }
    }

    fn packs_dir(&self) -> std::path::PathBuf {
        self.kb_path.join(".memoforge/packs")
    }

    fn pack_path(&self, id: &str) -> std::path::PathBuf {
        self.packs_dir().join(format!("{}.json", id))
    }

    fn index_path(&self) -> std::path::PathBuf {
        self.packs_dir().join("index.json")
    }

    /// Ensure the packs directory exists.
    fn ensure_dir(&self) -> Result<(), MemoError> {
        fs::create_dir_all(self.packs_dir()).map_err(|e| MemoError {
            code: ErrorCode::InvalidPath,
            message: format!("Failed to create packs directory: {}", e),
            retry_after_ms: None,
            context: None,
        })?;

        // Ensure .memoforge/.gitignore includes packs/
        let gitignore_path = self.kb_path.join(".memoforge/.gitignore");
        let gitignore_content = if gitignore_path.exists() {
            fs::read_to_string(&gitignore_path).unwrap_or_default()
        } else {
            String::new()
        };

        if !gitignore_content.lines().any(|l| l.trim() == "packs/") {
            let new_content = if gitignore_content.is_empty() {
                "packs/\n".to_string()
            } else if gitignore_content.ends_with('\n') {
                format!("{}packs/\n", gitignore_content)
            } else {
                format!("{}\npacks/\n", gitignore_content)
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
    fn load_index(&self) -> Result<PackIndex, MemoError> {
        let index_path = self.index_path();
        if !index_path.exists() {
            return Ok(PackIndex::new());
        }

        let content = fs::read_to_string(&index_path).map_err(|e| MemoError {
            code: ErrorCode::InvalidData,
            message: format!("Failed to read pack index: {}", e),
            retry_after_ms: None,
            context: None,
        })?;

        serde_json::from_str(&content).map_err(|e| MemoError {
            code: ErrorCode::InvalidData,
            message: format!("Failed to parse pack index: {}", e),
            retry_after_ms: None,
            context: None,
        })
    }

    /// Save the index to disk.
    fn save_index(&self, index: &PackIndex) -> Result<(), MemoError> {
        let index_path = self.index_path();
        let json = serde_json::to_string_pretty(index).map_err(|e| MemoError {
            code: ErrorCode::InvalidData,
            message: format!("Failed to serialize pack index: {}", e),
            retry_after_ms: None,
            context: None,
        })?;

        fs::write(&index_path, json).map_err(|e| MemoError {
            code: ErrorCode::InvalidPath,
            message: format!("Failed to write pack index: {}", e),
            retry_after_ms: None,
            context: None,
        })?;

        Ok(())
    }

    /// Save a pack to disk with atomic write.
    fn save_pack(&self, pack: &ContextPack) -> Result<(), MemoError> {
        let pack_path = self.pack_path(&pack.id);

        // Atomic write: write to temp file then rename
        let temp_path = pack_path.with_extension("json.tmp");
        let json = serde_json::to_string_pretty(pack).map_err(|e| MemoError {
            code: ErrorCode::InvalidData,
            message: format!("Failed to serialize context pack: {}", e),
            retry_after_ms: None,
            context: None,
        })?;

        fs::write(&temp_path, json).map_err(|e| MemoError {
            code: ErrorCode::InvalidPath,
            message: format!("Failed to write context pack: {}", e),
            retry_after_ms: None,
            context: None,
        })?;

        fs::rename(&temp_path, &pack_path).map_err(|e| MemoError {
            code: ErrorCode::InvalidPath,
            message: format!("Failed to rename context pack: {}", e),
            retry_after_ms: None,
            context: None,
        })?;

        // Update index
        let mut index = self.load_index()?;
        index.add(pack);
        self.save_index(&index)?;

        Ok(())
    }

    /// Create a new context pack.
    pub fn create(&self, pack: ContextPack) -> Result<ContextPack, MemoError> {
        self.ensure_dir()?;

        let pack_path = self.pack_path(&pack.id);
        if pack_path.exists() {
            return Err(MemoError {
                code: ErrorCode::InvalidData,
                message: format!("Context pack already exists: {}", pack.id),
                retry_after_ms: None,
                context: None,
            });
        }

        self.save_pack(&pack)?;
        Ok(pack)
    }

    /// Get a context pack by ID.
    pub fn get(&self, id: &str) -> Result<ContextPack, MemoError> {
        let pack_path = self.pack_path(id);
        if !pack_path.exists() {
            return Err(MemoError {
                code: ErrorCode::NotFoundKnowledge,
                message: format!("Context pack not found: {}", id),
                retry_after_ms: None,
                context: None,
            });
        }

        let content = fs::read_to_string(&pack_path).map_err(|e| MemoError {
            code: ErrorCode::NotFoundKnowledge,
            message: format!("Failed to read context pack: {}", e),
            retry_after_ms: None,
            context: None,
        })?;

        serde_json::from_str(&content).map_err(|e| MemoError {
            code: ErrorCode::InvalidData,
            message: format!("Failed to parse context pack: {}", e),
            retry_after_ms: None,
            context: None,
        })
    }

    /// List context packs with optional filtering.
    pub fn list(
        &self,
        scope_type: Option<ContextPackScope>,
        limit: Option<usize>,
    ) -> Result<Vec<ContextPack>, MemoError> {
        self.ensure_dir()?;

        let index = self.load_index()?;
        let mut filtered: Vec<_> = index
            .packs
            .iter()
            .filter(|entry| {
                if let Some(ref st) = scope_type {
                    &entry.scope_type == st
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

        // Load full packs
        let mut packs = Vec::new();
        for entry in filtered {
            if let Ok(pack) = self.get(&entry.id) {
                packs.push(pack);
            }
        }

        Ok(packs)
    }

    /// Update a context pack.
    pub fn update(&self, pack: ContextPack) -> Result<ContextPack, MemoError> {
        self.ensure_dir()?;

        let pack_path = self.pack_path(&pack.id);
        if !pack_path.exists() {
            return Err(MemoError {
                code: ErrorCode::NotFoundKnowledge,
                message: format!("Context pack not found: {}", pack.id),
                retry_after_ms: None,
                context: None,
            });
        }

        self.save_pack(&pack)?;
        Ok(pack)
    }

    /// Delete a context pack.
    pub fn delete(&self, id: &str) -> Result<(), MemoError> {
        let pack_path = self.pack_path(id);
        if !pack_path.exists() {
            return Err(MemoError {
                code: ErrorCode::NotFoundKnowledge,
                message: format!("Context pack not found: {}", id),
                retry_after_ms: None,
                context: None,
            });
        }

        fs::remove_file(&pack_path).map_err(|e| MemoError {
            code: ErrorCode::InvalidPath,
            message: format!("Failed to delete context pack: {}", e),
            retry_after_ms: None,
            context: None,
        })?;

        // Remove from index
        let mut index = self.load_index()?;
        index.remove(id);
        self.save_index(&index)?;

        Ok(())
    }

    /// Add an item path to a context pack.
    pub fn add_item_path(&self, id: &str, path: String) -> Result<ContextPack, MemoError> {
        let mut pack = self.get(id)?;
        pack.add_item_path(path);
        self.update(pack)
    }

    /// Remove an item path from a context pack.
    pub fn remove_item_path(&self, id: &str, path: &str) -> Result<ContextPack, MemoError> {
        let mut pack = self.get(id)?;
        pack.remove_item_path(path);
        self.update(pack)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn setup_store() -> (TempDir, ContextPackStore) {
        let temp = TempDir::new().unwrap();
        let kb_path = temp.path().to_path_buf();

        // Initialize KB structure
        fs::create_dir_all(kb_path.join(".memoforge")).unwrap();

        let store = ContextPackStore::new(&kb_path);
        store.ensure_dir().unwrap();

        (temp, store)
    }

    #[test]
    fn test_create_context_pack() {
        let (_temp, store) = setup_store();

        let pack = ContextPack::new(
            "Test Pack".to_string(),
            ContextPackScope::Tag,
            "important".to_string(),
        );
        let created = store.create(pack.clone()).unwrap();

        assert_eq!(created.id, pack.id);
        assert_eq!(created.name, "Test Pack");

        // Verify file exists
        assert!(store.pack_path(&pack.id).exists());

        // Verify index exists
        assert!(store.index_path().exists());
    }

    #[test]
    fn test_get_context_pack() {
        let (_temp, store) = setup_store();

        let pack = ContextPack::new(
            "Get Test".to_string(),
            ContextPackScope::Manual,
            "".to_string(),
        );
        store.create(pack.clone()).unwrap();

        let retrieved = store.get(&pack.id).unwrap();
        assert_eq!(retrieved.id, pack.id);
        assert_eq!(retrieved.name, "Get Test");
    }

    #[test]
    fn test_get_nonexistent_pack() {
        let (_temp, store) = setup_store();

        let result = store.get("nonexistent");
        assert!(result.is_err());
        assert_eq!(result.unwrap_err().code, ErrorCode::NotFoundKnowledge);
    }

    #[test]
    fn test_list_packs() {
        let (_temp, store) = setup_store();

        // Create multiple packs
        for i in 0..5 {
            let pack = ContextPack::new(
                format!("Pack {}", i),
                ContextPackScope::Manual,
                "".to_string(),
            );
            store.create(pack).unwrap();
        }

        let packs = store.list(None, None).unwrap();
        assert_eq!(packs.len(), 5);
    }

    #[test]
    fn test_list_packs_with_limit() {
        let (_temp, store) = setup_store();

        // Create multiple packs
        for i in 0..10 {
            let pack = ContextPack::new(
                format!("Pack {}", i),
                ContextPackScope::Manual,
                "".to_string(),
            );
            store.create(pack).unwrap();
        }

        let packs = store.list(None, Some(3)).unwrap();
        assert_eq!(packs.len(), 3);
    }

    #[test]
    fn test_list_packs_with_scope_filter() {
        let (_temp, store) = setup_store();

        // Create packs with different scope types
        let pack1 = ContextPack::new(
            "Tag Pack".to_string(),
            ContextPackScope::Tag,
            "important".to_string(),
        );
        let pack2 = ContextPack::new(
            "Folder Pack".to_string(),
            ContextPackScope::Folder,
            "docs".to_string(),
        );
        let pack3 = ContextPack::new(
            "Topic Pack".to_string(),
            ContextPackScope::Topic,
            "rust".to_string(),
        );

        store.create(pack1).unwrap();
        store.create(pack2).unwrap();
        store.create(pack3).unwrap();

        // Filter by Tag scope
        let tag_packs = store.list(Some(ContextPackScope::Tag), None).unwrap();
        assert_eq!(tag_packs.len(), 1);
        assert_eq!(tag_packs[0].name, "Tag Pack");

        // Filter by Folder scope
        let folder_packs = store.list(Some(ContextPackScope::Folder), None).unwrap();
        assert_eq!(folder_packs.len(), 1);
        assert_eq!(folder_packs[0].name, "Folder Pack");
    }

    #[test]
    fn test_update_pack() {
        let (_temp, store) = setup_store();

        let mut pack = ContextPack::new(
            "Update Test".to_string(),
            ContextPackScope::Manual,
            "".to_string(),
        );
        pack.add_item_path("docs/test.md".to_string());
        let created = store.create(pack).unwrap();

        let mut updated = created;
        updated.update_summary(Some("Updated summary".to_string()));
        updated.add_item_path("docs/other.md".to_string());

        let saved = store.update(updated).unwrap();
        assert_eq!(saved.summary, Some("Updated summary".to_string()));
        assert_eq!(saved.item_paths.len(), 2);
    }

    #[test]
    fn test_delete_pack() {
        let (_temp, store) = setup_store();

        let pack = ContextPack::new(
            "Delete Test".to_string(),
            ContextPackScope::Manual,
            "".to_string(),
        );
        let created = store.create(pack).unwrap();

        assert!(store.pack_path(&created.id).exists());

        store.delete(&created.id).unwrap();
        assert!(!store.pack_path(&created.id).exists());

        // Should also be removed from index
        let packs = store.list(None, None).unwrap();
        assert!(packs.iter().all(|p| p.id != created.id));
    }

    #[test]
    fn test_add_item_path() {
        let (_temp, store) = setup_store();

        let pack = ContextPack::new(
            "Add Item Test".to_string(),
            ContextPackScope::Manual,
            "".to_string(),
        );
        let created = store.create(pack).unwrap();

        let updated = store
            .add_item_path(&created.id, "docs/test.md".to_string())
            .unwrap();
        assert_eq!(updated.item_paths.len(), 1);
        assert_eq!(updated.item_paths[0], "docs/test.md");

        // Verify persistence
        let retrieved = store.get(&created.id).unwrap();
        assert_eq!(retrieved.item_paths.len(), 1);
    }

    #[test]
    fn test_remove_item_path() {
        let (_temp, store) = setup_store();

        let mut pack = ContextPack::new(
            "Remove Item Test".to_string(),
            ContextPackScope::Manual,
            "".to_string(),
        );
        pack.add_item_path("docs/test.md".to_string());
        pack.add_item_path("docs/other.md".to_string());
        let created = store.create(pack).unwrap();

        let updated = store.remove_item_path(&created.id, "docs/test.md").unwrap();
        assert_eq!(updated.item_paths.len(), 1);
        assert_eq!(updated.item_paths[0], "docs/other.md");

        // Verify persistence
        let retrieved = store.get(&created.id).unwrap();
        assert_eq!(retrieved.item_paths.len(), 1);
    }

    #[test]
    fn test_duplicate_item_path() {
        let (_temp, store) = setup_store();

        let pack = ContextPack::new(
            "Duplicate Test".to_string(),
            ContextPackScope::Manual,
            "".to_string(),
        );
        let created = store.create(pack).unwrap();

        // Add same path twice
        store
            .add_item_path(&created.id, "docs/test.md".to_string())
            .unwrap();
        store
            .add_item_path(&created.id, "docs/test.md".to_string())
            .unwrap();

        let retrieved = store.get(&created.id).unwrap();
        assert_eq!(retrieved.item_paths.len(), 1);
    }

    #[test]
    fn test_packs_gitignore() {
        let (_temp, store) = setup_store();

        let pack = ContextPack::new(
            "Gitignore Test".to_string(),
            ContextPackScope::Manual,
            "".to_string(),
        );
        store.create(pack).unwrap();

        let gitignore = fs::read_to_string(store.kb_path.join(".memoforge/.gitignore")).unwrap();
        assert!(gitignore.contains("packs/"));
    }

    #[test]
    fn test_update_updates_timestamp() {
        let (_temp, store) = setup_store();

        let pack = ContextPack::new(
            "Timestamp Test".to_string(),
            ContextPackScope::Manual,
            "".to_string(),
        );
        let created = store.create(pack).unwrap();

        std::thread::sleep(std::time::Duration::from_millis(10));

        let mut updated = created.clone();
        updated.update_summary(Some("New summary".to_string()));
        let saved = store.update(updated).unwrap();

        assert_ne!(saved.updated_at, created.updated_at);
    }

    #[test]
    fn test_scope_type_serialization() {
        let (_temp, store) = setup_store();

        let pack = ContextPack::new(
            "Scope Test".to_string(),
            ContextPackScope::Tag,
            "test".to_string(),
        );
        store.create(pack.clone()).unwrap();

        let retrieved = store.get(&pack.id).unwrap();
        assert!(matches!(retrieved.scope_type, ContextPackScope::Tag));
    }
}
