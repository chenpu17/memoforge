import type { Category, Knowledge, KnowledgeLinkCompletion, KnowledgeWithStale, GrepMatch, PaginatedKnowledge, DraftSummary, DraftPreviewResponse, CommitDraftResponse, DiscardDraftResponse, UpdateDraftReviewStateResponse, ReliabilityIssue, ReliabilityStats, CreateFixDraftResult, ContextPack, WorkflowTemplate, WorkflowRun, ReviewItem, KnowledgeGovernance } from '../types'

// Re-export types for component usage
export type { InboxItem, PromoteInboxItemResult, ContextItem, AgentSession, CompleteSessionOptions, CreateInboxItemOptions, StartSessionOptions, DraftSummary, DraftPreviewResponse, CommitDraftResponse, DiscardDraftResponse, UpdateDraftReviewStateResponse, ReliabilityIssue, ReliabilityStats, CreateFixDraftResult, ContextPack, WorkflowTemplate, WorkflowRun, ReviewItem, KnowledgeGovernance }
import type {
  InboxItem,
  PromoteInboxItemResult,
  ContextItem,
  AgentSession,
  CompleteSessionOptions,
  CreateInboxItemOptions,
  StartSessionOptions,
} from '../types'
import { getHttpService, initHttpService } from './http'

const runtimeEnv = ((import.meta as unknown as { env?: Record<string, string | undefined> }).env) || {}

function isTauriEnv() {
  if (typeof window === 'undefined') return false
  return '__TAURI__' in window || '__TAURI_INTERNALS__' in window
}

function getHttpToken(): string | undefined {
  if (typeof window === 'undefined') return runtimeEnv.VITE_MEMOFORGE_AUTH_TOKEN

  const cached = sessionStorage.getItem('memoforge_token')
  if (cached) return cached

  const hash = window.location.hash
  const match = hash.match(/token=([^&]+)/)
  if (match) {
    const token = decodeURIComponent(match[1])
    sessionStorage.setItem('memoforge_token', token)
    window.location.hash = ''
    return token
  }

  return runtimeEnv.VITE_MEMOFORGE_AUTH_TOKEN
}

function getHttpClient() {
  const baseUrl = runtimeEnv.VITE_MEMOFORGE_API_BASE || window.location.origin
  return getHttpService({
    baseUrl,
    authToken: getHttpToken(),
  })
}

function tryParseJsonError(error: string): string {
  try {
    const parsed = JSON.parse(error) as { message?: string }
    if (typeof parsed.message === 'string' && parsed.message.trim()) {
      return parsed.message
    }
  } catch {
    // noop
  }
  return error
}

export function getErrorMessage(error: unknown): string {
  if (typeof error === 'string') {
    return tryParseJsonError(error)
  }
  if (error instanceof Error) {
    return error.message
  }
  return String(error)
}

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (isTauriEnv()) {
    const { invoke: tauriInvoke } = await import('@tauri-apps/api/core')
    return tauriInvoke(cmd, args)
  }
  throw new Error('Not running in Tauri')
}

if (!isTauriEnv() && typeof window !== 'undefined') {
  initHttpService({
    baseUrl: runtimeEnv.VITE_MEMOFORGE_API_BASE || window.location.origin,
    authToken: getHttpToken(),
  })
}

