import React, { useEffect, useState } from 'react'
import { tauriService, DraftSummary, getErrorMessage } from '../services/tauri'
import { FileEdit, Clock, Bot, ChevronRight } from 'lucide-react'

interface AgentDraftPanelProps {
  onSelectDraft: (draftId: string) => void
  onCountChange?: (count: number) => void
  refreshToken?: number
}

export const AgentDraftPanel: React.FC<AgentDraftPanelProps> = ({
  onSelectDraft,
  onCountChange,
  refreshToken = 0,
}) => {
  const [drafts, setDrafts] = useState<DraftSummary[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void loadDrafts()
  }, [refreshToken])

  const loadDrafts = async () => {
    try {
      const list = await tauriService.listDrafts()
      setDrafts(list)
      setError(null)
      onCountChange?.(list.length)
    } catch (err) {
      setError(getErrorMessage(err))
      onCountChange?.(0)
    }
  }

  if (error) {
    return (
      <div className="rounded-md border px-3 py-2 text-[11px]" style={{ borderColor: '#FECACA', backgroundColor: '#FEF2F2', color: '#991B1B' }}>
        {error}
      </div>
    )
  }

  if (drafts.length === 0) {
    return (
      <div className="py-6 text-center">
        <Bot className="h-8 w-8 mx-auto mb-2 opacity-30" style={{ color: '#737373' }} />
        <p className="text-xs" style={{ color: '#A3A3A3' }}>暂无待确认的草稿</p>
        <p className="text-[11px] mt-1" style={{ color: '#D4D4D4' }}>AI 修改后会出现待确认变更</p>
      </div>
    )
  }

  return (
    <div className="space-y-1.5">
      {drafts.map((draft) => (
        <button
          key={draft.draft_id}
          onClick={() => onSelectDraft(draft.draft_id)}
          className="flex items-center gap-2.5 w-full rounded-lg border px-3 py-2.5 text-left transition-colors hover:border-indigo-200 hover:bg-indigo-50/30"
          style={{ borderColor: '#E5E5E5' }}
        >
          <div
            className="flex h-7 w-7 items-center justify-center rounded-md flex-shrink-0"
            style={{ backgroundColor: 'var(--brand-primary-soft)' }}
          >
            <FileEdit className="h-3.5 w-3.5" style={{ color: 'var(--brand-primary)' }} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-medium truncate" style={{ color: '#0A0A0A' }}>
                {draft.target_path || '未知目标'}
              </span>
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="inline-flex items-center gap-0.5 text-[10px]" style={{ color: 'var(--brand-primary)' }}>
                <Bot className="h-2.5 w-2.5" />
                {draft.source_agent}
              </span>
              <span className="text-[10px]" style={{ color: '#A3A3A3' }}>
                {draft.ops_count} 项变更
              </span>
              <span className="inline-flex items-center gap-0.5 text-[10px]" style={{ color: '#A3A3A3' }}>
                <Clock className="h-2.5 w-2.5" />
                {formatTime(draft.updated_at)}
              </span>
            </div>
          </div>
          <ChevronRight className="h-3.5 w-3.5 flex-shrink-0" style={{ color: '#D4D4D4' }} />
        </button>
      ))}
    </div>
  )
}

const formatTime = (dateStr: string) => {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / (1000 * 60))
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))

  if (diffMins < 1) return '刚刚'
  if (diffMins < 60) return `${diffMins}分钟前`
  if (diffHours < 24) return `${diffHours}小时前`
  return date.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
}
