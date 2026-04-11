import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SettingsModal } from './SettingsModal'

const getAppDiagnosticsMock = vi.fn()

vi.mock('../services/tauri', () => ({
  tauriService: {
    getAppDiagnostics: (...args: unknown[]) => getAppDiagnosticsMock(...args),
    openAppLogDir: vi.fn(),
  },
  getErrorMessage: (error: unknown) => String(error),
}))

describe('SettingsModal import strategy options', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getAppDiagnosticsMock.mockResolvedValue({
      dataDir: '/tmp/data',
      logDir: '/tmp/logs',
      mcpEndpoint: 'http://127.0.0.1:31415/mcp',
      kbPath: null,
      readonly: false,
      mode: 'desktop',
    })
  })

  it('only shows supported import strategy options', async () => {
    render(<SettingsModal onClose={vi.fn()} />)

    await waitFor(() => {
      expect(getAppDiagnosticsMock).toHaveBeenCalled()
    })

    expect(screen.getByRole('option', { name: '自动注册分类' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: '不自动注册分类' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /手动/i })).not.toBeInTheDocument()
  })

  it('shows ForgeNerve onboarding guidance and recommended MCP workflow', async () => {
    render(<SettingsModal onClose={vi.fn()} />)

    await waitFor(() => {
      expect(getAppDiagnosticsMock).toHaveBeenCalled()
    })

    expect(screen.getByText('ForgeNerve')).toBeInTheDocument()
    expect(screen.getByText('The Agent Knowledge OS for Developers')).toBeInTheDocument()
    expect(screen.getByText('在一个 Git 原生工作台中管理知识、连接 Agent，并安全审阅 AI 生成的变更。')).toBeInTheDocument()
    expect(screen.getByText('1. 打开知识库')).toBeInTheDocument()
    expect(screen.getByText('2. 复制 MCP 配置')).toBeInTheDocument()
    expect(screen.getByText('3. 用 Draft 写入')).toBeInTheDocument()
    expect(screen.getByText('推荐工作流：让 Agent 先读取上下文，再使用 Draft 流生成变更，最后回到桌面端审阅与确认。')).toBeInTheDocument()
    expect(screen.getByText('下载与发布')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /下载 v0.1.0/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Release Notes/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /安装与配置说明/ })).toBeInTheDocument()
    expect(screen.getByText(/首页与 GitHub Release 页面都能找到桌面安装包/)).toBeInTheDocument()
  })
})
