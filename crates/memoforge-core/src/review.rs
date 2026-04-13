//! Review Item projection model
//! v0.3.0: Unified review projection layer

use crate::{ErrorCode, MemoError};
use serde::{Deserialize, Serialize};

/// Review item source type
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ReviewSourceType {
    AgentDraft,
    InboxPromotion,
    ReliabilityFix,
    ImportCleanup,
}

/// Review item status
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ReviewStatus {
    Pending,
    InReview,
    Approved,
    Returned,
    Discarded,
}

/// Review decision type (for apply_review_decision)
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ReviewDecision {
    Approve,
    Return,
    Discard,
    Reopen,
}

/// Unified review projection
/// Note: ReviewItem is a projection layer, not persisted independently.
/// Aggregated from Draft + source object + risk flags.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReviewItem {
    /// Projection ID
    pub review_item_id: String,
    /// Source type
    pub source_type: ReviewSourceType,
    /// Source object ID
    pub source_ref_id: String,
    /// Associated Draft ID
    pub draft_id: String,
    /// Display title
    pub title: String,
    /// Risk flags
    pub risk_flags: Vec<String>,
    /// Review status
    pub status: ReviewStatus,
    /// Last decision maker
    #[serde(skip_serializing_if = "Option::is_none")]
    pub decided_by: Option<String>,
    /// Last decision time
    #[serde(skip_serializing_if = "Option::is_none")]
    pub decided_at: Option<String>,
    /// Creation time
    pub created_at: String,
    /// Update time
    pub updated_at: String,
}

impl ReviewItem {
    /// Check whether a state transition is valid
    pub fn can_transition_to(&self, decision: &ReviewDecision) -> bool {
        match (&self.status, decision) {
            // pending can transition to any decision except reopen
            (ReviewStatus::Pending, ReviewDecision::Approve) => true,
            (ReviewStatus::Pending, ReviewDecision::Return) => true,
            (ReviewStatus::Pending, ReviewDecision::Discard) => true,
            (ReviewStatus::Pending, ReviewDecision::Reopen) => false,
            // in_review can transition to any decision except reopen
            (ReviewStatus::InReview, ReviewDecision::Approve) => true,
            (ReviewStatus::InReview, ReviewDecision::Return) => true,
            (ReviewStatus::InReview, ReviewDecision::Discard) => true,
            (ReviewStatus::InReview, ReviewDecision::Reopen) => false,
            // returned can only reopen back to pending
            (ReviewStatus::Returned, ReviewDecision::Reopen) => true,
            (ReviewStatus::Returned, _) => false,
            // approved/discarded are terminal states
            (ReviewStatus::Approved, _) => false,
            (ReviewStatus::Discarded, _) => false,
        }
    }

    /// Transition from Pending to InReview.
    ///
    /// This is the entry point for the InReview state. Only Pending items
    /// can transition to InReview. The reviewer is recorded in `decided_by`
    /// and the timestamp in `decided_at`.
    pub fn start_review(&mut self, reviewer: Option<String>) -> Result<(), MemoError> {
        if self.status != ReviewStatus::Pending {
            return Err(MemoError {
                code: ErrorCode::InvalidData,
                message: format!(
                    "Cannot start review on item in {:?} state. Only Pending items can transition to InReview.",
                    self.status
                ),
                retry_after_ms: None,
                context: None,
            });
        }
        self.status = ReviewStatus::InReview;
        self.decided_by = reviewer;
        self.decided_at = Some(chrono::Utc::now().to_rfc3339());
        Ok(())
    }

