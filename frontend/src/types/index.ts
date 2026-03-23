export interface Knowledge {
  id: string
  title: string
  content: string
  category: string
  tags: string[]
  summary?: string
  created_at: string
  updated_at: string
}

export interface Category {
  name: string
  count: number
}

export interface SearchResult {
  knowledge: Knowledge
  score: number
}
