import React, { useEffect, useState } from 'react'
import { tauriService, DraftPreviewResponse, getErrorMessage } from '../services/tauri'
import { X, AlertTriangle, FileCheck, Trash2, FileEdit } from 'lucide-react'

interface DraftPreviewModalProps {
  draftId: string
  onCommit: () => void
  onDiscard: () => void
  onClose: () => void
}

export const DraftPreviewModal: React.FC<DraftPreviewModalProps> = ({
  draftId,
  onCommit,
  onDiscard,
  onClose,
}) => {
  const [preview, setPreview] = useState<DraftPreviewResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [actionInProgress, setActionInProgress] = useState<'commit' | 'discard' | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadPreview()
  }, [draftId])

  const loadPreview = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const data = await tauriService.getDraftPreview(draftId)
      setPreview(data)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setIsLoading(false)
    }
  }

  const handleCommit = async () => {
    setActionInProgress('commit')
    setError(null)
    try {
      await tauriService.commitDraft(draftId)
      onCommit()
      onClose()
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setActionInProgress(null)
    }
  }

  const handleDiscard = async () => {
    if (!confirm('确定要丢弃此草稿？所有变更将丢失。')) return

    setActionInProgress('discard')
    setError(null)
    try {
      await tauriService.discardDraft(draftId)
      onDiscard()
      onClose()
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setActionInProgress(null)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div
        className="relative bg-white rounded-xl shadow-xl w-[560px] max-h-[70vh] overflow-hidden"
        style={{ border: '1px solid #E5E5E5' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: '#E5E5E5' }}>
          <div className="flex items-center gap-2">
            <div
              className="flex h-7 w-7 items-center justify-center rounded-md"
              style={{ backgroundColor: 'var(--brand-primary-soft)' }}
            >
              <FileEdit className="h-3.5 w-3.5" style={{ color: 'var(--brand-primary)' }} />
            </div>
            <div>
              <h2 className="text-sm font-semibold" style={{ color: '#0A0A0A' }}>草稿预览</h2>
              <p className="text-[11px]" style={{ color: '#A3A3A3' }}>{draftId}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100">
            <X className="h-4 w-4" style={{ color: '#737373' }} />
          </button>
        </div>

        {/* Content */}
        <div className="px-5 py-4 overflow-y-auto max-h-[calc(70vh-140px)]">
          {isLoading && (
            <div className="py-8 text-center">
              <p className="text-xs" style={{ color: '#A3A3A3' }}>加载预览中...</p>
            </div>
          )}

          {error && (
            <div
              className="rounded-md border px-3 py-2 text-sm"
              style={{ borderColor: '#FECACA', backgroundColor: '#FEF2F2', color: '#991B1B' }}
            >
              {error}
            </div>
          )}

          {preview && !isLoading && (
            <div className="space-y-4">
              {/* Stats */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border px-3 py-2" style={{ borderColor: '#E5E5E5', backgroundColor: '#FAFAFA' }}>
                  <div className="text-[11px]" style={{ color: '#737373' }}>变更区段</div>
                  <div className="text-lg font-semibold" style={{ color: '#0A0A0A' }}>{preview.sections_changed}</div>
                </div>
                <div className="rounded-lg border px-3 py-2" style={{ borderColor: '#E5E5E5', backgroundColor: '#FAFAFA' }}>
                  <div className="text-[11px]" style={{ color: '#737373' }}>摘要状态</div>
                  <div className="text-sm font-medium" style={{ color: preview.summary_will_be_stale ? '#B45309' : '#047857' }}>
                    {preview.summary_will_be_stale ? '提交后需更新' : '无影响'}
                  </div>
                </div>
              </div>

              {/* Diff summary */}
              {preview.diff_summary && (
                <div>
                  <h3 className="text-xs font-medium mb-1.5" style={{ color: '#737373' }}>变更概要</h3>
                  <pre
                    className="rounded-lg border p-3 text-xs overflow-auto max-h-[200px]"
                    style={{ borderColor: '#E5E5E5', backgroundColor: '#FAFAFA', whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: '#334155' }}
                  >
                    {preview.diff_summary}
                  </pre>
                </div>
              )}

              {/* Warnings */}
              {preview.warnings.length > 0 && (
                <div>
                  <h3 className="text-xs font-medium mb-1.5" style={{ color: '#737373' }}>警告</h3>
                  <div className="space-y-1">
                    {preview.warnings.map((warning, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-2 rounded-md border px-3 py-2"
                        style={{ borderColor: '#FDE68A', backgroundColor: '#FFFBEB' }}
                      >
                        <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" style={{ color: '#B45309' }} />
                        <span className="text-xs" style={{ color: '#92400E' }}>{warning}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t" style={{ borderColor: '#E5E5E5' }}>
          <button
            onClick={handleDiscard}
            disabled={actionInProgress !== null || isLoading}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50"
            style={{ color: '#DC2626' }}
          >
            <Trash2 className="h-3.5 w-3.5" />
            {actionInProgress === 'discard' ? '丢弃中...' : '丢弃'}
          </button>
          <button
            onClick={handleCommit}
            disabled={actionInProgress !== null || isLoading}
            className="inline-flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-xs font-medium text-white disabled:opacity-50"
            style={{ backgroundColor: 'var(--brand-primary)' }}
          >
            <FileCheck className="h-3.5 w-3.5" />
            {actionInProgress === 'commit' ? '提交中...' : '确认提交'}
          </button>
        </div>
      </div>
    </div>
  )
}