    /// Apply a decision and return the new status
    pub fn apply_decision(
        &mut self,
        decision: ReviewDecision,
        decided_by: Option<String>,
    ) -> Result<ReviewStatus, MemoError> {
        if !self.can_transition_to(&decision) {
            return Err(MemoError {
                code: ErrorCode::InvalidData,
                message: format!(
                    "Cannot apply {:?} to item in {:?} state",
                    decision, self.status
                ),
                retry_after_ms: None,
                context: None,
            });
        }
        let new_status = match decision {
            ReviewDecision::Approve => ReviewStatus::Approved,
            ReviewDecision::Return => ReviewStatus::Returned,
            ReviewDecision::Discard => ReviewStatus::Discarded,
            ReviewDecision::Reopen => ReviewStatus::Pending,
        };
        self.status = new_status.clone();
        self.decided_by = decided_by;
        self.decided_at = Some(chrono::Utc::now().to_rfc3339());
        Ok(new_status)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_review_item(status: ReviewStatus) -> ReviewItem {
        ReviewItem {
            review_item_id: "test-item-1".into(),
            source_type: ReviewSourceType::AgentDraft,
            source_ref_id: "source-1".into(),
            draft_id: "draft-1".into(),
            title: "Test Review Item".into(),
            risk_flags: vec![],
            status,
            decided_by: None,
            decided_at: None,
            created_at: "2026-01-01T00:00:00Z".into(),
            updated_at: "2026-01-01T00:00:00Z".into(),
        }
    }

    // --- can_transition_to tests ---

    #[test]
    fn pending_can_approve() {
        let item = make_review_item(ReviewStatus::Pending);
        assert!(item.can_transition_to(&ReviewDecision::Approve));
    }

    #[test]
    fn pending_can_return() {
        let item = make_review_item(ReviewStatus::Pending);
        assert!(item.can_transition_to(&ReviewDecision::Return));
    }

    #[test]
    fn pending_can_discard() {
        let item = make_review_item(ReviewStatus::Pending);
        assert!(item.can_transition_to(&ReviewDecision::Discard));
    }

    #[test]
    fn pending_cannot_reopen() {
        let item = make_review_item(ReviewStatus::Pending);
        assert!(!item.can_transition_to(&ReviewDecision::Reopen));
    }

    #[test]
    fn in_review_can_approve() {
        let item = make_review_item(ReviewStatus::InReview);
        assert!(item.can_transition_to(&ReviewDecision::Approve));
    }

    #[test]
    fn in_review_can_return() {
        let item = make_review_item(ReviewStatus::InReview);
        assert!(item.can_transition_to(&ReviewDecision::Return));
    }

    #[test]
    fn in_review_can_discard() {
        let item = make_review_item(ReviewStatus::InReview);
        assert!(item.can_transition_to(&ReviewDecision::Discard));
    }

    #[test]
    fn in_review_cannot_reopen() {
        let item = make_review_item(ReviewStatus::InReview);
        assert!(!item.can_transition_to(&ReviewDecision::Reopen));
    }

    #[test]
    fn returned_can_reopen() {
        let item = make_review_item(ReviewStatus::Returned);
        assert!(item.can_transition_to(&ReviewDecision::Reopen));
    }

    #[test]
    fn returned_cannot_approve() {
        let item = make_review_item(ReviewStatus::Returned);
        assert!(!item.can_transition_to(&ReviewDecision::Approve));
    }

    #[test]
    fn returned_cannot_discard() {
        let item = make_review_item(ReviewStatus::Returned);
        assert!(!item.can_transition_to(&ReviewDecision::Discard));
    }

    #[test]
    fn approved_is_terminal() {
        let item = make_review_item(ReviewStatus::Approved);
        assert!(!item.can_transition_to(&ReviewDecision::Approve));
        assert!(!item.can_transition_to(&ReviewDecision::Return));
        assert!(!item.can_transition_to(&ReviewDecision::Discard));
        assert!(!item.can_transition_to(&ReviewDecision::Reopen));
    }

    #[test]
    fn discarded_is_terminal() {
        let item = make_review_item(ReviewStatus::Discarded);
        assert!(!item.can_transition_to(&ReviewDecision::Approve));
        assert!(!item.can_transition_to(&ReviewDecision::Return));
        assert!(!item.can_transition_to(&ReviewDecision::Discard));
        assert!(!item.can_transition_to(&ReviewDecision::Reopen));
    }

    // --- apply_decision tests ---

    #[test]
    fn apply_approve_from_pending() {
        let mut item = make_review_item(ReviewStatus::Pending);
        let result = item.apply_decision(ReviewDecision::Approve, Some("user1".into()));
        assert_eq!(result.unwrap(), ReviewStatus::Approved);
        assert_eq!(item.status, ReviewStatus::Approved);
        assert_eq!(item.decided_by.unwrap(), "user1");
        assert!(item.decided_at.is_some());
    }

    #[test]
    fn apply_return_from_in_review() {
        let mut item = make_review_item(ReviewStatus::InReview);
        let result = item.apply_decision(ReviewDecision::Return, None);
        assert_eq!(result.unwrap(), ReviewStatus::Returned);
        assert_eq!(item.status, ReviewStatus::Returned);
    }

    #[test]
    fn apply_reopen_from_returned() {
        let mut item = make_review_item(ReviewStatus::Returned);
        let result = item.apply_decision(ReviewDecision::Reopen, Some("admin".into()));
        assert_eq!(result.unwrap(), ReviewStatus::Pending);
        assert_eq!(item.status, ReviewStatus::Pending);
    }

    #[test]
    fn apply_discard_from_pending() {
        let mut item = make_review_item(ReviewStatus::Pending);
        let result = item.apply_decision(ReviewDecision::Discard, None);
        assert_eq!(result.unwrap(), ReviewStatus::Discarded);
        assert_eq!(item.status, ReviewStatus::Discarded);
    }

    #[test]
    fn apply_invalid_transition_returns_error() {
        let mut item = make_review_item(ReviewStatus::Approved);
        let result = item.apply_decision(ReviewDecision::Reopen, None);
        assert!(result.is_err());
        assert_eq!(result.unwrap_err().code, ErrorCode::InvalidData);
    }

    #[test]
    fn full_lifecycle_pending_to_approved() {
        let mut item = make_review_item(ReviewStatus::Pending);
        // pending -> approve -> approved
        item.apply_decision(ReviewDecision::Approve, Some("reviewer".into()))
            .unwrap();
        assert_eq!(item.status, ReviewStatus::Approved);
        // approved is terminal
        assert!(!item.can_transition_to(&ReviewDecision::Reopen));
    }

    #[test]
    fn full_lifecycle_with_return_and_reopen() {
        let mut item = make_review_item(ReviewStatus::Pending);
        // pending -> return -> returned
        item.apply_decision(ReviewDecision::Return, Some("reviewer".into()))
            .unwrap();
        assert_eq!(item.status, ReviewStatus::Returned);
        // returned -> reopen -> pending
        item.apply_decision(ReviewDecision::Reopen, Some("author".into()))
            .unwrap();
        assert_eq!(item.status, ReviewStatus::Pending);
        // pending -> approve -> approved
        item.apply_decision(ReviewDecision::Approve, Some("reviewer".into()))
            .unwrap();
        assert_eq!(item.status, ReviewStatus::Approved);
    }

    #[test]
    fn review_item_serialization_roundtrip() {
        let item = make_review_item(ReviewStatus::Pending);
        let json = serde_json::to_string(&item).unwrap();
        let deserialized: ReviewItem = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.review_item_id, "test-item-1");
        assert_eq!(deserialized.source_type, ReviewSourceType::AgentDraft);
        assert_eq!(deserialized.status, ReviewStatus::Pending);
    }

