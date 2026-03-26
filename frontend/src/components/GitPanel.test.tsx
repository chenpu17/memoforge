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
    gitStatusMock
      .mockResolvedValueOnce(['M programming/alpha.md'])
      .mockResolvedValueOnce([])
    gitCommitMock.mockResolvedValue(undefined)

    render(<GitPanel compact onStatusChange={onStatusChange} />)

    await waitFor(() => {
      expect(screen.getByText('M programming/alpha.md')).toBeInTheDocument()
    })
    expect(onStatusChange).toHaveBeenCalledWith(1)

    fireEvent.change(screen.getByPlaceholderText('提交信息'), {
      target: { value: 'fix sidebar status sync' },
    })
    fireEvent.click(screen.getByRole('button', { name: '提交' }))

    await waitFor(() => {
      expect(gitCommitMock).toHaveBeenCalledWith('fix sidebar status sync')
    })
    await waitFor(() => {
      expect(screen.getByText('无变更')).toBeInTheDocument()
    })
    expect(onStatusChange).toHaveBeenLastCalledWith(0)
  })

  it('reloads status when refresh token changes', async () => {
    const onStatusChange = vi.fn()
    gitStatusMock
      .mockResolvedValueOnce(['M programming/alpha.md'])
      .mockResolvedValueOnce([])

    const { rerender } = render(<GitPanel compact refreshToken={0} onStatusChange={onStatusChange} />)

    await waitFor(() => {
      expect(screen.getByText('M programming/alpha.md')).toBeInTheDocument()
    })

    rerender(<GitPanel compact refreshToken={1} onStatusChange={onStatusChange} />)

    await waitFor(() => {
      expect(screen.getByText('无变更')).toBeInTheDocument()
    })
    expect(gitStatusMock).toHaveBeenCalledTimes(2)
    expect(onStatusChange).toHaveBeenLastCalledWith(0)
  })
})
