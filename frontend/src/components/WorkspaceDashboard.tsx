import React, { useEffect, useState } from 'react'
import { tauriService, WorkspaceOverview, RecentEdit, getErrorMessage } from '../services/tauri'
import { FileEdit, FolderInput, Clock } from 'lucide-react'
import { KnowledgeHealthPanel } from './KnowledgeHealthPanel'
import { RecentActivityPanel } from './RecentActivityPanel'

interface WorkspaceDashboardProps {
  onSelectKnowledge: (path: string) => void
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

export const WorkspaceDashboard: React.FC<WorkspaceDashboardProps> = ({ onSelectKnowledge }) => {
  const [overview, setOverview] = useState<WorkspaceOverview | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadOverview()
  }, [])

  const loadOverview = async () => {
    try {
      const data = await tauriService.getWorkspaceOverview()
      setOverview(data)
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }

  if (error) {
    return (
      <div className="p-6">
        <div
          className="rounded-md border px-3 py-2 text-sm"
          style={{ borderColor: '#FECACA', backgroundColor: '#FEF2F2', color: '#991B1B' }}
        >
          加载工作区数据失败: {error}
        </div>
      </div>
    )
  }

  if (!overview) {
    return (
      <div className="p-6 text-center">
        <p className="text-xs" style={{ color: '#A3A3A3' }}>加载中...</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Top row: recent edits + imports */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Recent edits */}
        <div className="rounded-xl border p-4" style={{ borderColor: '#E5E5E5' }}>
          <div className="flex items-center gap-2 mb-3">
            <div
              className="flex h-6 w-6 items-center justify-center rounded-md"
              style={{ backgroundColor: 'var(--brand-primary-soft)' }}
            >
              <FileEdit className="h-3.5 w-3.5" style={{ color: 'var(--brand-primary)' }} />
            </div>
            <h3 className="text-xs font-medium" style={{ color: '#737373' }}>最近编辑</h3>
          </div>
          {overview.recent_edits.length === 0 ? (
            <p className="text-xs" style={{ color: '#A3A3A3' }}>暂无最近编辑。</p>
          ) : (
            <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
              {overview.recent_edits.map((edit) => (
                <RecentEditItem
                  key={edit.path}
                  edit={edit}
                  onClick={() => onSelectKnowledge(edit.path)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Stats cards */}
        <div className="space-y-4">
          {/* Import stats */}
          <div className="rounded-xl border p-4" style={{ borderColor: '#E5E5E5' }}>
            <div className="flex items-center gap-2 mb-2">
              <div
                className="flex h-6 w-6 items-center justify-center rounded-md"
                style={{ backgroundColor: '#ECFDF5' }}
              >
                <FolderInput className="h-3.5 w-3.5" style={{ color: '#047857' }} />
              </div>
              <h3 className="text-xs font-medium" style={{ color: '#737373' }}>导入统计</h3>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-semibold" style={{ color: '#0A0A0A' }}>
                {overview.recent_imports}
              </span>
              <span className="text-xs" style={{ color: '#737373' }}>次近期导入</span>
            </div>
          </div>

          {/* Health panel */}
          <KnowledgeHealthPanel
            pending={overview.pending_organize}
            onSelectKnowledge={onSelectKnowledge}
          />
        </div>
      </div>

      {/* Recent activity */}
      <RecentActivityPanel onSelectKnowledge={onSelectKnowledge} />
    </div>
  )
}

const RecentEditItem: React.FC<{ edit: RecentEdit; onClick: () => void }> = ({ edit, onClick }) => (
  <button
    onClick={onClick}
    className="flex items-center gap-2 w-full rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-gray-50"
  >
    <Clock className="h-3 w-3 flex-shrink-0" style={{ color: '#A3A3A3' }} />
    <span className="text-xs truncate flex-1" style={{ color: '#0A0A0A' }}>
      {edit.title}
    </span>
    <span className="text-[10px] flex-shrink-0 whitespace-nowrap" style={{ color: '#A3A3A3' }}>
      {formatTime(edit.updated_at)}
    </span>
  </button>
)
