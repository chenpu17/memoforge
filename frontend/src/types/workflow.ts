// ==================== Workflow Template Types ====================

export interface ContextRef {
  ref_type: 'knowledge' | 'pack' | 'url' | 'file'
  ref_id: string
  required: boolean
  reason?: string
  snapshot_summary?: string
}

export interface WorkflowTemplate {
  template_id: string
  name: string
  goal: string
  default_context_refs: ContextRef[]
  suggested_output_target?: string
  review_policy?: string
  success_criteria: string[]
  enabled: boolean
}

export interface WorkflowRun {
  run_id: string
  template_id: string
  session_id?: string
  draft_id?: string
  inbox_item_ids: string[]
}
