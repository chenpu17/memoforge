import React from 'react'
import type { Knowledge } from '../types'

interface KnowledgeListItemProps {
  knowledge: Knowledge
  isSelected: boolean
  isActive?: boolean
  listDensity: 'compact' | 'comfortable'
  categoryLabel: string
  onSelect: (knowledgeId: string) => void
  formatDate: (dateStr: string) => string
  style?: React.CSSProperties
  ariaAttributes?: React.HTMLAttributes<HTMLDivElement>
}

export const KnowledgeListItem = React.memo(({
  knowledge,
  isSelected,
  isActive = false,
  listDensity,
  categoryLabel,
  onSelect,
  formatDate,
  style,
  ariaAttributes,
}: KnowledgeListItemProps) => {
  const primaryTag = knowledge.tags[0]
  const extraTagCount = Math.max(knowledge.tags.length - 1, 0)

  return (
    <div
      className="px-2 py-1.5"
      {...ariaAttributes}
      style={{
        ...style,
        backgroundColor: '#FFFFFF',
        contentVisibility: 'auto',
        containIntrinsicSize: listDensity === 'comfortable' ? '120px' : (isSelected ? '96px' : '68px'),
      }}
    >
      <button
        type="button"
        className="w-full rounded-2xl border text-left transition-colors hover:bg-[#F8FAFC]"
        style={{
          padding: listDensity === 'compact' ? '11px 12px' : '13px 13px',
          borderColor: isSelected ? 'var(--brand-primary-border)' : (isActive ? 'var(--brand-primary-panel-border)' : '#EEF2F7'),
          backgroundColor: isSelected ? 'var(--brand-primary-soft)' : (isActive ? 'var(--brand-primary-surface)' : '#FFFFFF'),
          boxShadow: isSelected
            ? '0 8px 24px var(--brand-primary-shadow-soft)'
            : (isActive ? '0 4px 16px rgba(59, 130, 246, 0.06)' : 'none'),
        }}
        onClick={() => onSelect(knowledge.id)}
      >
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-center gap-1.5 text-[10px]" style={{ color: isSelected ? 'var(--brand-primary)' : '#94A3B8' }}>
              <span
                className="inline-block h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: isSelected ? 'var(--brand-primary)' : (isActive ? '#60A5FA' : '#CBD5E1') }}
              />
              <span>{formatDate(knowledge.updated_at)}</span>
              {knowledge.category && (
                <span
                  className="max-w-[140px] truncate rounded-full px-2 py-0.5"
                  style={{ backgroundColor: isSelected ? 'var(--brand-primary-soft-alt)' : '#F8FAFC', color: isSelected ? 'var(--brand-primary-strong)' : '#64748B' }}
                >
                  {categoryLabel}
                </span>
              )}
            </div>

            <h3
              className="min-w-0 text-[13px] font-semibold leading-5"
              style={{
                color: isSelected ? '#312E81' : '#171717',
                display: '-webkit-box',
                WebkitBoxOrient: 'vertical',
                WebkitLineClamp: listDensity === 'comfortable' || isSelected ? 2 : 1,
                overflow: 'hidden',
              }}
            >
              {knowledge.title}
            </h3>

            {(listDensity === 'comfortable' || isSelected) && knowledge.summary && (
              <p
                className="mt-1 text-xs leading-relaxed"
                style={{
                  color: isSelected ? 'var(--brand-primary)' : '#737373',
                  display: '-webkit-box',
                  WebkitBoxOrient: 'vertical',
                  WebkitLineClamp: listDensity === 'comfortable' ? 3 : 2,
                  overflow: 'hidden',
                }}
              >
                {knowledge.summary}
              </p>
            )}

            <div
              className="flex flex-wrap items-center gap-1.5 text-[11px]"
              style={{
                color: '#737373',
                marginTop: listDensity === 'comfortable' || isSelected ? '8px' : '6px',
              }}
            >
              {primaryTag && (
                <span
                  className="truncate rounded-full px-2 py-0.5"
                  style={{ backgroundColor: '#F5F3FF', color: '#6D28D9' }}
                >
                  #{primaryTag}
                  {extraTagCount > 0 ? ` +${extraTagCount}` : ''}
                </span>
              )}
              {!primaryTag && knowledge.tags.length > 0 && (
                <span>{knowledge.tags.length} 个标签</span>
              )}
            </div>
          </div>
        </div>
      </button>
    </div>
  )
})

KnowledgeListItem.displayName = 'KnowledgeListItem'
