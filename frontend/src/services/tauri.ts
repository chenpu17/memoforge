import { invoke } from '@tauri-apps/api/tauri'
import type { Knowledge, SearchResult } from '../types'

export const tauriService = {
  async listKnowledge(): Promise<Knowledge[]> {
    return invoke('list_knowledge')
  },

  async getKnowledge(id: string): Promise<Knowledge> {
    return invoke('get_knowledge', { id })
  },

  async createKnowledge(knowledge: Omit<Knowledge, 'id' | 'created_at' | 'updated_at'>): Promise<Knowledge> {
    return invoke('create_knowledge', { knowledge })
  },

  async updateKnowledge(id: string, knowledge: Partial<Knowledge>): Promise<Knowledge> {
    return invoke('update_knowledge', { id, knowledge })
  },

  async deleteKnowledge(id: string): Promise<void> {
    return invoke('delete_knowledge', { id })
  },

  async searchKnowledge(query: string, tags?: string[]): Promise<SearchResult[]> {
    return invoke('search_knowledge', { query, tags })
  },

  async getCategories(): Promise<string[]> {
    return invoke('get_categories')
  },

  async gitStatus(): Promise<string> {
    return invoke('git_status')
  },

  async gitCommit(message: string): Promise<void> {
    return invoke('git_commit', { message })
  },

  async gitPush(): Promise<void> {
    return invoke('git_push')
  },
}
