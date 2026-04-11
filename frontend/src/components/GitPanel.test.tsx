import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { GitPanel } from './GitPanel'

const gitStatusMock = vi.fn()
const gitCommitMock = vi.fn()
const gitPullMock = vi.fn()
const gitPushMock = vi.fn()

vi.mock('../services/tauri', () => ({
  tauriService: {
    gitStatus: (...args: unknown[]) => gitStatusMock(...args),
    gitCommit: (...args: unknown[]) => gitCommitMock(...args),
    gitPull: (...args: unknown[]) => gitPullMock(...args),
    gitPush: (...args: unknown[]) => gitPushMock(...args),
  },
}))

describe('GitPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    gitPullMock.mockResolvedValue(undefined)
    gitPushMock.mockResolvedValue(undefined)
  })

  it('reports git status count on initial load and after commit', async () => {
    const onStatusChange = vi.fn()
    gitStatusMock.mockResolvedValue(['M programming/alpha.md'])
    gitCommitMock.mockResolvedValue(undefined)

    render(<GitPanel compact onStatusChange={onStatusChange} />)

    await waitFor(() => {
      expect(screen.getByText('M programming/alpha.md')).toBeInTheDocument()
    })
    expect(gitStatusMock).toHaveBeenCalledTimes(1)
    expect(onStatusChange).toHaveBeenCalledWith(1)

    gitStatusMock.mockResolvedValue([])

    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'fix sidebar status sync' },
    })
    fireEvent.click(screen.getAllByRole('button')[0])

    await waitFor(() => {
      expect(gitCommitMock).toHaveBeenCalledWith('fix sidebar status sync')
    })
    await waitFor(() => {
      expect(gitStatusMock).toHaveBeenCalledTimes(2)
      expect(onStatusChange).toHaveBeenLastCalledWith(0)
      expect(screen.queryByText('M programming/alpha.md')).not.toBeInTheDocument()
    })
  })

  it('reloads status when refresh token changes', async () => {
    const onStatusChange = vi.fn()
    gitStatusMock.mockResolvedValue(['M programming/alpha.md'])

    const { rerender } = render(<GitPanel compact refreshToken={0} onStatusChange={onStatusChange} />)

    await waitFor(() => {
      expect(screen.getByText('M programming/alpha.md')).toBeInTheDocument()
    })

    gitStatusMock.mockResolvedValue([])
    rerender(<GitPanel compact refreshToken={1} onStatusChange={onStatusChange} />)

    await waitFor(() => {
      expect(gitStatusMock).toHaveBeenCalledTimes(2)
      expect(onStatusChange).toHaveBeenLastCalledWith(0)
      expect(screen.queryByText('M programming/alpha.md')).not.toBeInTheDocument()
    })
  })

  it('confirms pull when working tree is dirty, then refreshes repository state', async () => {
    const onRepoChanged = vi.fn()
    gitStatusMock.mockResolvedValue(['M programming/alpha.md'])

    const { container } = render(<GitPanel compact onRepoChanged={onRepoChanged} />)

    await waitFor(() => {
      expect(screen.getByText('M programming/alpha.md')).toBeInTheDocument()
    })

    const pullButton = container.querySelector('button svg.lucide-arrow-down')?.closest('button')
    expect(pullButton).not.toBeNull()

    fireEvent.click(pullButton as HTMLElement)

    await waitFor(() => {
      expect(screen.getByText('仍然 Pull')).toBeInTheDocument()
    })

    expect(gitPullMock).not.toHaveBeenCalled()

    gitStatusMock.mockResolvedValue([])
    fireEvent.click(screen.getByRole('button', { name: '仍然 Pull' }))

    await waitFor(() => {
      expect(gitPullMock).toHaveBeenCalledTimes(1)
    })
    await waitFor(() => {
      expect(gitStatusMock).toHaveBeenCalledTimes(2)
      expect(onRepoChanged).toHaveBeenCalledTimes(1)
      expect(screen.queryByText('仍然 Pull')).not.toBeInTheDocument()
    })
  })
})
