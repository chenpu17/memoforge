// ==================== Unified Review Queue Types ====================

export type ReviewSourceType = 'agent_draft' | 'inbox_promotion' | 'reliability_fix' | 'import_cleanup'
export type ReviewStatus = 'pending' | 'in_review' | 'approved' | 'returned' | 'discarded'
export type ReviewDecision = 'approve' | 'return' | 'discard' | 'reopen'

export interface ReviewItem {
  review_item_id: string
  source_type: ReviewSourceType
  source_ref_id: string
  draft_id: string
  title: string
  risk_flags: string[]
  status: ReviewStatus
  decided_by?: string
  decided_at?: string
  created_at: string
  updated_at: string
}
