import React, { useEffect, useState } from 'react'
import {
  tauriService,
  InboxItem,
  AgentSession,
  DraftSummary,
  getErrorMessage,
} from '../services/tauri'
import { Inbox, Layers, CheckCircle, XCircle, Clock, PlayCircle } from 'lucide-react'

interface MinimalWorkspaceProps {
  onSelectKnowledge: (path: string) => void
}

export const MinimalWorkspace: React.FC<MinimalWorkspaceProps> = () => {
  const [inboxItems, setInboxItems] = useState<InboxItem[]>([])
  const [sessions, setSessions] = useState<AgentSession[]>([])
  const [reviewDrafts, setReviewDrafts] = useState<DraftSummary[]>([])
  const [activeTab, setActiveTab] = useState<'inbox' | 'sessions' | 'review'>('inbox')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      setLoading(true)
      setError(null)

      // Load all three lists in parallel
      const [inboxData, sessionsData, draftsData] = await Promise.all([
        tauriService.listInboxItems('new', 10).catch(() => []),
        tauriService.listAgentSessions('running', 10).catch(() => []),
        tauriService.listDrafts().catch(() => []),
      ])

      setInboxItems(inboxData)
      setSessions(sessionsData)
      setReviewDrafts(draftsData.filter(d => d.review_state === 'pending'))
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'running':
        return <PlayCircle className="h-3 w-3" style={{ color: '#3B82F6' }} />
      case 'completed':
        return <CheckCircle className="h-3 w-3" style={{ color: '#10B981' }} />
      case 'failed':
        return <XCircle className="h-3 w-3" style={{ color: '#EF4444' }} />
      case 'cancelled':
        return <XCircle className="h-3 w-3" style={{ color: '#F59E0B' }} />
      default:
        return <Clock className="h-3 w-3" style={{ color: '#6B7280' }} />
    }
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

  if (error) {
    return (
      <div className="p-6">
        <div
          className="rounded-md border px-3 py-2 text-sm"
          style={{ borderColor: '#FECACA', backgroundColor: '#FEF2F2', color: '#991B1B' }}
        >
          加载数据失败: {error}
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="p-6 text-center">
        <p className="text-xs" style={{ color: '#A3A3A3' }}>加载中...</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Tab navigation */}
      <div className="flex border-b" style={{ borderColor: '#E5E5E5' }}>
        <button
          onClick={() => setActiveTab('inbox')}
          className={`px-4 py-2 text-xs font-medium transition-colors ${
            activeTab === 'inbox'
              ? 'border-b-2'
              : 'text-gray-500 hover:text-gray-700'
          }`}
          style={
            activeTab === 'inbox'
              ? { borderColor: 'var(--brand-primary)', color: 'var(--brand-primary)' }
              : {}
          }
        >
          收件箱 ({inboxItems.length})
        </button>
        <button
          onClick={() => setActiveTab('sessions')}
          className={`px-4 py-2 text-xs font-medium transition-colors ${
            activeTab === 'sessions'
              ? 'border-b-2'
              : 'text-gray-500 hover:text-gray-700'
          }`}
          style={
            activeTab === 'sessions'
              ? { borderColor: 'var(--brand-primary)', color: 'var(--brand-primary)' }
              : {}
          }
        >
          会话 ({sessions.length})
        </button>
        <button
          onClick={() => setActiveTab('review')}
          className={`px-4 py-2 text-xs font-medium transition-colors ${
            activeTab === 'review'
              ? 'border-b-2'
              : 'text-gray-500 hover:text-gray-700'
          }`}
          style={
            activeTab === 'review'
              ? { borderColor: 'var(--brand-primary)', color: 'var(--brand-primary)' }
              : {}
          }
        >
          审核 ({reviewDrafts.length})
        </button>
      </div>

      {/* Inbox Tab */}
      {activeTab === 'inbox' && (
        <div className="rounded-xl border p-4" style={{ borderColor: '#E5E5E5' }}>
          <div className="flex items-center gap-2 mb-3">
            <Inbox className="h-4 w-4" style={{ color: 'var(--brand-primary)' }} />
            <h3 className="text-sm font-medium" style={{ color: '#0A0A0A' }}>
              收件箱
            </h3>
          </div>
          {inboxItems.length === 0 ? (
            <p className="text-xs" style={{ color: '#A3A3A3' }}>
              收件箱为空。
            </p>
          ) : (
            <div className="space-y-2">
              {inboxItems.map((item) => (
                <div
                  key={item.id}
                  className="rounded-lg border p-3 flex items-start gap-3"
                  style={{ borderColor: '#F3F4F6' }}
                >
                  <div className="flex-shrink-0 mt-0.5">
                    <Clock className="h-3 w-3" style={{ color: '#9CA3AF' }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium truncate" style={{ color: '#0A0A0A' }}>
                        {item.title}
                      </span>
                      <span className="text-[10px] flex-shrink-0" style={{ color: '#6B7280' }}>
                        {formatTime(item.created_at)}
                      </span>
                    </div>
                    {item.snippet && (
                      <p className="text-xs truncate" style={{ color: '#6B7280' }}>
                        {item.snippet}
                      </p>
                    )}
                    {item.source_type && (
                      <span className="text-[10px] inline-block mt-1 px-1.5 py-0.5 rounded" style={{ color: '#6B7280', backgroundColor: '#F3F4F6' }}>
                        {item.source_type}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Sessions Tab */}
      {activeTab === 'sessions' && (
        <div className="rounded-xl border p-4" style={{ borderColor: '#E5E5E5' }}>
          <div className="flex items-center gap-2 mb-3">
            <Layers className="h-4 w-4" style={{ color: 'var(--brand-primary)' }} />
            <h3 className="text-sm font-medium" style={{ color: '#0A0A0A' }}>
              Agent 会话
            </h3>
          </div>
          {sessions.length === 0 ? (
            <p className="text-xs" style={{ color: '#A3A3A3' }}>
              暂无运行中的会话。
            </p>
          ) : (
            <div className="space-y-2">
              {sessions.map((session) => (
                <div
                  key={session.id}
                  className="rounded-lg border p-3 flex items-start gap-3"
                  style={{ borderColor: '#F3F4F6' }}
                >
                  <div className="flex-shrink-0 mt-0.5">
                    {getStatusIcon(session.status)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium" style={{ color: '#0A0A0A' }}>
                        {session.agent_name}
                      </span>
                      <span className="text-[10px] flex-shrink-0" style={{ color: '#6B7280' }}>
                        {formatTime(session.started_at)}
                      </span>
                    </div>
                    <p className="text-xs truncate" style={{ color: '#6B7280' }}>
                      {session.goal}
                    </p>
                    {session.context_items.length > 0 && (
                      <span className="text-[10px] inline-block mt-1 px-1.5 py-0.5 rounded" style={{ color: '#6B7280', backgroundColor: '#F3F4F6' }}>
                        {session.context_items.length} 上下文项
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Review Tab */}
      {activeTab === 'review' && (
        <div className="rounded-xl border p-4" style={{ borderColor: '#E5E5E5' }}>
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle className="h-4 w-4" style={{ color: '#F59E0B' }} />
            <h3 className="text-sm font-medium" style={{ color: '#0A0A0A' }}>
              待审核草稿
            </h3>
          </div>
          {reviewDrafts.length === 0 ? (
            <p className="text-xs" style={{ color: '#A3A3A3' }}>
              暂无待审核的草稿。
            </p>
          ) : (
            <div className="space-y-2">
              {reviewDrafts.map((draft) => (
                <div
                  key={draft.draft_id}
                  className="rounded-lg border p-3 flex items-start gap-3"
                  style={{ borderColor: '#F3F4F6' }}
                >
                  <div className="flex-shrink-0 mt-0.5">
                    <CheckCircle className="h-3 w-3" style={{ color: '#F59E0B' }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium" style={{ color: '#0A0A0A' }}>
                        {draft.target_path || '新知识点'}
                      </span>
                      <span className="text-[10px] flex-shrink-0" style={{ color: '#6B7280' }}>
                        {formatTime(draft.updated_at)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px]" style={{ color: '#6B7280' }}>
                        来源: {draft.source_agent}
                      </span>
                      {draft.ops_count > 0 && (
                        <span className="text-[10px] inline-block px-1.5 py-0.5 rounded" style={{ color: '#6B7280', backgroundColor: '#F3F4F6' }}>
                          {draft.ops_count} 操作
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
