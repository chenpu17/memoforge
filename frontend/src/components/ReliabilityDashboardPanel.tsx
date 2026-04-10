import React, { useEffect, useState } from 'react'
import { Shield, CheckCircle, XCircle, RefreshCw, AlertTriangle, Info, ChevronDown, ChevronRight, FileText } from 'lucide-react'
import { tauriService } from '../services/tauri'
import type { ReliabilityIssue, ReliabilityStats } from '../types'

type SeverityFilter = 'all' | 'high' | 'medium' | 'low'
type StatusFilter = 'all' | 'open' | 'ignored' | 'resolved'

const severityLabels: Record<string, { label: string; color: string; bgColor: string; icon: React.ReactNode }> = {
  high: { label: '高', color: '#DC2626', bgColor: '#FEE2E2', icon: <AlertTriangle className="h-3 w-3" /> },
  medium: { label: '中', color: '#D97706', bgColor: '#FEF3C7', icon: <Info className="h-3 w-3" /> },
  low: { label: '低', color: '#059669', bgColor: '#D1FAE5', icon: <CheckCircle className="h-3 w-3" /> },
}

const statusLabels: Record<string, { label: string; color: string; bgColor: string }> = {
  open: { label: '待处理', color: '#DC2626', bgColor: '#FEE2E2' },
  ignored: { label: '已忽略', color: '#737373', bgColor: '#F3F4F6' },
  resolved: { label: '已解决', color: '#059669', bgColor: '#D1FAE5' },
}

const ruleKeyLabels: Record<string, string> = {
  no_summary: '缺少摘要',
  no_tags: '缺少标签',
  no_category: '缺少分类',
  stale_content: '内容陈旧',
  broken_link: '链接失效',
  orphaned_knowledge: '孤立知识',
}

