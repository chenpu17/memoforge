import { create } from 'zustand'
import type { Category, Knowledge, GrepMatch } from '../types'

type EditorMode = 'read' | 'edit'

interface TagWithCount {
  tag: string
  count: number
}

interface AppState {
  knowledgeList: Knowledge[]
  currentKnowledge: Knowledge | null
  categories: Category[]
  searchResults: Knowledge[]
  grepResults: GrepMatch[]
  isSearching: boolean
  editorMode: EditorMode
  allTags: TagWithCount[]
  selectedTags: string[]
  // Pagination state
  hasMore: boolean
  offset: number

  setKnowledgeList: (list: Knowledge[]) => void
  appendKnowledgeList: (items: Knowledge[]) => void
  setHasMore: (hasMore: boolean) => void
  setOffset: (offset: number) => void
  setCurrentKnowledge: (knowledge: Knowledge | null) => void
  setCategories: (categories: Category[]) => void
  setSearchResults: (results: Knowledge[]) => void
  setGrepResults: (results: GrepMatch[]) => void
  setIsSearching: (isSearching: boolean) => void
  setEditorMode: (mode: EditorMode) => void
  setAllTags: (tags: TagWithCount[]) => void
  toggleTag: (tag: string) => void
}

export const useAppStore = create<AppState>((set) => ({
  knowledgeList: [],
  currentKnowledge: null,
  categories: [],
  searchResults: [],
  grepResults: [],
  isSearching: false,
  editorMode: 'read',
  allTags: [],
  selectedTags: [],
  hasMore: false,
  offset: 0,

  setKnowledgeList: (list) => set({ knowledgeList: list }),
  appendKnowledgeList: (items) => set((state) => ({
    knowledgeList: [...state.knowledgeList, ...items]
  })),
  setHasMore: (hasMore) => set({ hasMore }),
  setOffset: (offset) => set({ offset }),
  setCurrentKnowledge: (knowledge) => set({ currentKnowledge: knowledge }),
  setCategories: (categories) => set({ categories }),
  setSearchResults: (results) => set({ searchResults: results }),
  setGrepResults: (results) => set({ grepResults: results }),
  setIsSearching: (isSearching) => set({ isSearching }),
  setEditorMode: (mode) => set({ editorMode: mode }),
  setAllTags: (tags) => set({ allTags: tags }),
  toggleTag: (tag) => set((state) => ({
    selectedTags: state.selectedTags.includes(tag)
      ? state.selectedTags.filter(t => t !== tag)
      : [...state.selectedTags, tag]
  })),
}))
