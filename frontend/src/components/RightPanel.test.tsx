import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { RightPanel } from './RightPanel'

vi.mock('./GitPanel', () => ({
  GitPanel: () => <div>git-panel-content</div>,
}))

vi.mock('./MetadataPanel', () => ({
  MetadataPanel: () => <div>metadata-panel-content</div>,
}))

vi.mock('./BacklinksPanel', () => ({
  BacklinksPanel: () => <div>backlinks-panel-content</div>,
}))

describe('RightPanel', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('opens the git panel while a knowledge item is selected', async () => {
    const { container } = render(
      <RightPanel
        readonly={false}
        isGitRepo
        hasKnowledge
        folderMode={false}
      />,
    )

    const gitRailButton = container.querySelector('.right-panel-rail button[data-label="Git"]')
    expect(gitRailButton).not.toBeNull()

    fireEvent.click(gitRailButton as HTMLElement)

    await waitFor(() => {
      expect(screen.getByText('git-panel-content')).toBeInTheDocument()
    })
  })

  it('restores the last knowledge tab after leaving folder mode', async () => {
    const { container, rerender } = render(
      <RightPanel
        readonly={false}
        isGitRepo
        hasKnowledge={false}
        folderMode
      />,
    )

    const gitRailButton = container.querySelector('.right-panel-rail button[data-label="Git"]')
    expect(gitRailButton).not.toBeNull()

    fireEvent.click(gitRailButton as HTMLElement)

    await waitFor(() => {
      expect(screen.getByText('git-panel-content')).toBeInTheDocument()
    })

    rerender(
      <RightPanel
        readonly={false}
        isGitRepo
        hasKnowledge
        folderMode={false}
      />,
    )

    await waitFor(() => {
      expect(screen.getByText('metadata-panel-content')).toBeInTheDocument()
    })
  })
})
