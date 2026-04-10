import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useKnowledgeNavigation } from './useKnowledgeNavigation'
import { useAppStore } from '../stores/appStore'

const getKnowledgeWithStaleMock = vi.fn()
const getKnowledgeMock = vi.fn()

vi.mock('../services/tauri', () => ({
  tauriService: {
    getKnowledge: (...args: unknown[]) => getKnowledgeMock(...args),
    getKnowledgeWithStale: (...args: unknown[]) => getKnowledgeWithStaleMock(...args),
  },
}))

describe('useKnowledgeNavigation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.localStorage.clear()
    useAppStore.setState({
      currentKnowledge: null,
      currentKnowledgeBaseline: null,
      currentKnowledgeContent: '',
      editorMode: 'read',
      editorSelection: null,
    })
  })

  it('applies the persisted default editor mode when opening knowledge', async () => {
    window.localStorage.setItem('memoforge.settings.defaultEditorMode', JSON.stringify('rich'))
    getKnowledgeWithStaleMock.mockResolvedValue({
      id: 'notes/demo',
      title: 'Demo',
      content: '# Demo',
      tags: [],
      category: null,
      summary: null,
      created_at: '2026-04-08T00:00:00Z',
      updated_at: '2026-04-08T00:00:00Z',
      summary_stale: false,
    })

    const { result } = renderHook(() => useKnowledgeNavigation())

    await act(async () => {
      await result.current.openKnowledgeWithStale('notes/demo')
    })

    const state = useAppStore.getState()
    expect(getKnowledgeWithStaleMock).toHaveBeenCalledWith('notes/demo')
    expect(state.currentKnowledge?.id).toBe('notes/demo')
    expect(state.editorMode).toBe('rich')
  })
})
