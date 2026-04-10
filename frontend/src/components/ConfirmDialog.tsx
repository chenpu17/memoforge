import React from 'react'
import { X, AlertTriangle, FileText, Link } from 'lucide-react'
import type { ReferenceInfo } from '../services/tauri'

interface ConfirmDialogProps {
  title: string
  message: string
  references?: ReferenceInfo[]
  confirmLabel?: string
  confirmStyle?: 'danger' | 'warning' | 'primary'
  onConfirm: () => void
  onCancel: () => void
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  title,
  message,
  references,
  confirmLabel = '确认',
  confirmStyle = 'primary',
  onConfirm,
  onCancel,
}) => {
  const styleMap = {
    danger: { bg: '#EF4444', hover: '#DC2626' },
    warning: { bg: '#F59E0B', hover: '#D97706' },
    primary: { bg: 'var(--brand-primary)', hover: 'var(--brand-primary-hover)' },
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white rounded-lg shadow-xl w-[480px] max-h-[80vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: '#E5E5E5' }}>
          <div className="flex items-center gap-2">
            {confirmStyle === 'danger' && (
              <AlertTriangle className="h-5 w-5" style={{ color: '#EF4444' }} />
            )}
            <h2 className="text-lg font-semibold">{title}</h2>
          </div>
          <button onClick={onCancel} className="p-1 hover:bg-gray-100 rounded">
            <X className="h-5 w-5" style={{ color: '#737373' }} />
          </button>
        </div>

        {/* Content */}
        <div className="px-5 py-4 overflow-y-auto max-h-[calc(80vh-140px)]">
          <p className="text-sm" style={{ color: '#374151' }}>{message}</p>

          {references && references.length > 0 && (
            <div className="mt-4">
              <div className="flex items-center gap-2 mb-2">
                <Link className="h-4 w-4" style={{ color: '#F59E0B' }} />
                <span className="text-sm font-medium" style={{ color: '#92400E' }}>
                  以下知识引用了此条目，可能需要更新：
                </span>
              </div>
              <div className="border rounded-lg overflow-hidden" style={{ borderColor: '#E5E5E5' }}>
                {references.map((ref, index) => (
                  <div
                    key={ref.path}
                    className={`flex items-center gap-3 px-3 py-2 ${
                      index !== references.length - 1 ? 'border-b' : ''
                    }`}
                    style={{ borderColor: '#E5E5E5', backgroundColor: '#FFFBEB' }}
                  >
                    <FileText className="h-4 w-4 flex-shrink-0" style={{ color: '#737373' }} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate" style={{ color: '#0A0A0A' }}>
                        {ref.title}
                      </div>
                      <div className="text-xs" style={{ color: '#737373' }}>
                        行 {ref.lines.join(', ')}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-5 py-4 border-t" style={{ borderColor: '#E5E5E5' }}>
          <button
            onClick={onCancel}
            className="px-4 py-2 border rounded-md text-sm"
            style={{ borderColor: '#E5E5E5' }}
          >
            取消
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 rounded-md text-white text-sm font-medium"
            style={{ backgroundColor: styleMap[confirmStyle].bg }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
