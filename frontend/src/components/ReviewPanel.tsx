import React, { useState, useEffect } from 'react'
import { tauriService, DraftSummary, DraftPreviewResponse, getErrorMessage } from '../services/tauri'
import {
  FileEdit,
  Clock,
  Bot,
  ChevronRight,
  ChevronDown,
  FileCheck,
  Trash2,
  AlertTriangle,
  MessageSquare,
  X,
} from 'lucide-react'

interface ReviewPanelProps {
  onRefresh?: () => void
}

// Modal for return notes
interface ReturnDialogProps {
  draftId: string
  draftTitle: string
  onConfirm: (draftId: string, notes: string) => void
  onCancel: () => void
}

const ReturnDialog: React.FC<ReturnDialogProps> = ({ draftId, draftTitle, onConfirm, onCancel }) => {
  const [notes, setNotes] = useState('')

  const handleConfirm = () => {
    onConfirm(draftId, notes)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onCancel} />
      <div
        className="relative bg-white rounded-xl shadow-xl w-[480px] overflow-hidden"
        style={{ border: '1px solid #E5E5E5' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: '#E5E5E5' }}>
          <div className="flex items-center gap-2">
            <div
              className="flex h-7 w-7 items-center justify-center rounded-md"
              style={{ backgroundColor: '#FEF3C7' }}
            >
              <MessageSquare className="h-3.5 w-3.5" style={{ color: '#D97706' }} />
            </div>
            <h2 className="text-sm font-semibold" style={{ color: '#0A0A0A' }}>退回修改</h2>
          </div>
          <button onClick={onCancel} className="p-1 rounded hover:bg-gray-100">
            <X className="h-4 w-4" style={{ color: '#737373' }} />
          </button>
        </div>

        {/* Content */}
        <div className="px-5 py-4">
          <p className="text-xs mb-3" style={{ color: '#737373' }}>
            退回 "{draftTitle}"，可选填写退回原因：
          </p>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="退回原因（可选）..."
            className="w-full rounded-lg border px-3 py-2 text-sm resize-none"
            style={{ borderColor: '#E5E5E5', minHeight: '80px' }}
          />
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-5 py-3 border-t" style={{ borderColor: '#E5E5E5' }}>
          <button
            onClick={onCancel}
            className="px-4 py-1.5 border rounded-lg text-xs font-medium"
            style={{ borderColor: '#E5E5E5' }}
          >
            取消
          </button>
          <button
            onClick={handleConfirm}
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

// Confirmation dialog for commit/discard
interface ConfirmActionDialogProps {
  title: string
  message: string
  confirmLabel: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

const ConfirmActionDialog: React.FC<ConfirmActionDialogProps> = ({
  title,
  message,
  confirmLabel,
  danger = false,
  onConfirm,
  onCancel,
}) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onCancel} />
      <div
        className="relative bg-white rounded-xl shadow-xl w-[440px] overflow-hidden"
        style={{ border: '1px solid #E5E5E5' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: '#E5E5E5' }}>
          <div className="flex items-center gap-2">
            {danger && (
              <div
                className="flex h-7 w-7 items-center justify-center rounded-md"
                style={{ backgroundColor: '#FEE2E2' }}
              >
                <AlertTriangle className="h-3.5 w-3.5" style={{ color: '#DC2626' }} />
              </div>
            )}
            <h2 className="text-sm font-semibold" style={{ color: '#0A0A0A' }}>{title}</h2>
          </div>
          <button onClick={onCancel} className="p-1 rounded hover:bg-gray-100">
            <X className="h-4 w-4" style={{ color: '#737373' }} />
          </button>
        </div>

        {/* Content */}
        <div className="px-5 py-4">
          <p className="text-sm" style={{ color: '#374151' }}>{message}</p>
        </div>

        {/* Footer */}
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
            style={{ backgroundColor: danger ? '#DC2626' : 'var(--brand-primary)' }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

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
      <div
        className="flex h-5 w-5 items-center justify-center rounded-full"
        style={{ backgroundColor: iconBg }}
      >
        {type === 'success' ? (
          <FileCheck className="h-3 w-3.5 text-white" />
        ) : (
          <AlertTriangle className="h-3 w-3.5 text-white" />
        )}
      </div>
      <span className="text-sm font-medium" style={{ color: textColor }}>
        {message}
      </span>
    </div>
  )
}

