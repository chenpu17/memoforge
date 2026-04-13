import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CurrentKnowledgeEditorPane } from './CurrentKnowledgeEditorPane'

vi.mock('./Editor', () => ({
  Editor: () => <div>Editor</div>,
}))

vi.mock('../lib/knowledgeDrafts', () => ({
  clearKnowledgeDraft: vi.fn(),
  loadKnowledgeDraft: vi.fn(() => null),
  saveKnowledgeDraft: vi.fn(),
}))

vi.mock('../stores/appStore', () => ({
  useAppStore: (selector: (state: any) => any) => selector({
    currentKnowledge: null,
    currentKnowledgeBaseline: null,
    currentKnowledgeContent: '',
    setCurrentKnowledgeContent: vi.fn(),
  }),
}))

describe('CurrentKnowledgeEditorPane empty state', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows getting started guidance when no knowledge is selected', () => {
    render(
      <CurrentKnowledgeEditorPane
        readonly={false}
        editorMode="read"
        onCreateKnowledge={vi.fn()}
        onOpenSettings={vi.fn()}
      />
    )

    expect(screen.getByText('选择一篇知识，或从这里开始创建')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /新建第一篇知识/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /打开设置/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /下载 v0.3.0-beta.1/ })).toBeInTheDocument()
  })
})
