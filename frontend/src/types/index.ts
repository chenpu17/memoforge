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
