import { useCallback } from 'react'
import { useAppStore } from '../stores/appStore'
import { tauriService } from '../services/tauri'
import { hasKnowledgeUnsavedChanges } from '../lib/knowledgeChanges'
import { getDefaultEditorMode } from '../lib/settings'
import type { Knowledge } from '../types'

const DISCARD_MESSAGE = '当前知识有未保存内容，确认放弃修改并继续切换吗？'

export function useKnowledgeNavigation() {
  const setCurrentKnowledge = useAppStore((state) => state.setCurrentKnowledge)
  const setEditorMode = useAppStore((state) => state.setEditorMode)

  const confirmDiscardIfNeeded = useCallback(() => {
    const { currentKnowledge, currentKnowledgeBaseline, currentKnowledgeContent } = useAppStore.getState()
    const hasUnsavedChanges = hasKnowledgeUnsavedChanges(
      currentKnowledge,
      currentKnowledgeBaseline,
      currentKnowledgeContent,
    )

    if (!hasUnsavedChanges) return true
    return window.confirm(DISCARD_MESSAGE)
  }, [])

  const setKnowledgeWithGuard = useCallback((knowledge: Knowledge | null) => {
    if (knowledge !== null && !confirmDiscardIfNeeded()) return false
    setCurrentKnowledge(knowledge)
    return true
  }, [confirmDiscardIfNeeded, setCurrentKnowledge])

  const openKnowledge = useCallback(async (knowledgeId: string, level = 2) => {
    if (!confirmDiscardIfNeeded()) return false
    const knowledge = await tauriService.getKnowledge(knowledgeId, level)
    setCurrentKnowledge(knowledge)
    setEditorMode(getDefaultEditorMode())
    return true
  }, [confirmDiscardIfNeeded, setCurrentKnowledge, setEditorMode])

  const openKnowledgeWithStale = useCallback(async (knowledgeId: string) => {
    if (!confirmDiscardIfNeeded()) return false
    const knowledge = await tauriService.getKnowledgeWithStale(knowledgeId)
    setCurrentKnowledge(knowledge)
    setEditorMode(getDefaultEditorMode())
    return true
  }, [confirmDiscardIfNeeded, setCurrentKnowledge, setEditorMode])

  return {
    confirmDiscardIfNeeded,
    setKnowledgeWithGuard,
    openKnowledge,
    openKnowledgeWithStale,
  }
}
