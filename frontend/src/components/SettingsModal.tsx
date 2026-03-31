import React, { useEffect, useState } from 'react'
import { X, FolderOpen, Copy } from 'lucide-react'
import { AppDiagnostics, getErrorMessage, tauriService } from '../services/tauri'

interface SettingsModalProps {
  onClose: () => void
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ onClose }) => {
  const [diagnostics, setDiagnostics] = useState<AppDiagnostics | null>(null)
  const [diagnosticsError, setDiagnosticsError] = useState<string | null>(null)
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null)

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

  const handleCopyLogPath = async () => {
    if (!diagnostics?.log_dir) return
    try {
      await navigator.clipboard.writeText(diagnostics.log_dir)
      setCopyFeedback('已复制')
      window.setTimeout(() => setCopyFeedback(null), 1200)
    } catch (error) {
      setCopyFeedback(getErrorMessage(error))
      window.setTimeout(() => setCopyFeedback(null), 1600)
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
      <div
        className="absolute inset-0 bg-black/30"
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className="relative bg-white rounded-lg shadow-xl w-[400px] max-h-[80vh] overflow-hidden"
        style={{ border: '1px solid #E5E5E5' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: '#E5E5E5' }}>
          <h2 className="text-sm font-semibold" style={{ color: '#0A0A0A' }}>设置</h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-gray-100"
          >
            <X className="h-4 w-4" style={{ color: '#737373' }} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* 关于 */}
          <div className="pb-4 border-b" style={{ borderColor: '#E5E5E5' }}>
            <h3 className="text-xs font-medium mb-2" style={{ color: '#737373' }}>关于</h3>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span style={{ color: '#737373' }}>版本</span>
                <span style={{ color: '#0A0A0A' }}>0.1.0</span>
              </div>
              <div className="flex justify-between text-sm">
                <span style={{ color: '#737373' }}>构建</span>
                <span style={{ color: '#0A0A0A' }}>Tauri v2</span>
              </div>
            </div>
          </div>

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
                  Windows 一般位于 `%LOCALAPPDATA%\\com.memoforge.app\\logs`
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
                  onClick={handleCopyLogPath}
                  disabled={!diagnostics?.log_dir}
                  className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm disabled:opacity-50"
                  style={{ backgroundColor: '#EEF2FF', color: '#4338CA' }}
                >
                  <Copy className="h-4 w-4" />
                  复制路径
                </button>
                {copyFeedback && (
                  <span className="text-xs" style={{ color: '#737373' }}>{copyFeedback}</span>
                )}
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

          {/* 编辑器设置 */}
          <div className="pb-4 border-b" style={{ borderColor: '#E5E5E5' }}>
            <h3 className="text-xs font-medium mb-2" style={{ color: '#737373' }}>编辑器</h3>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm" style={{ color: '#0A0A0A' }}>默认阅读模式</span>
                <input
                  type="checkbox"
                  defaultChecked
                  className="w-4 h-4 rounded"
                  style={{ accentColor: '#6366F1' }}
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm" style={{ color: '#0A0A0A' }}>显示行号</span>
                <input
                  type="checkbox"
                  className="w-4 h-4 rounded"
                  style={{ accentColor: '#6366F1' }}
                />
              </div>
            </div>
          </div>

          {/* 快捷键 */}
          <div>
            <h3 className="text-xs font-medium mb-2" style={{ color: '#737373' }}>快捷键</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span style={{ color: '#0A0A0A' }}>搜索</span>
                <kbd className="px-1.5 py-0.5 rounded text-xs" style={{ backgroundColor: '#F5F5F5', color: '#737373' }}>⌘K</kbd>
              </div>
              <div className="flex justify-between">
                <span style={{ color: '#0A0A0A' }}>保存</span>
                <kbd className="px-1.5 py-0.5 rounded text-xs" style={{ backgroundColor: '#F5F5F5', color: '#737373' }}>⌘S</kbd>
              </div>
              <div className="flex justify-between">
                <span style={{ color: '#0A0A0A' }}>新建</span>
                <kbd className="px-1.5 py-0.5 rounded text-xs" style={{ backgroundColor: '#F5F5F5', color: '#737373' }}>⌘N</kbd>
              </div>
            </div>
          </div>

          {/* 提示 */}
          <div className="pt-2 text-center">
            <p className="text-xs" style={{ color: '#A3A3A3' }}>
              更多设置功能开发中...
            </p>
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
