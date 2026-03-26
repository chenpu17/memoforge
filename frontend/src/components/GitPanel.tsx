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
      <div className="p-3 space-y-3">
        {/* 标题栏 */}
        <div
          className="flex items-center gap-2 cursor-pointer select-none"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <GitBranch className="h-4 w-4 text-neutral-500" />
          <span className="font-medium text-sm">Git 状态</span>
          {isExpanded ? (
            <ChevronUp className="h-3 w-3 text-neutral-400 ml-auto" />
          ) : (
            <ChevronDown className="h-3 w-3 text-neutral-400 ml-auto" />
          )}
        </div>

        {isExpanded && (
          <>
            {/* 状态 */}
            <pre className="text-xs bg-neutral-50 p-2 rounded overflow-auto max-h-24 border border-neutral-100">
              {status || '无变更'}
            </pre>

            {/* 提交信息 */}
            <input
              type="text"
              value={commitMessage}
              onChange={(e) => setCommitMessage(e.target.value)}
              placeholder="提交信息"
              className="w-full px-2.5 py-1.5 border border-neutral-200 rounded text-xs focus:outline-none focus:border-indigo-300"
            />

            {/* 操作按钮 */}
            <div className="flex gap-1.5">
              <Button onClick={handleCommit} size="sm" className="flex-1 h-7 text-xs">
                提交
              </Button>
              <Button onClick={handlePull} size="sm" variant="outline" className="h-7 text-xs px-2">
                <ArrowDown className="h-3 w-3" />
              </Button>
              <Button onClick={handlePush} size="sm" variant="secondary" className="h-7 text-xs px-2">
                <Upload className="h-3 w-3" />
              </Button>
            </div>
          </>
        )}
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
