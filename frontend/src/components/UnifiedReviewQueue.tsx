import React, { useState, useEffect, useCallback } from 'react'
import { tauriService, getErrorMessage } from '../services/tauri'
import type { ReviewItem, ReviewSourceType, ReviewStatus, ReviewDecision, DraftPreviewResponse } from '../types'
import { useAppStore } from '../stores/appStore'
import {
  ClipboardCheck,
  Clock,
  ChevronRight,
  ChevronDown,
  CheckCircle2,
  RotateCcw,
  Trash2,
  AlertTriangle,
  MessageSquare,
  X,
  Filter,
  FileText,
  Shield,
  Upload,
  FolderInput,
  Eye,
} from 'lucide-react'

interface UnifiedReviewQueueProps {
  onRefresh?: () => void
}

// ==================== Source Type Config ====================

const sourceTypeConfig: Record<ReviewSourceType, {
  label: string
  color: string
  bgColor: string
  icon: React.ReactNode
}> = {
  agent_draft: {
    label: 'Agent Draft',
    color: '#1D4ED8',
    bgColor: '#EFF6FF',
    icon: <FileText className="h-3 w-3" />,
  },
  inbox_promotion: {
    label: 'Inbox',
    color: '#047857',
    bgColor: '#ECFDF5',
    icon: <Upload className="h-3 w-3" />,
  },
  reliability_fix: {
    label: 'Reliability',
    color: '#B45309',
    bgColor: '#FFFBEB',
    icon: <Shield className="h-3 w-3" />,
  },
  import_cleanup: {
    label: 'Import',
    color: '#7C3AED',
    bgColor: '#F5F3FF',
    icon: <FolderInput className="h-3 w-3" />,
  },
}

// ==================== Status Config ====================

const statusConfig: Record<ReviewStatus, {
  label: string
  color: string
  bgColor: string
}> = {
  pending: { label: '待审阅', color: '#92400E', bgColor: '#FEF3C7' },
  in_review: { label: '审阅中', color: '#1D4ED8', bgColor: '#EFF6FF' },
  approved: { label: '已通过', color: '#047857', bgColor: '#ECFDF5' },
  returned: { label: '已退回', color: '#991B1B', bgColor: '#FEE2E2' },
  discarded: { label: '已丢弃', color: '#737373', bgColor: '#F3F4F6' },
}

// ==================== Sub-components ====================

// Return notes dialog
interface ReturnDialogProps {
  itemId: string
  itemTitle: string
  onConfirm: (itemId: string, notes: string) => void
  onCancel: () => void
}

const ReturnDialog: React.FC<ReturnDialogProps> = ({ itemId, itemTitle, onConfirm, onCancel }) => {
  const [notes, setNotes] = useState('')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onCancel} />
      <div
        className="relative bg-white rounded-xl shadow-xl w-[480px] overflow-hidden"
        style={{ border: '1px solid #E5E5E5' }}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: '#E5E5E5' }}>
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md" style={{ backgroundColor: '#FEF3C7' }}>
              <MessageSquare className="h-3.5 w-3.5" style={{ color: '#D97706' }} />
            </div>
            <h2 className="text-sm font-semibold" style={{ color: '#0A0A0A' }}>退回修改</h2>
          </div>
          <button onClick={onCancel} className="p-1 rounded hover:bg-gray-100">
            <X className="h-4 w-4" style={{ color: '#737373' }} />
          </button>
        </div>
        <div className="px-5 py-4">
          <p className="text-xs mb-3" style={{ color: '#737373' }}>
            退回 "{itemTitle}"，可选填写退回原因：
          </p>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="退回原因（可选）..."
            className="w-full rounded-lg border px-3 py-2 text-sm resize-none"
            style={{ borderColor: '#E5E5E5', minHeight: '80px' }}
          />
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 border-t" style={{ borderColor: '#E5E5E5' }}>
          <button
            onClick={onCancel}
            className="px-4 py-1.5 border rounded-lg text-xs font-medium"
            style={{ borderColor: '#E5E5E5' }}
          >
            取消
          </button>
          <button
            onClick={() => onConfirm(itemId, notes)}
            className="px-4 py-1.5 rounded-lg text-xs font-medium text-white"
            style={{ backgroundColor: '#D97706' }}
          >
            确认退回
          </button>
        </div>
      </div>
    </div>
  )
}

