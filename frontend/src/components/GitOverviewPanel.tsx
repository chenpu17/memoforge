import React, { useEffect, useState } from 'react'
import { tauriService, GitOverview, getErrorMessage } from '../services/tauri'
import { GitBranch, ArrowUp, ArrowDown, FileEdit } from 'lucide-react'

export const GitOverviewPanel: React.FC = () => {
  const [overview, setOverview] = useState<GitOverview | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadOverview()
  }, [])

  const loadOverview = async () => {
    try {
      const data = await tauriService.getGitOverview()
      setOverview(data)
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }

  if (error || !overview) {
    return null
  }

  if (!overview.current_branch) {
    return null
  }

  return (
    <div className="rounded-xl border p-3" style={{ borderColor: '#E5E5E5' }}>
      <div className="flex items-center gap-2 mb-2">
        <GitBranch className="h-3.5 w-3.5" style={{ color: '#737373' }} />
        <span className="text-xs font-medium truncate" style={{ color: '#0A0A0A' }}>
          {overview.current_branch}
        </span>
      </div>
      <div className="flex items-center gap-3">
        {overview.ahead > 0 && (
          <div className="flex items-center gap-1">
            <ArrowUp className="h-3 w-3" style={{ color: '#047857' }} />
            <span className="text-[11px] font-medium" style={{ color: '#047857' }}>
              {overview.ahead}
            </span>
          </div>
        )}
        {overview.behind > 0 && (
          <div className="flex items-center gap-1">
            <ArrowDown className="h-3 w-3" style={{ color: '#B45309' }} />
            <span className="text-[11px] font-medium" style={{ color: '#B45309' }}>
              {overview.behind}
            </span>
          </div>
        )}
        {overview.working_changes > 0 && (
          <div className="flex items-center gap-1">
            <FileEdit className="h-3 w-3" style={{ color: 'var(--brand-primary)' }} />
            <span className="text-[11px]" style={{ color: 'var(--brand-primary)' }}>
              {overview.working_changes} 改动
            </span>
          </div>
        )}
        {overview.ahead === 0 && overview.behind === 0 && overview.working_changes === 0 && (
          <span className="text-[11px]" style={{ color: '#A3A3A3' }}>已同步</span>
        )}
      </div>
    </div>
  )
}
