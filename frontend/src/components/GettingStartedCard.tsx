import React from 'react'
import { Download, ExternalLink, Settings2, Sparkles } from 'lucide-react'
import { openExternalLink } from '../lib/externalLinks'
import { HERO_QUICK_DOWNLOADS, README_URL, RELEASE_NOTES_URL, RELEASE_URL } from '../lib/releaseLinks'

interface ActionSpec {
  label: string
  onClick: () => void
  kind?: 'primary' | 'secondary'
}

interface GettingStartedCardProps {
  title: string
  description: string
  primaryAction?: ActionSpec
  secondaryAction?: ActionSpec
  compact?: boolean
}

export const GettingStartedCard: React.FC<GettingStartedCardProps> = ({
  title,
  description,
  primaryAction,
  secondaryAction,
  compact = false,
}) => {
  return (
    <div
      className="mx-auto w-full max-w-3xl rounded-3xl border bg-white shadow-sm"
      style={{ borderColor: '#E5E7EB', padding: compact ? '20px' : '28px' }}
    >
      <div className="flex items-start gap-3">
        <div
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl"
          style={{ backgroundColor: 'var(--brand-primary-soft)', color: 'var(--brand-primary-strong)' }}
        >
          <Sparkles className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-lg font-semibold" style={{ color: '#0A0A0A' }}>{title}</div>
          <div className="mt-1 text-sm leading-6" style={{ color: '#525252' }}>{description}</div>
        </div>
      </div>

      {(primaryAction || secondaryAction) && (
        <div className="mt-4 flex flex-wrap gap-2">
          {primaryAction && (
            <button
              type="button"
              onClick={primaryAction.onClick}
              className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm"
              style={{ backgroundColor: 'var(--brand-primary)', color: '#FFFFFF' }}
            >
              <Sparkles className="h-4 w-4" />
              {primaryAction.label}
            </button>
          )}
          {secondaryAction && (
            <button
              type="button"
              onClick={secondaryAction.onClick}
              className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm"
              style={{ backgroundColor: '#F5F5F5', color: '#0A0A0A' }}
            >
              <Settings2 className="h-4 w-4" />
              {secondaryAction.label}
            </button>
          )}
        </div>
      )}

      <div className="mt-4 rounded-2xl border px-4 py-3" style={{ borderColor: '#E5E7EB', backgroundColor: '#FCFCFD' }}>
        <div className="text-xs font-medium" style={{ color: '#737373' }}>快速入口</div>
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void openExternalLink(RELEASE_URL)}
            className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs"
            style={{ backgroundColor: 'var(--brand-primary)', color: '#FFFFFF' }}
          >
            <Download className="h-3.5 w-3.5" />
            下载 v0.1.0
          </button>
          <button
            type="button"
            onClick={() => void openExternalLink(RELEASE_NOTES_URL)}
            className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs"
            style={{ backgroundColor: '#F5F5F5', color: '#0A0A0A' }}
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Release Notes
          </button>
          <button
            type="button"
            onClick={() => void openExternalLink(README_URL)}
            className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs"
            style={{ backgroundColor: '#F5F5F5', color: '#0A0A0A' }}
          >
            <ExternalLink className="h-3.5 w-3.5" />
            MCP 配置说明
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {HERO_QUICK_DOWNLOADS.map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={() => void openExternalLink(item.url)}
              className="rounded-full border px-2.5 py-1 text-[11px]"
              style={{ borderColor: '#E5E7EB', color: '#525252', backgroundColor: '#FFFFFF' }}
            >
              {item.label} · {item.hint}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