export const ReviewPanel: React.FC<ReviewPanelProps> = ({ onRefresh }) => {
  const [drafts, setDrafts] = useState<DraftSummary[]>([])
  const [expandedDraftId, setExpandedDraftId] = useState<string | null>(null)
  const [preview, setPreview] = useState<Record<string, DraftPreviewResponse>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionInProgress, setActionInProgress] = useState<string | null>(null)
  const [showReturnDialog, setShowReturnDialog] = useState<{ draftId: string; draftTitle: string } | null>(null)
  const [showConfirmDialog, setShowConfirmDialog] = useState<{
    action: 'commit' | 'discard'
    draftId: string
    draftTitle: string
  } | null>(null)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  useEffect(() => {
    void loadDrafts()
  }, [])

  const loadDrafts = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const allDrafts = await tauriService.listDrafts()
      const pendingDrafts = allDrafts.filter(d => d.review_state === 'pending')
      setDrafts(pendingDrafts)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setIsLoading(false)
    }
  }

  const loadPreview = async (draftId: string) => {
    if (preview[draftId]) return // Already loaded

    try {
      const data = await tauriService.getDraftPreview(draftId)
      setPreview(prev => ({ ...prev, [draftId]: data }))
    } catch (err) {
      console.error('Failed to load draft preview:', err)
    }
  }

  const handleExpand = (draftId: string) => {
    if (expandedDraftId === draftId) {
      setExpandedDraftId(null)
    } else {
      setExpandedDraftId(draftId)
      void loadPreview(draftId)
    }
  }

  const handleCommit = async (draftId: string) => {
    setShowConfirmDialog(null)
    setActionInProgress(draftId)

    try {
      await tauriService.commitDraft(draftId)
      setToast({ message: '提交成功', type: 'success' })
      await loadDrafts()
      onRefresh?.()
    } catch (err) {
      setToast({ message: `提交失败: ${getErrorMessage(err)}`, type: 'error' })
    } finally {
      setActionInProgress(null)
    }
  }

  const handleReturn = async (draftId: string, notes: string) => {
    setShowReturnDialog(null)
    setActionInProgress(draftId)

    try {
      await tauriService.updateDraftReviewState(draftId, 'returned', notes || undefined)
      setToast({ message: '退回成功', type: 'success' })
      await loadDrafts()
      onRefresh?.()
    } catch (err) {
      setToast({ message: `退回失败: ${getErrorMessage(err)}`, type: 'error' })
    } finally {
      setActionInProgress(null)
    }
  }

  const handleDiscard = async (draftId: string) => {
    setShowConfirmDialog(null)
    setActionInProgress(draftId)

    try {
      await tauriService.discardDraft(draftId)
      setToast({ message: '丢弃成功', type: 'success' })
      await loadDrafts()
      onRefresh?.()
    } catch (err) {
      setToast({ message: `丢弃失败: ${getErrorMessage(err)}`, type: 'error' })
    } finally {
      setActionInProgress(null)
    }
  }

  const getSourceInfo = (draft: DraftSummary) => {
    const parts: string[] = []

    if (draft.source_session_id) {
      const shortId = draft.source_session_id.slice(0, 8)
      parts.push(`来自 Agent 会话: ${shortId}`)
    } else if (draft.source_inbox_item_id) {
      const shortId = draft.source_inbox_item_id.slice(0, 8)
      parts.push(`来自 Inbox: ${shortId}`)
    }

    if (draft.source_agent) {
      parts.push(`Agent: ${draft.source_agent}`)
    }

    return parts.join(' · ')
  }

  const getStatusBadge = (state?: string) => {
    switch (state) {
      case 'pending':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: '#FEF3C7', color: '#92400E' }}>
            待审阅
          </span>
        )
      case 'returned':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: '#FEE2E2', color: '#991B1B' }}>
            已退回
          </span>
        )
      default:
        return null
    }
  }

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

  if (drafts.length === 0) {
    return (
      <div className="py-12 text-center">
        <FileEdit className="h-10 w-10 mx-auto mb-3 opacity-20" style={{ color: '#737373' }} />
        <p className="text-sm" style={{ color: '#A3A3A3' }}>待审阅的 AI 变更会出现在这里</p>
        <p className="text-xs mt-1" style={{ color: '#D4D4D4' }}>当 Agent 修改知识时，变更会先进入审阅流程</p>
      </div>
    )
  }

  return (
    <div className="space-y-0">
      {/* Header */}
      <div className="px-4 py-3 border-b" style={{ borderColor: '#E5E5E5' }}>
        <h2 className="text-sm font-semibold" style={{ color: '#0A0A0A' }}>Review 待审阅</h2>
      </div>

      {/* Drafts List */}
      <div className="divide-y" style={{ borderColor: '#F5F5F5' }}>
        {drafts.map((draft) => {
          const isExpanded = expandedDraftId === draft.draft_id
          const draftPreview = preview[draft.draft_id]

          return (
            <div key={draft.draft_id} className="divide-y" style={{ borderColor: '#F5F5F5' }}>
              {/* Summary Row */}
              <button
                onClick={() => handleExpand(draft.draft_id)}
                className="w-full px-4 py-3.5 flex items-center gap-3 hover:bg-gray-50 transition-colors text-left"
                disabled={actionInProgress === draft.draft_id}
              >
                <div
                  className="flex h-8 w-8 items-center justify-center rounded-md flex-shrink-0"
                  style={{ backgroundColor: 'var(--brand-primary-soft)' }}
                >
                  <FileEdit className="h-4 w-4" style={{ color: 'var(--brand-primary)' }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-xs font-medium truncate" style={{ color: '#0A0A0A' }}>
                      {draft.target_path || '未知目标'}
                    </span>
                    {getStatusBadge(draft.review_state)}
                  </div>
                  <div className="flex items-center gap-2">
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
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4 flex-shrink-0" style={{ color: '#D4D4D4' }} />
                ) : (
                  <ChevronRight className="h-4 w-4 flex-shrink-0" style={{ color: '#D4D4D4' }} />
                )}
              </button>

              {/* Expanded Preview */}
              {isExpanded && (
                <div className="px-4 py-3 bg-gray-50/50">
                  {/* Source Info */}
                  <div className="text-[11px] mb-3" style={{ color: '#737373' }}>
                    {getSourceInfo(draft)}
                  </div>

                  {/* Preview Content */}
                  {draftPreview ? (
                    <div className="space-y-3 mb-4">
                      {/* Stats */}
                      <div className="grid grid-cols-2 gap-2">
                        <div className="rounded-md border px-3 py-2" style={{ borderColor: '#E5E5E5', backgroundColor: 'white' }}>
                          <div className="text-[10px]" style={{ color: '#737373' }}>变更区段</div>
                          <div className="text-sm font-semibold" style={{ color: '#0A0A0A' }}>
                            {draftPreview.sections_changed}
                          </div>
                        </div>
                        <div className="rounded-md border px-3 py-2" style={{ borderColor: '#E5E5E5', backgroundColor: 'white' }}>
                          <div className="text-[10px]" style={{ color: '#737373' }}>摘要状态</div>
                          <div className="text-xs font-medium" style={{ color: draftPreview.summary_will_be_stale ? '#B45309' : '#047857' }}>
                            {draftPreview.summary_will_be_stale ? '提交后需更新' : '无影响'}
                          </div>
                        </div>
                      </div>

                      {/* Diff Summary */}
                      {draftPreview.diff_summary && (
                        <div>
                          <div className="text-[10px] font-medium mb-1" style={{ color: '#737373' }}>变更概要</div>
                          <pre
                            className="rounded-md border p-2.5 text-[11px] overflow-auto max-h-[180px]"
                            style={{ borderColor: '#E5E5E5', backgroundColor: 'white', whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: '#334155' }}
                          >
                            {draftPreview.diff_summary}
                          </pre>
                        </div>
                      )}

                      {/* Warnings */}
                      {draftPreview.warnings.length > 0 && (
                        <div>
                          <div className="text-[10px] font-medium mb-1" style={{ color: '#737373' }}>警告</div>
                          <div className="space-y-1">
                            {draftPreview.warnings.map((warning, i) => (
                              <div
                                key={i}
                                className="flex items-start gap-2 rounded-md border px-2.5 py-1.5"
                                style={{ borderColor: '#FDE68A', backgroundColor: '#FFFBEB' }}
                              >
                                <AlertTriangle className="h-3 w-3 flex-shrink-0 mt-0.5" style={{ color: '#B45309' }} />
                                <span className="text-[11px]" style={{ color: '#92400E' }}>{warning}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="py-6 text-center">
                      <div className="animate-spin rounded-full h-5 w-5 border-2 border-gray-300 border-t-gray-600 mx-auto mb-2" />
                      <p className="text-[11px]" style={{ color: '#A3A3A3' }}>加载预览中...</p>
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="flex items-center justify-end gap-2 pt-2 border-t" style={{ borderColor: '#E5E5E5' }}>
                    <button
                      onClick={() => setShowReturnDialog({ draftId: draft.draft_id, draftTitle: draft.target_path || '未知目标' })}
                      disabled={actionInProgress === draft.draft_id}
                      className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50"
                      style={{ color: '#D97706' }}
                    >
                      <MessageSquare className="h-3.5 w-3.5" />
                      退回修改
                    </button>
                    <button
                      onClick={() => setShowConfirmDialog({ action: 'discard', draftId: draft.draft_id, draftTitle: draft.target_path || '未知目标' })}
                      disabled={actionInProgress === draft.draft_id}
                      className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50"
                      style={{ color: '#DC2626' }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      丢弃
                    </button>
                    <button
                      onClick={() => setShowConfirmDialog({ action: 'commit', draftId: draft.draft_id, draftTitle: draft.target_path || '未知目标' })}
                      disabled={actionInProgress === draft.draft_id}
                      className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                      style={{ backgroundColor: 'var(--brand-primary)' }}
                    >
                      <FileCheck className="h-3.5 w-3.5" />
                      {actionInProgress === draft.draft_id ? '提交中...' : '确认提交'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Modals */}
      {showReturnDialog && (
        <ReturnDialog
          draftId={showReturnDialog.draftId}
          draftTitle={showReturnDialog.draftTitle}
          onConfirm={handleReturn}
          onCancel={() => setShowReturnDialog(null)}
        />
      )}

      {showConfirmDialog && (
        <ConfirmActionDialog
          title={showConfirmDialog.action === 'commit' ? '确认提交' : '丢弃变更'}
          message={
            showConfirmDialog.action === 'commit'
              ? '确认提交此变更？变更将写入知识库。'
              : '确定丢弃此变更？此操作不可恢复。'
          }
          confirmLabel={showConfirmDialog.action === 'commit' ? '确认提交' : '确认丢弃'}
          danger={showConfirmDialog.action === 'discard'}
          onConfirm={() =>
            showConfirmDialog.action === 'commit'
              ? handleCommit(showConfirmDialog.draftId)
              : handleDiscard(showConfirmDialog.draftId)
          }
          onCancel={() => setShowConfirmDialog(null)}
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
