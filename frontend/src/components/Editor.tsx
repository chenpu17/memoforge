import React, { Suspense, lazy } from 'react'
import type { EditorMode } from '../stores/appStore'

export interface EditorProps {
  value: string
  onChange: (value: string) => void
  onTransformContent?: (transform: (current: string) => string | null) => void
  mode: EditorMode
  knowledgePath?: string
  knowledgeTitle?: string
  knowledgeCategory?: string
  readOnly?: boolean
}

const ReadEditor = lazy(async () => {
  const module = await import('./EditorRead')
  return { default: module.EditorRead }
})

const WriteEditor = lazy(async () => {
  const module = await import('./EditorEdit')
  return { default: module.EditorEdit }
})

const RichEditor = lazy(async () => {
  const module = await import('./EditorRich')
  return { default: module.EditorRich }
})

const EditorFallback = () => (
  <div className="flex h-full w-full items-center justify-center text-sm text-neutral-400">
    加载编辑器中...
  </div>
)

export const Editor: React.FC<EditorProps> = (props) => (
  <Suspense fallback={<EditorFallback />}>
    {props.mode === 'read'
      ? <ReadEditor {...props} />
      : props.mode === 'rich'
        ? <RichEditor {...props} />
        : <WriteEditor {...props} />}
  </Suspense>
)
