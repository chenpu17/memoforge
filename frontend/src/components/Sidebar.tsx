import React, { useMemo } from 'react'
import { shallow } from 'zustand/shallow'
import { useAppStore } from '../stores/appStore'
import { Search, GitBranch, Settings, Database, ChevronsUpDown, FolderInput, Bot } from 'lucide-react'
import { KbSwitcher } from './KbSwitcher'
import { SettingsModal } from './SettingsModal'

interface SidebarProps {
  onImport?: () => void
  onOpenSearch?: () => void
  onOpenBrowserMode?: (mode: 'knowledge' | 'category' | 'tag') => void
  onToggleTagShortcut?: (tag: string) => void
  onClearFilters?: () => void
  browserMode?: 'knowledge' | 'category' | 'tag'
  selectedCategory?: string | null
  selectedTags?: string[]
  onSelectCategory?: (categoryId: string | null) => void
  pendingChangesCount?: number
  readonly?: boolean
  currentKbName?: string
  isGitRepo?: boolean
  mcpConnectionCount?: number
}

export const Sidebar: React.FC<SidebarProps> = ({
  onImport,
  onOpenSearch,
  onOpenBrowserMode,
  onToggleTagShortcut,
  onClearFilters,
  browserMode = 'knowledge',
  selectedCategory = null,
  selectedTags = [],
  onSelectCategory,
  pendingChangesCount = 0,
  readonly = false,
  currentKbName = '知识库',
  isGitRepo = true,
  mcpConnectionCount = 0,
}) => {
  const { categories, knowledgeList, allTags } = useAppStore((state) => ({
    categories: state.categories ?? [],
    knowledgeList: state.knowledgeList ?? [],
    allTags: state.allTags ?? [],
  }), shallow)
  const [showKbSwitcher, setShowKbSwitcher] = React.useState(false)
  const [showSettings, setShowSettings] = React.useState(false)
  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>()
    knowledgeList.forEach((knowledge) => {
      if (!knowledge.category) return
      counts.set(knowledge.category, (counts.get(knowledge.category) ?? 0) + 1)
    })
    return counts
  }, [knowledgeList])
  const totalKnowledgeCount = useMemo(
    () => categories.reduce((sum, category) => sum + (category.count ?? categoryCounts.get(category.id) ?? 0), 0),
    [categories, categoryCounts],
  )
  const topCategories = useMemo(() => categories.slice().sort((left, right) => {
    const leftCount = left.count ?? categoryCounts.get(left.id) ?? 0
    const rightCount = right.count ?? categoryCounts.get(right.id) ?? 0
    if (rightCount !== leftCount) return rightCount - leftCount
    return left.name.localeCompare(right.name, 'zh-CN')
  }).slice(0, 4), [categories, categoryCounts])
  const topTags = useMemo(() => [...allTags]
    .sort((left, right) => {
      if (right.count !== left.count) return right.count - left.count
      return left.tag.localeCompare(right.tag, 'zh-CN')
    })
    .slice(0, 6), [allTags])
  const hasActiveFilters = selectedCategory !== null || selectedTags.length > 0
  const showSelectedCategorySummary = selectedCategory !== null && browserMode !== 'category'
  const showSelectedTagSummary = selectedTags.length > 0 && browserMode !== 'tag'
  const showFilterSummary = showSelectedCategorySummary || showSelectedTagSummary
  const showCategoryShortcuts = browserMode !== 'category'
  const showTagShortcuts = browserMode !== 'tag'
  const showShortcutSection = showCategoryShortcuts || showTagShortcuts

  return (
    <div className="flex flex-col h-full">
      {/* Sidebar Header - Vault */}
      <div className="px-3 pt-3 pb-2">
        <div
          className="flex items-center gap-1.5 px-2 py-1.5 rounded-md cursor-pointer hover:bg-gray-200"
          style={{ backgroundColor: '#F5F5F5' }}
          onClick={() => setShowKbSwitcher(true)}
        >
          <Database className="h-4 w-4" style={{ color: '#6366F1' }} />
          <div className="flex-1">
            <div className="text-[13px] font-semibold" style={{ color: '#0A0A0A' }}>{currentKbName}</div>
            <div className="text-[11px]" style={{ color: '#737373' }}>点击切换知识库</div>
          </div>
          <ChevronsUpDown className="h-3.5 w-3.5" style={{ color: '#A3A3A3' }} />
        </div>
      </div>

      <div className="h-px" style={{ backgroundColor: '#E5E5E5' }} />

      <div className="flex-1 overflow-y-auto p-2">
        <div className="rounded-xl border bg-white p-2" style={{ borderColor: '#E5E7EB' }}>
          <div className="mb-1 px-1 text-[11px] font-medium" style={{ color: '#A3A3A3' }}>
            辅助入口
          </div>
          <div className="text-[11px] px-1" style={{ color: '#94A3B8' }}>
            主浏览切换已放到中间区域，这里只保留常用辅助操作。
          </div>
        </div>

        {hasActiveFilters && showFilterSummary && (
          <div className="mt-2 rounded-xl border bg-[#FCFCFD] p-2" style={{ borderColor: '#E5E7EB' }}>
            <div className="mb-1 px-1 text-[11px] font-medium" style={{ color: '#A3A3A3' }}>当前筛选</div>
            <div className="flex flex-wrap gap-1.5">
              {showSelectedCategorySummary && (
                <span className="rounded-full bg-[#EEF2FF] px-2 py-1 text-[11px]" style={{ color: '#4338CA' }}>
                  分类 · {categories.find((category) => category.id === selectedCategory)?.name ?? selectedCategory}
                </span>
              )}
              {showSelectedTagSummary && selectedTags.map((tag) => (
                <span key={tag} className="rounded-full bg-[#F5F3FF] px-2 py-1 text-[11px]" style={{ color: '#6D28D9' }}>
                  标签 · {tag}
                </span>
              ))}
            </div>
            <button
              type="button"
              onClick={onClearFilters}
              className="mt-2 w-full rounded-lg border px-2 py-2 text-xs font-medium"
              style={{ borderColor: '#E5E7EB', color: '#525252', backgroundColor: '#FFFFFF' }}
            >
              返回全部知识
            </button>
          </div>
        )}

        <div className="mt-2 rounded-xl border bg-white p-2" style={{ borderColor: '#E5E7EB' }}>
          <div className="mb-2 px-1 text-[11px] font-medium" style={{ color: '#A3A3A3' }}>
            {showShortcutSection ? '常用入口' : '辅助提示'}
          </div>

          {showShortcutSection ? (
            <>
              {showCategoryShortcuts && (
                <div className={showTagShortcuts ? 'mb-2' : undefined}>
                  <div className="mb-1 flex items-center justify-between px-1">
                    <div className="text-[11px]" style={{ color: '#737373' }}>高频分类</div>
                    <button
                      type="button"
                      onClick={() => onOpenBrowserMode?.('category')}
                      className="text-[11px] font-medium"
                      style={{ color: '#6366F1' }}
                    >
                      全部
                    </button>
                  </div>
                  <div className="space-y-1">
                    <button
                      type="button"
                      className="flex w-full items-center justify-between rounded-lg border px-2.5 py-2 text-left"
                      style={{
                        borderColor: selectedCategory === null && selectedTags.length === 0 ? '#C7D2FE' : '#E5E7EB',
                        backgroundColor: selectedCategory === null && selectedTags.length === 0 ? '#EEF2FF' : '#FFFFFF',
                      }}
                      onClick={() => {
                        onClearFilters?.()
                        onOpenBrowserMode?.('knowledge')
                      }}
                    >
                      <span className="text-xs font-medium" style={{ color: '#171717' }}>全部知识</span>
                      <span className="rounded-full bg-[#F8FAFC] px-2 py-0.5 text-[10px]" style={{ color: '#64748B' }}>
                        {totalKnowledgeCount || knowledgeList.length}
                      </span>
                    </button>
                    {topCategories.map((category) => {
                      const active = selectedCategory === category.id
                      return (
                        <button
                          type="button"
                          key={category.id}
                          className="flex w-full items-center justify-between rounded-lg border px-2.5 py-2 text-left"
                          style={{
                            borderColor: active ? '#C7D2FE' : '#E5E7EB',
                            backgroundColor: active ? '#EEF2FF' : '#FFFFFF',
                          }}
                          onClick={() => {
                            onSelectCategory?.(active ? null : category.id)
                            onOpenBrowserMode?.('knowledge')
                          }}
                        >
                          <span className="truncate text-xs font-medium" style={{ color: active ? '#312E81' : '#171717' }}>
                            {category.name}
                          </span>
                          <span className="rounded-full bg-[#F8FAFC] px-2 py-0.5 text-[10px]" style={{ color: '#64748B' }}>
                            {category.count ?? categoryCounts.get(category.id) ?? 0}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {showTagShortcuts && (
                <div>
                  <div className="mb-1 flex items-center justify-between px-1">
                    <div className="text-[11px]" style={{ color: '#737373' }}>热门标签</div>
                    <button
                      type="button"
                      onClick={() => onOpenBrowserMode?.('tag')}
                      className="text-[11px] font-medium"
                      style={{ color: '#6366F1' }}
                    >
                      全部
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {topTags.map(({ tag, count }) => {
                      const active = selectedTags.includes(tag)
                      return (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => {
                            onToggleTagShortcut?.(tag)
                            onOpenBrowserMode?.('knowledge')
                          }}
                          className="rounded-full border px-2 py-1 text-[10px] font-medium"
                          style={{
                            borderColor: active ? '#C7D2FE' : '#E5E7EB',
                            backgroundColor: active ? '#EEF2FF' : '#FFFFFF',
                            color: active ? '#4338CA' : '#525252',
                          }}
                        >
                          #{tag} · {count}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div
              className="rounded-lg border px-3 py-2 text-[11px]"
              style={{ borderColor: '#E5E7EB', backgroundColor: '#FCFCFD', color: '#64748B' }}
            >
              当前主浏览区已经在展示相同维度的内容，这里自动收起重复入口，避免两边同时出现两套分类列表。
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="border-t p-2" style={{ borderColor: '#E5E5E5' }}>
        <div
          className="flex items-center gap-2 px-2 py-[7px] rounded-md cursor-pointer"
          style={{ backgroundColor: '#FFFFFF', border: '1px solid #E5E5E5' }}
          onClick={onOpenSearch}
        >
          <Search className="h-3.5 w-3.5" style={{ color: '#A3A3A3' }} />
          <span className="text-xs flex-1" style={{ color: '#A3A3A3' }}>搜索知识...</span>
          <span
            className="text-[10px] px-1.5 py-[1px] rounded"
            style={{ backgroundColor: '#F5F5F5', border: '1px solid #E5E5E5', color: '#A3A3A3' }}
          >
            ⌘K
          </span>
        </div>

        <div className="mt-2 flex flex-wrap gap-1.5">
          {isGitRepo && (
            <div
              className="inline-flex items-center gap-1.5 rounded-full px-2 py-1"
              style={{ backgroundColor: '#F5F5F5', color: '#737373' }}
            >
              <div className="h-2 w-2 rounded-full" style={{ backgroundColor: pendingChangesCount > 0 ? '#F59E0B' : '#10B981' }} />
              <GitBranch className="h-3 w-3" />
              <span className="text-[11px]">
                {pendingChangesCount > 0 ? `${pendingChangesCount} 处变更` : 'Git 已同步'}
              </span>
            </div>
          )}
          <div
            className="inline-flex items-center gap-1.5 rounded-full px-2 py-1"
            style={{ backgroundColor: '#F5F5F5', color: '#737373' }}
          >
            <div className="h-2 w-2 rounded-full" style={{ backgroundColor: mcpConnectionCount > 0 ? '#10B981' : '#A3A3A3' }} />
            <Bot className="h-3 w-3" style={{ color: mcpConnectionCount > 0 ? '#10B981' : '#A3A3A3' }} />
            <span className="text-[11px]">
              {mcpConnectionCount > 0 ? `MCP ${mcpConnectionCount}` : 'MCP 未连接'}
            </span>
          </div>
        </div>

        <div className="mt-2 grid grid-cols-2 gap-1.5">
          {onImport && !readonly && (
            <button
              type="button"
              onClick={onImport}
              className="flex items-center justify-center gap-1.5 rounded-md px-2 py-2 text-xs font-medium"
              style={{ backgroundColor: '#EEF2FF', color: '#4338CA' }}
            >
              <FolderInput className="h-3.5 w-3.5" />
              导入
            </button>
          )}

          <button
            type="button"
            onClick={() => setShowSettings(true)}
            className="flex items-center justify-center gap-1.5 rounded-md px-2 py-2 text-xs font-medium"
            style={{
              backgroundColor: onImport && !readonly ? '#F5F5F5' : '#FFFFFF',
              border: '1px solid #E5E5E5',
              color: '#737373',
              gridColumn: onImport && !readonly ? undefined : '1 / -1',
            }}
          >
            <Settings className="h-3.5 w-3.5" />
            设置
          </button>
        </div>
      </div>

      {showKbSwitcher && (
        <KbSwitcher
          onClose={() => setShowKbSwitcher(false)}
          onSwitch={() => {
            // 刷新页面数据
            window.location.reload()
          }}
        />
      )}

      {showSettings && (
        <SettingsModal onClose={() => setShowSettings(false)} />
      )}
    </div>
  )
}