export const tauriService = {
  async startWindowDrag(): Promise<void> {
    if (isTauriEnv()) {
      return invoke('start_window_drag_cmd')
    }
  },

  async toggleWindowMaximize(): Promise<void> {
    if (isTauriEnv()) {
      const { getCurrentWindow } = await import('@tauri-apps/api/window')
      await getCurrentWindow().toggleMaximize()
    }
  },

  /**
   * @deprecated 对于 clone 操作，请使用 cloneKb() 代替
   */
  async initKb(path: string, mode: 'open' | 'new' | 'clone'): Promise<void> {
    if (isTauriEnv()) {
      return invoke('init_kb_cmd', { path, mode })
    }
    if (mode === 'clone') {
      throw new Error('HTTP 模式暂不支持 clone 初始化')
    }
    return getHttpClient().initKb(path, mode)
  },

  async getStatus(): Promise<{ initialized: boolean; kb_path: string | null; readonly?: boolean }> {
    if (isTauriEnv()) {
      return invoke('get_status_cmd')
    }
    const status = await getHttpClient().getStatus()
    return {
      initialized: status.initialized,
      kb_path: null,
      readonly: status.readonly,
    }
  },

  async listKnowledge(level = 1, limit = 50, offset = 0, categoryId?: string, tags?: string[]): Promise<PaginatedKnowledge> {
    if (isTauriEnv()) {
      return invoke('list_knowledge_cmd', { level, limit, offset, categoryId, tags })
    }
    const response = await getHttpClient().listKnowledge(level, { limit, offset, categoryId, tags })
    const items = response.items
    const total = response.total
    return {
      items,
      total,
      limit,
      offset,
      has_more: offset + items.length < total
    }
  },

  async getKnowledge(id: string, level = 2): Promise<Knowledge> {
    if (isTauriEnv()) {
      return invoke('get_knowledge_cmd', { id, level })
    }
    return getHttpClient().getKnowledge(id, level)
  },

  async getKnowledgeWithStale(id: string): Promise<KnowledgeWithStale> {
    if (isTauriEnv()) {
      return invoke('get_knowledge_with_stale_cmd', { id })
    }
    return getHttpClient().getKnowledgeWithStale(id)
  },

  async createKnowledge(knowledge: Omit<Knowledge, 'id' | 'created_at' | 'updated_at'>): Promise<string> {
    if (isTauriEnv()) {
      return invoke('create_knowledge_cmd', {
        title: knowledge.title,
        content: knowledge.content ?? '',
        tags: knowledge.tags,
        categoryId: knowledge.category || null,
        summary: knowledge.summary || null,
      })
    }
    return getHttpClient().createKnowledge(knowledge)
  },

  async updateKnowledge(id: string, knowledge: Partial<Knowledge>): Promise<void> {
    if (isTauriEnv()) {
      return invoke('update_knowledge_cmd', {
        id,
        patch: {
          title: knowledge.title ?? null,
          content: knowledge.content ?? null,
          tags: knowledge.tags ?? null,
          category: knowledge.category ?? null,
          summary: knowledge.summary ?? null,
        },
      })
    }
    return getHttpClient().updateKnowledge(id, knowledge)
  },

  async deleteKnowledge(id: string): Promise<void> {
    if (isTauriEnv()) {
      return invoke('delete_knowledge_cmd', { id })
    }
    return getHttpClient().deleteKnowledge(id)
  },

  async searchKnowledge(query: string, tags?: string[]): Promise<Knowledge[]> {
    if (isTauriEnv()) {
      return invoke('search_knowledge_cmd', { query, tags })
    }
    return getHttpClient().searchKnowledge(query, tags)
  },

  async completeKnowledgeLinks(query: string, limit?: number): Promise<KnowledgeLinkCompletion[]> {
    if (isTauriEnv()) {
      return invoke('complete_knowledge_links_cmd', { query, limit })
    }
    return getHttpClient().completeKnowledgeLinks(query, limit)
  },

  async grep(query: string, tags?: string[], limit?: number, categoryId?: string): Promise<GrepMatch[]> {
    if (isTauriEnv()) {
      return invoke('grep_cmd', { query, tags, categoryId, limit: limit || 50 })
    }
    return getHttpClient().grep(query, tags, limit, categoryId)
  },

  async getCategories(): Promise<Category[]> {
    if (isTauriEnv()) {
      return invoke('list_categories_cmd')
    }
    return getHttpClient().getCategories()
  },

  async gitStatus(): Promise<string[]> {
    if (isTauriEnv()) {
      return invoke('git_status_cmd')
    }
    return getHttpClient().gitStatus()
  },

  async isGitRepo(): Promise<boolean> {
    if (isTauriEnv()) {
      return invoke('is_git_repo_cmd')
    }
    // HTTP 模式假设是 Git 仓库
    return true
  },

  async gitCommit(message: string): Promise<void> {
    if (isTauriEnv()) {
      return invoke('git_commit_cmd', { message })
    }
    return getHttpClient().gitCommit(message)
  },

  async gitPush(): Promise<void> {
    if (isTauriEnv()) {
      return invoke('git_push_cmd')
    }
    return getHttpClient().gitPush()
  },

  async gitPull(): Promise<void> {
    if (isTauriEnv()) {
      return invoke('git_pull_cmd')
    }
    return getHttpClient().gitPull()
  },

  async getTags(prefix?: string): Promise<string[]> {
    if (isTauriEnv()) {
      return invoke('get_tags_cmd', { prefix })
    }
    return getHttpClient().getTags(prefix)
  },

  async getTagsWithCounts(): Promise<Array<{ tag: string; count: number }>> {
    if (isTauriEnv()) {
      const result: Array<[string, number]> = await invoke('get_tags_with_counts_cmd')
      return result.map(([tag, count]) => ({ tag, count }))
    }
    return getHttpClient().getTagsWithCounts()
  },

  async readEvents(limit: number): Promise<Event[]> {
    if (isTauriEnv()) {
      return invoke('read_events_cmd', { limit })
    }
    return []
  },

  async previewImport(sourcePath: string): Promise<ImportStats> {
    if (isTauriEnv()) {
      return invoke('preview_import_cmd', { sourcePath })
    }
    return getHttpClient().previewImport(sourcePath)
  },

  async importFolder(
    sourcePath: string,
    generateFrontmatter: boolean,
    autoCategories: boolean,
    dryRun: boolean
  ): Promise<ImportStats> {
    if (isTauriEnv()) {
      return invoke('import_folder_cmd', {
        sourcePath,
        generateFrontmatter,
        autoCategories,
        dryRun
      })
    }
    return getHttpClient().importFolder(sourcePath, generateFrontmatter, autoCategories, dryRun)
  },

  // 多知识库管理
  async listKnowledgeBases(): Promise<KnowledgeBaseInfo[]> {
    if (isTauriEnv()) {
      return invoke('list_kb_cmd')
    }
    return getHttpClient().listKnowledgeBases()
  },

  async getCurrentKb(): Promise<string | null> {
    if (isTauriEnv()) {
      return invoke('get_current_kb_cmd')
    }
    return getHttpClient().getCurrentKb()
  },

  async switchKb(path: string): Promise<void> {
    if (isTauriEnv()) {
      return invoke('switch_kb_cmd', { path })
    }
    return getHttpClient().switchKb(path)
  },

  async unregisterKb(path: string): Promise<void> {
    if (isTauriEnv()) {
      return invoke('unregister_kb_cmd', { path })
    }
    return getHttpClient().unregisterKb(path)
  },

  async closeKb(): Promise<void> {
    if (isTauriEnv()) {
      return invoke('close_kb_cmd')
    }
    return Promise.resolve()
  },

  async getRecentKbs(limit?: number): Promise<KnowledgeBaseInfo[]> {
    if (isTauriEnv()) {
      return invoke('get_recent_kbs_cmd', { limit })
    }
    return getHttpClient().listKnowledgeBases()
  },

  async getLastKb(): Promise<string | null> {
    if (isTauriEnv()) {
      return invoke('get_last_kb_cmd')
    }
    return getHttpClient().getCurrentKb()
  },

  async selectFolder(): Promise<string | null> {
    if (isTauriEnv()) {
      return invoke('select_folder_cmd')
    }
    // HTTP 模式不支持文件选择器
    return null
  },

  async getAppDiagnostics(): Promise<AppDiagnostics | null> {
    if (isTauriEnv()) {
      return invoke('get_app_diagnostics_cmd')
    }
    return null
  },

  async openAppLogDir(): Promise<void> {
    if (isTauriEnv()) {
      return invoke('open_app_log_dir_cmd')
    }
  },

  async importAssets(
    knowledgeId: string,
    assets: Array<{ fileName: string; mimeType?: string; bytes: number[] }>
  ): Promise<Array<{ file_name: string; relative_path: string; markdown: string; reused: boolean }>> {
    if (isTauriEnv()) {
      return invoke('import_assets_cmd', { knowledgeId, assets })
    }
    throw new Error('HTTP 模式暂不支持自动导入素材')
  },

  // Preview operations for dry_run mode
  async previewDeleteKnowledge(id: string): Promise<DeletePreview> {
    if (isTauriEnv()) {
      return invoke('preview_delete_knowledge_cmd', { id })
    }
    return getHttpClient().previewDeleteKnowledge(id)
  },

  async moveKnowledge(id: string, newCategoryId: string): Promise<void> {
    if (isTauriEnv()) {
      return invoke('move_knowledge_cmd', { id, newCategoryId })
    }
    return getHttpClient().moveKnowledge(id, newCategoryId)
  },

  async previewMoveKnowledge(id: string, newCategoryId: string): Promise<MovePreview> {
    if (isTauriEnv()) {
      return invoke('preview_move_knowledge_cmd', { id, newCategoryId })
    }
    return getHttpClient().previewMoveKnowledge(id, newCategoryId)
  },

  // 链接管理
  async getBacklinks(id: string): Promise<BacklinksResult> {
    if (isTauriEnv()) {
      return invoke('get_backlinks_cmd', { id })
    }
    return getHttpClient().getBacklinks(id)
  },

  async getRelated(id: string): Promise<RelatedResult> {
    if (isTauriEnv()) {
      return invoke('get_related_cmd', { id })
    }
    return getHttpClient().getRelated(id)
  },

  // 知识图谱
  async getKnowledgeGraph(): Promise<KnowledgeGraph> {
    if (isTauriEnv()) {
      return invoke('get_knowledge_graph_cmd')
    }
    return getHttpClient().getKnowledgeGraph()
  },

  // Agent 状态
  async getActiveAgents(): Promise<AgentInfo[]> {
    if (isTauriEnv()) {
      return invoke('get_active_agents_cmd')
    }
    return []
  },

  async getAgentCount(): Promise<number> {
    if (isTauriEnv()) {
      return invoke('get_agent_count_cmd')
    }
    return 0
  },

  async getMcpConnectionCount(): Promise<number> {
    if (isTauriEnv()) {
      return invoke('get_mcp_connection_count_cmd')
    }
    return 0
  },

  // AI 协作相关
  async selectKnowledge(path: string, title: string, category?: string): Promise<void> {
    if (isTauriEnv()) {
      return invoke('select_knowledge_cmd', { path, title, category })
    }
    // HTTP 模式不支持状态发布
  },

  async updateSelection(startLine: number, endLine: number, textLength: number, text?: string): Promise<void> {
    if (isTauriEnv()) {
      return invoke('update_selection_cmd', { startLine, endLine, textLength, text })
    }
    // HTTP 模式不支持状态发布
  },

  async clearSelection(): Promise<void> {
    if (isTauriEnv()) {
      return invoke('clear_selection_cmd')
    }
    // HTTP 模式不支持状态发布
  },

  async clearKnowledge(): Promise<void> {
    if (isTauriEnv()) {
      return invoke('clear_knowledge_cmd')
    }
    // HTTP 模式不支持状态发布
  },

  async setKb(path: string, name: string, count: number): Promise<void> {
    if (isTauriEnv()) {
      return invoke('set_kb_cmd', { path, name, count })
    }
    // HTTP 模式不支持状态发布
  },

  async refreshKbState(): Promise<void> {
    if (isTauriEnv()) {
      return invoke('refresh_kb_state_cmd')
    }
    // HTTP 模式不支持状态发布
  },

  // Clone Git 仓库到本地并初始化为知识库
  async cloneKb(repoUrl: string, localPath: string): Promise<string> {
    if (isTauriEnv()) {
      const result = await invoke<{ path: string }>('clone_kb_cmd', { repoUrl, localPath })
      return result.path
    }
    throw new Error('HTTP 模式暂不支持 Clone 操作')
  },

  // 获取内置知识库模板列表
  async listTemplates(): Promise<TemplateInfo[]> {
    if (isTauriEnv()) {
      return invoke('list_templates_cmd')
    }
    // HTTP fallback: 返回硬编码模板列表
    return [
      { id: 'developer-kb', name: '开发者知识库', description: '面向开发者的技术知识管理，预置开发分类和示例文档', categories: [{ name: '开发', path: '开发' }] },
      { id: 'project-retrospective', name: '项目复盘', description: '项目经验总结与复盘，预置复盘、问题、决策分类', categories: [{ name: '复盘', path: '复盘' }, { name: '问题', path: '问题' }, { name: '决策', path: '决策' }] },
      { id: 'tech-reading', name: '技术阅读笔记', description: '技术文章与书籍阅读笔记，预置阅读、笔记、收藏分类', categories: [{ name: '阅读', path: '阅读' }, { name: '笔记', path: '笔记' }, { name: '收藏', path: '收藏' }] },
    ]
  },

  // 基于模板创建知识库
  async createKbFromTemplate(templateId: string, targetPath: string, kbName?: string): Promise<string> {
    if (isTauriEnv()) {
      const result = await invoke<{ path: string }>('create_kb_from_template_cmd', { templateId, targetPath, kbName: kbName ?? null })
      return result.path
    }
    throw new Error('HTTP 模式暂不支持模板创建')
  },

  // 检查知识库健康状态
  async getKbHealth(kbPath?: string): Promise<KbHealth> {
    if (isTauriEnv()) {
      return invoke('get_kb_health_cmd', { kbPath: kbPath ?? null })
    }
    return { path_exists: false, last_open_ok: false, is_git_repo: false }
  },

  // 获取工作区概览（最近编辑、待整理、导入统计）
  async getWorkspaceOverview(): Promise<WorkspaceOverview> {
    if (isTauriEnv()) {
      return invoke('get_workspace_overview_cmd')
    }
    return { recent_edits: [], pending_organize: { no_summary: 0, stale_summary: 0, no_tags: 0, orphan: 0 }, recent_imports: 0 }
  },

  // 获取最近活动事件
  async getRecentActivity(limit?: number): Promise<Event[]> {
    if (isTauriEnv()) {
      return invoke('get_recent_activity_cmd', { limit: limit ?? 20 })
    }
    return []
  },

  // 获取 Git 概览（分支、ahead/behind、工作区改动）
  async getGitOverview(): Promise<GitOverview> {
    if (isTauriEnv()) {
      return invoke('get_git_overview_cmd')
    }
    return { current_branch: '', ahead: 0, behind: 0, working_changes: 0 }
  },

  // 草稿管理
  async listDrafts(): Promise<DraftSummary[]> {
    if (isTauriEnv()) {
      return invoke('list_drafts_cmd')
    }
    return []
  },

  async getDraftPreview(draftId: string): Promise<DraftPreviewResponse> {
    if (isTauriEnv()) {
      return invoke('get_draft_preview_cmd', { draftId })
    }
    return { sections_changed: 0, summary_will_be_stale: false, warnings: [], diff_summary: '' }
  },

  async commitDraft(draftId: string): Promise<CommitDraftResponse> {
    if (isTauriEnv()) {
      return invoke('commit_draft_cmd', { draftId })
    }
    return { committed: true, path: '', changed_sections: 0, summary_stale: false }
  },

  async discardDraft(draftId: string): Promise<DiscardDraftResponse> {
    if (isTauriEnv()) {
      return invoke('discard_draft_cmd', { draftId })
    }
    return { discarded: true, draft_id: draftId }
  },

  async updateDraftReviewState(
    draftId: string,
    state: string,
    notes?: string
  ): Promise<UpdateDraftReviewStateResponse> {
    if (isTauriEnv()) {
      return invoke('update_draft_review_state_cmd', {
        draftId,
        state,
        notes,
      })
    }
    throw new Error('HTTP mode not supported for draft review updates')
  },

  // ==================== Inbox Functions ====================

  async listInboxItems(status?: string, limit?: number): Promise<InboxItem[]> {
    if (isTauriEnv()) {
      return invoke('list_inbox_items_cmd', { status, limit })
    }
    // HTTP mode not supported for inbox yet
    return []
  },

  async createInboxItem(
    title: string,
    sourceType: string,
    opts?: CreateInboxItemOptions
  ): Promise<InboxItem> {
    if (isTauriEnv()) {
      return invoke('create_inbox_item_cmd', {
        title,
        source_type: sourceType,
        content_markdown: opts?.content_markdown,
        proposed_path: opts?.proposed_path,
        linked_session_id: opts?.linked_session_id,
      })
    }
    throw new Error('HTTP mode not supported for inbox creation')
  },

  async promoteInboxItemToDraft(
    inboxItemId: string,
    draftTitle?: string
  ): Promise<PromoteInboxItemResult> {
    if (isTauriEnv()) {
      return invoke('promote_inbox_item_to_draft_cmd', {
        inbox_item_id: inboxItemId,
        draft_title: draftTitle,
      })
    }
    throw new Error('HTTP mode not supported for inbox promotion')
  },

  async dismissInboxItem(
    inboxItemId: string,
    reason?: string
  ): Promise<InboxItem> {
    if (isTauriEnv()) {
      return invoke('dismiss_inbox_item_cmd', {
        inbox_item_id: inboxItemId,
        reason,
      })
    }
    throw new Error('HTTP mode not supported for inbox dismissal')
  },

  // ==================== Session Functions ====================

  async startAgentSession(
    agentName: string,
    goal: string,
    opts?: StartSessionOptions
  ): Promise<AgentSession> {
    if (isTauriEnv()) {
      return invoke('start_agent_session_cmd', {
        agent_name: agentName,
        goal,
        agent_source: opts?.agent_source,
        context_pack_ids: opts?.context_pack_ids,
      })
    }
    throw new Error('HTTP mode not supported for agent sessions')
  },

  async appendAgentSessionContext(
    sessionId: string,
    contextItem: ContextItem
  ): Promise<AgentSession> {
    if (isTauriEnv()) {
      return invoke('append_agent_session_context_cmd', {
        session_id: sessionId,
        context_item: contextItem,
      })
    }
    throw new Error('HTTP mode not supported for session context')
  },

  async listAgentSessions(
    status?: string,
    limit?: number
  ): Promise<AgentSession[]> {
    if (isTauriEnv()) {
      return invoke('list_agent_sessions_cmd', { status, limit })
    }
    // HTTP mode not supported for sessions yet
    return []
  },

  async getAgentSession(sessionId: string): Promise<AgentSession> {
    if (isTauriEnv()) {
      return invoke('get_agent_session_cmd', { session_id: sessionId })
    }
    throw new Error('HTTP mode not supported for session retrieval')
  },

  async completeAgentSession(
    sessionId: string,
    opts?: CompleteSessionOptions
  ): Promise<AgentSession> {
    if (isTauriEnv()) {
      return invoke('complete_agent_session_cmd', {
        session_id: sessionId,
        result_summary: opts?.result_summary,
        status: opts?.status,
      })
    }
    throw new Error('HTTP mode not supported for session completion')
  },

  // ==================== Reliability Functions ====================

  async listReliabilityIssues(severity?: 'low' | 'medium' | 'high', status?: 'open' | 'ignored' | 'resolved', limit?: number): Promise<ReliabilityIssue[]> {
    if (isTauriEnv()) {
      return invoke('list_reliability_issues_cmd', { severity, status, limit })
    }
    // HTTP mode not supported for reliability yet
    return []
  },

  async getReliabilityIssueDetail(issueId: string): Promise<ReliabilityIssue> {
    if (isTauriEnv()) {
      return invoke('get_reliability_issue_detail_cmd', { issue_id: issueId })
    }
    throw new Error('HTTP mode not supported for reliability')
  },

  async updateReliabilityIssueStatus(issueId: string, newStatus: 'open' | 'ignored' | 'resolved'): Promise<ReliabilityIssue> {
    if (isTauriEnv()) {
      return invoke('update_reliability_issue_status_cmd', { issue_id: issueId, new_status: newStatus })
    }
    throw new Error('HTTP mode not supported for reliability')
  },

  async createFixDraftFromIssue(issueId: string, fixInstructions?: string): Promise<CreateFixDraftResult> {
    if (isTauriEnv()) {
      return invoke('create_fix_draft_from_issue_cmd', { issue_id: issueId, fix_instructions: fixInstructions })
    }
    throw new Error('HTTP mode not supported for reliability')
  },

  async scanReliabilityIssues(): Promise<ReliabilityStats> {
    if (isTauriEnv()) {
      return invoke('scan_reliability_issues_cmd')
    }
    throw new Error('HTTP mode not supported for reliability')
  },

  async getReliabilityStats(): Promise<ReliabilityStats> {
    if (isTauriEnv()) {
      return invoke('get_reliability_stats_cmd')
    }
    // HTTP mode not supported for reliability yet
    return { total: 0, open: 0, ignored: 0, resolved: 0, high_severity: 0, medium_severity: 0, low_severity: 0 }
  },

  // ==================== Context Pack Functions ====================

  async listContextPacks(scopeType?: 'tag' | 'folder' | 'topic' | 'manual'): Promise<ContextPack[]> {
    if (isTauriEnv()) {
      return invoke('list_context_packs_cmd', { scopeType })
    }
    // HTTP mode not supported for context packs yet
    return []
  },

  async createContextPack(
    name: string,
    scopeType: string,
    scopeValue: string,
    itemPaths: string[],
    summary?: string
  ): Promise<ContextPack> {
    if (isTauriEnv()) {
      return invoke('create_context_pack_cmd', {
        name,
        scopeType,
        scopeValue,
        itemPaths,
        summary: summary ?? null,
      })
    }
    throw new Error('HTTP mode not supported for context pack creation')
  },

  async getContextPack(packId: string): Promise<ContextPack> {
    if (isTauriEnv()) {
      return invoke('get_context_pack_cmd', { packId })
    }
    throw new Error('HTTP mode not supported for context pack retrieval')
  },

  async exportContextPack(packId: string, format?: string): Promise<any> {
    if (isTauriEnv()) {
      return invoke('export_context_pack_cmd', { packId, format })
    }
    throw new Error('HTTP mode not supported for context pack export')
  },

  // ==================== Workflow Template Functions ====================

  async listWorkflowTemplates(enabledOnly?: boolean): Promise<WorkflowTemplate[]> {
    if (isTauriEnv()) {
      return invoke('list_workflow_templates_cmd', { enabledOnly: enabledOnly ?? false })
    }
    // HTTP fallback: return hardcoded built-in templates (IDs must match backend)
    return [
      {
        template_id: 'pr_issue_knowledge',
        name: 'PR/Issue 沉淀知识',
        goal: '从 PR 或 Issue 中提取关键知识并沉淀到知识库',
        default_context_refs: [],
        suggested_output_target: '开发',
        review_policy: 'human-approve',
        success_criteria: [
          '每个 PR/Issue 至少生成一条结构化知识',
          '知识条目包含问题背景、决策理由和影响范围',
          '标签和分类准确反映内容主题',
        ],
        enabled: true,
      },
      {
        template_id: 'runbook_verify',
        name: 'Runbook 校验与修复',
        goal: '检查 Runbook 文档的准确性和时效性，修复过期内容',
        default_context_refs: [],
        suggested_output_target: '运维',
        review_policy: 'human-approve',
        success_criteria: [
          '每个步骤可执行且结果符合预期',
          '标注的过时内容有明确替代方案',
          '校验报告包含改进优先级排序',
        ],
        enabled: true,
      },
      {
        template_id: 'meeting_notes',
        name: '会议纪要整理入库',
        goal: '将会议纪要整理为结构化知识并入库',
        default_context_refs: [],
        suggested_output_target: '会议',
        review_policy: 'human-approve',
        success_criteria: [
          '决策事项有明确的结论和理由',
          '行动项有负责人和截止时间',
          '会议纪要按照统一模板格式输出',
        ],
        enabled: true,
      },
      {
        template_id: 'release_retrospective',
        name: '版本发布复盘',
        goal: '对版本发布过程进行复盘，沉淀经验教训',
        default_context_refs: [],
        suggested_output_target: '复盘',
        review_policy: 'human-approve',
        success_criteria: [
          '复盘包含目标回顾、实际结果和差异分析',
          '经验教训有具体的改进措施',
          '改进方向有优先级和负责人',
        ],
        enabled: true,
      },
    ]
  },

  async startWorkflowRun(params: {
    template_id: string
    goal_override?: string
    context_refs?: Array<{
      ref_type: 'knowledge' | 'pack' | 'url' | 'file'
      ref_id: string
      required: boolean
      reason?: string
    }>
    suggested_output_target?: string
  }): Promise<WorkflowRun> {
    if (isTauriEnv()) {
      return invoke('start_workflow_run_cmd', {
        template_id: params.template_id,
        goal_override: params.goal_override ?? null,
        context_refs: params.context_refs ?? [],
        suggested_output_target: params.suggested_output_target ?? null,
      })
    }
    throw new Error('HTTP mode not supported for workflow runs')
  },

  // ==================== Unified Review Queue Functions ====================

  async listReviewItems(params?: { status?: string; source_type?: string; limit?: number }): Promise<ReviewItem[]> {
    if (isTauriEnv()) {
      return invoke('list_review_items_cmd', {
        status: params?.status ?? null,
        source_type: params?.source_type ?? null,
        limit: params?.limit ?? 100,
      })
    }
    // HTTP mode not supported for review queue yet
    return []
  },

  async getReviewItem(params: { review_item_id: string }): Promise<ReviewItem> {
    if (isTauriEnv()) {
      return invoke('get_review_item_cmd', { review_item_id: params.review_item_id })
    }
    throw new Error('HTTP mode not supported for review items')
  },

  async applyReviewDecision(params: { review_item_id: string; decision: string; notes?: string }): Promise<ReviewItem> {
    if (isTauriEnv()) {
      return invoke('apply_review_decision_cmd', {
        review_item_id: params.review_item_id,
        decision: params.decision,
        notes: params.notes ?? null,
      })
    }
    throw new Error('HTTP mode not supported for review decisions')
  },

  // ==================== Governance Functions ====================

  async getKnowledgeGovernance(params: { path: string }): Promise<KnowledgeGovernance> {
    if (isTauriEnv()) {
      return invoke('get_knowledge_governance_cmd', { path: params.path })
    }
    // HTTP mode not supported for governance yet
    return { evidence: null, freshness: null, effective_sla_days: 0 }
  },

  async updateKnowledgeGovernance(params: { path: string; evidence?: Record<string, unknown>; freshness?: Record<string, unknown> }): Promise<KnowledgeGovernance> {
    if (isTauriEnv()) {
      return invoke('update_knowledge_governance_cmd', {
        path: params.path,
        evidence: params.evidence ?? null,
        freshness: params.freshness ?? null,
      })
    }
    throw new Error('HTTP mode not supported for governance updates')
  },
}

