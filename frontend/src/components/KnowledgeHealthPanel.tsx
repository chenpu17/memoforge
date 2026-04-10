import React from 'react'
import { AlertTriangle, FileQuestion, Tag, Unlink } from 'lucide-react'
import type { PendingOrganize } from '../services/tauri'

interface KnowledgeHealthPanelProps {
  pending: PendingOrganize
  onSelectKnowledge: (path: string) => void
}

const ITEMS: { key: keyof PendingOrganize; label: string; icon: typeof AlertTriangle; color: string; bgColor: string }[] = [
  { key: 'no_summary', label: '无摘要', icon: FileQuestion, color: '#B45309', bgColor: '#FEF3C7' },
  { key: 'stale_summary', label: '摘要过期', icon: AlertTriangle, color: '#DC2626', bgColor: '#FEF2F2' },
  { key: 'no_tags', label: '无标签', icon: Tag, color: 'var(--brand-primary)', bgColor: 'var(--brand-primary-soft)' },
  { key: 'orphan', label: '孤立知识', icon: Unlink, color: '#737373', bgColor: '#F5F5F5' },
]

export const KnowledgeHealthPanel: React.FC<KnowledgeHealthPanelProps> = ({ pending }) => {
  const total = pending.no_summary + pending.stale_summary + pending.no_tags + pending.orphan

  if (total === 0) {
    return (
      <div className="rounded-xl border p-4" style={{ borderColor: '#E5E5E5', backgroundColor: '#FAFAFA' }}>
        <div className="flex items-center gap-2 mb-3">
          <div
            className="flex h-6 w-6 items-center justify-center rounded-md"
            style={{ backgroundColor: '#ECFDF5' }}
          >
            <span className="text-xs" style={{ color: '#047857' }}>OK</span>
          </div>
          <h3 className="text-xs font-medium" style={{ color: '#737373' }}>知识健康</h3>
        </div>
        <p className="text-xs" style={{ color: '#A3A3A3' }}>所有知识均已完成整理。</p>
      </div>
    )
  }

  return (
    <div className="rounded-xl border p-4" style={{ borderColor: '#E5E5E5' }}>
      <div className="flex items-center gap-2 mb-3">
        <div
          className="flex h-6 w-6 items-center justify-center rounded-md"
          style={{ backgroundColor: '#FEF3C7' }}
        >
          <AlertTriangle className="h-3.5 w-3.5" style={{ color: '#B45309' }} />
        </div>
        <h3 className="text-xs font-medium" style={{ color: '#737373' }}>待整理 ({total})</h3>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {ITEMS.map(({ key, label, icon: Icon, color, bgColor }) => {
          const count = pending[key]
          if (count === 0) return null
          return (
            <button
              key={key}
              className="flex items-center gap-2 rounded-lg border px-3 py-2 text-left transition-colors hover:opacity-80"
              style={{ borderColor: '#E5E5E5', backgroundColor: bgColor }}
              title={`查看 ${count} 个${label}知识`}
            >
              <Icon className="h-3.5 w-3.5 flex-shrink-0" style={{ color }} />
              <span className="text-xs font-medium" style={{ color }}>{count}</span>
              <span className="text-xs" style={{ color: '#737373' }}>{label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
