import React, { useEffect, useState } from 'react'
import { tauriService, Event, getErrorMessage } from '../services/tauri'
import { Clock, FilePlus, FileEdit, FileText, GitCommit, ArrowRightLeft, Trash2, GitPullRequest } from 'lucide-react'

interface RecentActivityPanelProps {
  onSelectKnowledge: (path: string) => void
}

const ACTION_ICONS: Record<string, { icon: typeof Clock; color: string }> = {
  create: { icon: FilePlus, color: '#047857' },
  update: { icon: FileEdit, color: 'var(--brand-primary)' },
  update_metadata: { icon: FileEdit, color: 'var(--brand-primary)' },
  delete: { icon: Trash2, color: '#DC2626' },
  move: { icon: ArrowRightLeft, color: '#B45309' },
  git_commit: { icon: GitCommit, color: '#0A0A0A' },
  git_pull: { icon: GitPullRequest, color: '#047857' },
  git_push: { icon: GitPullRequest, color: 'var(--brand-primary)' },
  git_merge: { icon: GitPullRequest, color: '#B45309' },
}

const formatTime = (dateStr: string) => {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / (1000 * 60))
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffMins < 1) return '刚刚'
  if (diffMins < 60) return `${diffMins}分钟前`
  if (diffHours < 24) return `${diffHours}小时前`
  if (diffDays < 7) return `${diffDays}天前`
  return date.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
}

const SOURCE_LABELS: Record<string, string> = {
  gui: '界面',
  cli: '命令行',
  mcp: 'MCP',
  'mcp:claude-code': 'Claude',
  'mcp:codex': 'Codex',
  'mcp:other': 'MCP',
}

export const RecentActivityPanel: React.FC<RecentActivityPanelProps> = ({ onSelectKnowledge }) => {
  const [events, setEvents] = useState<Event[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadEvents()
  }, [])

  const loadEvents = async () => {
    try {
      const activity = await tauriService.getRecentActivity(15)
      setEvents(activity)
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }

  if (error) {
    return (
      <div className="rounded-xl border p-4" style={{ borderColor: '#E5E5E5' }}>
        <h3 className="text-xs font-medium mb-2" style={{ color: '#737373' }}>最近活动</h3>
        <p className="text-xs" style={{ color: '#DC2626' }}>{error}</p>
      </div>
    )
  }

  if (events.length === 0) {
    return (
      <div className="rounded-xl border p-4" style={{ borderColor: '#E5E5E5', backgroundColor: '#FAFAFA' }}>
        <h3 className="text-xs font-medium mb-2" style={{ color: '#737373' }}>最近活动</h3>
        <p className="text-xs" style={{ color: '#A3A3A3' }}>暂无活动记录。</p>
      </div>
    )
  }

  return (
    <div className="rounded-xl border p-4" style={{ borderColor: '#E5E5E5' }}>
      <h3 className="text-xs font-medium mb-3" style={{ color: '#737373' }}>最近活动</h3>
      <div className="space-y-1.5 max-h-[280px] overflow-y-auto">
        {events.map((event, index) => {
          const actionStyle = ACTION_ICONS[event.action] ?? { icon: FileText, color: '#737373' }
          const ActionIcon = actionStyle.icon
          const sourceLabel = SOURCE_LABELS[event.source] ?? event.source

          return (
            <button
              key={`${event.time}-${index}`}
              onClick={() => event.path && onSelectKnowledge(event.path)}
              disabled={!event.path}
              className="flex items-center gap-2.5 w-full rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-gray-50 disabled:cursor-default disabled:hover:bg-transparent"
            >
              <ActionIcon className="h-3.5 w-3.5 flex-shrink-0" style={{ color: actionStyle.color }} />
              <div className="flex-1 min-w-0">
                <span className="text-xs truncate block" style={{ color: '#0A0A0A' }}>
                  {event.detail || event.path || event.action}
                </span>
              </div>
              <span
                className="text-[10px] flex-shrink-0 rounded px-1 py-0.5"
                style={{ backgroundColor: '#F5F5F5', color: '#A3A3A3' }}
              >
                {sourceLabel}
              </span>
              <span className="text-[10px] flex-shrink-0 whitespace-nowrap" style={{ color: '#A3A3A3' }}>
                {formatTime(event.time)}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