export interface Event {
  time: string
  source: 'gui' | 'cli' | 'mcp' | 'mcp:claude-code' | 'mcp:codex' | 'mcp:other'
  action: 'create' | 'update' | 'update_metadata' | 'delete' | 'move' | 'git_commit' | 'git_pull' | 'git_push' | 'git_merge'
  path: string | null
  detail: string
}

export interface ImportStats {
  total_files: number
  files_with_frontmatter: number
  files_imported: number
  categories_created: number
  results: Array<{
    path: string
    title: string
    had_frontmatter: boolean
    generated_frontmatter: boolean
  }>
}

export interface AppDiagnostics {
  log_dir: string
  log_file: string
  current_kb: string | null
  recent_logs: string[]
}

export interface KnowledgeBaseInfo {
  path: string
  name: string
  last_accessed: string
  is_default: boolean
}

export interface ReferenceInfo {
  path: string
  title: string
  lines: number[]
}

export interface DeletePreview {
  path: string
  title: string
  references: ReferenceInfo[]
}

export interface MovePreview {
  old_path: string
  new_path: string
  title: string
  references: ReferenceInfo[]
}

// 链接相关类型
export interface LinkInfo {
  source_id: string
  source_title: string
  link_text: string
  display_text: string | null
  line_number: number
}

