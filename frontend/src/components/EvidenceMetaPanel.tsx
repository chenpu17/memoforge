import React, { useCallback, useEffect, useState } from 'react'
import { Shield, CheckCircle, ExternalLink, Copy, Check, Link2, GitCommitHorizontal, Terminal, ChevronDown, ChevronRight, AlertTriangle } from 'lucide-react'
import { shallow } from 'zustand/shallow'
import { useAppStore } from '../stores/appStore'
import { tauriService, getErrorMessage } from '../services/tauri'

interface EvidenceMetaPanelProps {
  readonly?: boolean
}

const formatDate = (value: string) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export const EvidenceMetaPanel: React.FC<EvidenceMetaPanelProps> = ({ readonly = false }) => {
  const { currentKnowledgeId, governance, setKnowledgeGovernance } = useAppStore((state) => ({
    currentKnowledgeId: state.currentKnowledge?.id ?? null,
    governance: state.knowledgeGovernance,
    setKnowledgeGovernance: state.setKnowledgeGovernance,
  }), shallow)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [pathCopied, setPathCopied] = useState(false)
  const [showLinkedRefs, setShowLinkedRefs] = useState(false)

  // Local edit state
  const [editOwner, setEditOwner] = useState('')
  const [editSourceUrl, setEditSourceUrl] = useState('')
  const [editValidForVersion, setEditValidForVersion] = useState('')
  const [hasLocalChanges, setHasLocalChanges] = useState(false)

  const evidence = governance?.evidence ?? null

  // Sync local state when governance loads
  useEffect(() => {
    if (evidence) {
      setEditOwner(evidence.owner ?? '')
      setEditSourceUrl(evidence.source_url ?? '')
      setEditValidForVersion(evidence.valid_for_version ?? '')
      setHasLocalChanges(false)
    } else {
      setEditOwner('')
      setEditSourceUrl('')
      setEditValidForVersion('')
      setHasLocalChanges(false)
    }
  }, [evidence])

  // Load governance data when knowledge changes
  useEffect(() => {
    if (!currentKnowledgeId) return

    let cancelled = false
    const load = async () => {
      try {
        setLoading(true)
        setError(null)
        const result = await tauriService.getKnowledgeGovernance({ path: currentKnowledgeId })
        if (!cancelled) {
          setKnowledgeGovernance(result)
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Failed to load governance:', err)
          setError(getErrorMessage(err))
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void load()
    return () => { cancelled = true }
  }, [currentKnowledgeId, setKnowledgeGovernance])

  const handleFieldChange = useCallback((field: 'owner' | 'source_url' | 'valid_for_version', value: string) => {
    if (field === 'owner') setEditOwner(value)
    else if (field === 'source_url') setEditSourceUrl(value)
    else if (field === 'valid_for_version') setEditValidForVersion(value)
    setHasLocalChanges(true)
  }, [])

  const handleSave = useCallback(async () => {
    if (!currentKnowledgeId) return

    try {
      setSaving(true)
      setError(null)
      const result = await tauriService.updateKnowledgeGovernance({
        path: currentKnowledgeId,
        evidence: {
          owner: editOwner || null,
          source_url: editSourceUrl || null,
          valid_for_version: editValidForVersion || null,
        },
      })
      setKnowledgeGovernance(result)
      setHasLocalChanges(false)
    } catch (err) {
      console.error('Failed to save evidence:', err)
      setError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }, [currentKnowledgeId, editOwner, editSourceUrl, editValidForVersion, setKnowledgeGovernance])

  const handleVerify = useCallback(async () => {
    if (!currentKnowledgeId) return

    try {
      setVerifying(true)
      setError(null)
      const now = new Date().toISOString()
      const result = await tauriService.updateKnowledgeGovernance({
        path: currentKnowledgeId,
        evidence: {
          ...evidence,
          verified_at: now,
          verified_by: 'user',
        },
      })
      setKnowledgeGovernance(result)
    } catch (err) {
      console.error('Failed to verify:', err)
      setError(getErrorMessage(err))
    } finally {
      setVerifying(false)
    }
  }, [currentKnowledgeId, evidence, setKnowledgeGovernance])

  const handleCopyRef = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setPathCopied(true)
      window.setTimeout(() => setPathCopied(false), 1800)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  if (loading) {
    return (
      <div className="side-panel-body">
        <div className="side-panel-empty">加载证据信息...</div>
      </div>
    )
  }

  if (!currentKnowledgeId) {
    return (
      <div className="side-panel-body">
        <div className="side-panel-empty">选择知识条目以查看证据信息</div>
      </div>
    )
  }

  const linkedRefsCount =
    (evidence?.linked_issue_ids?.length ?? 0) +
    (evidence?.linked_pr_ids?.length ?? 0) +
    (evidence?.linked_commit_shas?.length ?? 0) +
    (evidence?.command_output_refs?.length ?? 0)

  return (
    <div className="side-panel-body">
      <div className="side-panel-card">
        {/* Header */}
        <div className="side-panel-section">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <Shield className="h-3.5 w-3.5" style={{ color: 'var(--brand-primary)' }} />
              <span className="side-panel-heading !mb-0">证据信息</span>
            </div>
            <div className="flex items-center gap-1.5">
              {evidence?.verified_at ? (
                <span
                  className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
                  style={{ backgroundColor: '#D1FAE5', color: '#047857' }}
                  title={`验证于 ${formatDate(evidence.verified_at)}`}
                >
                  <CheckCircle className="h-3 w-3" />
                  已验证
                </span>
              ) : (
                <span
                  className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
                  style={{ backgroundColor: '#F3F4F6', color: '#737373' }}
                >
                  未验证
                </span>
              )}
              {(!evidence?.owner || evidence.owner.trim() === '') && (
                <span
                  className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
                  style={{ backgroundColor: '#FEF3C7', color: '#92400E' }}
                  title="未设置负责人"
                >
                  <AlertTriangle className="h-3 w-3" />
                  无负责人
                </span>
              )}
            </div>
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

        {!evidence && !loading ? (
          <div className="side-panel-section">
            <div className="rounded-xl bg-[#F8FAFC] px-3 py-4 text-center text-xs" style={{ color: '#737373' }}>
              <Shield className="h-6 w-6 mx-auto mb-2" style={{ color: '#D4D4D4' }} />
              <p>此知识条目尚无证据信息</p>
              <p className="mt-1 text-[11px]" style={{ color: '#A3A3A3' }}>填写下方字段并保存以添加证据</p>
            </div>
          </div>
        ) : null}

        {/* Editable fields */}
        <div className="side-panel-section">
          <div className="side-panel-heading">负责人</div>
          <input
            value={editOwner}
            onChange={(e) => handleFieldChange('owner', e.target.value)}
            placeholder="例: @username 或团队名"
            disabled={readonly}
            className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:border-indigo-500 disabled:cursor-not-allowed disabled:bg-gray-100"
            style={{ borderColor: '#E5E5E5' }}
          />
        </div>

        <div className="side-panel-section">
          <div className="side-panel-heading">来源链接</div>
          <div className="relative">
            <input
              value={editSourceUrl}
              onChange={(e) => handleFieldChange('source_url', e.target.value)}
              placeholder="https://..."
              disabled={readonly}
              className="w-full rounded-md border px-3 py-2 pr-8 text-sm outline-none focus:border-indigo-500 disabled:cursor-not-allowed disabled:bg-gray-100"
              style={{ borderColor: '#E5E5E5' }}
            />
            {editSourceUrl && (
              <a
                href={editSourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="absolute right-2 top-1/2 -translate-y-1/2"
                title="打开链接"
              >
                <ExternalLink className="h-3.5 w-3.5" style={{ color: '#737373' }} />
              </a>
            )}
          </div>
        </div>

        <div className="side-panel-section">
          <div className="side-panel-heading">适用版本</div>
          <input
            value={editValidForVersion}
            onChange={(e) => handleFieldChange('valid_for_version', e.target.value)}
            placeholder="例: v1.2.0"
            disabled={readonly}
            className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:border-indigo-500 disabled:cursor-not-allowed disabled:bg-gray-100"
            style={{ borderColor: '#E5E5E5' }}
          />
        </div>

        {/* Save button */}
        {hasLocalChanges && !readonly && (
          <div className="side-panel-section">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="w-full rounded-md px-3 py-2 text-xs font-medium text-white disabled:opacity-60"
              style={{ backgroundColor: 'var(--brand-primary)' }}
            >
              {saving ? '保存中...' : '保存证据信息'}
            </button>
          </div>
        )}

        {/* Read-only linked references */}
        {evidence && linkedRefsCount > 0 && (
          <div className="side-panel-section">
            <button
              type="button"
              onClick={() => setShowLinkedRefs((v) => !v)}
              className="flex w-full items-center justify-between gap-2 rounded-xl px-2 py-1 text-left transition-colors hover:bg-[#F8FAFC]"
              style={{ color: '#525252' }}
            >
              <span className="inline-flex items-center gap-1.5">
                {showLinkedRefs ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                <span className="text-xs font-medium">关联引用 ({linkedRefsCount})</span>
              </span>
            </button>
            {showLinkedRefs && (
              <div className="mt-2 rounded-xl bg-[#F8FAFC] px-3 py-2 text-xs space-y-2" style={{ color: '#525252' }}>
                {evidence.linked_issue_ids.length > 0 && (
                  <div>
                    <div className="mb-1 text-[11px]" style={{ color: '#737373' }}>
                      <Link2 className="inline h-3 w-3 mr-1" />Issues
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {evidence.linked_issue_ids.map((id) => (
                        <span
                          key={id}
                          className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]"
                          style={{ borderColor: '#E5E7EB', backgroundColor: '#FFFFFF', color: '#525252' }}
                        >
                          #{id}
                          <button type="button" onClick={() => handleCopyRef(id)} className="hover:opacity-70">
                            {pathCopied ? <Check className="h-2.5 w-2.5" style={{ color: '#15803D' }} /> : <Copy className="h-2.5 w-2.5" />}
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {evidence.linked_pr_ids.length > 0 && (
                  <div>
                    <div className="mb-1 text-[11px]" style={{ color: '#737373' }}>
                      <GitCommitHorizontal className="inline h-3 w-3 mr-1" />PRs
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {evidence.linked_pr_ids.map((id) => (
                        <span
                          key={id}
                          className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]"
                          style={{ borderColor: '#E5E7EB', backgroundColor: '#FFFFFF', color: '#525252' }}
                        >
                          PR #{id}
                          <button type="button" onClick={() => handleCopyRef(id)} className="hover:opacity-70">
                            {pathCopied ? <Check className="h-2.5 w-2.5" style={{ color: '#15803D' }} /> : <Copy className="h-2.5 w-2.5" />}
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {evidence.linked_commit_shas.length > 0 && (
                  <div>
                    <div className="mb-1 text-[11px]" style={{ color: '#737373' }}>
                      <GitCommitHorizontal className="inline h-3 w-3 mr-1" />Commits
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {evidence.linked_commit_shas.map((sha) => (
                        <span
                          key={sha}
                          className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[11px]"
                          style={{ borderColor: '#E5E7EB', backgroundColor: '#FFFFFF', color: '#525252' }}
                        >
                          {sha.slice(0, 7)}
                          <button type="button" onClick={() => handleCopyRef(sha)} className="hover:opacity-70">
                            {pathCopied ? <Check className="h-2.5 w-2.5" style={{ color: '#15803D' }} /> : <Copy className="h-2.5 w-2.5" />}
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {evidence.command_output_refs.length > 0 && (
                  <div>
                    <div className="mb-1 text-[11px]" style={{ color: '#737373' }}>
                      <Terminal className="inline h-3 w-3 mr-1" />命令输出
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {evidence.command_output_refs.map((ref) => (
                        <span
                          key={ref}
                          className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]"
                          style={{ borderColor: '#E5E7EB', backgroundColor: '#FFFFFF', color: '#525252' }}
                        >
                          {ref}
                          <button type="button" onClick={() => handleCopyRef(ref)} className="hover:opacity-70">
                            {pathCopied ? <Check className="h-2.5 w-2.5" style={{ color: '#15803D' }} /> : <Copy className="h-2.5 w-2.5" />}
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Verification info */}
        {evidence?.verified_at && (
          <div className="side-panel-section">
            <div className="rounded-xl bg-[#F8FAFC] px-3 py-2 text-xs" style={{ color: '#525252' }}>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg bg-white px-2.5 py-2">
                  <div className="mb-1 text-[11px]" style={{ color: '#737373' }}>验证时间</div>
                  <div>{formatDate(evidence.verified_at)}</div>
                </div>
                <div className="rounded-lg bg-white px-2.5 py-2">
                  <div className="mb-1 text-[11px]" style={{ color: '#737373' }}>验证人</div>
                  <div>{evidence.verified_by || '--'}</div>
                </div>
              </div>
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
                borderColor: 'var(--brand-primary-border)',
                backgroundColor: 'var(--brand-primary-soft)',
                color: 'var(--brand-primary-strong)',
              }}
            >
              <CheckCircle className="h-3.5 w-3.5" />
              {verifying ? '验证中...' : '验证此知识'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
