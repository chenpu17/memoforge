import React, { useState, useEffect } from 'react'
import { Button } from './ui/Button'
import { tauriService } from '../services/tauri'
import { GitBranch, Upload, ArrowDown, ChevronDown, ChevronUp } from 'lucide-react'

interface GitPanelProps {
  compact?: boolean
  refreshToken?: number
  onStatusChange?: (count: number) => void
}

export const GitPanel: React.FC<GitPanelProps> = ({
  compact = false,
  refreshToken = 0,
  onStatusChange,
}) => {
  const [status, setStatus] = useState('')
  const [commitMessage, setCommitMessage] = useState('')
  const [isExpanded, setIsExpanded] = useState(true)
  const statusLines = status ? status.split('\n').filter(Boolean) : []
  const statusPreview = statusLines.slice(0, 6).join('\n')
  const statusSummary = statusLines.reduce((summary, line) => {
    const code = line.slice(0, 2)
    if (code === '??') {
      summary.untracked += 1
      return summary
    }
    if (code[0] && code[0] !== ' ') {
      summary.staged += 1
    }
    if (code[1] && code[1] !== ' ') {
      summary.modified += 1
    }
    return summary
  }, { staged: 0, modified: 0, untracked: 0 })

  const loadStatus = async () => {
    try {
      const result = await tauriService.gitStatus()
      setStatus(result.join('\n'))
      onStatusChange?.(result.length)
    } catch (error) {
      console.error('Failed to load git status:', error)
    }
  }

  const handleCommit = async () => {
    if (!commitMessage.trim()) return

    try {
      await tauriService.gitCommit(commitMessage)
      setCommitMessage('')
      await loadStatus()
    } catch (error) {
      console.error('Commit failed:', error)
    }
  }

  const handlePush = async () => {
    try {
      await tauriService.gitPush()
      await loadStatus()
    } catch (error) {
      console.error('Push failed:', error)
    }
  }

  const handlePull = async () => {
    try {
      await tauriService.gitPull()
      await loadStatus()
    } catch (error) {
      console.error('Pull failed:', error)
    }
  }

  useEffect(() => {
    void loadStatus()
  }, [refreshToken])

  // 紧凑模式（右侧面板内）
  if (compact) {
    return (
      <div className="side-panel-body">
        <div className="side-panel-card">
          <div className="side-panel-section">
            <div
              className="flex cursor-pointer select-none items-center gap-2"
              onClick={() => setIsExpanded(!isExpanded)}
            >
              <GitBranch className="h-4 w-4 text-neutral-500" />
              <span className="text-sm font-medium">Git 状态</span>
              {isExpanded ? (
                <ChevronUp className="ml-auto h-3 w-3 text-neutral-400" />
              ) : (
                <ChevronDown className="ml-auto h-3 w-3 text-neutral-400" />
              )}
            </div>
          </div>

          {isExpanded && (
            <>
              <div className="side-panel-section">
                <div className="side-panel-heading">工作区</div>
                <div className="mb-2 flex flex-wrap gap-1.5 text-[11px]">
                  <span className="rounded-full bg-[#F8FAFC] px-2 py-1" style={{ color: '#64748B' }}>
                    总计 {statusLines.length}
                  </span>
                  <span className="rounded-full bg-[#ECFDF5] px-2 py-1" style={{ color: '#166534' }}>
                    已暂存 {statusSummary.staged}
                  </span>
                  <span className="rounded-full bg-[#FFF7ED] px-2 py-1" style={{ color: '#C2410C' }}>
                    已修改 {statusSummary.modified}
                  </span>
                  <span className="rounded-full bg-[#F8FAFC] px-2 py-1" style={{ color: '#7C3AED' }}>
                    未跟踪 {statusSummary.untracked}
                  </span>
                </div>
                <pre className="max-h-28 overflow-auto rounded-md border border-neutral-200 bg-neutral-50 p-2 text-xs">
                  {statusPreview || '无变更'}
                </pre>
                {statusLines.length > 6 && (
                  <div className="mt-2 text-[11px]" style={{ color: '#94A3B8' }}>
                    还有 {statusLines.length - 6} 条，展开后可继续提交或同步。
                  </div>
                )}
              </div>

              <div className="side-panel-section">
                <div className="side-panel-heading">提交信息</div>
                <input
                  type="text"
                  value={commitMessage}
                  onChange={(e) => setCommitMessage(e.target.value)}
                  placeholder="输入提交信息"
                  className="w-full rounded-md border border-neutral-200 px-2.5 py-1.5 text-xs focus:border-indigo-300 focus:outline-none"
                />
              </div>

              <div className="side-panel-section">
                <div className="flex gap-1.5">
                  <Button onClick={handleCommit} size="sm" className="h-8 flex-1 text-xs">
                    提交
                  </Button>
                  <Button onClick={handlePull} size="sm" variant="outline" className="h-8 px-2 text-xs">
                    <ArrowDown className="h-3 w-3" />
                  </Button>
                  <Button onClick={handlePush} size="sm" variant="secondary" className="h-8 px-2 text-xs">
                    <Upload className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    )
  }

  // 原始模式（底部面板）- 保留兼容
  return (
    <div className="p-4 border-t space-y-4">
      <div className="flex items-center gap-2">
        <GitBranch className="h-4 w-4" />
        <span className="font-semibold">Git 状态</span>
      </div>

      <pre className="text-xs bg-muted p-2 rounded overflow-auto max-h-32">
        {status || '无变更'}
      </pre>

      <input
        type="text"
        value={commitMessage}
        onChange={(e) => setCommitMessage(e.target.value)}
        placeholder="提交信息"
        className="w-full px-3 py-2 border rounded-lg text-sm"
      />

      <div className="flex gap-2">
        <Button onClick={handleCommit} size="sm" className="flex-1">
          提交
        </Button>
        <Button onClick={handlePull} size="sm" variant="outline">
          拉取
        </Button>
        <Button onClick={handlePush} size="sm" variant="secondary">
          <Upload className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
