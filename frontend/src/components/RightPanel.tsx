import React, { Suspense, lazy, useEffect, useState } from 'react'
import { Info, GitBranch, Link2, ChevronsLeft, ChevronsRight } from 'lucide-react'

const GitPanel = lazy(async () => {
  const module = await import('./GitPanel')
  return { default: module.GitPanel }
})

const MetadataPanel = lazy(async () => {
  const module = await import('./MetadataPanel')
  return { default: module.MetadataPanel }
})

const BacklinksPanel = lazy(async () => {
  const module = await import('./BacklinksPanel')
  return { default: module.BacklinksPanel }
})

type TabType = 'metadata' | 'git' | 'backlinks'

interface RightPanelProps {
  readonly: boolean
  isGitRepo: boolean
  hasKnowledge: boolean
  folderMode?: boolean
  pendingChangesCount?: number
  onGitStatusChange?: (count: number) => void
}

const panelFallback = (
  <div className="side-panel-body">
    <div className="side-panel-empty">
      加载中...
    </div>
  </div>
)

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

export const RightPanel: React.FC<RightPanelProps> = React.memo(({
  readonly,
  isGitRepo,
  hasKnowledge,
  folderMode = false,
  pendingChangesCount = 0,
  onGitStatusChange,
}) => {
  const [isOpen, setIsOpen] = usePersistentState('rightPanel.isOpen', false)
  const [activeTab, setActiveTab] = usePersistentState<TabType>('rightPanel.activeTab', 'metadata')
  const [lastKnowledgeTab, setLastKnowledgeTab] = usePersistentState<'metadata' | 'backlinks'>('rightPanel.lastKnowledgeTab', 'metadata')
  const [railTooltip, setRailTooltip] = useState<{ label: string; top: number; left: number } | null>(null)

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
    setIsOpen(!isOpen)
  }

  const showRailTooltip = (label: string, target: EventTarget | null) => {
    if (!(target instanceof HTMLElement)) return
    const rect = target.getBoundingClientRect()
    setRailTooltip({
      label,
      top: rect.top + rect.height / 2,
      left: rect.left - 10,
    })
  }

  const hideRailTooltip = () => {
    setRailTooltip(null)
  }

  useEffect(() => {
    if (activeTab !== 'git') {
      setLastKnowledgeTab(activeTab)
    }
  }, [activeTab, setLastKnowledgeTab])

  useEffect(() => {
    if (folderMode) {
      if (activeTab !== 'git') {
        setActiveTab('git')
      }
      return
    }

    if (!hasKnowledge) return
    if (activeTab === 'git') {
      setActiveTab(lastKnowledgeTab)
    }
  }, [activeTab, folderMode, hasKnowledge, isOpen, lastKnowledgeTab, setActiveTab, setIsOpen])

  const edgeToggle = (
    <button
      type="button"
      onClick={handleToggle}
      className="right-panel-edge-toggle"
      title={isOpen ? '折叠右侧面板' : '展开右侧面板'}
    >
      {isOpen ? <ChevronsRight className="h-3.5 w-3.5" /> : <ChevronsLeft className="h-3.5 w-3.5" />}
    </button>
  )

  const iconBar = (
    <div className="right-panel-rail">
      <button
        onClick={() => handleIconClick('metadata')}
        className={`right-panel-rail-button ${activeTab === 'metadata' && isOpen ? 'right-panel-rail-button--active' : ''}`}
        title="元数据"
        aria-label="元数据"
        data-label="元数据"
        onMouseEnter={(event) => showRailTooltip('元数据', event.currentTarget)}
        onMouseLeave={hideRailTooltip}
        onFocus={(event) => showRailTooltip('元数据', event.currentTarget)}
        onBlur={hideRailTooltip}
        disabled={folderMode || !hasKnowledge}
      >
        <Info className="h-4 w-4" />
      </button>
      <button
        onClick={() => handleIconClick('git')}
        className={`right-panel-rail-button ${activeTab === 'git' && isOpen ? 'right-panel-rail-button--active' : ''}`}
        title="Git"
        aria-label="Git"
        data-label="Git"
        onMouseEnter={(event) => showRailTooltip('Git', event.currentTarget)}
        onMouseLeave={hideRailTooltip}
        onFocus={(event) => showRailTooltip('Git', event.currentTarget)}
        onBlur={hideRailTooltip}
        disabled={readonly || !isGitRepo}
      >
        <GitBranch className="h-4 w-4" />
      </button>
      <button
        onClick={() => handleIconClick('backlinks')}
        className={`right-panel-rail-button ${activeTab === 'backlinks' && isOpen ? 'right-panel-rail-button--active' : ''}`}
        title="反向链接"
        aria-label="反向链接"
        data-label="反向链接"
        onMouseEnter={(event) => showRailTooltip('反向链接', event.currentTarget)}
        onMouseLeave={hideRailTooltip}
        onFocus={(event) => showRailTooltip('反向链接', event.currentTarget)}
        onBlur={hideRailTooltip}
        disabled={folderMode || !hasKnowledge}
      >
        <Link2 className="h-4 w-4" />
      </button>
    </div>
  )

  if (!isOpen) {
    return (
      <div className="right-panel-shell relative flex border-l border-neutral-200 bg-white">
        {edgeToggle}
        {iconBar}
        {railTooltip && (
          <div
            className="pointer-events-none fixed z-30 rounded-full border px-2.5 py-1 text-[11px] font-medium"
            style={{
              top: railTooltip.top,
              left: railTooltip.left,
              transform: 'translate(-100%, -50%)',
              borderColor: '#E5E7EB',
              backgroundColor: 'rgba(255, 255, 255, 0.98)',
              color: '#404040',
              boxShadow: '0 14px 30px rgba(15, 23, 42, 0.12)',
            }}
          >
            {railTooltip.label}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="right-panel-shell relative flex border-l border-neutral-200 bg-white transition-all duration-200 ease-in-out">
      {edgeToggle}
      {iconBar}
      {railTooltip && (
        <div
          className="pointer-events-none fixed z-30 rounded-full border px-2.5 py-1 text-[11px] font-medium"
          style={{
            top: railTooltip.top,
            left: railTooltip.left,
            transform: 'translate(-100%, -50%)',
            borderColor: '#E5E7EB',
            backgroundColor: 'rgba(255, 255, 255, 0.98)',
            color: '#404040',
            boxShadow: '0 14px 30px rgba(15, 23, 42, 0.12)',
          }}
        >
          {railTooltip.label}
        </div>
      )}

      <div
        className="flex flex-col"
        style={{ width: 'clamp(236px, 24vw, 272px)', minWidth: 'clamp(236px, 24vw, 272px)' }}
      >
        <div className="right-panel-tabs">
          <button
            onClick={() => setActiveTab('metadata')}
            className={`right-panel-tab ${activeTab === 'metadata' ? 'right-panel-tab--active' : ''}`}
            disabled={folderMode || !hasKnowledge}
          >
            元数据
          </button>
          <button
            onClick={() => setActiveTab('git')}
            className={`right-panel-tab ${activeTab === 'git' ? 'right-panel-tab--active' : ''}`}
            disabled={readonly || !isGitRepo}
          >
            Git
          </button>
          <button
            onClick={() => setActiveTab('backlinks')}
            className={`right-panel-tab ${activeTab === 'backlinks' ? 'right-panel-tab--active' : ''}`}
            disabled={folderMode || !hasKnowledge}
          >
            反向链接
          </button>
        </div>

        <div className="flex-1 min-h-0">
          <Suspense fallback={panelFallback}>
            {activeTab === 'metadata' && !folderMode && hasKnowledge && (
              <MetadataPanel readonly={readonly} />
            )}
            {activeTab === 'git' && !readonly && isGitRepo && (
              <GitPanel
                compact
                refreshToken={pendingChangesCount}
                onStatusChange={onGitStatusChange}
              />
            )}
            {activeTab === 'backlinks' && !folderMode && hasKnowledge && (
              <BacklinksPanel />
            )}
            {folderMode && activeTab !== 'git' && (
              <div className="side-panel-body">
                <div className="side-panel-empty">
                  目录浏览时仅保留 Git 面板，打开文档后会自动恢复元数据与反向链接。
                </div>
              </div>
            )}
          </Suspense>
        </div>
      </div>
    </div>
  )
})