// Confirmation dialog for approve/discard
interface ConfirmActionDialogProps {
  title: string
  message: string
  confirmLabel: string
  confirmColor: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

const ConfirmActionDialog: React.FC<ConfirmActionDialogProps> = ({
  title,
  message,
  confirmLabel,
  confirmColor,
  danger = false,
  onConfirm,
  onCancel,
}) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center">
    <div className="absolute inset-0 bg-black/30" onClick={onCancel} />
    <div
      className="relative bg-white rounded-xl shadow-xl w-[440px] overflow-hidden"
      style={{ border: '1px solid #E5E5E5' }}
    >
      <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: '#E5E5E5' }}>
        <div className="flex items-center gap-2">
          {danger && (
            <div className="flex h-7 w-7 items-center justify-center rounded-md" style={{ backgroundColor: '#FEE2E2' }}>
              <AlertTriangle className="h-3.5 w-3.5" style={{ color: '#DC2626' }} />
            </div>
          )}
          <h2 className="text-sm font-semibold" style={{ color: '#0A0A0A' }}>{title}</h2>
        </div>
        <button onClick={onCancel} className="p-1 rounded hover:bg-gray-100">
          <X className="h-4 w-4" style={{ color: '#737373' }} />
        </button>
      </div>
      <div className="px-5 py-4">
        <p className="text-sm" style={{ color: '#374151' }}>{message}</p>
      </div>
      <div className="flex justify-end gap-2 px-5 py-3 border-t" style={{ borderColor: '#E5E5E5' }}>
        <button
          onClick={onCancel}
          className="px-4 py-1.5 border rounded-lg text-xs font-medium"
          style={{ borderColor: '#E5E5E5' }}
        >
          取消
        </button>
        <button
          onClick={onConfirm}
          className="px-4 py-1.5 rounded-lg text-xs font-medium text-white"
          style={{ backgroundColor: confirmColor }}
        >
          {confirmLabel}
        </button>
      </div>
    </div>
  </div>
)

// Toast notification
interface ToastProps {
  message: string
  type?: 'success' | 'error'
  onClose: () => void
}

const Toast: React.FC<ToastProps> = ({ message, type = 'success', onClose }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000)
    return () => clearTimeout(timer)
  }, [onClose])

  const bgColor = type === 'success' ? '#ECFDF5' : '#FEF2F2'
  const textColor = type === 'success' ? '#047857' : '#DC2626'
  const iconBg = type === 'success' ? '#10B981' : '#EF4444'

  return (
    <div
      className="fixed bottom-4 right-4 z-50 flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg animate-slide-in"
      style={{ backgroundColor: bgColor, border: `1px solid ${type === 'success' ? '#D1FAE5' : '#FECACA'}` }}
    >
      <div className="flex h-5 w-5 items-center justify-center rounded-full" style={{ backgroundColor: iconBg }}>
        {type === 'success' ? (
          <CheckCircle2 className="h-3 w-3.5 text-white" />
        ) : (
          <AlertTriangle className="h-3 w-3.5 text-white" />
        )}
      </div>
      <span className="text-sm font-medium" style={{ color: textColor }}>{message}</span>
    </div>
  )
}

// ==================== Helper ====================

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

// ==================== Main Component ====================

type StatusFilter = 'all' | 'pending' | 'in_review' | 'returned'
type SourceFilter = 'all' | ReviewSourceType

