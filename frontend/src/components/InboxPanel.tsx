import React, { useEffect, useState } from 'react'
import { Inbox, CheckCircle2, XCircle, ChevronDown, ChevronRight, FileText, User } from 'lucide-react'
import { tauriService } from '../services/tauri'
import type { InboxItem } from '../types'

type StatusFilter = 'all' | 'new' | 'triaged' | 'drafted' | 'promoted' | 'ignored'

const statusLabels: Record<string, { label: string; color: string; bgColor: string }> = {
  new: { label: '新候选项', color: '#6366F1', bgColor: '#EEF2FF' },
  triaged: { label: '已整理', color: '#0891B2', bgColor: '#ECFEFF' },
  drafted: { label: '已草稿', color: '#7C3AED', bgColor: '#F5F3FF' },
  promoted: { label: '已发布', color: '#059669', bgColor: '#ECFDF5' },
  ignored: { label: '已忽略', color: '#737373', bgColor: '#F3F4F6' },
}

const sourceTypeLabels: Record<string, { label: string; icon: React.ReactNode }> = {
  agent: { label: 'Agent', icon: <User className="h-3 w-3" /> },
  import: { label: '导入', icon: <FileText className="h-3 w-3" /> },
  paste: { label: '粘贴', icon: <FileText className="h-3 w-3" /> },
  manual: { label: '手动', icon: <User className="h-3 w-3" /> },
  reliability: { label: '可靠性', icon: <User className="h-3 w-3" /> },
}

export const InboxPanel: React.FC = () => {
  const [items, setItems] = useState<InboxItem[]>([])
  const [filter, setFilter] = useState<StatusFilter>('all')
  const [loading, setLoading] = useState(true)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)

  const loadItems = async () => {
    try {
      setLoading(true)
      setError(null)
      const fetched = await tauriService.listInboxItems(filter === 'all' ? undefined : filter, 100)
      setItems(fetched)
    } catch (err) {
      console.error('Failed to load inbox items:', err)
      setError(typeof err === 'string' ? err : '加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadItems()
  }, [filter])

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const handlePromote = async (item: InboxItem) => {
    try {
      await tauriService.promoteInboxItemToDraft(item.id)
      await loadItems()
    } catch (err) {
      console.error('Failed to promote inbox item:', err)
      alert('转为 Draft 失败: ' + err)
    }
  }

  const handleDismiss = async (item: InboxItem) => {
    try {
      await tauriService.dismissInboxItem(item.id)
      await loadItems()
    } catch (err) {
      console.error('Failed to dismiss inbox item:', err)
      alert('忽略失败: ' + err)
    }
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
    return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
  }

  const filteredItems = filter === 'all' ? items : items.filter((item) => item.status === filter)

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="border-b px-4 py-3" style={{ borderColor: '#E5E5E5' }}>
        <div className="flex items-center gap-2">
          <Inbox className="h-4 w-4" style={{ color: 'var(--brand-primary)' }} />
          <h1 className="text-sm font-semibold" style={{ color: '#0A0A0A' }}>Inbox 收件箱</h1>
        </div>
      </div>

      {/* Status Filter Tabs */}
      <div className="border-b px-4 pt-2" style={{ borderColor: '#E5E5E5' }}>
        <div className="flex gap-1 overflow-x-auto pb-2 scrollbar-hide">
          {[
            { value: 'all', label: '全部' },
            { value: 'new', label: '新候选项' },
            { value: 'triaged', label: '已整理' },
            { value: 'ignored', label: '已忽略' },
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
        ) : filteredItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 px-8 text-center">
            <Inbox className="h-8 w-8 mb-2" style={{ color: '#D4D4D8' }} />
            <p className="text-xs" style={{ color: '#737373' }}>Agent 创建的候选项会出现在这里。你可以审阅后转为正式知识或忽略。</p>
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: '#E5E5E5' }}>
            {filteredItems.map((item) => {
              const isExpanded = expandedIds.has(item.id)
              const statusInfo = statusLabels[item.status] || statusLabels.new
              const sourceInfo = sourceTypeLabels[item.source_type] || sourceTypeLabels.manual

              return (
                <div key={item.id} className="px-4 py-3">
                  <div className="flex items-start gap-3">
                    <button
                      type="button"
                      onClick={() => toggleExpand(item.id)}
                      className="mt-0.5 flex-shrink-0"
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4" style={{ color: '#A3A3A3' }} />
                      ) : (
                        <ChevronRight className="h-4 w-4" style={{ color: '#A3A3A3' }} />
                      )}
                    </button>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span
                          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
                          style={{ backgroundColor: '#F3F4F6', color: '#737373' }}
                        >
                          {sourceInfo.icon}
                          {sourceInfo.label}
                        </span>
                        <span
                          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
                          style={{ backgroundColor: statusInfo.bgColor, color: statusInfo.color }}
                        >
                          {statusInfo.label}
                        </span>
                        <span className="text-[10px]" style={{ color: '#A3A3A3' }}>{formatDate(item.created_at)}</span>
                      </div>

                      <h3 className="text-xs font-medium mb-1" style={{ color: '#0A0A0A' }}>{item.title}</h3>

                      {item.source_agent && (
                        <div className="text-[10px]" style={{ color: '#737373' }}>来源: {item.source_agent}</div>
                      )}

                      {isExpanded && (item.snippet || item.content_markdown) && (
                        <div className="mt-2 p-2 rounded-lg text-[11px] whitespace-pre-wrap" style={{ backgroundColor: '#F9FAFB', color: '#525252' }}>
                          {item.snippet || item.content_markdown}
                        </div>
                      )}

                      {item.status === 'new' && (
                        <div className="mt-2 flex gap-2">
                          <button
                            type="button"
                            onClick={() => handlePromote(item)}
                            className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium"
                            style={{ backgroundColor: 'var(--brand-primary-soft)', color: 'var(--brand-primary-strong)' }}
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            转为 Draft
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDismiss(item)}
                            className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium"
                            style={{ backgroundColor: '#FEF2F2', color: '#991B1B' }}
                          >
                            <XCircle className="h-3.5 w-3.5" />
                            忽略
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
