import React, { useMemo, useState } from 'react'
import { shallow } from 'zustand/shallow'
import { useAppStore } from '../stores/appStore'
import { X, AlertTriangle, Copy, Check, ChevronDown, ChevronRight } from 'lucide-react'

interface MetadataPanelProps {
  readonly?: boolean
}

const formatMetadataDate = (value: string) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export const MetadataPanel: React.FC<MetadataPanelProps> = ({ readonly = false }) => {
  const {
    currentKnowledge,
    currentKnowledgeContent,
    patchCurrentKnowledge,
    categories,
    allTags,
  } = useAppStore((state) => ({
    currentKnowledge: state.currentKnowledge
      ? {
          id: state.currentKnowledge.id,
          title: state.currentKnowledge.title,
          category: state.currentKnowledge.category,
          tags: state.currentKnowledge.tags,
          summary: state.currentKnowledge.summary,
          summary_stale: state.currentKnowledge.summary_stale,
          created_at: state.currentKnowledge.created_at,
          updated_at: state.currentKnowledge.updated_at,
        }
      : null,
    currentKnowledgeContent: state.currentKnowledgeContent,
    patchCurrentKnowledge: state.patchCurrentKnowledge,
    categories: state.categories,
    allTags: state.allTags,
  }), shallow)
  const [tagInput, setTagInput] = useState('')
  const [pathCopied, setPathCopied] = useState(false)
  const [showDetails, setShowDetails] = useState(false)
  const [showAllTags, setShowAllTags] = useState(false)
  const [showAllSuggestedTags, setShowAllSuggestedTags] = useState(false)

  if (!currentKnowledge) {
    return (
      <div className="side-panel-body">
        <div className="side-panel-empty">
          选择或创建知识以查看元数据
        </div>
      </div>
    )
  }

  const updateField = (field: keyof typeof currentKnowledge, value: any) => {
    if (readonly) return
    patchCurrentKnowledge({ content: currentKnowledgeContent, [field]: value })
  }

  const addTag = (tag: string) => {
    const normalizedTag = tag.trim()
    if (readonly) return
    if (normalizedTag && !currentKnowledge.tags.includes(normalizedTag)) {
      updateField('tags', [...currentKnowledge.tags, normalizedTag])
      setTagInput('')
    }
  }

  const removeTag = (tag: string) => {
    if (readonly) return
    updateField('tags', currentKnowledge.tags.filter(t => t !== tag))
  }

  const categorySuggestions = useMemo(
    () => categories.slice().sort((left, right) => (right.count ?? 0) - (left.count ?? 0)).slice(0, 4),
    [categories],
  )
  const selectedCategory = categories.find((category) => category.id === currentKnowledge.category)

  const suggestedTags = useMemo(() => {
    const query = tagInput.trim().toLowerCase()
    return allTags
      .filter(({ tag }) => !currentKnowledge.tags.includes(tag))
      .filter(({ tag }) => !query || tag.toLowerCase().includes(query))
      .slice(0, query ? 6 : 8)
  }, [allTags, currentKnowledge.tags, tagInput])

  const datalistTags = useMemo(() => {
    const query = tagInput.trim().toLowerCase()
    return allTags
      .filter(({ tag }) => !currentKnowledge.tags.includes(tag))
      .filter(({ tag }) => !query || tag.toLowerCase().includes(query))
      .slice(0, 50)
  }, [allTags, currentKnowledge.tags, tagInput])

  const handleCopyPath = async () => {
    try {
      await navigator.clipboard.writeText(currentKnowledge.id)
      setPathCopied(true)
      window.setTimeout(() => setPathCopied(false), 1800)
    } catch (error) {
      console.error('Failed to copy knowledge path:', error)
    }
  }

  const metadataStats = [
    { label: '分类', value: selectedCategory?.name ?? '未分类' },
    { label: '标签', value: `${currentKnowledge.tags.length} 个` },
    { label: '摘要', value: currentKnowledge.summary_stale ? '待更新' : '正常', tone: currentKnowledge.summary_stale ? 'warning' : 'default' as const },
  ]
  const visibleTags = showAllTags ? currentKnowledge.tags : currentKnowledge.tags.slice(0, 4)
  const hiddenTagCount = Math.max(currentKnowledge.tags.length - visibleTags.length, 0)
  const visibleSuggestedTags = showAllSuggestedTags ? suggestedTags : suggestedTags.slice(0, 4)
  const hiddenSuggestedTagCount = Math.max(suggestedTags.length - visibleSuggestedTags.length, 0)

  return (
    <div className="side-panel-body">
      <div className="side-panel-card">
        <div className="side-panel-section">
          <div className="side-panel-heading">概览</div>
          <div className="flex flex-wrap gap-1.5 text-[11px]">
            {metadataStats.map((item) => (
              <span
                key={item.label}
                className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1"
                style={{
                  borderColor: '#E5E7EB',
                  backgroundColor: item.tone === 'warning' ? '#FEF3C7' : '#F8FAFC',
                  color: item.tone === 'warning' ? '#92400E' : '#64748B',
                }}
              >
                <span style={{ color: item.tone === 'warning' ? '#B45309' : '#94A3B8' }}>{item.label}</span>
                <span className="max-w-[108px] truncate font-medium" style={{ color: item.tone === 'warning' ? '#92400E' : '#171717' }}>
                  {item.value}
                </span>
              </span>
            ))}
          </div>
        </div>

        <div className="side-panel-section">
          <button
            type="button"
            onClick={() => setShowDetails((value) => !value)}
            className="flex w-full items-center justify-between gap-2 rounded-xl px-2 py-1 text-left transition-colors hover:bg-[#F8FAFC]"
            style={{ color: '#525252' }}
          >
            <span className="inline-flex items-center gap-1.5">
              {showDetails ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              <span className="side-panel-heading !mb-0">路径与时间</span>
            </span>
            <span className="truncate text-[11px]" style={{ color: '#94A3B8' }}>
              更新于 {formatMetadataDate(currentKnowledge.updated_at)}
            </span>
          </button>
          {showDetails ? (
            <div className="mt-2 rounded-xl bg-[#F8FAFC] px-3 py-2 text-xs" style={{ color: '#525252' }}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[11px]" style={{ color: '#737373' }}>路径</div>
                  <div className="mt-1 break-all font-medium" style={{ color: '#171717' }}>
                    {currentKnowledge.id}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleCopyPath}
                  className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5"
                  style={{ backgroundColor: '#FFFFFF', color: pathCopied ? '#15803D' : '#737373', border: '1px solid #E5E7EB' }}
                >
                  {pathCopied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                  <span>{pathCopied ? '已复制' : '复制'}</span>
                </button>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <div className="rounded-lg bg-white px-2.5 py-2">
                  <div className="mb-1 text-[11px]" style={{ color: '#737373' }}>创建于</div>
                  <div>{formatMetadataDate(currentKnowledge.created_at)}</div>
                </div>
                <div className="rounded-lg bg-white px-2.5 py-2">
                  <div className="mb-1 text-[11px]" style={{ color: '#737373' }}>更新于</div>
                  <div>{formatMetadataDate(currentKnowledge.updated_at)}</div>
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-2 flex items-center justify-between gap-2 rounded-xl bg-[#F8FAFC] px-3 py-2 text-xs" style={{ color: '#525252' }}>
              <div className="min-w-0">
                <div className="text-[11px]" style={{ color: '#737373' }}>路径</div>
                <div
                  className="truncate font-medium"
                  style={{ color: '#171717' }}
                  title={currentKnowledge.id}
                >
                  {currentKnowledge.id}
                </div>
              </div>
              <button
                type="button"
                onClick={handleCopyPath}
                className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5"
                style={{ backgroundColor: '#FFFFFF', color: pathCopied ? '#15803D' : '#737373', border: '1px solid #E5E7EB' }}
              >
                {pathCopied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                <span>{pathCopied ? '已复制' : '复制'}</span>
              </button>
            </div>
          )}
        </div>

        <div className="side-panel-section">
          <div className="side-panel-heading">标题</div>
          <input
            value={currentKnowledge.title}
            onChange={(e) => updateField('title', e.target.value)}
            placeholder="输入标题"
            disabled={readonly}
            className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:border-indigo-500 disabled:cursor-not-allowed disabled:bg-gray-100"
            style={{ borderColor: '#E5E5E5' }}
          />
        </div>

        <div className="side-panel-section">
          <div className="side-panel-heading">分类</div>
          <select
            value={currentKnowledge.category || ''}
            onChange={(e) => updateField('category', e.target.value || undefined)}
            disabled={readonly}
            className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:border-indigo-500 disabled:cursor-not-allowed disabled:bg-gray-100"
            style={{ borderColor: '#E5E5E5' }}
          >
            <option value="">未分类</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
          {selectedCategory && (
            <div className="mt-2 rounded-xl bg-[#F8FAFC] px-3 py-2 text-xs" style={{ color: '#525252' }}>
              当前分类: <span className="font-medium" style={{ color: '#171717' }}>{selectedCategory.name}</span>
            </div>
          )}
          {categorySuggestions.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {categorySuggestions.slice(0, 3).map((category) => (
                <button
                  key={category.id}
                  type="button"
                  disabled={readonly}
                  onClick={() => updateField('category', category.id)}
                  className="rounded-md border px-2 py-1 text-[11px] transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                  style={{
                    borderColor: currentKnowledge.category === category.id ? '#C7D2FE' : '#E5E7EB',
                    backgroundColor: currentKnowledge.category === category.id ? '#EEF2FF' : '#FFFFFF',
                    color: currentKnowledge.category === category.id ? '#4338CA' : '#737373',
                  }}
                >
                  {category.name}
                </button>
              ))}
              {!!currentKnowledge.category && (
                <button
                  type="button"
                  disabled={readonly}
                  onClick={() => updateField('category', undefined)}
                  className="rounded-md border px-2 py-1 text-[11px] transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                  style={{ borderColor: '#E5E7EB', backgroundColor: '#FFFFFF', color: '#737373' }}
                >
                  清除分类
                </button>
              )}
            </div>
          )}
        </div>

        <div className="side-panel-section">
          <div className="side-panel-heading">标签</div>
          <div className="mb-2 flex flex-wrap gap-1.5">
            {visibleTags.map(tag => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs"
                style={{ backgroundColor: '#EEF2FF', color: '#6366F1' }}
              >
                {tag}
                {!readonly && (
                  <button onClick={() => removeTag(tag)} className="hover:opacity-70">
                    <X className="h-3 w-3" />
                  </button>
                )}
              </span>
            ))}
            {hiddenTagCount > 0 && (
              <button
                type="button"
                onClick={() => setShowAllTags(true)}
                className="rounded-full border px-2.5 py-1 text-[11px] font-medium"
                style={{ borderColor: '#E5E7EB', backgroundColor: '#FFFFFF', color: '#64748B' }}
              >
                +{hiddenTagCount} 更多
              </button>
            )}
            {showAllTags && currentKnowledge.tags.length > 4 && (
              <button
                type="button"
                onClick={() => setShowAllTags(false)}
                className="rounded-full border px-2.5 py-1 text-[11px] font-medium"
                style={{ borderColor: '#E5E7EB', backgroundColor: '#FFFFFF', color: '#64748B' }}
              >
                收起
              </button>
            )}
          </div>
          {!readonly && (
            <>
              <input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                placeholder="输入标签后回车"
                list="metadata-tag-suggestions"
                className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:border-indigo-500"
                style={{ borderColor: '#E5E5E5' }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    addTag(tagInput)
                  }
                }}
              />
              <datalist id="metadata-tag-suggestions">
                {datalistTags.map(({ tag }) => (
                  <option key={tag} value={tag} />
                ))}
              </datalist>
              {suggestedTags.length > 0 && (
                <div className="mt-2">
                  <div className="mb-1 text-[11px]" style={{ color: '#737373' }}>
                    推荐标签
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {visibleSuggestedTags.map(({ tag, count }) => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => addTag(tag)}
                        className="rounded-full border px-2.5 py-1 text-[11px] transition-colors"
                        style={{ borderColor: '#E5E7EB', backgroundColor: '#FFFFFF', color: '#737373' }}
                      >
                        {tag} <span style={{ color: '#A3A3A3' }}>{count}</span>
                      </button>
                    ))}
                    {hiddenSuggestedTagCount > 0 && (
                      <button
                        type="button"
                        onClick={() => setShowAllSuggestedTags(true)}
                        className="rounded-full border px-2.5 py-1 text-[11px] font-medium"
                        style={{ borderColor: '#E5E7EB', backgroundColor: '#FFFFFF', color: '#64748B' }}
                      >
                        +{hiddenSuggestedTagCount} 更多推荐
                      </button>
                    )}
                    {showAllSuggestedTags && suggestedTags.length > 4 && (
                      <button
                        type="button"
                        onClick={() => setShowAllSuggestedTags(false)}
                        className="rounded-full border px-2.5 py-1 text-[11px] font-medium"
                        style={{ borderColor: '#E5E7EB', backgroundColor: '#FFFFFF', color: '#64748B' }}
                      >
                        收起推荐
                      </button>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="side-panel-section">
          <div className="flex items-center gap-2">
            <div className="side-panel-heading !mb-0">摘要</div>
            {!!currentKnowledge.summary_stale && (
              <span
                className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                style={{ backgroundColor: '#FEF3C7', color: '#92400E' }}
              >
                已过期
              </span>
            )}
          </div>
          {!!currentKnowledge.summary_stale && (
            <div
              className="mb-2 mt-2 flex items-center gap-2 rounded-xl px-3 py-2 text-[13px]"
              style={{ backgroundColor: '#FEF3C7', color: '#92400E' }}
            >
              <AlertTriangle className="h-4 w-4 flex-shrink-0" />
              <span>摘要已过期，内容在上次生成摘要后已更新</span>
            </div>
          )}
          <textarea
            className="min-h-[104px] w-full resize-none rounded-md border px-3 py-2 text-sm outline-none focus:border-indigo-500 disabled:cursor-not-allowed disabled:bg-gray-100"
            style={{ borderColor: '#E5E5E5' }}
            value={currentKnowledge.summary || ''}
            onChange={(e) => updateField('summary', e.target.value)}
            placeholder="输入摘要"
            disabled={readonly}
          />
        </div>
      </div>
    </div>
  )
}
