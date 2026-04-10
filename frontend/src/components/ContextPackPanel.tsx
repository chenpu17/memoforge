import React, { useEffect, useState } from 'react'
import { Package, FileText, Download, ChevronDown, ChevronRight, PlusCircle, Folder, Tag, Layers } from 'lucide-react'
import { tauriService } from '../services/tauri'
import type { ContextPack } from '../types'

type ViewMode = 'list' | 'create' | 'detail'

const scopeTypeLabels: Record<string, { label: string; icon: React.ReactNode; color: string; bgColor: string }> = {
  tag: { label: '标签', icon: <Tag className="h-3 w-3" />, color: '#6366F1', bgColor: '#EEF2FF' },
  folder: { label: '文件夹', icon: <Folder className="h-3 w-3" />, color: '#0891B2', bgColor: '#ECFEFF' },
  topic: { label: '主题', icon: <Layers className="h-3 w-3" />, color: '#7C3AED', bgColor: '#F5F3FF' },
  manual: { label: '手动', icon: <Package className="h-3 w-3" />, color: '#059669', bgColor: '#ECFDF5' },
}

export const ContextPackPanel: React.FC = () => {
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [packs, setPacks] = useState<ContextPack[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)

  // Create form state
  const [name, setName] = useState('')
  const [scopeType, setScopeType] = useState<'tag' | 'folder' | 'topic' | 'manual'>('manual')
  const [scopeValue, setScopeValue] = useState('')
  const [itemPaths, setItemPaths] = useState('')
  const [summary, setSummary] = useState('')

  const loadPacks = async () => {
    try {
      setLoading(true)
      setError(null)
      const fetched = await tauriService.listContextPacks()
      setPacks(fetched)
    } catch (err) {
      console.error('Failed to load context packs:', err)
      setError(typeof err === 'string' ? err : '加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadPacks()
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

  const handleCreate = async () => {
    if (!name.trim()) {
      alert('请输入包名称')
      return
    }
    if (scopeType !== 'manual' && !scopeValue.trim()) {
      alert('请输入作用域值')
      return
    }
    if (!itemPaths.trim()) {
      alert('请输入至少一个知识路径')
      return
    }

    try {
      setCreating(true)
      const paths = itemPaths.split('\n').map(p => p.trim()).filter(p => p)
      await tauriService.createContextPack(name, scopeType, scopeValue, paths, summary || undefined)
      await loadPacks()
      setViewMode('list')
      // Reset form
      setName('')
      setScopeType('manual')
      setScopeValue('')
      setItemPaths('')
      setSummary('')
    } catch (err) {
      console.error('Failed to create context pack:', err)
      alert('创建失败: ' + err)
    } finally {
      setCreating(false)
    }
  }

  const handleExport = async (pack: ContextPack) => {
    try {
      const result = await tauriService.exportContextPack(pack.id, 'json')
      const dataStr = JSON.stringify(result, null, 2)
      const blob = new Blob([dataStr], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${pack.name.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_')}_pack.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Failed to export context pack:', err)
      alert('导出失败: ' + err)
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

  const getScopeValueLabel = (scopeType: string, scopeValue: string) => {
    if (scopeType === 'tag') return `#${scopeValue}`
    if (scopeType === 'folder') return scopeValue
    if (scopeType === 'topic') return scopeValue
    return scopeValue
  }

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="border-b px-4 py-3 flex items-center justify-between" style={{ borderColor: '#E5E5E5' }}>
        <div className="flex items-center gap-2">
          <Package className="h-4 w-4" style={{ color: 'var(--brand-primary)' }} />
          <h1 className="text-sm font-semibold" style={{ color: '#0A0A0A' }}>
            {viewMode === 'create' ? '创建 Context Pack' : viewMode === 'detail' ? 'Context Pack 详情' : 'Context Packs'}
          </h1>
        </div>
        {viewMode !== 'list' && (
          <button
            type="button"
            onClick={() => setViewMode('list')}
            className="rounded-md px-2 py-1 text-xs"
            style={{ backgroundColor: '#F5F5F5', color: '#737373' }}
          >
            返回列表
          </button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {viewMode === 'list' ? (
          <>
            {/* Create Button */}
            <div className="p-4">
              <button
                type="button"
                onClick={() => setViewMode('create')}
                className="flex w-full items-center justify-center gap-2 rounded-lg border px-4 py-3 text-xs font-medium"
                style={{ borderColor: '#E5E7EB', backgroundColor: '#FFFFFF', color: '#525252' }}
              >
                <PlusCircle className="h-4 w-4" style={{ color: 'var(--brand-primary)' }} />
                创建新的 Context Pack
              </button>
            </div>

            {/* Pack List */}
            {loading ? (
              <div className="flex items-center justify-center h-48 text-xs" style={{ color: '#737373' }}>
                加载中...
              </div>
            ) : error ? (
              <div className="flex items-center justify-center h-48 text-xs" style={{ color: '#DC2626' }}>
                {error}
              </div>
            ) : packs.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 px-8 text-center">
                <Package className="h-8 w-8 mb-2" style={{ color: '#D4D4D8' }} />
                <p className="text-xs" style={{ color: '#737373' }}>
                  Context Pack 让你将相关知识组织在一起，方便 Agent 在特定场景下快速获取上下文。
                  点击上方按钮创建你的第一个 Pack。
                </p>
              </div>
            ) : (
              <div className="divide-y" style={{ borderColor: '#E5E5E5' }}>
                {packs.map((pack) => {
                  const isExpanded = expandedIds.has(pack.id)
                  const scopeInfo = scopeTypeLabels[pack.scope_type] || scopeTypeLabels.manual

                  return (
                    <div key={pack.id} className="px-4 py-3">
                      <div className="flex items-start gap-3">
                        <button
                          type="button"
                          onClick={() => toggleExpand(pack.id)}
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
                              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
                              style={{ backgroundColor: scopeInfo.bgColor, color: scopeInfo.color }}
                            >
                              {scopeInfo.icon}
                              {scopeInfo.label}
                              {pack.scope_value && ` · ${getScopeValueLabel(pack.scope_type, pack.scope_value)}`}
                            </span>
                            <span className="text-[10px]" style={{ color: '#A3A3A3' }}>{formatDate(pack.created_at)}</span>
                          </div>

                          <h3 className="text-xs font-medium mb-1" style={{ color: '#0A0A0A' }}>{pack.name}</h3>

                          {pack.summary && (
                            <p className="text-[11px] mb-1" style={{ color: '#737373' }}>{pack.summary}</p>
                          )}

                          <div className="flex items-center gap-1">
                            <FileText className="h-3 w-3" style={{ color: '#A3A3A3' }} />
                            <span className="text-[10px]" style={{ color: '#737373' }}>{pack.item_paths.length} 项内容</span>
                          </div>

                          {isExpanded && (
                            <div className="mt-2">
                              <div className="mb-2 text-[10px] font-medium" style={{ color: '#A3A3A3' }}>包含的知识路径:</div>
                              <div className="space-y-1">
                                {pack.item_paths.map((path) => (
                                  <div
                                    key={path}
                                    className="p-2 rounded text-[11px] truncate"
                                    style={{ backgroundColor: '#F9FAFB', color: '#525252' }}
                                    title={path}
                                  >
                                    {path}
                                  </div>
                                ))}
                              </div>
                              <div className="mt-2 flex gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleExport(pack)}
                                  className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium"
                                  style={{ backgroundColor: 'var(--brand-primary-soft)', color: 'var(--brand-primary-strong)' }}
                                >
                                  <Download className="h-3.5 w-3.5" />
                                  导出
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        ) : viewMode === 'create' ? (
          <div className="p-4 space-y-4">
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: '#0A0A0A' }}>
                包名称 <span style={{ color: '#DC2626' }}>*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例如: React 开发核心概念"
                className="w-full rounded-md border px-3 py-2 text-xs"
                style={{ borderColor: '#E5E7EB' }}
              />
            </div>

            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: '#0A0A0A' }}>
                作用域类型
              </label>
              <div className="flex gap-2">
                {[
                  { value: 'tag' as const, label: '标签' },
                  { value: 'folder' as const, label: '文件夹' },
                  { value: 'topic' as const, label: '主题' },
                  { value: 'manual' as const, label: '手动' },
                ].map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setScopeType(option.value)}
                    className="flex-1 rounded-md border px-3 py-2 text-xs font-medium"
                    style={{
                      borderColor: scopeType === option.value ? 'var(--brand-primary-border)' : '#E5E7EB',
                      backgroundColor: scopeType === option.value ? 'var(--brand-primary-soft)' : '#FFFFFF',
                      color: scopeType === option.value ? 'var(--brand-primary-strong)' : '#525252',
                    }}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            {scopeType !== 'manual' && (
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: '#0A0A0A' }}>
                  作用域值 <span style={{ color: '#DC2626' }}>*</span>
                </label>
                <input
                  type="text"
                  value={scopeValue}
                  onChange={(e) => setScopeValue(e.target.value)}
                  placeholder={
                    scopeType === 'tag' ? '例如: react' :
                    scopeType === 'folder' ? '例如: 前端/React' :
                    '例如: 性能优化'
                  }
                  className="w-full rounded-md border px-3 py-2 text-xs"
                  style={{ borderColor: '#E5E7EB' }}
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: '#0A0A0A' }}>
                知识路径 <span style={{ color: '#DC2626' }}>*</span>
              </label>
              <textarea
                value={itemPaths}
                onChange={(e) => setItemPaths(e.target.value)}
                placeholder="每行输入一个知识路径，例如:&#10;前端/React/Hook原理&#10;前端/React/性能优化&#10;开发/最佳实践/React"
                rows={8}
                className="w-full rounded-md border px-3 py-2 text-xs resize-none"
                style={{ borderColor: '#E5E7EB', fontFamily: 'monospace' }}
              />
              <div className="mt-1 text-[10px]" style={{ color: '#A3A3A3' }}>
                {itemPaths.split('\n').filter(p => p.trim()).length} 条路径
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: '#0A0A0A' }}>
                描述（可选）
              </label>
              <textarea
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                placeholder="简要描述这个 Context Pack 的用途和使用场景..."
                rows={3}
                className="w-full rounded-md border px-3 py-2 text-xs resize-none"
                style={{ borderColor: '#E5E7EB' }}
              />
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setViewMode('list')}
                disabled={creating}
                className="flex-1 rounded-md px-4 py-2 text-xs font-medium"
                style={{ backgroundColor: '#F5F5F5', color: '#737373' }}
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleCreate}
                disabled={creating || !name.trim()}
                className="flex-1 rounded-md px-4 py-2 text-xs font-medium text-white"
                style={{
                  backgroundColor: 'var(--brand-primary)',
                  opacity: creating || !name.trim() ? 0.6 : 1,
                }}
              >
                {creating ? '创建中...' : '创建 Pack'}
              </button>
            </div>
          </div>
        ) : (
          <div className="p-4">
            <div className="rounded-lg border p-4" style={{ borderColor: '#E5E7EB' }}>
              <div className="text-center">
                <Package className="h-12 w-12 mx-auto mb-2" style={{ color: '#D4D4D8' }} />
                <p className="text-xs" style={{ color: '#737373' }}>详情视图开发中</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
