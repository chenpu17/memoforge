import { create } from 'zustand'
import type { Knowledge, SearchResult } from '../types'

interface AppState {
  knowledgeList: Knowledge[]
  currentKnowledge: Knowledge | null
  categories: string[]
  searchResults: SearchResult[]
  isSearching: boolean

  setKnowledgeList: (list: Knowledge[]) => void
  setCurrentKnowledge: (knowledge: Knowledge | null) => void
  setCategories: (categories: string[]) => void
  setSearchResults: (results: SearchResult[]) => void
  setIsSearching: (isSearching: boolean) => void
}

export const useAppStore = create<AppState>((set) => ({
  knowledgeList: [],
  currentKnowledge: null,
  categories: [],
  searchResults: [],
  isSearching: false,

  setKnowledgeList: (list) => set({ knowledgeList: list }),
  setCurrentKnowledge: (knowledge) => set({ currentKnowledge: knowledge }),
  setCategories: (categories) => set({ categories }),
  setSearchResults: (results) => set({ searchResults: results }),
  setIsSearching: (isSearching) => set({ isSearching }),
}))
