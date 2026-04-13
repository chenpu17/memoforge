// ==================== Governance Types ====================

export interface EvidenceMeta {
  owner?: string
  source_url?: string
  linked_issue_ids: string[]
  linked_pr_ids: string[]
  linked_commit_shas: string[]
  command_output_refs: string[]
  verified_at?: string
  verified_by?: string
  valid_for_version?: string
}

export interface FreshnessPolicy {
  sla_days: number
  last_verified_at?: string
  next_review_at?: string
  review_owner?: string
  review_status: 'ok' | 'due' | 'overdue' | 'unknown'
}

export interface KnowledgeGovernance {
  evidence: EvidenceMeta | null
  freshness: FreshnessPolicy | null
  effective_sla_days: number
}
