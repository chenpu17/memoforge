/**
 * Unified API Layer
 * Automatically switches between Tauri and HTTP based on environment
 */

import type { Category, Knowledge, KnowledgeWithStale, GrepMatch } from '../types'
import { tauriService } from './tauri'
import { getHttpService, initHttpService } from './http'

// Check if running in Tauri
const isTauri = typeof window !== 'undefined' && '__TAURI__' in window

// API configuration
export interface ApiConfig {
  http?: {
    baseUrl: string
    authToken?: string
  }
}

// Initialize API based on environment
export function initApi(config: ApiConfig): void {
  if (!isTauri && config.http) {
    initHttpService(config.http)
  }
}

/**
 * Unified API that works in both Tauri and Web environments
 */
export const api = {
  // Status
  async getStatus(): Promise<{ initialized: boolean; kb_path: string | null }> {
    if (isTauri) {
      return tauriService.getStatus()
    }
    // HTTP mode: assume initialized if we can reach the server
    const http = getHttpService()
    const status = await http.getStatus()
    return {
      initialized: status.initialized,
      kb_path: null, // HTTP doesn't expose kb_path
    }
  },

  // Knowledge CRUD
  async listKnowledge(level = 1): Promise<Knowledge[]> {
    if (isTauri) {
      const result = await tauriService.listKnowledge(level)
      return result.items
    }
    const http = getHttpService()
    const response = await http.listKnowledge(level)
    return response.items
  },

  async getKnowledge(id: string, level = 2): Promise<Knowledge> {
    if (isTauri) {
      return tauriService.getKnowledge(id, level)
    }
    const http = getHttpService()
    return http.getKnowledge(id, level)
  },

  async getKnowledgeWithStale(id: string): Promise<KnowledgeWithStale> {
    if (isTauri) {
      return tauriService.getKnowledgeWithStale(id)
    }
    const http = getHttpService()
    return http.getKnowledgeWithStale(id)
  },

  async createKnowledge(knowledge: Omit<Knowledge, 'id' | 'created_at' | 'updated_at'>): Promise<string> {
    if (isTauri) {
      return tauriService.createKnowledge(knowledge)
    }
    const http = getHttpService()
    return http.createKnowledge(knowledge)
  },

  async updateKnowledge(id: string, knowledge: Partial<Knowledge>): Promise<void> {
    if (isTauri) {
      return tauriService.updateKnowledge(id, knowledge)
    }
    const http = getHttpService()
    return http.updateKnowledge(id, knowledge)
  },

  async deleteKnowledge(id: string): Promise<void> {
    if (isTauri) {
      return tauriService.deleteKnowledge(id)
    }
    const http = getHttpService()
    return http.deleteKnowledge(id)
  },

  // Categories
  async getCategories(): Promise<Category[]> {
    if (isTauri) {
      return tauriService.getCategories()
    }
    const http = getHttpService()
    return http.getCategories()
  },

  // Tags
  async getTags(prefix?: string): Promise<string[]> {
    if (isTauri) {
      return tauriService.getTags(prefix)
    }
    const http = getHttpService()
    return http.getTags(prefix)
  },

  // Search
  async searchKnowledge(query: string, tags?: string[]): Promise<Knowledge[]> {
    if (isTauri) {
      return tauriService.searchKnowledge(query, tags)
    }
    const http = getHttpService()
    return http.searchKnowledge(query, tags)
  },

  // Grep
  async grep(query: string, tags?: string[], limit?: number): Promise<GrepMatch[]> {
    if (isTauri) {
      return tauriService.grep(query, tags, limit)
    }
    const http = getHttpService()
    return http.grep(query, tags, limit)
  },

  // Git operations (Tauri only)
  async gitStatus(): Promise<string[]> {
    if (isTauri) {
      return tauriService.gitStatus()
    }
    // HTTP mode: not supported
    console.warn('Git operations not supported in web mode')
    return []
  },

  async gitCommit(message: string): Promise<void> {
    if (isTauri) {
      return tauriService.gitCommit(message)
    }
    console.warn('Git operations not supported in web mode')
  },

  async gitPush(): Promise<void> {
    if (isTauri) {
      return tauriService.gitPush()
    }
    console.warn('Git operations not supported in web mode')
  },

  async gitPull(): Promise<void> {
    if (isTauri) {
      return tauriService.gitPull()
    }
    console.warn('Git operations not supported in web mode')
  },

  // Multi-KB management (Tauri only)
  async listKnowledgeBases(): Promise<Array<{ path: string; name: string; last_accessed: string; is_default: boolean }>> {
    if (isTauri) {
      return tauriService.listKnowledgeBases()
    }
    // HTTP mode: not supported
    console.warn('Multi-KB management not supported in web mode')
    return []
  },

  async getCurrentKb(): Promise<string | null> {
    if (isTauri) {
      return tauriService.getCurrentKb()
    }
    // HTTP mode: not supported
    return null
  },

  async switchKb(path: string): Promise<void> {
    if (isTauri) {
      return tauriService.switchKb(path)
    }
    console.warn('Multi-KB management not supported in web mode')
  },

  async unregisterKb(path: string): Promise<void> {
    if (isTauri) {
      return tauriService.unregisterKb(path)
    }
    console.warn('Multi-KB management not supported in web mode')
  },

  async closeKb(): Promise<void> {
    if (isTauri) {
      return tauriService.closeKb()
    }
    console.warn('Multi-KB management not supported in web mode')
  },

  // Preview operations (Tauri only)
  async previewDeleteKnowledge(id: string): Promise<{ path: string; title: string; references: Array<{ path: string; title: string; lines: number[] }> }> {
    if (isTauri) {
      return tauriService.previewDeleteKnowledge(id)
    }
    // HTTP mode: return minimal preview
    return {
      path: id,
      title: 'Knowledge',
      references: [],
    }
  },

  async previewMoveKnowledge(id: string, newCategoryId: string): Promise<{ old_path: string; new_path: string; title: string; references: Array<{ path: string; title: string; lines: number[] }> }> {
    if (isTauri) {
      return tauriService.previewMoveKnowledge(id, newCategoryId)
    }
    return {
      old_path: id,
      new_path: `${newCategoryId}/${id}`,
      title: 'Knowledge',
      references: [],
    }
  },

  // Links (Tauri only for now)
  async getBacklinks(id: string): Promise<{ target_id: string; backlinks: Array<{ source_id: string; source_title: string; link_text: string; display_text: string | null; line_number: number }> }> {
    if (isTauri) {
      return tauriService.getBacklinks(id)
    }
    // HTTP mode: not yet implemented
    return {
      target_id: id,
      backlinks: [],
    }
  },

  async getRelated(id: string): Promise<{ id: string; related: Array<{ id: string; title: string; relation_type: 'Outgoing' | 'Incoming' | 'SharedTags' }> }> {
    if (isTauri) {
      return tauriService.getRelated(id)
    }
    // HTTP mode: not yet implemented
    return {
      id,
      related: [],
    }
  },

  // Import (Tauri only)
  async previewImport(sourcePath: string): Promise<{ total_files: number; files_with_frontmatter: number; files_imported: number; categories_created: number; results: Array<{ path: string; title: string; had_frontmatter: boolean; generated_frontmatter: boolean }> }> {
    if (isTauri) {
      return tauriService.previewImport(sourcePath)
    }
    console.warn('Import not supported in web mode')
    return {
      total_files: 0,
      files_with_frontmatter: 0,
      files_imported: 0,
      categories_created: 0,
      results: [],
    }
  },

  async importFolder(sourcePath: string, generateFrontmatter: boolean, autoCategories: boolean, dryRun: boolean): Promise<{ total_files: number; files_with_frontmatter: number; files_imported: number; categories_created: number; results: Array<{ path: string; title: string; had_frontmatter: boolean; generated_frontmatter: boolean }> }> {
    if (isTauri) {
      return tauriService.importFolder(sourcePath, generateFrontmatter, autoCategories, dryRun)
    }
    console.warn('Import not supported in web mode')
    return {
      total_files: 0,
      files_with_frontmatter: 0,
      files_imported: 0,
      categories_created: 0,
      results: [],
    }
  },

  // Events (Tauri only)
  async readEvents(limit: number): Promise<Array<{ time: string; source: string; action: string; path: string | null; detail: string }>> {
    if (isTauri) {
      return tauriService.readEvents(limit)
    }
    return []
  },
}

// Export environment check
export const isTauriEnv = isTauri
export const isWebEnv = !isTauri
