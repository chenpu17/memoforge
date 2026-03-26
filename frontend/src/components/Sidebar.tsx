import React from 'react'
import { useAppStore } from '../stores/appStore'
import { ChevronRight, ChevronDown, Search, GitBranch, Settings, Database, ChevronsUpDown, FolderInput, Bot } from 'lucide-react'
import { cn } from '../lib/utils'
import { KbSwitcher } from './KbSwitcher'
import { SettingsModal } from './SettingsModal'

interface SidebarProps {
  onImport?: () => void
  onOpenSearch?: () => void
  selectedCategory?: string | null
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
  selectedCategory = null,
  onSelectCategory,
  pendingChangesCount = 0,
  readonly = false,
  currentKbName = '知识库',
  isGitRepo = true,
  mcpConnectionCount = 0,
}) => {
  const { categories, knowledgeList } = useAppStore()
  const [expandedCategories, setExpandedCategories] = React.useState<Set<string>>(new Set())
  const [showKbSwitcher, setShowKbSwitcher] = React.useState(false)
  const [showSettings, setShowSettings] = React.useState(false)

  const toggleCategory = (catId: string) => {
    const newExpanded = new Set(expandedCategories)
    if (newExpanded.has(catId)) {
      newExpanded.delete(catId)
    } else {
      newExpanded.add(catId)
    }
    setExpandedCategories(newExpanded)
  }

  const getCategoryCount = (catId: string, catName: string) => {
    return knowledgeList.filter(k => {
      const kCategory = k.category || ''
      return kCategory === catId || kCategory === catName
    }).length
  }

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

      {/* Categories Section */}
      <div className="flex-1 overflow-y-auto p-2">
        <div className="mb-1 px-1 py-1">
          <div className="text-[11px] font-medium" style={{ color: '#A3A3A3' }}>分类</div>
        </div>

        {categories.map(cat => {
          const isSelected = selectedCategory === cat.name
          const isExpanded = expandedCategories.has(cat.id)
          return (
            <div key={cat.id}>
              <div
                className={cn(
                  "flex items-center justify-between px-2 py-[5px] rounded-md cursor-pointer text-sm",
                  isSelected ? "bg-[#EEF2FF]" : "hover:bg-[#F5F5F5]"
                )}
                onClick={() => {
                  onSelectCategory?.(isSelected ? null : cat.name)
                  toggleCategory(cat.id)
                }}
              >
                <div className="flex items-center gap-1">
                  {isExpanded ? (
                    <ChevronDown className="h-3 w-3" style={{ color: isSelected ? '#4338CA' : '#737373' }} />
                  ) : (
                    <ChevronRight className="h-3 w-3" style={{ color: isSelected ? '#4338CA' : '#737373' }} />
                  )}
                  <span style={{ color: isSelected ? '#4338CA' : '#404040', fontWeight: isSelected ? 600 : 'normal' }}>{cat.name}</span>
                </div>
                <span
                  className="text-[10px] px-1.5 min-w-[20px] h-5 flex items-center justify-center rounded-full"
                  style={{
                    backgroundColor: isSelected ? '#6366F1' : '#F5F5F5',
                    color: isSelected ? '#FFFFFF' : '#737373'
                  }}
                >
                  {getCategoryCount(cat.id, cat.name)}
                </span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Footer */}
      <div className="border-t p-2" style={{ borderColor: '#E5E5E5' }}>
        {/* Search Row */}
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

        {/* Git Row - only show if Git repo */}
        {isGitRepo && (
          <div className="flex items-center gap-2 px-2 py-1.5 mt-0.5 rounded-md cursor-pointer hover:bg-[#F5F5F5]">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: pendingChangesCount > 0 ? '#F59E0B' : '#10B981' }} />
            <span className="text-xs flex-1" style={{ color: '#737373' }}>
              {pendingChangesCount > 0 ? `${pendingChangesCount} 处变更未提交` : '工作区已同步'}
            </span>
            <GitBranch className="h-3.5 w-3.5" style={{ color: '#A3A3A3' }} />
          </div>
        )}

        {/* MCP Agent Status */}
        <div className="flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer hover:bg-[#F5F5F5]">
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: mcpConnectionCount > 0 ? '#10B981' : '#A3A3A3' }} />
          <span className="text-xs flex-1" style={{ color: '#737373' }}>
            {mcpConnectionCount > 0 ? `MCP: ${mcpConnectionCount} 个连接` : 'MCP: 未连接'}
          </span>
          <Bot className="h-3.5 w-3.5" style={{ color: mcpConnectionCount > 0 ? '#10B981' : '#A3A3A3' }} />
        </div>

        {/* Import Row */}
        {onImport && !readonly && (
          <div
            onClick={onImport}
            className="flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer hover:bg-[#F5F5F5]"
          >
            <FolderInput className="h-3.5 w-3.5" style={{ color: '#6366F1' }} />
            <span className="text-xs" style={{ color: '#6366F1' }}>导入 Markdown</span>
          </div>
        )}

        {/* Settings Row */}
        <div
          onClick={() => setShowSettings(true)}
          className="flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer hover:bg-[#F5F5F5]"
        >
          <Settings className="h-3.5 w-3.5" style={{ color: '#A3A3A3' }} />
          <span className="text-xs" style={{ color: '#737373' }}>设置</span>
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