    #[test]
    fn review_status_serialization_values() {
        assert_eq!(
            serde_json::to_string(&ReviewStatus::Pending).unwrap(),
            "\"pending\""
        );
        assert_eq!(
            serde_json::to_string(&ReviewStatus::InReview).unwrap(),
            "\"in_review\""
        );
        assert_eq!(
            serde_json::to_string(&ReviewStatus::Approved).unwrap(),
            "\"approved\""
        );
        assert_eq!(
            serde_json::to_string(&ReviewStatus::Returned).unwrap(),
            "\"returned\""
        );
        assert_eq!(
            serde_json::to_string(&ReviewStatus::Discarded).unwrap(),
            "\"discarded\""
        );
    }

    // --- start_review tests ---

    #[test]
    fn start_review_from_pending_succeeds() {
        let mut item = make_review_item(ReviewStatus::Pending);
        item.start_review(Some("reviewer".to_string())).unwrap();
        assert_eq!(item.status, ReviewStatus::InReview);
        assert_eq!(item.decided_by.unwrap(), "reviewer");
        assert!(item.decided_at.is_some());
    }

    #[test]
    fn start_review_from_pending_without_reviewer() {
        let mut item = make_review_item(ReviewStatus::Pending);
        item.start_review(None).unwrap();
        assert_eq!(item.status, ReviewStatus::InReview);
        assert!(item.decided_by.is_none());
    }

    #[test]
    fn start_review_from_in_review_fails() {
        let mut item = make_review_item(ReviewStatus::InReview);
        let result = item.start_review(Some("reviewer".into()));
        assert!(result.is_err());
        assert_eq!(result.unwrap_err().code, ErrorCode::InvalidData);
    }

    #[test]
    fn start_review_from_returned_fails() {
        let mut item = make_review_item(ReviewStatus::Returned);
        let result = item.start_review(None);
        assert!(result.is_err());
    }

    #[test]
    fn start_review_from_approved_fails() {
        let mut item = make_review_item(ReviewStatus::Approved);
        let result = item.start_review(None);
        assert!(result.is_err());
    }

    #[test]
    fn start_review_then_approve() {
        let mut item = make_review_item(ReviewStatus::Pending);
        item.start_review(Some("reviewer".into())).unwrap();
        assert_eq!(item.status, ReviewStatus::InReview);
        item.apply_decision(ReviewDecision::Approve, Some("reviewer".into())).unwrap();
        assert_eq!(item.status, ReviewStatus::Approved);
    }

    #[test]
    fn start_review_then_return() {
        let mut item = make_review_item(ReviewStatus::Pending);
        item.start_review(Some("reviewer".into())).unwrap();
        item.apply_decision(ReviewDecision::Return, Some("reviewer".into())).unwrap();
        assert_eq!(item.status, ReviewStatus::Returned);
    }
}