export interface BacklinksResult {
  target_id: string
  backlinks: LinkInfo[]
}

export interface RelatedKnowledge {
  id: string
  title: string
  relation_type: 'Outgoing' | 'Incoming' | 'SharedTags'
}

export interface RelatedResult {
  id: string
  related: RelatedKnowledge[]
}

// 知识图谱类型
export interface GraphNode {
  id: string
  title: string
  category_id: string | null
  tags: string[]
}

export interface GraphEdge {
  source: string
  target: string
  relation: 'WikiLink' | 'SharedTag' | 'SameCategory'
}

export interface KnowledgeGraph {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

// Agent 状态类型
export interface AgentInfo {
  pid: number
  name: string
  started_at: string
  kb_path: string
}

// 模板相关类型
export interface TemplateCategory {
  name: string
  path: string
}

export interface TemplateInfo {
  id: string
  name: string
  description: string
  categories: TemplateCategory[]
}

// 知识库健康状态
export interface KbHealth {
  path_exists: boolean
  last_open_ok: boolean
  is_git_repo: boolean
}

// 工作区概览类型
export interface RecentEdit {
  path: string
  title: string
  updated_at: string
}

export interface PendingOrganize {
  no_summary: number
  stale_summary: number
  no_tags: number
  orphan: number
}

export interface WorkspaceOverview {
  recent_edits: RecentEdit[]
  pending_organize: PendingOrganize
  recent_imports: number
}

// Git 概览类型
export interface GitOverview {
  current_branch: string
  ahead: number
  behind: number
  working_changes: number
}
