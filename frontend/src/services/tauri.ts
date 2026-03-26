import type { Category, Knowledge, KnowledgeWithStale, GrepMatch, PaginatedKnowledge } from '../types'
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

  async grep(query: string, tags?: string[], limit?: number): Promise<GrepMatch[]> {
    if (isTauriEnv()) {
      return invoke('grep_cmd', { query, tags, limit: limit || 50 })
    }
    return getHttpClient().grep(query, tags, limit)
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
}

// Event types for frontend
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
