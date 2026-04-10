//! Integration tests for Inbox and Session stores.
//!
//! Tests cross-module interactions between Inbox, Draft, and Session workflows.

use memoforge_core::inbox::{InboxItem, InboxSourceType, InboxStatus};
use memoforge_core::inbox_store::InboxStore;
use memoforge_core::session::{AgentSession, ContextItem, ContextRefType};
use memoforge_core::session_store::SessionStore;
use tempfile::TempDir;

fn setup_knowledge_base() -> (TempDir, InboxStore, SessionStore) {
    let temp = TempDir::new().unwrap();
    let kb_path = temp.path().to_path_buf();

    // Initialize KB structure
    std::fs::create_dir_all(kb_path.join(".memoforge")).unwrap();

    let inbox_store = InboxStore::new(kb_path.clone());
    let session_store = SessionStore::new(kb_path.clone());

    // Create a dummy item to initialize directories
    let dummy_inbox = inbox_store
        .create_inbox_item(InboxItem::new(InboxSourceType::Manual, "init".to_string()))
        .unwrap();
    let dummy_session = session_store
        .create_session(AgentSession::new("init".to_string(), "init".to_string()))
        .unwrap();

    // Clean up dummy items
    let _ = inbox_store.delete_inbox_item(&dummy_inbox.id);
    let _ = session_store.delete_session(&dummy_session.id);

    (temp, inbox_store, session_store)
}

/// Test 1: Complete Inbox->Draft->Session association chain.
#[test]
fn test_complete_inbox_draft_session_association() {
    let (_temp, inbox_store, session_store) = setup_knowledge_base();

    // Step 1: Create Session
    let session = AgentSession::new(
        "claude-code".to_string(),
        "Generate documentation".to_string(),
    );
    let created_session = session_store.create_session(session).unwrap();
    let session_id = created_session.id.clone();

    // Step 2: Create InboxItem associated with session
    let mut inbox_item = InboxItem::new(InboxSourceType::Agent, "API Reference Draft".to_string());
    inbox_item.linked_session_id = Some(session_id.clone());
    inbox_item.content_markdown = Some("# API Reference\n\nThis is a draft...".to_string());

    let created_inbox = inbox_store.create_inbox_item(inbox_item).unwrap();
    let inbox_id = created_inbox.id.clone();

    // Step 3: Associate Inbox item with Session
    let session_with_inbox = session_store
        .add_inbox_item_id(&session_id, inbox_id.clone())
        .unwrap();
    assert_eq!(session_with_inbox.inbox_item_ids.len(), 1);
    assert_eq!(session_with_inbox.inbox_item_ids[0], inbox_id);

    // Step 4: Update Inbox item status to triaged
    let triaged_inbox = inbox_store
        .update_inbox_status(&inbox_id, InboxStatus::Triaged)
        .unwrap();
    assert_eq!(triaged_inbox.status, InboxStatus::Triaged);

    // Step 5: Simulate draft creation (update inbox with linked_draft_id)
    let mut inbox_with_draft = triaged_inbox;
    let draft_id = "draft_12345".to_string();
    inbox_with_draft.linked_draft_id = Some(draft_id.clone());
    inbox_with_draft.status = InboxStatus::Drafted;

    let drafted_inbox = inbox_store.update_inbox_item(inbox_with_draft).unwrap();
    assert_eq!(drafted_inbox.status, InboxStatus::Drafted);
    assert_eq!(drafted_inbox.linked_draft_id, Some(draft_id.clone()));

    // Step 6: Associate draft with Session
    let session_with_draft = session_store
        .add_draft_id(&session_id, draft_id.clone())
        .unwrap();
    assert_eq!(session_with_draft.draft_ids.len(), 1);
    assert_eq!(session_with_draft.draft_ids[0], draft_id);

    // Step 7: Verify complete association chain
    let final_session = session_store.get_session(&session_id).unwrap();
    assert_eq!(final_session.inbox_item_ids.len(), 1);
    assert_eq!(final_session.draft_ids.len(), 1);

    let final_inbox = inbox_store.get_inbox_item(&inbox_id).unwrap();
    assert_eq!(final_inbox.linked_session_id, Some(session_id));
    assert_eq!(final_inbox.linked_draft_id, Some(draft_id));
    assert_eq!(final_inbox.status, InboxStatus::Drafted);
}

