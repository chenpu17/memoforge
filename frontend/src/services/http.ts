/**
 * HTTP API Service
 * REST API client for web access
 */

import type { Category, Knowledge, KnowledgeWithStale, GrepMatch } from '../types'

export interface HttpConfig {
  baseUrl: string
  authToken?: string
}

export interface StatusResponse {
  initialized: boolean
  knowledge_count: number
  category_count: number
  git_initialized: boolean
  readonly: boolean
}

export interface KnowledgeListResponse {
  items: Knowledge[]
  total: number
}

export interface TagsResponse {
  tags: string[]
  total: number
}

export interface CategoryListResponse {
  categories: Category[]
}

export interface GrepResponse {
  results: GrepMatch[]
  total: number
}

export interface CreateResponse {
  id: string
  created: boolean
}

export interface ImportBody {
  source_path: string
  generate_frontmatter: boolean
  auto_categories: boolean
  dry_run: boolean
}

export interface ApiError {
  error: {
    code: number
    message: string
  }
}

class HttpService {
  private baseUrl: string
  private authToken?: string

  constructor(config: HttpConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '')
    this.authToken = config.authToken
  }

  setAuthToken(token: string | undefined) {
    this.authToken = token
  }

  private async request<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`

    const headers: Record<string, string> = {
      ...((options.headers as Record<string, string>) || {}),
    }

    const method = options.method?.toUpperCase() || 'GET'
    if (options.body != null && method !== 'GET' && method !== 'HEAD' && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json'
    }

    if (this.authToken) {
      headers['Authorization'] = `Bearer ${this.authToken}`
    }

    const response = await fetch(url, {
      ...options,
      headers,
    })

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Unauthorized')
      }
      if (response.status === 403) {
        throw new Error('Forbidden - Read-only mode')
      }
      if (response.status === 404) {
        throw new Error('Not found')
      }

      try {
        const error: ApiError = await response.json()
        throw new Error(error.error.message)
      } catch {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
    }

    if (response.status === 204) {
      return undefined as T
    }

    return response.json()
  }

  // Status
  async getStatus(): Promise<StatusResponse> {
    return this.request<StatusResponse>('/api/status')
  }

  // Knowledge
  async listKnowledge(level = 1, options?: {
    categoryId?: string
    tags?: string[]
    limit?: number
    offset?: number
  }): Promise<KnowledgeListResponse> {
    const params = new URLSearchParams()
    params.set('level', String(level))
    if (options?.categoryId) params.set('category_id', options.categoryId)
    if (options?.tags?.length) params.set('tags', options.tags.join(','))
    if (options?.limit) params.set('limit', String(options.limit))
    if (options?.offset) params.set('offset', String(options.offset))

    return this.request<KnowledgeListResponse>(`/api/knowledge?${params}`)
  }

  async getKnowledge(id: string, level = 2): Promise<Knowledge> {
    const params = new URLSearchParams()
    params.set('id', id)
    params.set('level', String(level))
    return this.request<Knowledge>(`/api/knowledge/item?${params}`)
  }

  async getKnowledgeWithStale(id: string): Promise<KnowledgeWithStale> {
    const params = new URLSearchParams()
    params.set('id', id)
    return this.request<KnowledgeWithStale>(`/api/knowledge/stale?${params}`)
  }

  async createKnowledge(knowledge: Omit<Knowledge, 'id' | 'created_at' | 'updated_at'>): Promise<string> {
    const response = await this.request<CreateResponse>('/api/knowledge', {
      method: 'POST',
      body: JSON.stringify({
        title: knowledge.title,
        content: knowledge.content ?? '',
        tags: knowledge.tags,
        category_id: knowledge.category || null,
        summary: knowledge.summary || null,
      }),
    })
    return response.id
  }

  async updateKnowledge(id: string, knowledge: Partial<Knowledge>): Promise<void> {
    const params = new URLSearchParams()
    params.set('id', id)
    await this.request(`/api/knowledge/item?${params}`, {
      method: 'PUT',
      body: JSON.stringify({
        title: knowledge.title ?? null,
        content: knowledge.content ?? null,
        tags: knowledge.tags ?? null,
        category: knowledge.category ?? null,
        summary: knowledge.summary ?? null,
      }),
    })
  }

  async deleteKnowledge(id: string): Promise<void> {
    const params = new URLSearchParams()
    params.set('id', id)
    await this.request(`/api/knowledge/item?${params}`, {
      method: 'DELETE',
    })
  }

  // Categories
  async getCategories(): Promise<Category[]> {
    const response = await this.request<CategoryListResponse>('/api/categories')
    return response.categories
  }

  async createCategory(name: string, parentId?: string, description?: string): Promise<string> {
    const response = await this.request<CreateResponse>('/api/categories', {
      method: 'POST',
      body: JSON.stringify({
        name,
        parent_id: parentId,
        description,
      }),
    })
    return response.id
  }

  async updateCategory(id: string, name?: string, description?: string): Promise<void> {
    await this.request(`/api/categories/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify({
        name,
        description,
      }),
    })
  }

  async deleteCategory(id: string): Promise<void> {
    await this.request(`/api/categories/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    })
  }

  // Tags
  async getTags(prefix?: string): Promise<string[]> {
    const params = new URLSearchParams()
    if (prefix) params.set('prefix', prefix)
    const response = await this.request<TagsResponse>(`/api/tags?${params}`)
    return response.tags
  }

  async getTagsWithCounts(): Promise<Array<{ tag: string; count: number }>> {
    const response = await this.request<{ tags: Array<{ tag: string; count: number }>; total: number }>('/api/tags/with-counts')
    return response.tags
  }

  // Search
  async searchKnowledge(query: string, tags?: string[], limit?: number): Promise<Knowledge[]> {
    const params = new URLSearchParams()
    params.set('query', query)
    if (tags?.length) params.set('tags', tags.join(','))
    if (limit) params.set('limit', String(limit))
    const response = await this.request<KnowledgeListResponse>(`/api/search?${params}`)
    return response.items
  }

  // Grep
  async grep(query: string, tags?: string[], limit?: number): Promise<GrepMatch[]> {
    const params = new URLSearchParams()
    params.set('query', query)
    if (tags?.length) params.set('tags', tags.join(','))
    if (limit) params.set('limit', String(limit))
    const response = await this.request<GrepResponse>(`/api/grep?${params}`)
    return response.results
  }

  // KB Management
  async initKb(path: string, mode: 'open' | 'new'): Promise<void> {
    await this.request('/api/kb/init', {
      method: 'POST',
      body: JSON.stringify({ path, mode }),
    })
  }

  async listKnowledgeBases(): Promise<Array<{ path: string; name: string; last_accessed: string; is_default: boolean }>> {
    return this.request('/api/kb/list')
  }

  async getCurrentKb(): Promise<string | null> {
    return this.request('/api/kb/current')
  }

  async switchKb(path: string): Promise<void> {
    await this.request('/api/kb/switch', {
      method: 'POST',
      body: JSON.stringify({ path }),
    })
  }

  async unregisterKb(path: string): Promise<void> {
    await this.request('/api/kb/unregister', {
      method: 'POST',
      body: JSON.stringify({ path }),
    })
  }

  // Preview delete
  async previewDeleteKnowledge(id: string): Promise<DeletePreview> {
    const params = new URLSearchParams()
    params.set('id', id)
    return this.request<DeletePreview>(`/api/knowledge/delete-preview?${params}`)
  }

  // Preview move
  async moveKnowledge(id: string, newCategoryId: string): Promise<void> {
    const params = new URLSearchParams()
    params.set('id', id)
    await this.request(`/api/knowledge/move?${params}`, {
      method: 'POST',
      body: JSON.stringify({ new_category_id: newCategoryId }),
    })
  }

  async previewMoveKnowledge(id: string, newCategoryId: string): Promise<MovePreview> {
    const params = new URLSearchParams()
    params.set('id', id)
    return this.request<MovePreview>(`/api/knowledge/move-preview?${params}`, {
      method: 'POST',
      body: JSON.stringify({ new_category_id: newCategoryId }),
    })
  }

  // Get backlinks
  async getBacklinks(id: string): Promise<BacklinksResult> {
    const params = new URLSearchParams()
    params.set('id', id)
    return this.request<BacklinksResult>(`/api/knowledge/backlinks?${params}`)
  }

  // Get related
  async getRelated(id: string): Promise<RelatedResult> {
    const params = new URLSearchParams()
    params.set('id', id)
    return this.request<RelatedResult>(`/api/knowledge/related?${params}`)
  }

  async getKnowledgeGraph(): Promise<KnowledgeGraph> {
    return this.request<KnowledgeGraph>('/api/knowledge/graph')
  }

  async previewImport(sourcePath: string): Promise<ImportStats> {
    return this.request<ImportStats>('/api/import/preview', {
      method: 'POST',
      body: JSON.stringify({
        source_path: sourcePath,
        generate_frontmatter: true,
        auto_categories: true,
        dry_run: true,
      } satisfies ImportBody),
    })
  }

  async importFolder(
    sourcePath: string,
    generateFrontmatter: boolean,
    autoCategories: boolean,
    dryRun: boolean
  ): Promise<ImportStats> {
    return this.request<ImportStats>('/api/import', {
      method: 'POST',
      body: JSON.stringify({
        source_path: sourcePath,
        generate_frontmatter: generateFrontmatter,
        auto_categories: autoCategories,
        dry_run: dryRun,
      } satisfies ImportBody),
    })
  }

  // Git operations
  async gitStatus(): Promise<string[]> {
    const response = await this.request<{ files: string[] }>('/api/git/status')
    return response.files
  }

  async gitCommit(message: string): Promise<void> {
    await this.request('/api/git/commit', {
      method: 'POST',
      body: JSON.stringify({ message }),
    })
  }

  async gitPush(): Promise<void> {
    await this.request('/api/git/push', {
      method: 'POST',
    })
  }

  async gitPull(): Promise<void> {
    await this.request('/api/git/pull', {
      method: 'POST',
    })
  }
}

// Additional types for HTTP service
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

export interface ReferenceInfo {
  path: string
  title: string
  lines: number[]
}

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

// Singleton instance
let httpService: HttpService | null = null

export function getHttpService(config?: HttpConfig): HttpService {
  if (!httpService && config) {
    httpService = new HttpService(config)
  }
  if (!httpService) {
    throw new Error('HTTP service not initialized')
  }
  return httpService
}

export function initHttpService(config: HttpConfig): HttpService {
  httpService = new HttpService(config)
  return httpService
}

export { HttpService }
