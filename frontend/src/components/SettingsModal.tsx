import React, { useEffect, useState } from 'react'
import { X, FolderOpen, Copy, MessageSquare, CheckCircle2, Inbox, Package, Download, ExternalLink } from 'lucide-react'
import { AppDiagnostics, getErrorMessage, tauriService } from '../services/tauri'
import { ForgeNerveLogo } from './ForgeNerveLogo'
import { openExternalLink } from '../lib/externalLinks'
import {
  MCP_ENDPOINT,
  RELEASE_URL,
  RELEASE_NOTES_URL,
  README_URL,
  DOWNLOAD_GROUPS,
  RELEASE_VERSION,
} from '../lib/releaseLinks'
import {
  getAutoSaveInterval,
  getDefaultEditorMode,
  getImportStrategy,
  getShowLineNumbersSetting,
  saveSetting,
  type EditorModeSetting,
  type ImportStrategy,
} from '../lib/settings'

interface SettingsModalProps {
  onClose: () => void
}
const OPEN_CODE_CONFIG_PATH = '~/.config/opencode/opencode.json'
const CLAUDE_CONFIG_PATH = '~/.claude/mcp.json'

const OPEN_CODE_CONFIG = `{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "memoforge": {
      "type": "remote",
      "url": "${MCP_ENDPOINT}",
      "enabled": true
    }
  }
}`

const CLAUDE_CONFIG = `{
  "mcpServers": {
    "memoforge": {
      "type": "sse",
      "url": "${MCP_ENDPOINT}"
    }
  }
}`