export const ReliabilityDashboardPanel: React.FC = () => {
  const [issues, setIssues] = useState<ReliabilityIssue[]>([])
  const [stats, setStats] = useState<ReliabilityStats | null>(null)
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [loading, setLoading] = useState(true)
  const [scanning, setScanning] = useState(false)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)

  const loadIssues = async () => {
    try {
      setLoading(true)
      setError(null)
      const fetched = await tauriService.listReliabilityIssues(
        severityFilter === 'all' ? undefined : severityFilter,
        statusFilter === 'all' ? undefined : statusFilter,
        100
      )
      setIssues(fetched)
    } catch (err) {
      console.error('Failed to load reliability issues:', err)
      setError(typeof err === 'string' ? err : '加载失败')
    } finally {
      setLoading(false)
    }
  }

  const loadStats = async () => {
    try {
      const fetched = await tauriService.getReliabilityStats()
      setStats(fetched)
    } catch (err) {
      console.error('Failed to load reliability stats:', err)
    }
  }

  useEffect(() => {
    void loadIssues()
    void loadStats()
  }, [severityFilter, statusFilter])

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

  const handleScan = async () => {
    try {
      setScanning(true)
      setError(null)
      await tauriService.scanReliabilityIssues()
      await loadIssues()
      await loadStats()
    } catch (err) {
      console.error('Failed to scan reliability issues:', err)
      setError(typeof err === 'string' ? err : '扫描失败')
    } finally {
      setScanning(false)
    }
  }

  const handleCreateFixDraft = async (issue: ReliabilityIssue) => {
    try {
      await tauriService.createFixDraftFromIssue(issue.id)
      await loadIssues()
      await loadStats()
    } catch (err) {
      console.error('Failed to create fix draft:', err)
      alert('创建修复 Draft 失败: ' + err)
    }
  }

  const handleIgnore = async (issue: ReliabilityIssue) => {
    try {
      await tauriService.updateReliabilityIssueStatus(issue.id, 'ignored')
      await loadIssues()
      await loadStats()
    } catch (err) {
      console.error('Failed to ignore issue:', err)
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

  const filteredIssues = issues

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="border-b px-4 py-3 flex items-center justify-between" style={{ borderColor: '#E5E5E5' }}>
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4" style={{ color: 'var(--brand-primary)' }} />
          <h1 className="text-sm font-semibold" style={{ color: '#0A0A0A' }}>知识可靠性</h1>
        </div>
        <button
          type="button"
          onClick={handleScan}
          disabled={scanning}
          className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium"
          style={{
            backgroundColor: 'var(--brand-primary-soft)',
            color: 'var(--brand-primary-strong)',
            opacity: scanning ? 0.6 : 1,
          }}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${scanning ? 'animate-spin' : ''}`} />
          {scanning ? '扫描中...' : '扫描'}
        </button>
      </div>

      {/* Stats Bar */}
      {stats && stats.total > 0 && (
        <div className="border-b px-4 py-2 flex gap-2 items-center" style={{ borderColor: '#E5E5E5', backgroundColor: '#FAFAFA' }}>
          <div className="text-[10px]" style={{ color: '#737373' }}>按严重程度:</div>
          <div
            className="rounded-full px-2 py-0.5 text-[10px] font-medium flex items-center gap-1"
            style={{ backgroundColor: '#FEE2E2', color: '#DC2626' }}
          >
            <AlertTriangle className="h-3 w-3" />
            高 {stats.high_severity}
          </div>
          <div
            className="rounded-full px-2 py-0.5 text-[10px] font-medium flex items-center gap-1"
            style={{ backgroundColor: '#FEF3C7', color: '#D97706' }}
          >
            <Info className="h-3 w-3" />
            中 {stats.medium_severity}
          </div>
          <div
            className="rounded-full px-2 py-0.5 text-[10px] font-medium flex items-center gap-1"
            style={{ backgroundColor: '#D1FAE5', color: '#059669' }}
          >
            <CheckCircle className="h-3 w-3" />
            低 {stats.low_severity}
          </div>
        </div>
      )}

      {/* Filter Tabs */}
      <div className="border-b px-4 pt-2" style={{ borderColor: '#E5E5E5' }}>
        <div className="flex gap-1 overflow-x-auto pb-2 scrollbar-hide">
          <div className="flex gap-1 mr-3">
            {[
              { value: 'all', label: '全部' },
              { value: 'open', label: '待处理' },
              { value: 'ignored', label: '已忽略' },
            ].map((tab) => {
              const isActive = statusFilter === tab.value
              return (
                <button
                  key={tab.value}
                  type="button"
                  onClick={() => setStatusFilter(tab.value as StatusFilter)}
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
          <div className="border-l" style={{ borderColor: '#E5E5E5' }} />
          <div className="flex gap-1 ml-3">
            {[
              { value: 'all', label: '全部' },
              { value: 'high', label: '高' },
              { value: 'medium', label: '中' },
              { value: 'low', label: '低' },
            ].map((tab) => {
              const isActive = severityFilter === tab.value
              return (
                <button
                  key={tab.value}
                  type="button"
                  onClick={() => setSeverityFilter(tab.value as SeverityFilter)}
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
        ) : filteredIssues.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 px-8 text-center">
            <Shield className="h-8 w-8 mb-2" style={{ color: '#D4D4D8' }} />
            <p className="text-xs" style={{ color: '#737373' }}>知识库很健康，没有发现质量问题。</p>
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: '#E5E5E5' }}>
            {filteredIssues.map((issue) => {
              const isExpanded = expandedIds.has(issue.id)
              const severityInfo = severityLabels[issue.severity] || severityLabels.medium
              const statusInfo = statusLabels[issue.status] || statusLabels.open

              return (
                <div key={issue.id} className="px-4 py-3">
                  <div className="flex items-start gap-3">
                    <button
                      type="button"
                      onClick={() => toggleExpand(issue.id)}
                      className="mt-0.5 flex-shrink-0"
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4" style={{ color: '#A3A3A3' }} />
                      ) : (
                        <ChevronRight className="h-4 w-4" style={{ color: '#A3A3A3' }} />
                      )}
                    </button>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span
                          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
                          style={{ backgroundColor: severityInfo.bgColor, color: severityInfo.color }}
                        >
                          {severityInfo.icon}
                          {severityInfo.label}严重性
                        </span>
                        <span
                          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
                          style={{ backgroundColor: '#F3F4F6', color: '#737373' }}
                        >
                          {ruleKeyLabels[issue.rule_key] || issue.rule_key}
                        </span>
                        <span
                          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
                          style={{ backgroundColor: statusInfo.bgColor, color: statusInfo.color }}
                        >
                          {statusInfo.label}
                        </span>
                        <span className="text-[10px]" style={{ color: '#A3A3A3' }}>{formatDate(issue.detected_at)}</span>
                      </div>

                      <div className="flex items-center gap-1 mb-1">
                        <FileText className="h-3 w-3 flex-shrink-0" style={{ color: '#737373' }} />
                        <span className="text-xs truncate" style={{ color: '#0A0A0A' }}>{issue.knowledge_path}</span>
                      </div>

                      <h3 className="text-xs font-medium mb-1" style={{ color: '#0A0A0A' }}>{issue.summary}</h3>

                      {isExpanded && issue.linked_draft_id && (
                        <div className="mt-2 p-2 rounded-lg text-[11px]" style={{ backgroundColor: '#F9FAFB', color: '#525252' }}>
                          已关联修复 Draft: {issue.linked_draft_id}
                        </div>
                      )}

                      {issue.status === 'open' && (
                        <div className="mt-2 flex gap-2">
                          <button
                            type="button"
                            onClick={() => handleCreateFixDraft(issue)}
                            className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium"
                            style={{ backgroundColor: 'var(--brand-primary-soft)', color: 'var(--brand-primary-strong)' }}
                          >
                            <CheckCircle className="h-3.5 w-3.5" />
                            生成修复 Draft
                          </button>
                          <button
                            type="button"
                            onClick={() => handleIgnore(issue)}
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