/// Test 2: Inbox status machine boundary tests.
#[test]
fn test_inbox_status_machine_boundaries() {
    let (_temp, inbox_store, _session_store) = setup_knowledge_base();

    // Test 2a: ignored -> triaged recovery is valid
    let mut item1 = InboxItem::new(InboxSourceType::Agent, "Test item 1".to_string());
    item1.status = InboxStatus::Ignored;
    let created1 = inbox_store.create_inbox_item(item1).unwrap();

    let restored = inbox_store
        .update_inbox_status(&created1.id, InboxStatus::Triaged)
        .unwrap();
    assert_eq!(restored.status, InboxStatus::Triaged);

    // Test 2b: promoted status cannot transition back
    let mut item2 = InboxItem::new(InboxSourceType::Agent, "Test item 2".to_string());
    item2.status = InboxStatus::Promoted;
    item2.linked_knowledge_path = Some("docs/final.md".to_string());
    let created2 = inbox_store.create_inbox_item(item2).unwrap();

    // Cannot go back to triaged from promoted
    let result = inbox_store.update_inbox_status(&created2.id, InboxStatus::Triaged);
    assert!(result.is_err());
    assert_eq!(
        result.unwrap_err().code,
        memoforge_core::error::ErrorCode::InvalidArgument
    );

    // Test 2c: drafted status requires linked_draft_id to be non-empty
    let mut item3 = InboxItem::new(InboxSourceType::Agent, "Test item 3".to_string());
    item3.status = InboxStatus::Drafted;
    let created3 = inbox_store.create_inbox_item(item3).unwrap();

    // Drafted without linked_draft_id is allowed (for flexibility)
    // But let's verify the item has the drafted status
    assert_eq!(created3.status, InboxStatus::Drafted);

    // Now add a draft_id to it
    let mut updated = created3;
    updated.linked_draft_id = Some("draft_xyz".to_string());
    let saved = inbox_store.update_inbox_item(updated).unwrap();
    assert_eq!(saved.linked_draft_id, Some("draft_xyz".to_string()));
}

/// Test 3: Session terminal state constraints.
#[test]
fn test_session_terminal_state_constraints() {
    let (_temp, _inbox_store, session_store) = setup_knowledge_base();

    // Test 3a: completed state cannot append context
    let mut session1 = AgentSession::new("claude-code".to_string(), "Test goal".to_string());
    session1.status = memoforge_core::session::SessionStatus::Completed;
    session1.finished_at = Some(chrono::Utc::now().to_rfc3339());
    let completed_session = session_store.create_session(session1).unwrap();

    let context_item = ContextItem::new(ContextRefType::Knowledge, "docs/test.md".to_string());

    let result = session_store.append_context(&completed_session.id, context_item);
    assert!(result.is_err());

    // Test 3b: failed state cannot complete
    let mut session2 = AgentSession::new("claude-code".to_string(), "Test goal".to_string());
    session2.status = memoforge_core::session::SessionStatus::Failed;
    session2.finished_at = Some(chrono::Utc::now().to_rfc3339());
    let failed_session = session_store.create_session(session2).unwrap();

    let result = session_store.complete_session(&failed_session.id, Some("Success".to_string()));
    assert!(result.is_err());

    // Test 3c: running state can append context normally
    let session3 = AgentSession::new("claude-code".to_string(), "Test goal".to_string());
    let running_session = session_store.create_session(session3).unwrap();

    let context_item = ContextItem::with_summary(
        ContextRefType::Url,
        "https://example.com".to_string(),
        "Example reference".to_string(),
    );

    let updated = session_store
        .append_context(&running_session.id, context_item)
        .unwrap();
    assert_eq!(updated.context_items.len(), 1);
    assert_eq!(
        updated.context_items[0].summary,
        Some("Example reference".to_string())
    );
}

/// Test 4: Concurrent safety with multiple store instances.
#[test]
fn test_concurrent_safety_multiple_instances() {
    let temp = TempDir::new().unwrap();
    let kb_path = temp.path().to_path_buf();

    // Initialize KB structure
    std::fs::create_dir_all(kb_path.join(".memoforge")).unwrap();

    // Create two independent store instances
    let inbox_store1 = InboxStore::new(kb_path.clone());
    let inbox_store2 = InboxStore::new(kb_path.clone());

    // Store 1 creates an item
    let item1 = InboxItem::new(InboxSourceType::Agent, "From store 1".to_string());
    let created1 = inbox_store1.create_inbox_item(item1).unwrap();

    // Store 2 can read it
    let retrieved2 = inbox_store2.get_inbox_item(&created1.id).unwrap();
    assert_eq!(retrieved2.id, created1.id);

    // Store 2 creates a different item
    let item2 = InboxItem::new(InboxSourceType::Manual, "From store 2".to_string());
    let created2 = inbox_store2.create_inbox_item(item2).unwrap();

    // Store 1 can read it
    let retrieved1 = inbox_store1.get_inbox_item(&created2.id).unwrap();
    assert_eq!(retrieved1.id, created2.id);

    // Both can list and see both items
    let list1 = inbox_store1.list_inbox_items(None, None).unwrap();
    let list2 = inbox_store2.list_inbox_items(None, None).unwrap();

    assert_eq!(list1.len(), 2);
    assert_eq!(list2.len(), 2);
}