export const SettingsModal: React.FC<SettingsModalProps> = ({ onClose }) => {
  const [diagnostics, setDiagnostics] = useState<AppDiagnostics | null>(null)
  const [diagnosticsError, setDiagnosticsError] = useState<string | null>(null)
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null)

  // Persisted settings
  const [defaultEditorMode, setDefaultEditorMode] = useState<EditorModeSetting>(
    () => getDefaultEditorMode()
  )
  const [autoSaveInterval, setAutoSaveInterval] = useState<number>(
    () => getAutoSaveInterval()
  )
  const [importStrategy, setImportStrategy] = useState<ImportStrategy>(
    () => getImportStrategy()
  )
  const [showLineNumbers, setShowLineNumbers] = useState<boolean>(
    () => getShowLineNumbersSetting()
  )

  useEffect(() => {
    let cancelled = false

    const loadDiagnostics = async () => {
      try {
        const nextDiagnostics = await tauriService.getAppDiagnostics()
        if (cancelled) return
        setDiagnostics(nextDiagnostics)
        setDiagnosticsError(null)
      } catch (error) {
        if (cancelled) return
        setDiagnosticsError(getErrorMessage(error))
      }
    }

    void loadDiagnostics()
    return () => {
      cancelled = true
    }
  }, [])

  const handleSettingChange = <T,>(setter: (value: T) => void, key: string) => (value: T) => {
    setter(value)
    saveSetting(key, value)
  }

  const handleCopyText = async (value: string, successMessage: string) => {
    try {
      await navigator.clipboard.writeText(value)
      setCopyFeedback(successMessage)
      window.setTimeout(() => setCopyFeedback(null), 1400)
    } catch (error) {
      setCopyFeedback(getErrorMessage(error))
      window.setTimeout(() => setCopyFeedback(null), 1800)
    }
  }

  const handleOpenLogDir = async () => {
    try {
      await tauriService.openAppLogDir()
      setDiagnosticsError(null)
    } catch (error) {
      setDiagnosticsError(getErrorMessage(error))
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />

      {/* Modal */}
      <div
        className="relative w-[min(680px,calc(100vw-2rem))] max-h-[85vh] overflow-hidden rounded-lg bg-white shadow-xl"
        style={{ border: '1px solid #E5E5E5' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: '#E5E5E5' }}>
          <h2 className="text-sm font-semibold" style={{ color: '#0A0A0A' }}>设置</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100">
            <X className="h-4 w-4" style={{ color: '#737373' }} />
          </button>
        </div>

        {/* Content */}
        <div className="max-h-[calc(85vh-114px)] overflow-y-auto p-4 space-y-4">
          {/* 品牌与接入 */}
          <div className="pb-4 border-b" style={{ borderColor: '#E5E5E5' }}>
            <div
              className="rounded-xl border p-4"
              style={{ borderColor: 'var(--brand-primary-panel-border)', backgroundColor: 'var(--brand-primary-surface)' }}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-base font-semibold" style={{ color: '#111827' }}>
                    <ForgeNerveLogo size={24} withWordmark wordmarkClassName="text-base font-semibold tracking-tight" />
                  </div>
                  <div className="mt-1 text-sm" style={{ color: '#4B5563' }}>The Agent Knowledge OS for Developers</div>
                  <div className="mt-2 text-sm" style={{ color: '#374151' }}>
                    在一个 Git 原生工作台中管理知识、连接 Agent，并安全审阅 AI 生成的变更。
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 text-[11px]">
                  <span className="rounded-full border px-2 py-1" style={{ borderColor: 'var(--brand-primary-border)', color: 'var(--brand-primary-strong)', backgroundColor: 'var(--brand-primary-soft)' }}>Local-first</span>
                  <span className="rounded-full border px-2 py-1" style={{ borderColor: 'var(--brand-primary-border)', color: 'var(--brand-primary-strong)', backgroundColor: 'var(--brand-primary-soft)' }}>Git-native</span>
                  <span className="rounded-full border px-2 py-1" style={{ borderColor: 'var(--brand-primary-border)', color: 'var(--brand-primary-strong)', backgroundColor: 'var(--brand-primary-soft)' }}>MCP-ready</span>
                </div>
              </div>

              <div className="mt-4 grid gap-2 md:grid-cols-3">
                <div className="rounded-lg border p-3" style={{ borderColor: '#E5E7EB', backgroundColor: '#FFFFFF' }}>
                  <div className="text-xs font-medium" style={{ color: '#111827' }}>1. 打开知识库</div>
                  <div className="mt-1 text-xs" style={{ color: '#6B7280' }}>先进入你的本地知识库或团队仓库。</div>
                </div>
                <div className="rounded-lg border p-3" style={{ borderColor: '#E5E7EB', backgroundColor: '#FFFFFF' }}>
                  <div className="text-xs font-medium" style={{ color: '#111827' }}>2. 复制 MCP 配置</div>
                  <div className="mt-1 text-xs" style={{ color: '#6B7280' }}>把下方配置复制到 Claude Code 或 OpenCode。</div>
                </div>
                <div className="rounded-lg border p-3" style={{ borderColor: '#E5E7EB', backgroundColor: '#FFFFFF' }}>
                  <div className="text-xs font-medium" style={{ color: '#111827' }}>3. 用 Draft 写入</div>
                  <div className="mt-1 text-xs" style={{ color: '#6B7280' }}>推荐让 Agent 先生成草稿，再由你在桌面端确认提交。</div>
                </div>
              </div>
            </div>
          </div>

          {/* 通用 */}
          <div className="pb-4 border-b" style={{ borderColor: '#E5E5E5' }}>
            <h3 className="text-xs font-medium mb-2" style={{ color: '#737373' }}>通用</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm" style={{ color: '#0A0A0A' }}>默认编辑模式</span>
                <select
                  value={defaultEditorMode}
                  onChange={(e) => handleSettingChange(setDefaultEditorMode, 'defaultEditorMode')(e.target.value as EditorModeSetting)}
                  className="rounded-md border px-2 py-1 text-xs"
                  style={{ borderColor: '#E5E5E5', color: '#0A0A0A' }}
                >
                  <option value="read">阅读</option>
                  <option value="markdown">Markdown</option>
                  <option value="rich">高级编辑</option>
                </select>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm" style={{ color: '#0A0A0A' }}>自动保存间隔</span>
                  <span className="text-xs ml-1" style={{ color: '#A3A3A3' }}>(0 = 关闭)</span>
                </div>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min={0}
                    max={300}
                    value={autoSaveInterval}
                    onChange={(e) => handleSettingChange(setAutoSaveInterval, 'autoSaveInterval')(Number(e.target.value))}
                    className="w-16 rounded-md border px-2 py-1 text-xs text-right"
                    style={{ borderColor: '#E5E5E5' }}
                  />
                  <span className="text-xs" style={{ color: '#737373' }}>秒</span>
                </div>
              </div>
            </div>
          </div>

          {/* 编辑器 */}
          <div className="pb-4 border-b" style={{ borderColor: '#E5E5E5' }}>
            <h3 className="text-xs font-medium mb-2" style={{ color: '#737373' }}>编辑器</h3>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm" style={{ color: '#0A0A0A' }}>显示行号</span>
                <input
                  type="checkbox"
                  checked={showLineNumbers}
                  onChange={(e) => handleSettingChange(setShowLineNumbers, 'showLineNumbers')(e.target.checked)}
                  className="w-4 h-4 rounded"
                  style={{ accentColor: 'var(--brand-primary)' }}
                />
              </div>
            </div>
          </div>

          {/* 知识库 */}
          <div className="pb-4 border-b" style={{ borderColor: '#E5E5E5' }}>
            <h3 className="text-xs font-medium mb-2" style={{ color: '#737373' }}>知识库</h3>
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm" style={{ color: '#0A0A0A' }}>导入策略</span>
                <p className="text-xs" style={{ color: '#A3A3A3' }}>导入文件时的默认分类方式</p>
              </div>
                  <select
                value={importStrategy}
                onChange={(e) => handleSettingChange(setImportStrategy, 'importStrategy')(e.target.value as ImportStrategy)}
                className="rounded-md border px-2 py-1 text-xs"
                style={{ borderColor: '#E5E5E5', color: '#0A0A0A' }}
              >
                <option value="auto-category">自动注册分类</option>
                <option value="none">不自动注册分类</option>
              </select>
            </div>
          </div>

          {/* vNext 新功能 */}
          <div className="pb-4 border-b" style={{ borderColor: '#E5E5E5' }}>
            <h3 className="text-xs font-medium mb-3" style={{ color: '#737373' }}>vNext 新功能</h3>
            <div className="space-y-2.5">
              <div className="rounded-lg border p-3" style={{ borderColor: '#E5E7EB', backgroundColor: '#FFFFFF' }}>
                <div className="flex items-start gap-2.5">
                  <div
                    className="flex h-7 w-7 items-center justify-center rounded-md flex-shrink-0"
                    style={{ backgroundColor: '#EEF2FF' }}
                  >
                    <Inbox className="h-3.5 w-3.5" style={{ color: '#6366F1' }} />
                  </div>
                  <div>
                    <div className="text-sm font-medium mb-0.5" style={{ color: '#0A0A0A' }}>Inbox 收件箱</div>
                    <p className="text-[11px]" style={{ color: '#525252' }}>Agent 创建的候选项先进入收件箱，你可以审阅后转为正式知识或忽略。</p>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border p-3" style={{ borderColor: '#E5E7EB', backgroundColor: '#FFFFFF' }}>
                <div className="flex items-start gap-2.5">
                  <div
                    className="flex h-7 w-7 items-center justify-center rounded-md flex-shrink-0"
                    style={{ backgroundColor: '#ECFDF5' }}
                  >
                    <MessageSquare className="h-3.5 w-3.5" style={{ color: '#059669' }} />
                  </div>
                  <div>
                    <div className="text-sm font-medium mb-0.5" style={{ color: '#0A0A0A' }}>Sessions 会话</div>
                    <p className="text-[11px]" style={{ color: '#525252' }}>每次 Agent 工作会话都有完整记录，包含上下文、产出和结果。</p>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border p-3" style={{ borderColor: '#E5E7EB', backgroundColor: '#FFFFFF' }}>
                <div className="flex items-start gap-2.5">
                  <div
                    className="flex h-7 w-7 items-center justify-center rounded-md flex-shrink-0"
                    style={{ backgroundColor: '#FEF3C7' }}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" style={{ color: '#D97706' }} />
                  </div>
                  <div>
                    <div className="text-sm font-medium mb-0.5" style={{ color: '#0A0A0A' }}>Review 审阅</div>
                    <p className="text-[11px]" style={{ color: '#525252' }}>Agent 的知识修改先进入审阅队列，你可以预览 diff、确认提交或退回修改。</p>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border p-3" style={{ borderColor: '#E5E7EB', backgroundColor: '#FFFFFF' }}>
                <div className="flex items-start gap-2.5">
                  <div
                    className="flex h-7 w-7 items-center justify-center rounded-md flex-shrink-0"
                    style={{ backgroundColor: '#E0E7FF' }}
                  >
                    <Package className="h-3.5 w-3.5" style={{ color: '#4338CA' }} />
                  </div>
                  <div>
                    <div className="text-sm font-medium mb-0.5" style={{ color: '#0A0A0A' }}>Context Packs 打包</div>
                    <p className="text-[11px]" style={{ color: '#525252' }}>将相关知识按标签、文件夹或主题打包，供 Agent 在特定场景下快速获取上下文。</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Git */}
          <div className="pb-4 border-b" style={{ borderColor: '#E5E5E5' }}>
            <h3 className="text-xs font-medium mb-2" style={{ color: '#737373' }}>Git</h3>
            <div className="rounded-lg border px-3 py-2 text-xs" style={{ borderColor: '#E5E7EB', backgroundColor: '#FAFAFA', color: '#525252' }}>
              ForgeNerve 使用 Git 进行版本管理。提交、拉取和推送操作可在右侧面板的 Git 区域操作。
              <br />Pull 前如果存在未提交改动会自动提示。
            </div>
          </div>

          {/* MCP 配置 */}
          <div className="pb-4 border-b" style={{ borderColor: '#E5E5E5' }}>
            <div className="mb-2 flex items-center justify-between gap-3">
              <h3 className="text-xs font-medium" style={{ color: '#737373' }}>MCP 快速配置</h3>
              {copyFeedback && (
                <span className="text-xs" style={{ color: '#737373' }}>{copyFeedback}</span>
              )}
            </div>

            <div
              className="rounded-lg border px-3 py-2 text-sm"
              style={{ borderColor: 'var(--brand-primary-panel-border)', backgroundColor: 'var(--brand-primary-surface-alt)', color: '#1D4ED8' }}
            >
              启动 ForgeNerve 桌面应用后，MCP 服务默认监听在 <code>{MCP_ENDPOINT}</code>。
            </div>

            <div
              className="mt-3 rounded-lg border px-3 py-2 text-xs"
              style={{ borderColor: '#E5E7EB', backgroundColor: '#FFFFFF', color: '#525252' }}
            >
              推荐工作流：让 Agent 先读取上下文，再使用 Draft 流生成变更，最后回到桌面端审阅与确认。
            </div>

            <div className="mt-3 space-y-3">
              <div className="rounded-lg border p-3" style={{ borderColor: '#E5E7EB', backgroundColor: '#FCFCFD' }}>
                <div className="mb-2 flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium" style={{ color: '#0A0A0A' }}>OpenCode</div>
                    <div className="text-xs" style={{ color: '#737373' }}>
                      写入 <code>{OPEN_CODE_CONFIG_PATH}</code>，或放在项目根目录的 <code>opencode.json</code>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleCopyText(OPEN_CODE_CONFIG, 'OpenCode 配置已复制')}
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs"
                    style={{ backgroundColor: 'var(--brand-primary-soft)', color: 'var(--brand-primary-strong)' }}
                  >
                    <Copy className="h-3.5 w-3.5" />
                    复制
                  </button>
                </div>
                <pre
                  className="overflow-x-auto rounded-md p-3 text-[11px]"
                  style={{ backgroundColor: '#0F172A', color: '#E2E8F0' }}
                >
                  {OPEN_CODE_CONFIG}
                </pre>
              </div>

              <div className="rounded-lg border p-3" style={{ borderColor: '#E5E7EB', backgroundColor: '#FCFCFD' }}>
                <div className="mb-2 flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium" style={{ color: '#0A0A0A' }}>Claude Code</div>
                    <div className="text-xs" style={{ color: '#737373' }}>
                      写入 <code>{CLAUDE_CONFIG_PATH}</code>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleCopyText(CLAUDE_CONFIG, 'Claude Code 配置已复制')}
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs"
                    style={{ backgroundColor: 'var(--brand-primary-soft)', color: 'var(--brand-primary-strong)' }}
                  >
                    <Copy className="h-3.5 w-3.5" />
                    复制
                  </button>
                </div>
                <pre
                  className="overflow-x-auto rounded-md p-3 text-[11px]"
                  style={{ backgroundColor: '#0F172A', color: '#E2E8F0' }}
                >
                  {CLAUDE_CONFIG}
                </pre>
              </div>

              <div className="rounded-lg border p-3 text-xs" style={{ borderColor: '#E5E7EB', backgroundColor: '#FFFFFF', color: '#525252' }}>
                <div className="font-medium" style={{ color: '#0A0A0A' }}>排查建议</div>
                <div className="mt-1">1. 先确认桌面应用正在运行。</div>
                <div className="mt-1">2. 访问 <code>http://127.0.0.1:31415/health</code> 检查服务是否可达。</div>
                <div className="mt-1">3. 如果你改过端口，例如用 <code>MEMOFORGE_MCP_PORT=3030 cargo tauri dev</code> 启动，记得同步修改上面的 URL。</div>
              </div>
            </div>
          </div>

          {/* 下载与发布 */}
          <div className="pb-4 border-b" style={{ borderColor: '#E5E5E5' }}>
            <h3 className="text-xs font-medium mb-2" style={{ color: '#737373' }}>下载与发布</h3>

            <div className="rounded-lg border p-3" style={{ borderColor: '#E5E7EB', backgroundColor: '#FFFFFF' }}>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void openExternalLink(RELEASE_URL)}
                  className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm"
                  style={{ backgroundColor: 'var(--brand-primary)', color: '#FFFFFF' }}
                >
                  <Download className="h-4 w-4" />
                  {`下载 v${RELEASE_VERSION}`}
                </button>
                <button
                  type="button"
                  onClick={() => void openExternalLink(RELEASE_NOTES_URL)}
                  className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm"
                  style={{ backgroundColor: '#F5F5F5', color: '#0A0A0A' }}
                >
                  <ExternalLink className="h-4 w-4" />
                  Release Notes
                </button>
                <button
                  type="button"
                  onClick={() => void openExternalLink(README_URL)}
                  className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm"
                  style={{ backgroundColor: '#F5F5F5', color: '#0A0A0A' }}
                >
                  <ExternalLink className="h-4 w-4" />
                  安装与配置说明
                </button>
              </div>

              <div className="mt-3 rounded-lg border px-3 py-2 text-xs" style={{ borderColor: '#E5E7EB', backgroundColor: '#FAFAFA', color: '#525252' }}>
                首页与 GitHub Release 页面都能找到桌面安装包、便携版，以及独立的 <code>memoforge-*</code> MCP 二进制。
              </div>

              <div className="mt-3 grid gap-3">
                {DOWNLOAD_GROUPS.map((group) => (
                  <div
                    key={group.title}
                    className="rounded-lg border p-3"
                    style={{ borderColor: '#E5E7EB', backgroundColor: '#FCFCFD' }}
                  >
                    <div className="text-sm font-medium" style={{ color: '#0A0A0A' }}>{group.title}</div>
                    <div className="mt-1 text-xs" style={{ color: '#737373' }}>{group.description}</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {group.assets.map((asset) => (
                        <button
                          type="button"
                          key={asset.label}
                          onClick={() => void openExternalLink(asset.url)}
                          className="rounded-md border px-2 py-1 text-[11px]"
                          style={{ borderColor: '#E5E7EB', backgroundColor: '#FFFFFF', color: '#0A0A0A' }}
                        >
                          {asset.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 诊断与日志 */}
          <div className="pb-4 border-b" style={{ borderColor: '#E5E5E5' }}>
            <h3 className="text-xs font-medium mb-2" style={{ color: '#737373' }}>诊断与日志</h3>
            <div className="space-y-3">
              <div className="space-y-1">
                <div className="flex justify-between gap-3 text-sm">
                  <span style={{ color: '#737373' }}>日志目录</span>
                  <span className="text-right break-all" style={{ color: '#0A0A0A' }}>
                    {diagnostics?.log_dir ?? '加载中...'}
                  </span>
                </div>
                <p className="text-xs" style={{ color: '#A3A3A3' }}>
                  Windows 一般位于 `%LOCALAPPDATA%\com.memoforge.app\logs`
                </p>
              </div>

              {diagnostics?.log_file && (
                <div className="flex justify-between gap-3 text-sm">
                  <span style={{ color: '#737373' }}>日志文件</span>
                  <span className="text-right break-all" style={{ color: '#0A0A0A' }}>
                    {diagnostics.log_file}
                  </span>
                </div>
              )}

              {diagnostics?.current_kb && (
                <div className="flex justify-between gap-3 text-sm">
                  <span style={{ color: '#737373' }}>当前知识库</span>
                  <span className="text-right break-all" style={{ color: '#0A0A0A' }}>
                    {diagnostics.current_kb}
                  </span>
                </div>
              )}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleOpenLogDir}
                  className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm"
                  style={{ backgroundColor: '#F5F5F5', color: '#0A0A0A' }}
                >
                  <FolderOpen className="h-4 w-4" />
                  打开日志目录
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (diagnostics?.log_dir) {
                      void navigator.clipboard.writeText(diagnostics.log_dir)
                    }
                  }}
                  disabled={!diagnostics?.log_dir}
                  className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm disabled:opacity-50"
                  style={{ backgroundColor: 'var(--brand-primary-soft)', color: 'var(--brand-primary-strong)' }}
                >
                  <Copy className="h-4 w-4" />
                  复制路径
                </button>
              </div>

              {diagnostics?.recent_logs && diagnostics.recent_logs.length > 0 && (
                <div>
                  <div className="mb-1 text-xs font-medium" style={{ color: '#737373' }}>最近日志</div>
                  <pre
                    className="max-h-32 overflow-auto rounded-md p-2 text-[11px]"
                    style={{ backgroundColor: '#FAFAFA', color: '#334155', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
                  >
                    {diagnostics.recent_logs.join('\n')}
                  </pre>
                </div>
              )}

              {diagnosticsError && (
                <div
                  className="rounded-md border px-3 py-2 text-sm"
                  style={{ borderColor: '#FECACA', backgroundColor: '#FEF2F2', color: '#991B1B' }}
                >
                  {diagnosticsError}
                </div>
              )}
            </div>
          </div>

          {/* 快捷键 */}
          <div className="pb-4 border-b" style={{ borderColor: '#E5E5E5' }}>
            <h3 className="text-xs font-medium mb-2" style={{ color: '#737373' }}>快捷键</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span style={{ color: '#0A0A0A' }}>搜索</span>
                <kbd className="px-1.5 py-0.5 rounded text-xs" style={{ backgroundColor: '#F5F5F5', color: '#737373' }}>Cmd+K</kbd>
              </div>
              <div className="flex justify-between">
                <span style={{ color: '#0A0A0A' }}>保存</span>
                <kbd className="px-1.5 py-0.5 rounded text-xs" style={{ backgroundColor: '#F5F5F5', color: '#737373' }}>Cmd+S</kbd>
              </div>
              <div className="flex justify-between">
                <span style={{ color: '#0A0A0A' }}>新建</span>
                <kbd className="px-1.5 py-0.5 rounded text-xs" style={{ backgroundColor: '#F5F5F5', color: '#737373' }}>Cmd+N</kbd>
              </div>
            </div>
          </div>

          {/* 关于 */}
          <div>
            <h3 className="text-xs font-medium mb-2" style={{ color: '#737373' }}>关于</h3>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span style={{ color: '#737373' }}>版本</span>
                <span style={{ color: '#0A0A0A' }}>{RELEASE_VERSION}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span style={{ color: '#737373' }}>构建</span>
                <span style={{ color: '#0A0A0A' }}>Tauri v2</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t flex justify-end" style={{ borderColor: '#E5E5E5' }}>
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm rounded-md"
            style={{ backgroundColor: '#F5F5F5', color: '#0A0A0A' }}
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  )
}