export const UnifiedReviewQueue: React.FC<UnifiedReviewQueueProps> = ({ onRefresh }) => {
  const { setActiveAgentPanel } = useAppStore((state) => ({
    setActiveAgentPanel: state.setActiveAgentPanel,
  }))
  const [items, setItems] = useState<ReviewItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [previewData, setPreviewData] = useState<Record<string, DraftPreviewResponse>>({})
  const [previewLoading, setPreviewLoading] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all')
  const [actionInProgress, setActionInProgress] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [showReturnDialog, setShowReturnDialog] = useState<{ id: string; title: string } | null>(null)
  const [showConfirmDialog, setShowConfirmDialog] = useState<{
    action: 'approve' | 'discard'
    id: string
    title: string
  } | null>(null)
  const [batchConfirmAction, setBatchConfirmAction] = useState<'approve' | 'discard' | null>(null)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  const loadItems = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const data = await tauriService.listReviewItems()
      setItems(data)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadItems()
  }, [loadItems])

  // Computed: filtered items
  const filteredItems = items.filter((item) => {
    if (statusFilter !== 'all' && item.status !== statusFilter) return false
    if (sourceFilter !== 'all' && item.source_type !== sourceFilter) return false
    return true
  })

  // Computed: status counts
  const statusCounts = items.reduce<Record<string, number>>((acc, item) => {
    acc[item.status] = (acc[item.status] || 0) + 1
    return acc
  }, {})

  // Toggle expand for preview
  const handleExpand = useCallback((itemId: string, draftId?: string) => {
    setExpandedId((prev) => {
      if (prev === itemId) return null
      // Load draft preview when expanding
      if (draftId && !previewData[itemId]) {
        setPreviewLoading(itemId)
        tauriService.getDraftPreview(draftId)
          .then((preview) => {
            setPreviewData((prev) => ({ ...prev, [itemId]: preview }))
          })
          .catch(() => {
            // Silently fail — preview is optional
          })
          .finally(() => {
            setPreviewLoading(null)
          })
      }
      return itemId
    })
  }, [previewData])

  // Toggle selection for batch operations
  const toggleSelect = (itemId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(itemId)) {
        next.delete(itemId)
      } else {
        next.add(itemId)
      }
      return next
    })
  }

  const toggleSelectAll = () => {
    const actionableIds = filteredItems
      .filter((item) => item.status === 'pending' || item.status === 'returned')
      .map((item) => item.review_item_id)
    if (selectedIds.size === actionableIds.length && actionableIds.length > 0) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(actionableIds))
    }
  }

  // Apply a decision to a single item
  const applyDecision = async (itemId: string, decision: ReviewDecision, notes?: string) => {
    setActionInProgress(itemId)
    try {
      await tauriService.applyReviewDecision({
        review_item_id: itemId,
        decision,
        notes,
      })
      const decisionLabel = decision === 'approve' ? '通过' : decision === 'return' ? '退回' : decision === 'discard' ? '丢弃' : '重开'
      setToast({ message: `操作成功：${decisionLabel}`, type: 'success' })
      await loadItems()
      onRefresh?.()
    } catch (err) {
      setToast({ message: `操作失败: ${getErrorMessage(err)}`, type: 'error' })
    } finally {
      setActionInProgress(null)
    }
  }

  // Batch apply
  const handleBatchAction = async (decision: 'approve' | 'discard') => {
    setBatchConfirmAction(null)
    setActionInProgress('batch')
    let successCount = 0
    let failCount = 0
    for (const id of selectedIds) {
      try {
        await tauriService.applyReviewDecision({
          review_item_id: id,
          decision,
        })
        successCount++
      } catch {
        failCount++
      }
    }
    setSelectedIds(new Set())
    setActionInProgress(null)
    if (failCount === 0) {
      setToast({ message: `批量${decision === 'approve' ? '通过' : '丢弃'}成功：${successCount} 项`, type: 'success' })
    } else {
      setToast({ message: `完成：${successCount} 成功，${failCount} 失败`, type: 'error' })
    }
    await loadItems()
    onRefresh?.()
  }

  const sourceTypeToAgentPanel: Record<ReviewSourceType, 'sessions' | 'inbox' | 'reliability' | null> = {
    agent_draft: 'sessions',
    inbox_promotion: 'inbox',
    reliability_fix: 'reliability',
    import_cleanup: null,
  }

  const handleNavigateToSource = (sourceType: ReviewSourceType) => {
    const panel = sourceTypeToAgentPanel[sourceType]
    if (panel) {
      setActiveAgentPanel(panel)
    }
  }

  // Determine which actions are available for a given status
  const getAvailableActions = (status: ReviewStatus) => {
    switch (status) {
      case 'pending':
      case 'in_review':
        return { approve: true, return: true, discard: true, reopen: false }
      case 'returned':
        return { approve: false, return: false, discard: false, reopen: true }
      default:
        return { approve: false, return: false, discard: false, reopen: false }
    }
  }

  // ==================== Render ====================

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-6 w-6 border-2 border-gray-300 border-t-gray-600" />
      </div>
    )
  }

  if (error) {
    return (
      <div
        className="rounded-md border px-3 py-2 text-xs"
        style={{ borderColor: '#FECACA', backgroundColor: '#FEF2F2', color: '#991B1B' }}
      >
        {error}
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="border-b px-4 py-3" style={{ borderColor: '#E5E5E5' }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ClipboardCheck className="h-4 w-4" style={{ color: 'var(--brand-primary)' }} />
            <h1 className="text-sm font-semibold" style={{ color: '#0A0A0A' }}>Unified Review Queue</h1>
          </div>
          <button
            onClick={() => void loadItems()}
            className="text-[11px] font-medium px-2 py-1 rounded-md hover:bg-gray-100"
            style={{ color: '#737373' }}
          >
            刷新
          </button>
        </div>
      </div>

      {/* Stats Bar */}
      <div className="border-b px-4 py-2 flex items-center gap-3" style={{ borderColor: '#E5E5E5' }}>
        <span className="text-[10px] font-medium" style={{ color: '#737373' }}>
          <Filter className="h-3 w-3 inline mr-1" />
          统计：
        </span>
        {(['pending', 'in_review', 'returned'] as ReviewStatus[]).map((status) => {
          const config = statusConfig[status]
          const count = statusCounts[status] || 0
          if (count === 0 && status !== 'pending') return null
          return (
            <span
              key={status}
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
              style={{ backgroundColor: config.bgColor, color: config.color }}
            >
              {config.label} {count}
            </span>
          )
        })}
        {(statusCounts['approved'] || 0) > 0 && (
          <span
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
            style={{ backgroundColor: statusConfig.approved.bgColor, color: statusConfig.approved.color }}
          >
            已通过 {statusCounts['approved']}
          </span>
        )}
        {(statusCounts['discarded'] || 0) > 0 && (
          <span
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
            style={{ backgroundColor: statusConfig.discarded.bgColor, color: statusConfig.discarded.color }}
          >
            已丢弃 {statusCounts['discarded']}
          </span>
        )}
      </div>

      {/* Filter Tabs */}
      <div className="border-b px-4 pt-2" style={{ borderColor: '#E5E5E5' }}>
        {/* Status filters */}
        <div className="flex gap-1 overflow-x-auto pb-1.5">
          {([
            { value: 'all' as StatusFilter, label: '全部' },
            { value: 'pending' as StatusFilter, label: '待审阅' },
            { value: 'in_review' as StatusFilter, label: '审阅中' },
            { value: 'returned' as StatusFilter, label: '已退回' },
          ]).map((tab) => {
            const isActive = statusFilter === tab.value
            return (
              <button
                key={tab.value}
                type="button"
                onClick={() => setStatusFilter(tab.value)}
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
        {/* Source type filters */}
        <div className="flex gap-1 overflow-x-auto pb-2">
          {([
            { value: 'all' as SourceFilter, label: '全部来源' },
            { value: 'agent_draft' as SourceFilter, label: 'Agent Draft' },
            { value: 'inbox_promotion' as SourceFilter, label: 'Inbox' },
            { value: 'reliability_fix' as SourceFilter, label: 'Reliability' },
            { value: 'import_cleanup' as SourceFilter, label: 'Import' },
          ]).map((tab) => {
            const isActive = sourceFilter === tab.value
            return (
              <button
                key={tab.value}
                type="button"
                onClick={() => setSourceFilter(tab.value)}
                className="whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[10px] font-medium"
                style={{
                  borderColor: isActive ? 'var(--brand-primary-border)' : '#E5E7EB',
                  backgroundColor: isActive ? 'var(--brand-primary-soft)' : '#FFFFFF',
                  color: isActive ? 'var(--brand-primary-strong)' : '#737373',
                }}
              >
                {tab.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Batch Action Bar */}
      {selectedIds.size > 0 && (
        <div
          className="flex items-center justify-between px-4 py-2 border-b"
          style={{ borderColor: '#E5E5E5', backgroundColor: '#FAFAFA' }}
        >
          <span className="text-xs font-medium" style={{ color: '#374151' }}>
            已选择 {selectedIds.size} 项
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setBatchConfirmAction('approve')}
              disabled={actionInProgress === 'batch'}
              className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
              style={{ backgroundColor: '#059669' }}
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              {actionInProgress === 'batch' ? '处理中...' : '批量通过'}
            </button>
            <button
              onClick={() => setBatchConfirmAction('discard')}
              disabled={actionInProgress === 'batch'}
              className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
              style={{ backgroundColor: '#DC2626' }}
            >
              <Trash2 className="h-3.5 w-3.5" />
              批量丢弃
            </button>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {filteredItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 px-8 text-center">
            <ClipboardCheck className="h-10 w-10 mx-auto mb-3 opacity-20" style={{ color: '#737373' }} />
            <p className="text-sm" style={{ color: '#A3A3A3' }}>暂无待审阅项目</p>
            <p className="text-xs mt-1" style={{ color: '#D4D4D4' }}>
              来自 Agent Draft、Inbox、Reliability 和 Import 的待确认变更会出现在这里
            </p>
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: '#F5F5F5' }}>
            {/* Select All Row */}
            {(statusFilter === 'all' || statusFilter === 'pending' || statusFilter === 'returned') && filteredItems.length > 1 && (
              <div
                className="px-4 py-2 flex items-center gap-3"
                style={{ backgroundColor: '#FAFAFA', borderBottom: '1px solid #F5F5F5' }}
              >
                <input
                  type="checkbox"
                  checked={(() => {
                    const actionableIds = filteredItems
                      .filter((item) => item.status === 'pending' || item.status === 'returned')
                      .map((item) => item.review_item_id)
                    return actionableIds.length > 0 && actionableIds.every((id) => selectedIds.has(id))
                  })()}
                  onChange={toggleSelectAll}
                  className="h-3.5 w-3.5 rounded border-gray-300"
                />
                <span className="text-[10px]" style={{ color: '#737373' }}>全选（仅待审阅和已退回）</span>
              </div>
            )}

            {filteredItems.map((item) => {
              const isExpanded = expandedId === item.review_item_id
              const sourceConfig = sourceTypeConfig[item.source_type]
              const currentStatusConfig = statusConfig[item.status]
              const actions = getAvailableActions(item.status)
              const isActionable = item.status === 'pending' || item.status === 'returned' || item.status === 'in_review'
              const canSelect = item.status === 'pending' || item.status === 'returned'

              return (
                <div key={item.review_item_id} className="divide-y" style={{ borderColor: '#F5F5F5' }}>
                  {/* Summary Row */}
                  <div className="px-4 py-3.5 flex items-start gap-3 hover:bg-gray-50/50 transition-colors">
                    {/* Checkbox */}
                    {canSelect && (
                      <div className="flex items-center h-8 flex-shrink-0 pt-0.5">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(item.review_item_id)}
                          onChange={() => toggleSelect(item.review_item_id)}
                          className="h-3.5 w-3.5 rounded border-gray-300"
                        />
                      </div>
                    )}

                    {/* Expand toggle */}
                    <button
                      onClick={() => handleExpand(item.review_item_id, item.draft_id)}
                      className="mt-1.5 flex-shrink-0"
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4" style={{ color: '#D4D4D4' }} />
                      ) : (
                        <ChevronRight className="h-4 w-4" style={{ color: '#D4D4D4' }} />
                      )}
                    </button>

                    {/* Source type icon */}
                    <div
                      className="flex h-8 w-8 items-center justify-center rounded-md flex-shrink-0"
                      style={{ backgroundColor: sourceConfig.bgColor }}
                    >
                      <span style={{ color: sourceConfig.color }}>{sourceConfig.icon}</span>
                    </div>

                    {/* Main info */}
                    <button
                      onClick={() => handleExpand(item.review_item_id, item.draft_id)}
                      className="flex-1 min-w-0 text-left"
                      disabled={actionInProgress === item.review_item_id}
                    >
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-xs font-medium truncate" style={{ color: '#0A0A0A' }}>
                          {item.title}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                          style={{ backgroundColor: sourceConfig.bgColor, color: sourceConfig.color }}
                        >
                          {sourceConfig.label}
                        </span>
                        <span
                          className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded"
                          style={{ backgroundColor: currentStatusConfig.bgColor, color: currentStatusConfig.color }}
                        >
                          {currentStatusConfig.label}
                        </span>
                        {item.risk_flags.length > 0 && (
                          <span className="inline-flex items-center gap-0.5 text-[10px]" style={{ color: '#B45309' }}>
                            <AlertTriangle className="h-2.5 w-2.5" />
                            {item.risk_flags.length} 风险
                          </span>
                        )}
                        <span className="inline-flex items-center gap-0.5 text-[10px]" style={{ color: '#A3A3A3' }}>
                          <Clock className="h-2.5 w-2.5" />
                          {formatTime(item.updated_at)}
                        </span>
                      </div>
                    </button>

                    {/* Quick actions (only for actionable items) */}
                    {isActionable && (
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {actions.approve && (
                          <button
                            onClick={() =>
                              setShowConfirmDialog({
                                action: 'approve',
                                id: item.review_item_id,
                                title: item.title,
                              })
                            }
                            disabled={actionInProgress === item.review_item_id}
                            title="通过"
                            className="h-7 w-7 inline-flex items-center justify-center rounded-md hover:bg-green-50 disabled:opacity-50"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" style={{ color: '#059669' }} />
                          </button>
                        )}
                        {actions.reopen && (
                          <button
                            onClick={() => void applyDecision(item.review_item_id, 'reopen')}
                            disabled={actionInProgress === item.review_item_id}
                            title="重开"
                            className="h-7 w-7 inline-flex items-center justify-center rounded-md hover:bg-blue-50 disabled:opacity-50"
                          >
                            <RotateCcw className="h-3.5 w-3.5" style={{ color: '#2563EB' }} />
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Expanded Detail */}
                  {isExpanded && (
                    <div className="px-4 py-3 bg-gray-50/50">
                      {/* Diff Preview */}
                      {previewLoading === item.review_item_id && (
                        <div className="mb-3 rounded-md border px-3 py-2 flex items-center gap-2" style={{ borderColor: '#E5E5E5', backgroundColor: 'white' }}>
                          <div className="animate-spin rounded-full h-3 w-3 border border-gray-300 border-t-gray-600" />
                          <span className="text-[10px]" style={{ color: '#737373' }}>加载变更预览...</span>
                        </div>
                      )}
                      {previewData[item.review_item_id] && (
                        <div className="mb-3 rounded-md border" style={{ borderColor: '#E5E5E5', backgroundColor: 'white' }}>
                          <div className="px-3 py-2 border-b flex items-center gap-2" style={{ borderColor: '#E5E5E5' }}>
                            <Eye className="h-3 w-3" style={{ color: '#737373' }} />
                            <span className="text-[10px] font-medium" style={{ color: '#737373' }}>变更预览</span>
                            {previewData[item.review_item_id].sections_changed > 0 && (
                              <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-medium" style={{ backgroundColor: '#EFF6FF', color: '#1D4ED8' }}>
                                {previewData[item.review_item_id].sections_changed} 处变更
                              </span>
                            )}
                            {previewData[item.review_item_id].summary_will_be_stale && (
                              <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-medium" style={{ backgroundColor: '#FEF3C7', color: '#92400E' }}>
                                摘要将过期
                              </span>
                            )}
                          </div>
                          {previewData[item.review_item_id].diff_summary && (
                            <div className="px-3 py-2">
                              <pre className="text-[10px] whitespace-pre-wrap font-mono" style={{ color: '#374151' }}>
                                {previewData[item.review_item_id].diff_summary}
                              </pre>
                            </div>
                          )}
                          {previewData[item.review_item_id].warnings.length > 0 && (
                            <div className="px-3 py-2 border-t" style={{ borderColor: '#FEF3C7' }}>
                              {previewData[item.review_item_id].warnings.map((w, i) => (
                                <div key={i} className="flex items-start gap-1.5 text-[10px] mb-0.5" style={{ color: '#92400E' }}>
                                  <AlertTriangle className="h-2.5 w-2.5 flex-shrink-0 mt-0.5" />
                                  {w}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Risk Flags */}
                      {item.risk_flags.length > 0 && (
                        <div className="mb-3">
                          <div className="text-[10px] font-medium mb-1" style={{ color: '#737373' }}>风险标记</div>
                          <div className="flex flex-wrap gap-1">
                            {item.risk_flags.map((flag, i) => (
                              <span
                                key={i}
                                className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px]"
                                style={{ borderColor: '#FDE68A', backgroundColor: '#FFFBEB', color: '#92400E' }}
                              >
                                <AlertTriangle className="h-2.5 w-2.5" />
                                {flag}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Metadata */}
                      <div className="grid grid-cols-3 gap-2 mb-3">
                        <div className="rounded-md border px-3 py-2" style={{ borderColor: '#E5E5E5', backgroundColor: 'white' }}>
                          <div className="text-[10px]" style={{ color: '#737373' }}>来源类型</div>
                          <div className="text-xs font-medium" style={{ color: sourceConfig.color }}>
                            {sourceConfig.label}
                          </div>
                        </div>
                        <div className="rounded-md border px-3 py-2" style={{ borderColor: '#E5E5E5', backgroundColor: 'white' }}>
                          <div className="text-[10px]" style={{ color: '#737373' }}>来源 ID</div>
                          {sourceTypeToAgentPanel[item.source_type] ? (
                            <button
                              type="button"
                              onClick={() => handleNavigateToSource(item.source_type)}
                              className="text-xs font-mono truncate hover:underline"
                              style={{ color: 'var(--brand-primary)' }}
                              title={`跳转到 ${sourceTypeConfig[item.source_type].label}`}
                            >
                              {item.source_ref_id.slice(0, 12)}
                            </button>
                          ) : (
                            <div className="text-xs font-mono truncate" style={{ color: '#0A0A0A' }}>
                              {item.source_ref_id.slice(0, 12)}
                            </div>
                          )}
                        </div>
                        <div className="rounded-md border px-3 py-2" style={{ borderColor: '#E5E5E5', backgroundColor: 'white' }}>
                          <div className="text-[10px]" style={{ color: '#737373' }}>创建时间</div>
                          <div className="text-xs" style={{ color: '#0A0A0A' }}>
                            {formatTime(item.created_at)}
                          </div>
                        </div>
                      </div>

                      {/* Decision info (if decided) */}
                      {(item.decided_by || item.decided_at) && (
                        <div className="rounded-md border px-3 py-2 mb-3" style={{ borderColor: '#E5E5E5', backgroundColor: 'white' }}>
                          <div className="text-[10px]" style={{ color: '#737373' }}>决策信息</div>
                          <div className="text-xs" style={{ color: '#374151' }}>
                            {item.decided_by && <span>处理者: {item.decided_by}</span>}
                            {item.decided_at && (
                              <span className="ml-3">
                                {formatTime(item.decided_at)}
                              </span>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Action Buttons */}
                      {isActionable && (
                        <div className="flex items-center justify-end gap-2 pt-2 border-t" style={{ borderColor: '#E5E5E5' }}>
                          {actions.reopen && (
                            <button
                              onClick={() => void applyDecision(item.review_item_id, 'reopen')}
                              disabled={actionInProgress === item.review_item_id}
                              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50"
                              style={{ color: '#2563EB' }}
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                              重开
                            </button>
                          )}
                          {actions.return && (
                            <button
                              onClick={() =>
                                setShowReturnDialog({
                                  id: item.review_item_id,
                                  title: item.title,
                                })
                              }
                              disabled={actionInProgress === item.review_item_id}
                              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50"
                              style={{ color: '#D97706' }}
                            >
                              <MessageSquare className="h-3.5 w-3.5" />
                              退回修改
                            </button>
                          )}
                          {actions.discard && (
                            <button
                              onClick={() =>
                                setShowConfirmDialog({
                                  action: 'discard',
                                  id: item.review_item_id,
                                  title: item.title,
                                })
                              }
                              disabled={actionInProgress === item.review_item_id}
                              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50"
                              style={{ color: '#DC2626' }}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              丢弃
                            </button>
                          )}
                          {actions.approve && (
                            <button
                              onClick={() =>
                                setShowConfirmDialog({
                                  action: 'approve',
                                  id: item.review_item_id,
                                  title: item.title,
                                })
                              }
                              disabled={actionInProgress === item.review_item_id}
                              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                              style={{ backgroundColor: '#059669' }}
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              {actionInProgress === item.review_item_id ? '处理中...' : '确认通过'}
                            </button>
                          )}
                        </div>
                      )}

                      {/* Non-actionable status display */}
                      {!isActionable && (
                        <div className="flex items-center justify-center pt-2 border-t" style={{ borderColor: '#E5E5E5' }}>
                          <span className="text-xs" style={{ color: '#A3A3A3' }}>
                            此项目已处理（{currentStatusConfig.label}）
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Modals */}
      {showReturnDialog && (
        <ReturnDialog
          itemId={showReturnDialog.id}
          itemTitle={showReturnDialog.title}
          onConfirm={(itemId, notes) => {
            setShowReturnDialog(null)
            void applyDecision(itemId, 'return', notes)
          }}
          onCancel={() => setShowReturnDialog(null)}
        />
      )}

      {showConfirmDialog && (
        <ConfirmActionDialog
          title={showConfirmDialog.action === 'approve' ? '确认通过' : '丢弃变更'}
          message={
            showConfirmDialog.action === 'approve'
              ? `确认通过「${showConfirmDialog.title}」？变更将写入知识库。`
              : `确定丢弃「${showConfirmDialog.title}」？此操作不可恢复。`
          }
          confirmLabel={showConfirmDialog.action === 'approve' ? '确认通过' : '确认丢弃'}
          confirmColor={showConfirmDialog.action === 'approve' ? '#059669' : '#DC2626'}
          danger={showConfirmDialog.action === 'discard'}
          onConfirm={() => {
            const { action, id } = showConfirmDialog
            setShowConfirmDialog(null)
            void applyDecision(id, action)
          }}
          onCancel={() => setShowConfirmDialog(null)}
        />
      )}

      {batchConfirmAction && (
        <ConfirmActionDialog
          title={batchConfirmAction === 'approve' ? '批量通过' : '批量丢弃'}
          message={
            batchConfirmAction === 'approve'
              ? `确认通过选中的 ${selectedIds.size} 项？变更将写入知识库。`
              : `确定丢弃选中的 ${selectedIds.size} 项？此操作不可恢复。`
          }
          confirmLabel={batchConfirmAction === 'approve' ? '确认全部通过' : '确认全部丢弃'}
          confirmColor={batchConfirmAction === 'approve' ? '#059669' : '#DC2626'}
          danger={batchConfirmAction === 'discard'}
          onConfirm={() => void handleBatchAction(batchConfirmAction)}
          onCancel={() => setBatchConfirmAction(null)}
        />
      )}

      {/* Toast */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      <style>{`
        @keyframes slide-in {
          from {
            transform: translateY(20px);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }
        .animate-slide-in {
          animation: slide-in 0.3s ease-out;
        }
      `}</style>
    </div>
  )
}
