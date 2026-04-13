import React, { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react'
import { Info, GitBranch, Link2, Bot, ChevronsLeft, ChevronsRight, Shield, ExternalLink, FileText } from 'lucide-react'
import { useAppStore } from '../stores/appStore'
import type { DraftSummary } from '../types'

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

const AgentDraftPanel = lazy(async () => {
  const module = await import('./AgentDraftPanel')
  return { default: module.AgentDraftPanel }
})

const DraftPreviewModal = lazy(async () => {
  const module = await import('./DraftPreviewModal')
  return { default: module.DraftPreviewModal }
})

const EvidenceMetaPanel = lazy(async () => {
  const module = await import('./EvidenceMetaPanel')
  return { default: module.EvidenceMetaPanel }
})

const FreshnessActions = lazy(async () => {
  const module = await import('./FreshnessActions')
  return { default: module.FreshnessActions }
})

type TabType = 'metadata' | 'git' | 'backlinks' | 'agent' | 'evidence'

interface RightPanelProps {
  readonly: boolean
  isGitRepo: boolean
  hasKnowledge: boolean
  folderMode?: boolean
  pendingChangesCount?: number
  onGitStatusChange?: (count: number) => void
  onRepoChanged?: () => void | Promise<void>
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

  const setValue = useCallback((value: T) => {
    setState(value)
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch (e) {
      console.error('Failed to save state to localStorage:', e)
    }
  }, [key])

  return [state, setValue]
}

export const RightPanel: React.FC<RightPanelProps> = React.memo(({
  readonly,
  isGitRepo,
  hasKnowledge,
  folderMode = false,
  pendingChangesCount = 0,
  onGitStatusChange,
  onRepoChanged,
}) => {
  const [isOpen, setIsOpen] = usePersistentState('rightPanel.isOpen', false)
  const [activeTab, setActiveTab] = usePersistentState<TabType>('rightPanel.activeTab', 'metadata')
  const [lastKnowledgeTab, setLastKnowledgeTab] = usePersistentState<'metadata' | 'backlinks' | 'evidence'>('rightPanel.lastKnowledgeTab', 'metadata')
  const [railTooltip, setRailTooltip] = useState<{ label: string; top: number; left: number } | null>(null)
  const previousFolderModeRef = useRef(folderMode)
  const [draftCount, setDraftCount] = useState(0)
  const [previewDraftId, setPreviewDraftId] = useState<string | null>(null)
  const [draftRefreshToken, setDraftRefreshToken] = useState(0)
  const [selectedDraft, setSelectedDraft] = useState<DraftSummary | null>(null)

  const { currentKnowledgeId, currentKnowledgeTitle, setActiveAgentPanel } = useAppStore((state) => ({
    currentKnowledgeId: state.currentKnowledge?.id ?? null,
    currentKnowledgeTitle: state.currentKnowledge?.title ?? null,
    setActiveAgentPanel: state.setActiveAgentPanel,
  }))

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
    if (activeTab === 'metadata' || activeTab === 'backlinks' || activeTab === 'evidence') {
      setLastKnowledgeTab(activeTab)
    }
  }, [activeTab, setLastKnowledgeTab])

  useEffect(() => {
    const wasFolderMode = previousFolderModeRef.current
    previousFolderModeRef.current = folderMode

    if (folderMode) {
      if (activeTab !== 'git') {
        setActiveTab('git')
      }
      return
    }

    if (!wasFolderMode || !hasKnowledge) return
    if (activeTab === 'git') {
      setActiveTab(lastKnowledgeTab)
    }
  }, [activeTab, folderMode, hasKnowledge, lastKnowledgeTab, setActiveTab])

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
      <button
        onClick={() => handleIconClick('evidence')}
        className={`right-panel-rail-button ${activeTab === 'evidence' && isOpen ? 'right-panel-rail-button--active' : ''}`}
        title="证据与治理"
        aria-label="证据与治理"
        data-label="证据与治理"
        onMouseEnter={(event) => showRailTooltip('证据与治理', event.currentTarget)}
        onMouseLeave={hideRailTooltip}
        onFocus={(event) => showRailTooltip('证据与治理', event.currentTarget)}
        onBlur={hideRailTooltip}
        disabled={folderMode || !hasKnowledge}
      >
        <Shield className="h-4 w-4" />
      </button>
      <button
        onClick={() => handleIconClick('agent')}
        className={`right-panel-rail-button relative ${activeTab === 'agent' && isOpen ? 'right-panel-rail-button--active' : ''}`}
        title="AI 草稿"
        aria-label="AI 草稿"
        data-label="AI 草稿"
        onMouseEnter={(event) => showRailTooltip('AI 草稿', event.currentTarget)}
        onMouseLeave={hideRailTooltip}
        onFocus={(event) => showRailTooltip('AI 草稿', event.currentTarget)}
        onBlur={hideRailTooltip}
      >
        <Bot className="h-4 w-4" />
        {draftCount > 0 && (
          <span
            className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full text-[9px] font-bold text-white"
            style={{ backgroundColor: '#EF4444', padding: '0 3px' }}
          >
            {draftCount > 9 ? '9+' : draftCount}
          </span>
        )}
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
          <button
            onClick={() => setActiveTab('evidence')}
            className={`right-panel-tab ${activeTab === 'evidence' ? 'right-panel-tab--active' : ''}`}
            disabled={folderMode || !hasKnowledge}
          >
            证据
          </button>
          <button
            onClick={() => setActiveTab('agent')}
            className={`right-panel-tab ${activeTab === 'agent' ? 'right-panel-tab--active' : ''}`}
          >
            AI
            {draftCount > 0 && (
              <span
                className="ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full text-[9px] font-bold text-white"
                style={{ backgroundColor: '#EF4444', padding: '0 3px' }}
              >
                {draftCount}
              </span>
            )}
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
                onRepoChanged={onRepoChanged}
              />
            )}
            {activeTab === 'backlinks' && !folderMode && hasKnowledge && (
              <BacklinksPanel />
            )}
            {activeTab === 'evidence' && !folderMode && hasKnowledge && (
              <div className="flex flex-col h-full overflow-y-auto">
                <EvidenceMetaPanel readonly={readonly} />
                <FreshnessActions readonly={readonly} />
              </div>
            )}
            {activeTab === 'agent' && (
              <AgentDraftPanel
                onSelectDraft={(draftId, draftSummary) => {
                  setPreviewDraftId(draftId)
                  setSelectedDraft(draftSummary ?? null)
                }}
                onCountChange={setDraftCount}
                refreshToken={draftRefreshToken}
              />
            )}
            {folderMode && activeTab !== 'git' && activeTab !== 'agent' && (
              <div className="side-panel-body">
                <div className="side-panel-empty">
                  目录浏览时仅保留 Git 面板，打开文档后会自动恢复元数据与反向链接。
                </div>
              </div>
            )}

            {/* Related Items Navigation */}
            {activeTab === 'agent' && selectedDraft && (
              <div className="border-t px-3 py-2.5 space-y-1.5" style={{ borderColor: '#F0F0F0' }}>
                <div className="text-[10px] font-medium" style={{ color: '#A3A3A3' }}>关联项目</div>
                {selectedDraft.source_session_id && (
                  <button
                    type="button"
                    onClick={() => setActiveAgentPanel('sessions')}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-gray-50"
                  >
                    <ExternalLink className="h-3 w-3 flex-shrink-0" style={{ color: 'var(--brand-primary)' }} />
                    <span className="truncate" style={{ color: '#525252' }}>Session {selectedDraft.source_session_id.slice(0, 8)}</span>
                  </button>
                )}
                {selectedDraft.target_path && (
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-gray-50"
                    disabled
                  >
                    <FileText className="h-3 w-3 flex-shrink-0" style={{ color: '#737373' }} />
                    <span className="truncate" style={{ color: '#737373' }}>{selectedDraft.target_path}</span>
                  </button>
                )}
              </div>
            )}

            {activeTab === 'evidence' && currentKnowledgeId && (
              <div className="border-t px-3 py-2.5 space-y-1.5" style={{ borderColor: '#F0F0F0' }}>
                <div className="text-[10px] font-medium" style={{ color: '#A3A3A3' }}>关联项目</div>
                <div className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs">
                  <FileText className="h-3 w-3 flex-shrink-0" style={{ color: 'var(--brand-primary)' }} />
                  <span className="truncate font-medium" style={{ color: '#525252' }}>{currentKnowledgeTitle || currentKnowledgeId}</span>
                </div>
              </div>
            )}
          </Suspense>
        </div>
      </div>

      {/* Draft Preview Modal */}
      {previewDraftId && (
        <Suspense fallback={null}>
          <DraftPreviewModal
            draftId={previewDraftId}
            onCommit={() => {
              setPreviewDraftId(null)
              setDraftRefreshToken((current) => current + 1)
            }}
            onDiscard={() => {
              setPreviewDraftId(null)
              setDraftRefreshToken((current) => current + 1)
            }}
            onClose={() => { setPreviewDraftId(null) }}
          />
        </Suspense>
      )}
    </div>
  )
})
