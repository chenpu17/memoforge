import React, { startTransition, useCallback, useEffect, useRef } from 'react'
import { shallow } from 'zustand/shallow'
import { Editor } from './Editor'
import { useAppStore, type EditorMode } from '../stores/appStore'
import { clearKnowledgeDraft, loadKnowledgeDraft, saveKnowledgeDraft } from '../lib/knowledgeDrafts'

interface CurrentKnowledgeEditorPaneProps {
  readonly: boolean
  editorMode: EditorMode
}

export const CurrentKnowledgeEditorPane: React.FC<CurrentKnowledgeEditorPaneProps> = React.memo(({
  readonly,
  editorMode,
}) => {
  const {
    currentKnowledgeId,
    currentKnowledgeTitle,
    currentKnowledgeCategory,
    currentKnowledgeContent,
    currentKnowledgeBaselineContent,
    setCurrentKnowledgeContent,
  } = useAppStore((state) => ({
    currentKnowledgeId: state.currentKnowledge?.id ?? null,
    currentKnowledgeTitle: state.currentKnowledge?.title ?? '',
    currentKnowledgeCategory: state.currentKnowledge?.category,
    currentKnowledgeContent: state.currentKnowledgeContent,
    currentKnowledgeBaselineContent: state.currentKnowledgeBaseline?.content ?? '',
    setCurrentKnowledgeContent: state.setCurrentKnowledgeContent,
  }), shallow)
  const hydrationRef = useRef<string | null>(null)

  const handleChange = useCallback((content: string) => {
    if (!currentKnowledgeId) return
    startTransition(() => {
      setCurrentKnowledgeContent(content)
    })
  }, [currentKnowledgeId, setCurrentKnowledgeContent])

  const handleTransformContent = useCallback((transform: (current: string) => string | null) => {
    if (!currentKnowledgeId) return

    startTransition(() => {
      const current = useAppStore.getState().currentKnowledgeContent
      const next = transform(current)
      if (next !== null && next !== current) {
        setCurrentKnowledgeContent(next)
      }
    })
  }, [currentKnowledgeId, setCurrentKnowledgeContent])

  useEffect(() => {
    if (!currentKnowledgeId) return

    hydrationRef.current = currentKnowledgeId
    const draft = loadKnowledgeDraft(currentKnowledgeId)
    if (draft !== null && draft !== currentKnowledgeBaselineContent && draft !== currentKnowledgeContent) {
      setCurrentKnowledgeContent(draft)
    }

    queueMicrotask(() => {
      hydrationRef.current = null
    })
  }, [currentKnowledgeBaselineContent, currentKnowledgeContent, currentKnowledgeId, setCurrentKnowledgeContent])

  useEffect(() => {
    if (!currentKnowledgeId || hydrationRef.current === currentKnowledgeId) return

    if (currentKnowledgeContent === currentKnowledgeBaselineContent) {
      clearKnowledgeDraft(currentKnowledgeId)
      return
    }

    const timer = window.setTimeout(() => {
      saveKnowledgeDraft(currentKnowledgeId, currentKnowledgeContent)
    }, 280)

    return () => window.clearTimeout(timer)
  }, [currentKnowledgeBaselineContent, currentKnowledgeContent, currentKnowledgeId])

  if (!currentKnowledgeId) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400">
        选择或创建知识开始编辑
      </div>
    )
  }

  return (
    <Editor
      value={currentKnowledgeContent}
      onChange={handleChange}
      onTransformContent={handleTransformContent}
      mode={readonly ? 'read' : editorMode}
      knowledgePath={currentKnowledgeId}
      knowledgeTitle={currentKnowledgeTitle}
      knowledgeCategory={currentKnowledgeCategory}
      readOnly={readonly}
    />
  )
})
