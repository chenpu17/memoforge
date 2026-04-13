import React, { useCallback, useState } from 'react'
import { Clock, CheckCircle, AlertTriangle, AlertOctagon, HelpCircle, RefreshCw, Info } from 'lucide-react'
import { shallow } from 'zustand/shallow'
import { useAppStore } from '../stores/appStore'
import { tauriService, getErrorMessage } from '../services/tauri'

interface FreshnessActionsProps {
  readonly?: boolean
}

const statusConfig: Record<string, { label: string; color: string; bgColor: string; icon: React.ReactNode }> = {
  ok: {
    label: '正常',
    color: '#047857',
    bgColor: '#D1FAE5',
    icon: <CheckCircle className="h-3.5 w-3.5" />,
  },
  due: {
    label: '待复查',
    color: '#92400E',
    bgColor: '#FEF3C7',
    icon: <AlertTriangle className="h-3.5 w-3.5" />,
  },
  overdue: {
    label: '已过期',
    color: '#991B1B',
    bgColor: '#FEE2E2',
    icon: <AlertOctagon className="h-3.5 w-3.5" />,
  },
  unknown: {
    label: '未知',
    color: '#525252',
    bgColor: '#F3F4F6',
    icon: <HelpCircle className="h-3.5 w-3.5" />,
  },
}

const formatRelativeDate = (value: string) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

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

export const FreshnessActions: React.FC<FreshnessActionsProps> = ({ readonly = false }) => {
  const { currentKnowledgeId, governance, setKnowledgeGovernance } = useAppStore((state) => ({
    currentKnowledgeId: state.currentKnowledge?.id ?? null,
    governance: state.knowledgeGovernance,
    setKnowledgeGovernance: state.setKnowledgeGovernance,
  }), shallow)

  const [verifying, setVerifying] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const freshness = governance?.freshness ?? null
  const effectiveSlaDays = governance?.effective_sla_days ?? 0
  const reviewStatus = freshness?.review_status ?? 'unknown'
  const config = statusConfig[reviewStatus] ?? statusConfig.unknown

  // Determine SLA source explanation
  const getSlaSource = (): string | null => {
    if (effectiveSlaDays <= 0) return null
    if (freshness?.sla_days && freshness.sla_days === effectiveSlaDays) {
      return '来自知识条目自身设定'
    }
    if (freshness?.sla_days && freshness.sla_days !== effectiveSlaDays) {
      return `来自上级分类设定 (${effectiveSlaDays} 天)`
    }
    if (effectiveSlaDays === 90) {
      return '系统默认值 (90 天)'
    }
    return '来自全局策略设定'
  }

  const handleVerify = useCallback(async () => {
    if (!currentKnowledgeId) return

    try {
      setVerifying(true)
      setError(null)
      const now = new Date().toISOString()
      const nextReview = new Date(Date.now() + effectiveSlaDays * 86400000).toISOString()
      const result = await tauriService.updateKnowledgeGovernance({
        path: currentKnowledgeId,
        freshness: {
          ...freshness,
          sla_days: freshness?.sla_days ?? effectiveSlaDays,
          last_verified_at: now,
          next_review_at: nextReview,
          review_status: 'ok',
          review_owner: 'user',
        },
      })
      setKnowledgeGovernance(result)
    } catch (err) {
      console.error('Failed to verify freshness:', err)
      setError(getErrorMessage(err))
    } finally {
      setVerifying(false)
    }
  }, [currentKnowledgeId, freshness, effectiveSlaDays, setKnowledgeGovernance])

  if (!currentKnowledgeId) return null

  return (
    <div className="side-panel-card">
      {/* Status badge */}
      <div className="side-panel-section">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" style={{ color: 'var(--brand-primary)' }} />
            <span className="side-panel-heading !mb-0">Freshness</span>
          </div>
          <span
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
            style={{ backgroundColor: config.bgColor, color: config.color }}
          >
            {config.icon}
            {config.label}
          </span>
        </div>
      </div>

      {error && (
        <div
          className="side-panel-section mb-2 flex items-center gap-2 rounded-lg px-3 py-2 text-xs"
          style={{ backgroundColor: '#FEF2F2', color: '#991B1B' }}
        >
          {error}
        </div>
      )}

      {/* SLA info */}
      <div className="side-panel-section">
        <div className="rounded-xl bg-[#F8FAFC] px-3 py-2 text-xs" style={{ color: '#525252' }}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px]" style={{ color: '#737373' }}>SLA 周期</span>
            <span className="font-medium" style={{ color: '#171717' }}>
              {effectiveSlaDays > 0 ? `${effectiveSlaDays} 天` : '未设定'}
            </span>
          </div>
          {getSlaSource() && (
            <div className="text-[10px] flex items-center gap-1" style={{ color: '#A3A3A3' }}>
              <Info className="h-3 w-3 flex-shrink-0" />
              {getSlaSource()}
            </div>
          )}
        </div>
      </div>

      {/* Timestamps */}
      {freshness && (
        <div className="side-panel-section">
          <div className="rounded-xl bg-[#F8FAFC] px-3 py-2 text-xs" style={{ color: '#525252' }}>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg bg-white px-2.5 py-2">
                <div className="mb-1 text-[11px]" style={{ color: '#737373' }}>上次验证</div>
                <div className="font-medium" style={{ color: '#171717' }}>
                  {freshness.last_verified_at ? formatRelativeDate(freshness.last_verified_at) : '--'}
                </div>
              </div>
              <div className="rounded-lg bg-white px-2.5 py-2">
                <div className="mb-1 text-[11px]" style={{ color: '#737373' }}>下次复查</div>
                <div className="font-medium" style={{ color: reviewStatus === 'overdue' ? '#DC2626' : reviewStatus === 'due' ? '#D97706' : '#171717' }}>
                  {freshness.next_review_at ? formatRelativeDate(freshness.next_review_at) : '--'}
                </div>
              </div>
            </div>
            {freshness.review_owner && (
              <div className="mt-2 text-[11px]" style={{ color: '#737373' }}>
                复查负责人: <span className="font-medium" style={{ color: '#525252' }}>{freshness.review_owner}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Verify button */}
      {!readonly && (
        <div className="side-panel-section">
          <button
            type="button"
            onClick={handleVerify}
            disabled={verifying}
            className="flex w-full items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-xs font-medium disabled:opacity-60"
            style={{
              borderColor: reviewStatus === 'overdue' ? '#FECACA' : reviewStatus === 'due' ? '#FDE68A' : 'var(--brand-primary-border)',
              backgroundColor: reviewStatus === 'overdue' ? '#FEF2F2' : reviewStatus === 'due' ? '#FFFBEB' : 'var(--brand-primary-soft)',
              color: reviewStatus === 'overdue' ? '#991B1B' : reviewStatus === 'due' ? '#92400E' : 'var(--brand-primary-strong)',
            }}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${verifying ? 'animate-spin' : ''}`} />
            {verifying ? '验证中...' : '验证此知识'}
          </button>
        </div>
      )}
    </div>
  )
}
