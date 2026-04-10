import React, { useEffect, useState } from 'react'
import { MessageSquare, Bot, Clock, CheckCircle, XCircle, AlertCircle, ChevronRight, FileText, Package, ArrowLeft } from 'lucide-react'
import { tauriService } from '../services/tauri'
import type { AgentSession } from '../types'

type StatusFilter = 'all' | 'running' | 'completed' | 'failed' | 'cancelled'

const statusLabels: Record<string, { label: string; color: string; bgColor: string; icon: React.ReactNode }> = {
  running: { label: '运行中', color: '#F59E0B', bgColor: '#FEF3C7', icon: <Clock className="h-3 w-3" /> },
  completed: { label: '已完成', color: '#059669', bgColor: '#ECFDF5', icon: <CheckCircle className="h-3 w-3" /> },
  failed: { label: '失败', color: '#DC2626', bgColor: '#FEF2F2', icon: <XCircle className="h-3 w-3" /> },
  cancelled: { label: '已取消', color: '#737373', bgColor: '#F3F4F6', icon: <AlertCircle className="h-3 w-3" /> },
}

const refTypeLabels: Record<string, { label: string; icon: React.ReactNode }> = {
  knowledge: { label: '知识', icon: <FileText className="h-3 w-3" /> },
  pack: { label: '上下文包', icon: <Package className="h-3 w-3" /> },
  url: { label: 'URL', icon: <FileText className="h-3 w-3" /> },
  file: { label: '文件', icon: <FileText className="h-3 w-3" /> },
}

