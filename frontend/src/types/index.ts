export interface Knowledge {
  id: string
  title: string
  content?: string
  category?: string
  tags: string[]
  summary?: string
  created_at: string
  updated_at: string
  summary_stale?: boolean
}

export interface PaginatedKnowledge {
  items: Knowledge[]
  total: number
  limit: number
  offset: number
  has_more: boolean
}

export interface KnowledgeWithStale extends Knowledge {
  summary_stale: boolean
}

export interface Category {
  id: string
  name: string
  count?: number
}

export interface GrepMatch {
  id: string
  title: string
  line_number: number
  line: string
}

export interface KnowledgeLinkCompletion {
  id: string
  title: string
  summary?: string
  category?: string
}

export interface SearchResult {
  knowledge: Knowledge
  matches: GrepMatch[]
}

// ==================== Inbox Types ====================

export interface InboxItem {
  id: string
  source_type: 'agent' | 'import' | 'paste' | 'manual' | 'reliability'
  source_agent?: string
  title: string
  snippet?: string
  content_markdown?: string
  proposed_path?: string
  status: 'new' | 'triaged' | 'drafted' | 'promoted' | 'ignored'
  linked_draft_id?: string
  linked_session_id?: string
  linked_knowledge_path?: string
  metadata?: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface PromoteInboxItemResult {
  draft_id: string
  inbox_item: InboxItem
}

// ==================== Session Types ====================

export interface ContextItem {
  ref_type: 'knowledge' | 'pack' | 'url' | 'file'
  ref_id: string
  accessed_at: string
  summary?: string
}

export interface AgentSession {
  id: string
  agent_name: string
  agent_source?: string
  goal: string
  status: 'running' | 'completed' | 'failed' | 'cancelled'
  context_items: ContextItem[]
  draft_ids: string[]
  inbox_item_ids: string[]
  result_summary?: string
  context_pack_ids: string[]
  started_at: string
  finished_at?: string
  metadata?: Record<string, unknown>
}

export interface CompleteSessionOptions {
  result_summary?: string
  status?: 'failed'
}

export interface CreateInboxItemOptions {
  content_markdown?: string
  proposed_path?: string
  linked_session_id?: string
}

export interface StartSessionOptions {
  agent_source?: string
  context_pack_ids?: string[]
}

export interface DraftSummary {
  draft_id: string
  target_path: string | null
  updated_at: string
  source_agent: string
  ops_count: number
  review_state?: string
  review_notes?: string
  source_session_id?: string
  source_inbox_item_id?: string
}

export interface DraftPreviewResponse {
  sections_changed: number
  summary_will_be_stale: boolean
  warnings: string[]
  diff_summary: string
}

export interface CommitDraftResponse {
  committed: boolean
  path: string
  changed_sections: number
  summary_stale: boolean
}

export interface DiscardDraftResponse {
  discarded: boolean
  draft_id: string
}

export interface UpdateDraftReviewStateResponse {
  draft_id: string
  review_state: string
  review_notes?: string
}

// ==================== Reliability Types ====================

export interface ReliabilityIssue {
  id: string
  rule_key: string
  knowledge_path: string
  severity: 'low' | 'medium' | 'high'
  status: 'open' | 'ignored' | 'resolved'
  summary: string
  linked_draft_id?: string
  detected_at: string
  updated_at?: string
}

export interface ReliabilityStats {
  total: number
  open: number
  ignored: number
  resolved: number
  high_severity: number
  medium_severity: number
  low_severity: number
}

export interface CreateFixDraftResult {
  draft_id: string
  issue_id: string
}

// ==================== Context Pack Types ====================

export interface ContextPack {
  id: string
  name: string
  scope_type: 'tag' | 'folder' | 'topic' | 'manual'
  scope_value: string
  item_paths: string[]
  summary: string | null
  version: string
  created_at: string
  updated_at: string
}

// ==================== Workflow Template Types ====================

export { type ContextRef, type WorkflowTemplate, type WorkflowRun } from './workflow'

// ==================== Governance Types ====================

export { type EvidenceMeta, type FreshnessPolicy, type KnowledgeGovernance } from './governance'

// ==================== Unified Review Queue Types ====================

export { type ReviewSourceType, type ReviewStatus, type ReviewDecision, type ReviewItem } from './review'
