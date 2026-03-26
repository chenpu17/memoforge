import React, { useState } from 'react'
import { Info, GitBranch, Link2, ChevronRight } from 'lucide-react'
import { GitPanel } from './GitPanel'
import { MetadataPanel } from './MetadataPanel'
import { BacklinksPanel } from './BacklinksPanel'

type TabType = 'metadata' | 'git' | 'backlinks'

interface RightPanelProps {
  readonly: boolean
  isGitRepo: boolean
  hasKnowledge: boolean
  pendingChangesCount?: number
  onGitStatusChange?: (count: number) => void
}

// 状态持久化 hook
function usePersistentState<T>(key: string, defaultValue: T): [T, (value: T) => void] {
  const [state, setState] = useState<T>(() => {
    try {
      const saved = localStorage.getItem(key)
      if (saved !== null) {
        return JSON.parse(saved)
      }
    } catch (e) {
      console.error('Failed to load state from localStorage:', e)
    }
    return defaultValue
  })

  const setValue = (value: T) => {
    setState(value)
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch (e) {
      console.error('Failed to save state to localStorage:', e)
    }
  }

  return [state, setValue]
}

export const RightPanel: React.FC<RightPanelProps> = ({
  readonly,
  isGitRepo,
  hasKnowledge,
  pendingChangesCount = 0,
  onGitStatusChange,
}) => {
  const [isOpen, setIsOpen] = usePersistentState('rightPanel.isOpen', false)
  const [activeTab, setActiveTab] = usePersistentState<TabType>('rightPanel.activeTab', 'metadata')

  const handleIconClick = (tab: TabType) => {
    if (isOpen && activeTab === tab) {
      // 如果已展开且点击当前 tab，则折叠
      setIsOpen(false)
    } else {
      // 否则展开并切换到该 tab
      setActiveTab(tab)
      setIsOpen(true)
    }
  }

  const handleToggle = () => {
    setIsOpen(false)
  }

  // 图标栏（折叠时显示）
  const iconBar = (
    <div className="flex flex-col items-center py-2 gap-1 w-10 border-l border-neutral-200 bg-white">
      <button
        onClick={() => handleIconClick('metadata')}
        className={`p-2 rounded-md transition-colors ${
          activeTab === 'metadata' && isOpen
            ? 'bg-indigo-100 text-indigo-600'
            : 'hover:bg-neutral-100 text-neutral-500'
        }`}
        title="元数据"
        disabled={!hasKnowledge}
      >
        <Info className="h-4 w-4" />
      </button>
      <button
        onClick={() => handleIconClick('git')}
        className={`p-2 rounded-md transition-colors ${
          activeTab === 'git' && isOpen
            ? 'bg-indigo-100 text-indigo-600'
            : 'hover:bg-neutral-100 text-neutral-500'
        }`}
        title="Git"
        disabled={readonly || !isGitRepo}
      >
        <GitBranch className="h-4 w-4" />
      </button>
      <button
        onClick={() => handleIconClick('backlinks')}
        className={`p-2 rounded-md transition-colors ${
          activeTab === 'backlinks' && isOpen
            ? 'bg-indigo-100 text-indigo-600'
            : 'hover:bg-neutral-100 text-neutral-500'
        }`}
        title="反向链接"
        disabled={!hasKnowledge}
      >
        <Link2 className="h-4 w-4" />
      </button>
    </div>
  )

  // 如果折叠状态，只显示图标栏
  if (!isOpen) {
    return iconBar
  }

  // 展开状态
  return (
    <div className="flex border-l border-neutral-200 bg-white transition-all duration-200 ease-in-out">
      {/* 图标栏 */}
      {iconBar}

      {/* 面板内容 */}
      <div className="w-72 flex flex-col min-w-[288px]">
        {/* Tab 栏 */}
        <div className="flex items-center border-b border-neutral-200 px-2 h-10">
          <button
            onClick={() => setActiveTab('metadata')}
            className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
              activeTab === 'metadata'
                ? 'bg-indigo-100 text-indigo-600'
                : 'text-neutral-500 hover:text-neutral-700'
            }`}
            disabled={!hasKnowledge}
          >
            元数据
          </button>
          <button
            onClick={() => setActiveTab('git')}
            className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
              activeTab === 'git'
                ? 'bg-indigo-100 text-indigo-600'
                : 'text-neutral-500 hover:text-neutral-700'
            }`}
            disabled={readonly || !isGitRepo}
          >
            Git
          </button>
          <button
            onClick={() => setActiveTab('backlinks')}
            className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
              activeTab === 'backlinks'
                ? 'bg-indigo-100 text-indigo-600'
                : 'text-neutral-500 hover:text-neutral-700'
            }`}
            disabled={!hasKnowledge}
          >
            反向链接
          </button>
          <button
            onClick={handleToggle}
            className="ml-auto p-1.5 rounded hover:bg-neutral-100 text-neutral-400 hover:text-neutral-600 transition-colors"
            title="折叠面板"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {/* Tab 内容 */}
        <div className="flex-1 overflow-y-auto">
          {activeTab === 'metadata' && hasKnowledge && (
            <MetadataPanel readonly={readonly} />
          )}
          {activeTab === 'git' && !readonly && isGitRepo && (
            <GitPanel
              compact
              refreshToken={pendingChangesCount}
              onStatusChange={onGitStatusChange}
            />
          )}
          {activeTab === 'backlinks' && hasKnowledge && (
            <BacklinksPanel />
          )}
        </div>
      </div>
    </div>
  )
}
