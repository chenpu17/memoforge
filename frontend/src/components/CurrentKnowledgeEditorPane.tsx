import React, { startTransition, useCallback, useEffect, useRef } from 'react'
import { shallow } from 'zustand/shallow'
import { Editor } from './Editor'
import { GettingStartedCard } from './GettingStartedCard'
import { useAppStore, type EditorMode } from '../stores/appStore'
import { clearKnowledgeDraft, loadKnowledgeDraft, saveKnowledgeDraft } from '../lib/knowledgeDrafts'

interface CurrentKnowledgeEditorPaneProps {
  readonly: boolean
  editorMode: EditorMode
  onCreateKnowledge?: () => void
  onOpenSettings?: () => void
}

export const CurrentKnowledgeEditorPane: React.FC<CurrentKnowledgeEditorPaneProps> = React.memo(({
  readonly,
  editorMode,
  onCreateKnowledge,
  onOpenSettings,
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
      <div className="flex h-full items-center justify-center px-6 py-10">
        <GettingStartedCard
          title="选择一篇知识，或从这里开始创建"
          description="当前还没有打开文档。建议先创建第一篇知识，或打开设置复制 MCP 配置，让 Claude Code / OpenCode 通过 Draft 流安全写入。"
          primaryAction={readonly || !onCreateKnowledge ? undefined : {
            label: '新建第一篇知识',
            onClick: onCreateKnowledge,
          }}
          secondaryAction={onOpenSettings ? {
            label: '打开设置',
            onClick: onOpenSettings,
          } : undefined}
        />
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
