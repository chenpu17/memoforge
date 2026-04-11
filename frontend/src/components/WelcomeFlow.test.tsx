import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { WelcomeFlow } from './WelcomeFlow'

const selectFolderMock = vi.fn()

vi.mock('../services/tauri', () => ({
  tauriService: {
    selectFolder: (...args: unknown[]) => selectFolderMock(...args),
  },
  getErrorMessage: (error: unknown) => String(error),
}))

describe('WelcomeFlow clone path behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('recomputes derived clone path when repo url changes after selecting a parent directory', async () => {
    selectFolderMock.mockResolvedValue('/tmp/workspaces')

    render(<WelcomeFlow onKbReady={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: /Clone Git 仓库/ }))
    fireEvent.click(screen.getByRole('button', { name: '选择父目录' }))

    const repoInput = screen.getByPlaceholderText('https://github.com/user/repo.git')
    const pathInput = screen.getByPlaceholderText('选择本地存储路径') as HTMLInputElement

    await waitFor(() => {
      expect(pathInput.value).toBe('/tmp/workspaces')
    })

    fireEvent.change(repoInput, { target: { value: 'https://github.com/acme/demo.git' } })

    await waitFor(() => {
      expect(pathInput.value).toBe('/tmp/workspaces/demo')
    })
  })

  it('stops deriving the clone path after the user edits the target path manually', async () => {
    selectFolderMock.mockResolvedValue('/tmp/workspaces')

    render(<WelcomeFlow onKbReady={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: /Clone Git 仓库/ }))
    fireEvent.change(screen.getByPlaceholderText('https://github.com/user/repo.git'), {
      target: { value: 'https://github.com/acme/demo.git' },
    })
    fireEvent.click(screen.getByRole('button', { name: '选择父目录' }))

    const repoInput = screen.getByPlaceholderText('https://github.com/user/repo.git')
    const pathInput = screen.getByPlaceholderText('选择本地存储路径') as HTMLInputElement

    await waitFor(() => {
      expect(pathInput.value).toBe('/tmp/workspaces/demo')
    })

    fireEvent.change(pathInput, { target: { value: '/tmp/custom-target' } })
    fireEvent.change(repoInput, { target: { value: 'https://github.com/acme/renamed.git' } })

    await waitFor(() => {
      expect(pathInput.value).toBe('/tmp/custom-target')
    })
  })

  it('disables create and clone entries in readonly mode', () => {
    render(<WelcomeFlow onKbReady={vi.fn()} readonly />)

    expect(screen.getByRole('button', { name: /新建知识库/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Clone Git 仓库/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /导入已有目录/ })).not.toBeDisabled()
    expect(screen.getByText('当前为只读模式：你仍可打开已有知识库，但不能新建或克隆。')).toBeInTheDocument()
  })

  it('shows the product positioning copy on the main screen', () => {
    render(<WelcomeFlow onKbReady={vi.fn()} />)

    expect(screen.getByText('面向 AI Agent 的开发者知识操作系统')).toBeInTheDocument()
    expect(screen.getByText('在一个 Git 原生工作台中管理知识、连接 Agent，并安全审阅 AI 生成的变更。')).toBeInTheDocument()
    expect(screen.getByText('Local-first')).toBeInTheDocument()
    expect(screen.getByText('Git-native')).toBeInTheDocument()
    expect(screen.getByText('MCP-ready')).toBeInTheDocument()
    expect(screen.getByText('完成启动后，可在设置页一键复制 MCP 配置，连接 Claude Code 或 OpenCode。')).toBeInTheDocument()
    expect(screen.getByText('下载与发布入口')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /下载 v0.1.0/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Release Notes/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /安装与配置说明/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Windows · Setup \.exe/ })).toBeInTheDocument()
  })
})