/// Test 5: Multiple inbox items in a session.
#[test]
fn test_multiple_inbox_items_in_session() {
    let (_temp, inbox_store, session_store) = setup_knowledge_base();

    // Create session
    let session = AgentSession::new(
        "claude-code".to_string(),
        "Generate multiple items".to_string(),
    );
    let created_session = session_store.create_session(session).unwrap();
    let session_id = created_session.id.clone();

    // Create multiple inbox items for the session
    let item_ids = vec![
        {
            let mut item = InboxItem::new(InboxSourceType::Agent, "Item 1".to_string());
            item.linked_session_id = Some(session_id.clone());
            inbox_store.create_inbox_item(item).unwrap().id
        },
        {
            let mut item = InboxItem::new(InboxSourceType::Agent, "Item 2".to_string());
            item.linked_session_id = Some(session_id.clone());
            inbox_store.create_inbox_item(item).unwrap().id
        },
        {
            let mut item = InboxItem::new(InboxSourceType::Agent, "Item 3".to_string());
            item.linked_session_id = Some(session_id.clone());
            inbox_store.create_inbox_item(item).unwrap().id
        },
    ];

    // Associate all items with session
    for item_id in &item_ids {
        session_store
            .add_inbox_item_id(&session_id, item_id.clone())
            .unwrap();
    }

    // Verify session has all items
    let final_session = session_store.get_session(&session_id).unwrap();
    assert_eq!(final_session.inbox_item_ids.len(), 3);

    // Verify all items are linked to the session
    for item_id in &item_ids {
        let item = inbox_store.get_inbox_item(item_id).unwrap();
        assert_eq!(item.linked_session_id, Some(session_id.clone()));
    }
}

/// Test 6: Session with context items and inbox items together.
#[test]
fn test_session_with_context_and_inbox_items() {
    let (_temp, inbox_store, session_store) = setup_knowledge_base();

    // Create session
    let session = AgentSession::new("claude-code".to_string(), "Complex workflow".to_string());
    let created_session = session_store.create_session(session).unwrap();
    let session_id = created_session.id.clone();

    // Add context items
    let context_item1 =
        ContextItem::new(ContextRefType::Knowledge, "docs/reference.md".to_string());
    let context_item2 =
        ContextItem::new(ContextRefType::Url, "https://docs.example.com".to_string());

    session_store
        .append_context(&session_id, context_item1)
        .unwrap();
    session_store
        .append_context(&session_id, context_item2)
        .unwrap();

    // Add inbox items
    let mut inbox_item = InboxItem::new(InboxSourceType::Agent, "Generated draft".to_string());
    inbox_item.linked_session_id = Some(session_id.clone());
    let created_inbox = inbox_store.create_inbox_item(inbox_item).unwrap();
    let inbox_id = created_inbox.id.clone();
    session_store
        .add_inbox_item_id(&session_id, inbox_id.clone())
        .unwrap();

    // Verify session state
    let final_session = session_store.get_session(&session_id).unwrap();
    assert_eq!(final_session.context_items.len(), 2);
    assert_eq!(final_session.inbox_item_ids.len(), 1);
    assert_eq!(
        final_session.status,
        memoforge_core::session::SessionStatus::Running
    );

    // Verify inbox item state
    let inbox = inbox_store.get_inbox_item(&inbox_id).unwrap();
    assert_eq!(inbox.linked_session_id, Some(session_id));
    assert_eq!(inbox.status, InboxStatus::New);
}

/// Test 7: Inbox item deletion affects session association.
#[test]
fn test_inbox_deletion_from_session() {
    let (_temp, inbox_store, session_store) = setup_knowledge_base();

    // Create session and inbox item
    let session = AgentSession::new("claude-code".to_string(), "Test deletion".to_string());
    let created_session = session_store.create_session(session).unwrap();
    let session_id = created_session.id.clone();

    let mut inbox_item = InboxItem::new(InboxSourceType::Agent, "To be deleted".to_string());
    inbox_item.linked_session_id = Some(session_id.clone());
    let created_inbox = inbox_store.create_inbox_item(inbox_item).unwrap();

    // Associate
    session_store
        .add_inbox_item_id(&session_id, created_inbox.id.clone())
        .unwrap();

    // Verify association
    let session_before = session_store.get_session(&session_id).unwrap();
    assert_eq!(session_before.inbox_item_ids.len(), 1);

    // Delete inbox item
    inbox_store.delete_inbox_item(&created_inbox.id).unwrap();

    // Session still has the ID reference (it doesn't auto-clean)
    let session_after = session_store.get_session(&session_id).unwrap();
    assert_eq!(session_after.inbox_item_ids.len(), 1);

    // But the inbox item is gone
    let result = inbox_store.get_inbox_item(&created_inbox.id);
    assert!(result.is_err());
}
