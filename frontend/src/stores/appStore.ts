import { create } from 'zustand'
import type { Category, Knowledge, GrepMatch } from '../types'
import type { WorkspaceOverview } from '../services/tauri'

export type EditorMode = 'read' | 'markdown' | 'rich'
export type AgentPanel = 'inbox' | 'sessions' | 'review' | 'reliability' | 'packs' | null

interface TagWithCount {
  tag: string
  count: number
}

interface EditorSelectionState {
  startLine: number
  endLine: number
  textLength: number
}

interface AppState {
  knowledgeList: Knowledge[]
  currentKnowledge: Knowledge | null
  currentKnowledgeBaseline: Knowledge | null
  currentKnowledgeContent: string
  categories: Category[]
  searchResults: Knowledge[]
  grepResults: GrepMatch[]
  isSearching: boolean
  editorMode: EditorMode
  editorSelection: EditorSelectionState | null
  allTags: TagWithCount[]
  selectedTags: string[]
  // Pagination state
  hasMore: boolean
  offset: number
  // Workspace overview
  workspaceOverview: WorkspaceOverview | null
  // Agent panel state
  activeAgentPanel: AgentPanel

  setKnowledgeList: (list: Knowledge[]) => void
  appendKnowledgeList: (items: Knowledge[]) => void
  setHasMore: (hasMore: boolean) => void
  setOffset: (offset: number) => void
  setCurrentKnowledge: (knowledge: Knowledge | null) => void
  patchCurrentKnowledge: (patch: Partial<Knowledge>) => void
  setCurrentKnowledgeContent: (content: string) => void
  setCategories: (categories: Category[]) => void
  setSearchResults: (results: Knowledge[]) => void
  setGrepResults: (results: GrepMatch[]) => void
  setIsSearching: (isSearching: boolean) => void
  setEditorMode: (mode: EditorMode) => void
  setEditorSelection: (selection: EditorSelectionState) => void
  clearEditorSelection: () => void
  setAllTags: (tags: TagWithCount[]) => void
  toggleTag: (tag: string) => void
  setWorkspaceOverview: (overview: WorkspaceOverview) => void
  setActiveAgentPanel: (panel: AgentPanel) => void
}

export const useAppStore = create<AppState>((set) => ({
  knowledgeList: [],
  currentKnowledge: null,
  currentKnowledgeBaseline: null,
  currentKnowledgeContent: '',
  categories: [],
  searchResults: [],
  grepResults: [],
  isSearching: false,
  editorMode: 'read',
  editorSelection: null,
  allTags: [],
  selectedTags: [],
  hasMore: false,
  offset: 0,
  workspaceOverview: null,
  activeAgentPanel: null,

  setKnowledgeList: (list) => set({ knowledgeList: list }),
  appendKnowledgeList: (items) => set((state) => ({
    knowledgeList: [...state.knowledgeList, ...items]
  })),
  setHasMore: (hasMore) => set({ hasMore }),
  setOffset: (offset) => set({ offset }),
  setCurrentKnowledge: (knowledge) => set({
    currentKnowledge: knowledge,
    currentKnowledgeBaseline: knowledge ? { ...knowledge } : null,
    currentKnowledgeContent: knowledge?.content ?? '',
    editorSelection: null,
  }),
  patchCurrentKnowledge: (patch) => set((state) => (
    state.currentKnowledge
      ? {
          currentKnowledge: {
            ...state.currentKnowledge,
            ...patch,
          },
        }
      : {}
  )),
  setCurrentKnowledgeContent: (content) => set({ currentKnowledgeContent: content }),
  setCategories: (categories) => set({ categories }),
  setSearchResults: (results) => set({ searchResults: results }),
  setGrepResults: (results) => set({ grepResults: results }),
  setIsSearching: (isSearching) => set({ isSearching }),
  setEditorMode: (mode) => set({ editorMode: mode }),
  setEditorSelection: (selection) => set({ editorSelection: selection }),
  clearEditorSelection: () => set({ editorSelection: null }),
  setAllTags: (tags) => set({ allTags: tags }),
  toggleTag: (tag) => set((state) => ({
    selectedTags: state.selectedTags.includes(tag)
      ? state.selectedTags.filter(t => t !== tag)
      : [...state.selectedTags, tag]
  })),
  setWorkspaceOverview: (overview) => set({ workspaceOverview: overview }),
  setActiveAgentPanel: (panel) => set({ activeAgentPanel: panel }),
}))