export const AgentSessionPanel: React.FC = () => {
  const [sessions, setSessions] = useState<AgentSession[]>([])
  const [filter, setFilter] = useState<StatusFilter>('all')
  const [loading, setLoading] = useState(true)
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const [selectedSession, setSelectedSession] = useState<AgentSession | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadSessions = async () => {
    try {
      setLoading(true)
      setError(null)
      const fetched = await tauriService.listAgentSessions(filter === 'all' ? undefined : filter, 100)
      setSessions(fetched)
    } catch (err) {
      console.error('Failed to load agent sessions:', err)
      setError(typeof err === 'string' ? err : '加载失败')
    } finally {
      setLoading(false)
    }
  }

  const loadSessionDetail = async (sessionId: string) => {
    try {
      const session = await tauriService.getAgentSession(sessionId)
      setSelectedSession(session)
    } catch (err) {
      console.error('Failed to load session detail:', err)
      alert('加载会话详情失败: ' + err)
    }
  }

  useEffect(() => {
    void loadSessions()
  }, [filter])

  useEffect(() => {
    if (selectedSessionId) {
      void loadSessionDetail(selectedSessionId)
    }
  }, [selectedSessionId])

  const handleBackToList = () => {
    setSelectedSessionId(null)
    setSelectedSession(null)
  }

  const handleSessionClick = (sessionId: string) => {
    setSelectedSessionId(sessionId)
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return '刚刚'
    if (diffMins < 60) return `${diffMins}分钟前`
    if (diffHours < 24) return `${diffHours}小时前`
    if (diffDays === 1) return '昨天'
    if (diffDays < 7) return `${diffDays}天前`
    return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  const truncate = (text: string, maxLength = 60) => {
    if (text.length <= maxLength) return text
    return text.substring(0, maxLength) + '...'
  }

  const filteredSessions = filter === 'all' ? sessions : sessions.filter((session) => session.status === filter)

  if (selectedSession && selectedSessionId) {
    return (
      <div className="flex flex-col h-full bg-white">
        {/* Detail Header */}
        <div className="border-b px-4 py-3 flex items-center gap-2" style={{ borderColor: '#E5E5E5' }}>
          <button
            type="button"
            onClick={handleBackToList}
            className="flex-shrink-0 rounded-md p-1 hover:bg-gray-100"
          >
            <ArrowLeft className="h-4 w-4" style={{ color: '#737373' }} />
          </button>
          <Bot className="h-4 w-4 flex-shrink-0" style={{ color: 'var(--brand-primary)' }} />
          <h1 className="text-sm font-semibold truncate" style={{ color: '#0A0A0A' }}>
            会话详情 · {selectedSession.agent_name}
          </h1>
        </div>

        {/* Detail Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {/* Goal */}
          <div className="mb-4">
            <div className="text-[11px] font-medium mb-1" style={{ color: '#737373' }}>目标</div>
            <div className="p-3 rounded-lg text-xs whitespace-pre-wrap" style={{ backgroundColor: '#F9FAFB', color: '#0A0A0A' }}>
              {selectedSession.goal}
            </div>
          </div>

          {/* Status */}
          <div className="mb-4">
            <div className="text-[11px] font-medium mb-1" style={{ color: '#737373' }}>状态</div>
            <span
              className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-medium"
              style={{
                backgroundColor: statusLabels[selectedSession.status]?.bgColor || '#F3F4F6',
                color: statusLabels[selectedSession.status]?.color || '#737373',
              }}
            >
              {statusLabels[selectedSession.status]?.icon}
              {statusLabels[selectedSession.status]?.label || selectedSession.status}
            </span>
          </div>

          {/* Result Summary */}
          {selectedSession.result_summary && (
            <div className="mb-4">
              <div className="text-[11px] font-medium mb-1" style={{ color: '#737373' }}>结果摘要</div>
              <div className="p-3 rounded-lg text-xs whitespace-pre-wrap" style={{ backgroundColor: '#F0FDF4', color: '#0A0A0A' }}>
                {selectedSession.result_summary}
              </div>
            </div>
          )}

          {/* Time Range */}
          <div className="mb-4">
            <div className="text-[11px] font-medium mb-1" style={{ color: '#737373' }}>时间范围</div>
            <div className="text-xs" style={{ color: '#525252' }}>
              开始: {formatDate(selectedSession.started_at)}
              {selectedSession.finished_at && (
                <>
                  <br />
                  结束: {formatDate(selectedSession.finished_at)}
                </>
              )}
            </div>
          </div>

          {/* Context Items */}
          {selectedSession.context_items.length > 0 && (
            <div className="mb-4">
              <div className="text-[11px] font-medium mb-2" style={{ color: '#737373' }}>
                上下文引用 ({selectedSession.context_items.length})
              </div>
              <div className="space-y-1">
                {selectedSession.context_items.map((item, index) => {
                  const refInfo = refTypeLabels[item.ref_type] || refTypeLabels.file
                  return (
                    <div
                      key={index}
                      className="flex items-center gap-2 p-2 rounded-lg text-xs"
                      style={{ backgroundColor: '#F9FAFB' }}
                    >
                      {refInfo.icon}
                      <span className="flex-shrink-0 text-[10px]" style={{ color: '#737373' }}>{refInfo.label}</span>
                      <span className="truncate flex-1" style={{ color: '#0A0A0A' }}>{item.ref_id}</span>
                      <span className="text-[10px] flex-shrink-0" style={{ color: '#A3A3A3' }}>{formatDate(item.accessed_at)}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Draft IDs */}
          {selectedSession.draft_ids.length > 0 && (
            <div className="mb-4">
              <div className="text-[11px] font-medium mb-2" style={{ color: '#737373' }}>
                关联草稿 ({selectedSession.draft_ids.length})
              </div>
              <div className="space-y-1">
                {selectedSession.draft_ids.map((draftId, index) => (
                  <div
                    key={index}
                    className="p-2 rounded-lg text-xs"
                    style={{ backgroundColor: '#F5F3FF', color: '#6D28D9' }}
                  >
                    {draftId}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Inbox Item IDs */}
          {selectedSession.inbox_item_ids.length > 0 && (
            <div className="mb-4">
              <div className="text-[11px] font-medium mb-2" style={{ color: '#737373' }}>
                关联收件箱项 ({selectedSession.inbox_item_ids.length})
              </div>
              <div className="space-y-1">
                {selectedSession.inbox_item_ids.map((itemId, index) => (
                  <div
                    key={index}
                    className="p-2 rounded-lg text-xs"
                    style={{ backgroundColor: '#EEF2FF', color: '#4338CA' }}
                  >
                    {itemId}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Context Pack IDs */}
          {selectedSession.context_pack_ids.length > 0 && (
            <div className="mb-4">
              <div className="text-[11px] font-medium mb-2" style={{ color: '#737373' }}>
                上下文包 ({selectedSession.context_pack_ids.length})
              </div>
              <div className="space-y-1">
                {selectedSession.context_pack_ids.map((packId, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-2 p-2 rounded-lg text-xs"
                    style={{ backgroundColor: '#F9FAFB' }}
                  >
                    <Package className="h-3.5 w-3.5" style={{ color: '#737373' }} />
                    <span style={{ color: '#0A0A0A' }}>{packId}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="border-b px-4 py-3 flex items-center gap-2" style={{ borderColor: '#E5E5E5' }}>
        <MessageSquare className="h-4 w-4" style={{ color: 'var(--brand-primary)' }} />
        <h1 className="text-sm font-semibold" style={{ color: '#0A0A0A' }}>Sessions 会话</h1>
      </div>

      {/* Status Filter Tabs */}
      <div className="border-b px-4 pt-2" style={{ borderColor: '#E5E5E5' }}>
        <div className="flex gap-1 overflow-x-auto pb-2 scrollbar-hide">
          {[
            { value: 'all', label: '全部' },
            { value: 'running', label: '运行中' },
            { value: 'completed', label: '已完成' },
            { value: 'failed', label: '失败' },
          ].map((tab) => {
            const isActive = filter === tab.value
            return (
              <button
                key={tab.value}
                type="button"
                onClick={() => setFilter(tab.value as StatusFilter)}
                className="whitespace-nowrap rounded-full border px-3 py-1 text-xs font-medium"
                style={{
                  borderColor: isActive ? 'var(--brand-primary-border)' : '#E5E7EB',
                  backgroundColor: isActive ? 'var(--brand-primary-soft)' : '#FFFFFF',
                  color: isActive ? 'var(--brand-primary-strong)' : '#525252',
                }}
              >
                {tab.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-48 text-xs" style={{ color: '#737373' }}>
            加载中...
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-48 text-xs" style={{ color: '#DC2626' }}>
            {error}
          </div>
        ) : filteredSessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 px-8 text-center">
            <MessageSquare className="h-8 w-8 mb-2" style={{ color: '#D4D4D8' }} />
            <p className="text-xs" style={{ color: '#737373' }}>Agent 工作会话记录会出现在这里。每次协作过程都会被完整记录。</p>
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: '#E5E5E5' }}>
            {filteredSessions.map((session) => {
              const statusInfo = statusLabels[session.status] || statusLabels.completed

              return (
                <button
                  key={session.id}
                  type="button"
                  onClick={() => handleSessionClick(session.id)}
                  className="w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex-shrink-0">
                      <Bot className="h-4 w-4" style={{ color: 'var(--brand-primary)' }} />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span
                          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
                          style={{ backgroundColor: statusInfo.bgColor, color: statusInfo.color }}
                        >
                          {statusInfo.icon}
                          {statusInfo.label}
                        </span>
                        <span className="text-[10px]" style={{ color: '#737373' }}>{formatDate(session.started_at)}</span>
                      </div>

                      <div className="text-xs font-medium mb-1" style={{ color: '#0A0A0A' }}>
                        {session.agent_name}
                      </div>

                      <div className="text-[11px] mb-1" style={{ color: '#525252' }}>
                        {truncate(session.goal)}
                      </div>

                      <div className="flex items-center gap-3 text-[10px]" style={{ color: '#A3A3A3' }}>
                        {session.context_items.length > 0 && (
                          <span>上下文 {session.context_items.length}</span>
                        )}
                        {session.draft_ids.length > 0 && (
                          <span>草稿 {session.draft_ids.length}</span>
                        )}
                        {session.inbox_item_ids.length > 0 && (
                          <span>收件箱 {session.inbox_item_ids.length}</span>
                        )}
                      </div>
                    </div>

                    <ChevronRight className="h-4 w-4 flex-shrink-0 mt-2" style={{ color: '#D4D4D4' }} />
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
