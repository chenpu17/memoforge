import React, { useEffect, useState } from 'react'
import { Zap, ChevronDown, ChevronRight, Play, CheckCircle, ArrowLeft, Target, ListChecks, FileText, Link, Package } from 'lucide-react'
import { tauriService } from '../services/tauri'
import type { WorkflowTemplate, WorkflowRun } from '../types'

type ViewMode = 'list' | 'detail'

const templateIcons: Record<string, string> = {
  'pr_issue_knowledge': 'PR',
  'runbook_verify': 'RB',
  'meeting_notes': 'MT',
  'release_retrospective': 'VR',
}

const templateColors: Record<string, { color: string; bgColor: string }> = {
  'pr_issue_knowledge': { color: '#6366F1', bgColor: '#EEF2FF' },
  'runbook_verify': { color: '#0891B2', bgColor: '#ECFEFF' },
  'meeting_notes': { color: '#7C3AED', bgColor: '#F5F3FF' },
  'release_retrospective': { color: '#059669', bgColor: '#ECFDF5' },
}

const defaultTemplateStyle = { color: '#525252', bgColor: '#F3F4F6' }
const defaultTemplateIcon = 'WF'

export const WorkflowTemplateLauncher: React.FC = () => {
  const [templates, setTemplates] = useState<WorkflowTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [selectedTemplate, setSelectedTemplate] = useState<WorkflowTemplate | null>(null)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  // Launch state
  const [launching, setLaunching] = useState(false)
  const [launchResult, setLaunchResult] = useState<WorkflowRun | null>(null)
  const [launchError, setLaunchError] = useState<string | null>(null)

  // Goal override input
  const [goalOverride, setGoalOverride] = useState('')

  const loadTemplates = async () => {
    try {
      setLoading(true)
      setError(null)
      const fetched = await tauriService.listWorkflowTemplates(true)
      setTemplates(fetched)
    } catch (err) {
      console.error('Failed to load workflow templates:', err)
      setError(typeof err === 'string' ? err : '加载工作流模板失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadTemplates()
  }, [])

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

  const handleSelectTemplate = (template: WorkflowTemplate) => {
    setSelectedTemplate(template)
    setViewMode('detail')
    setGoalOverride('')
    setLaunchResult(null)
    setLaunchError(null)
  }

  const handleBackToList = () => {
    setViewMode('list')
    setSelectedTemplate(null)
    setLaunchResult(null)
    setLaunchError(null)
    setGoalOverride('')
  }

  const handleLaunch = async () => {
    if (!selectedTemplate) return

    try {
      setLaunching(true)
      setLaunchError(null)
      setLaunchResult(null)

      const result = await tauriService.startWorkflowRun({
        template_id: selectedTemplate.template_id,
        goal_override: goalOverride.trim() || undefined,
      })
      setLaunchResult(result)
    } catch (err) {
      console.error('Failed to launch workflow:', err)
      setLaunchError(typeof err === 'string' ? err : '启动工作流失败')
    } finally {
      setLaunching(false)
    }
  }

  // Detail view
  if (viewMode === 'detail' && selectedTemplate) {
    const style = templateColors[selectedTemplate.template_id] || defaultTemplateStyle

    return (
      <div className="flex flex-col h-full bg-white">
        {/* Detail Header */}
        <div className="border-b px-4 py-3 flex items-center gap-2" style={{ borderColor: '#E5E5E5' }}>
          <button
            type="button"
            onClick={handleBackToList}
            className="flex-shrink-0 rounded-md p-1 hover:bg-gray-100"
          >
            <ArrowLeft className="h-4 w-4" style={{ color: '#737373' }} />
          </button>
          <div
            className="flex-shrink-0 inline-flex items-center justify-center h-6 w-6 rounded-md text-[10px] font-bold"
            style={{ backgroundColor: style.bgColor, color: style.color }}
          >
            {templateIcons[selectedTemplate.template_id] || defaultTemplateIcon}
          </div>
          <h1 className="text-sm font-semibold truncate" style={{ color: '#0A0A0A' }}>
            {selectedTemplate.name}
          </h1>
        </div>

        {/* Detail Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Goal */}
          <div>
            <div className="flex items-center gap-1.5 mb-1.5">
              <Target className="h-3.5 w-3.5" style={{ color: '#737373' }} />
              <div className="text-[11px] font-medium" style={{ color: '#737373' }}>目标</div>
            </div>
            <div className="p-3 rounded-lg text-xs whitespace-pre-wrap" style={{ backgroundColor: '#F9FAFB', color: '#0A0A0A' }}>
              {selectedTemplate.goal}
            </div>
          </div>

          {/* Success Criteria */}
          {selectedTemplate.success_criteria.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-1.5">
                <ListChecks className="h-3.5 w-3.5" style={{ color: '#737373' }} />
                <div className="text-[11px] font-medium" style={{ color: '#737373' }}>完成标准</div>
              </div>
              <div className="space-y-1.5">
                {selectedTemplate.success_criteria.map((criterion, index) => (
                  <div key={index} className="flex items-start gap-2 p-2 rounded-lg text-xs" style={{ backgroundColor: '#F9FAFB' }}>
                    <CheckCircle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" style={{ color: '#10B981' }} />
                    <span style={{ color: '#525252' }}>{criterion}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Default Context Refs */}
          {selectedTemplate.default_context_refs.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-1.5">
                <FileText className="h-3.5 w-3.5" style={{ color: '#737373' }} />
                <div className="text-[11px] font-medium" style={{ color: '#737373' }}>
                  默认上下文 ({selectedTemplate.default_context_refs.length})
                </div>
              </div>
              <div className="space-y-1">
                {selectedTemplate.default_context_refs.map((ref, index) => {
                  const contextIcon: Record<string, React.ReactNode> = {
                    url: <Link className="h-3 w-3 flex-shrink-0" />,
                    knowledge: <FileText className="h-3 w-3 flex-shrink-0" />,
                    pack: <Package className="h-3 w-3 flex-shrink-0" />,
                    file: <FileText className="h-3 w-3 flex-shrink-0" />,
                  }
                  return (
                    <div key={index} className="p-2 rounded-lg text-xs" style={{ backgroundColor: '#F9FAFB' }}>
                      <div className="flex items-center gap-2 mb-0.5">
                        <span style={{ color: '#525252' }}>{contextIcon[ref.ref_type] ?? <FileText className="h-3 w-3" />}</span>
                        <span className="truncate font-medium" style={{ color: '#0A0A0A' }}>{ref.ref_id}</span>
                        {ref.required ? (
                          <span
                            className="flex-shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium"
                            style={{ backgroundColor: '#FEE2E2', color: '#991B1B' }}
                          >
                            必需
                          </span>
                        ) : (
                          <span
                            className="flex-shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium"
                            style={{ backgroundColor: '#F3F4F6', color: '#737373' }}
                          >
                            可选
                          </span>
                        )}
                      </div>
                      {ref.reason && (
                        <div className="mt-0.5 text-[11px]" style={{ color: '#A3A3A3' }}>
                          {ref.reason}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Suggested Output Target */}
          {selectedTemplate.suggested_output_target && (
            <div>
              <div className="text-[11px] font-medium mb-1.5" style={{ color: '#737373' }}>建议输出目录</div>
              <div
                className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium"
                style={{ backgroundColor: '#ECFDF5', color: '#047857' }}
              >
                <FileText className="h-3 w-3" />
                {selectedTemplate.suggested_output_target}
              </div>
            </div>
          )}

          {/* Review Policy */}
          {selectedTemplate.review_policy && (
            <div>
              <div className="text-[11px] font-medium mb-1.5" style={{ color: '#737373' }}>审阅策略</div>
              <div
                className="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium"
                style={{ backgroundColor: '#FEF3C7', color: '#92400E' }}
              >
                {selectedTemplate.review_policy}
              </div>
            </div>
          )}

          {/* Goal Override Input */}
          {!launchResult && (
            <div>
              <label className="block text-[11px] font-medium mb-1.5" style={{ color: '#737373' }}>
                自定义目标（可选）
              </label>
              <textarea
                value={goalOverride}
                onChange={(e) => setGoalOverride(e.target.value)}
                placeholder="覆盖模板默认目标，描述这次运行的具体需求..."
                rows={3}
                className="w-full rounded-md border px-3 py-2 text-xs resize-none"
                style={{ borderColor: '#E5E7EB' }}
              />
            </div>
          )}

          {/* Launch Result */}
          {launchResult && (
            <div className="rounded-lg border p-4" style={{ borderColor: '#A7F3D0', backgroundColor: '#ECFDF5' }}>
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle className="h-4 w-4" style={{ color: '#059669' }} />
                <span className="text-xs font-medium" style={{ color: '#047857' }}>工作流已启动</span>
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs">
                  <span style={{ color: '#737373' }}>Run ID:</span>
                  <code className="rounded px-1.5 py-0.5 text-[11px]" style={{ backgroundColor: '#F0FDF4', color: '#065F46' }}>
                    {launchResult.run_id}
                  </code>
                </div>
                {launchResult.session_id && (
                  <div className="flex items-center gap-2 text-xs">
                    <span style={{ color: '#737373' }}>Session:</span>
                    <code className="rounded px-1.5 py-0.5 text-[11px]" style={{ backgroundColor: '#F0FDF4', color: '#065F46' }}>
                      {launchResult.session_id}
                    </code>
                  </div>
                )}
                {launchResult.draft_id && (
                  <div className="flex items-center gap-2 text-xs">
                    <span style={{ color: '#737373' }}>Draft:</span>
                    <code className="rounded px-1.5 py-0.5 text-[11px]" style={{ backgroundColor: '#F0FDF4', color: '#065F46' }}>
                      {launchResult.draft_id}
                    </code>
                  </div>
                )}
                {launchResult.inbox_item_ids.length > 0 && (
                  <div className="flex items-center gap-2 text-xs">
                    <span style={{ color: '#737373' }}>收件箱项:</span>
                    <span style={{ color: '#065F46' }}>{launchResult.inbox_item_ids.length} 项</span>
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={handleBackToList}
                className="mt-3 rounded-md px-3 py-1.5 text-xs font-medium"
                style={{ backgroundColor: '#D1FAE5', color: '#065F46' }}
              >
                返回模板列表
              </button>
            </div>
          )}

          {/* Launch Error */}
          {launchError && (
            <div className="rounded-lg border p-3 text-xs" style={{ borderColor: '#FECACA', backgroundColor: '#FEF2F2', color: '#991B1B' }}>
              {launchError}
            </div>
          )}

          {/* Launch Button */}
          {!launchResult && (
            <button
              type="button"
              onClick={handleLaunch}
              disabled={launching}
              className="flex w-full items-center justify-center gap-2 rounded-md px-4 py-2.5 text-xs font-medium text-white"
              style={{
                backgroundColor: 'var(--brand-primary)',
                opacity: launching ? 0.6 : 1,
                cursor: launching ? 'not-allowed' : 'pointer',
              }}
            >
              <Play className="h-3.5 w-3.5" />
              {launching ? '启动中...' : '启动工作流'}
            </button>
          )}
        </div>
      </div>
    )
  }

  // List view
  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="border-b px-4 py-3" style={{ borderColor: '#E5E5E5' }}>
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4" style={{ color: 'var(--brand-primary)' }} />
          <h1 className="text-sm font-semibold" style={{ color: '#0A0A0A' }}>Workflow 工作流</h1>
        </div>
        <p className="mt-1 text-[11px]" style={{ color: '#737373' }}>
          选择模板启动结构化工作流，让 Agent 按预定义流程执行任务
        </p>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-48 text-xs" style={{ color: '#737373' }}>
            加载中...
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-48 px-8 text-center">
            <Zap className="h-8 w-8 mb-2" style={{ color: '#FCA5A5' }} />
            <p className="text-xs" style={{ color: '#DC2626' }}>{error}</p>
            <button
              type="button"
              onClick={() => void loadTemplates()}
              className="mt-3 rounded-md px-3 py-1.5 text-[11px] font-medium"
              style={{ backgroundColor: 'var(--brand-primary-soft)', color: 'var(--brand-primary-strong)' }}
            >
              重试
            </button>
          </div>
        ) : templates.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 px-8 text-center">
            <Zap className="h-8 w-8 mb-2" style={{ color: '#D4D4D8' }} />
            <p className="text-xs" style={{ color: '#737373' }}>暂无可用的工作流模板。请联系管理员配置模板。</p>
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: '#E5E5E5' }}>
            {templates.map((template) => {
              const isExpanded = expandedIds.has(template.template_id)
              const style = templateColors[template.template_id] || defaultTemplateStyle
              const icon = templateIcons[template.template_id] || defaultTemplateIcon

              return (
                <div key={template.template_id} className="px-4 py-3">
                  <div className="flex items-start gap-3">
                    <button
                      type="button"
                      onClick={() => toggleExpand(template.template_id)}
                      className="mt-0.5 flex-shrink-0"
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4" style={{ color: '#A3A3A3' }} />
                      ) : (
                        <ChevronRight className="h-4 w-4" style={{ color: '#A3A3A3' }} />
                      )}
                    </button>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span
                          className="inline-flex items-center justify-center h-5 w-5 rounded text-[9px] font-bold"
                          style={{ backgroundColor: style.bgColor, color: style.color }}
                        >
                          {icon}
                        </span>
                        <h3 className="text-xs font-medium" style={{ color: '#0A0A0A' }}>{template.name}</h3>
                      </div>

                      <p className="text-[11px] mb-1.5" style={{ color: '#525252' }}>
                        {template.goal.length > 80 ? `${template.goal.slice(0, 80)}...` : template.goal}
                      </p>

                      <div className="flex items-center gap-3 text-[10px]" style={{ color: '#A3A3A3' }}>
                        {template.success_criteria.length > 0 && (
                          <span>完成标准 {template.success_criteria.length} 项</span>
                        )}
                        {template.default_context_refs.length > 0 && (
                          <span>上下文 {template.default_context_refs.length} 项</span>
                        )}
                        {template.suggested_output_target && (
                          <span>输出至 {template.suggested_output_target}</span>
                        )}
                      </div>

                      {isExpanded && (
                        <div className="mt-2">
                          {template.success_criteria.length > 0 && (
                            <div className="mb-2">
                              <div className="text-[10px] font-medium mb-1" style={{ color: '#A3A3A3' }}>完成标准</div>
                              <div className="space-y-1">
                                {template.success_criteria.map((criterion, index) => (
                                  <div key={index} className="flex items-start gap-1.5 text-[11px]" style={{ color: '#525252' }}>
                                    <CheckCircle className="h-3 w-3 flex-shrink-0 mt-0.5" style={{ color: '#10B981' }} />
                                    {criterion}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          <button
                            type="button"
                            onClick={() => handleSelectTemplate(template)}
                            className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium"
                            style={{ backgroundColor: 'var(--brand-primary-soft)', color: 'var(--brand-primary-strong)' }}
                          >
                            <Play className="h-3.5 w-3.5" />
                            查看详情并启动
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
