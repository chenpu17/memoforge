import { Suspense, lazy, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { Search, Plus, Save, ChevronRight, MoreHorizontal, Trash2, FolderOpen, AlertCircle, Database, ChevronsLeft, ChevronsRight } from 'lucide-react'
import { Group as PanelGroup, Panel, Separator as PanelResizeHandle, type PanelImperativeHandle } from 'react-resizable-panels'
import { shallow } from 'zustand/shallow'
import { CurrentKnowledgeEditorPane } from './components/CurrentKnowledgeEditorPane'
import { DirectoryKnowledgeBrowser } from './components/DirectoryKnowledgeBrowser'
import { KnowledgeTreeNav } from './components/KnowledgeTreeNav'
import { SearchPanel } from './components/SearchPanel'
import { NewKnowledgeModal } from './components/NewKnowledgeModal'
import { ImportModal } from './components/ImportModal'
import { ToastNotifications } from './components/ToastNotifications'
import { ConfirmDialog } from './components/ConfirmDialog'
import { ReadOnlyBanner } from './components/ReadOnlyBanner'
import { Input } from './components/ui/Input'
import { KbSwitcher } from './components/KbSwitcher'
import { RightPanel } from './components/RightPanel'
import { SettingsModal } from './components/SettingsModal'
import { useAppStore } from './stores/appStore'
import { tauriService, DeletePreview, getErrorMessage } from './services/tauri'
import { useKnowledgeNavigation } from './hooks/useKnowledgeNavigation'
import { hasKnowledgeUnsavedChanges } from './lib/knowledgeChanges'
import { clearKnowledgeDraft } from './lib/knowledgeDrafts'
import {
  buildKnowledgeTreeRoot,
  findFolderNode,
  getFolderBreadcrumbs,
  getFolderDisplayName,
  getKnowledgeFolderPath,
  type TreeSelection,
} from './lib/knowledgeTree'

const KnowledgeGraphPanel = lazy(async () => {
  const module = await import('./components/KnowledgeGraphPanel')
  return { default: module.KnowledgeGraphPanel }
})

const isMacOS = typeof navigator !== 'undefined' && navigator.userAgent.includes('Mac')
const LIST_WIDTH_KEY = 'memoforge.knowledge-list.width'
const LIST_COLLAPSED_KEY = 'memoforge.knowledge-list.collapsed'
const LIST_DENSITY_KEY = 'memoforge.knowledge-list.density'
const LIST_MIN_WIDTH = 240
const LIST_MAX_WIDTH = 520

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

const wait = (ms: number) => new Promise<void>((resolve) => {
  window.setTimeout(resolve, ms)
})

const isRetriableRequestError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  return /Failed to fetch|Load failed|NetworkError|ERR_ABORTED/i.test(message)
}

async function retryAsync<T>(operation: () => Promise<T>, attempts = 2, delayMs = 160): Promise<T> {
  let lastError: unknown

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await operation()
    } catch (error) {
      lastError = error
      if (!isRetriableRequestError(error) || attempt === attempts - 1) {
        throw error
      }
      await wait(delayMs * (attempt + 1))
    }
  }

  throw lastError
}

const getStoredNumber = (key: string, fallback: number) => {
  if (typeof window === 'undefined') return fallback

  const stored = window.localStorage.getItem(key)
  const parsed = stored ? Number(stored) : Number.NaN
  return Number.isFinite(parsed) ? parsed : fallback
}

const getStoredBoolean = (key: string, fallback = false) => {
  if (typeof window === 'undefined') return fallback

  const stored = window.localStorage.getItem(key)
  if (stored === null) return fallback
  return stored === 'true'
}

const formatDate = (dateStr: string) => {
  const date = new Date(dateStr)
  const now = new Date()
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))

  if (diffDays === 0) return '今天'
  if (diffDays === 1) return '昨天'
  if (diffDays === 2) return '2天前'
  if (diffDays < 7) return `${diffDays}天前`
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}周前`
  return date.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
}

const countDocumentWords = (content: string) => {
  const cjkCharacterCount = (content.match(/[\u3400-\u9FFF]/g) ?? []).length
  const latinWordCount = (
    content
      .replace(/[\u3400-\u9FFF]/g, ' ')
      .match(/[A-Za-z0-9_]+(?:[.-][A-Za-z0-9_]+)*/g) ?? []
  ).length

  return cjkCharacterCount + latinWordCount
}

const getEditorModeLabel = (mode: 'read' | 'markdown' | 'rich') => {
  switch (mode) {
    case 'markdown':
      return 'Markdown'
    case 'rich':
      return '高级编辑'
    default:
      return '阅读'
  }
}

const getEditorModeBadgeStyle = (mode: 'read' | 'markdown' | 'rich') => {
  switch (mode) {
    case 'markdown':
      return {
        backgroundColor: '#EEF2FF',
        border: '1px solid #C7D2FE',
        color: '#4338CA',
      }
    case 'rich':
      return {
        backgroundColor: '#ECFDF5',
        border: '1px solid #A7F3D0',
        color: '#047857',
      }
    default:
      return {
        backgroundColor: '#FFFFFF',
        border: '1px solid #E5E7EB',
        color: '#64748B',
      }
  }
}

interface ResizableHandleProps {
  collapsed: boolean
  onToggle: () => void
  expandTitle: string
  collapseTitle: string
  collapsedDirection: 'left' | 'right'
  expandedDirection: 'left' | 'right'
  topOffset?: number
}

const ResizableHandle = ({
  collapsed,
  onToggle,
  expandTitle,
  collapseTitle,
  collapsedDirection,
  expandedDirection,
  topOffset = 14,
}: ResizableHandleProps) => {
  const iconDirection = collapsed ? collapsedDirection : expandedDirection
  const Icon = iconDirection === 'left' ? ChevronsLeft : ChevronsRight

  return (
    <PanelResizeHandle
      className={`panel-resize-handle ${collapsed ? 'panel-resize-handle--collapsed' : ''}`}
      onDoubleClick={(event) => {
        event.preventDefault()
        onToggle()
      }}
    >
      <div className="panel-resize-handle__line" />
      <button
        type="button"
        className="panel-resize-handle__toggle"
        title={collapsed ? expandTitle : collapseTitle}
        style={{ top: topOffset }}
        onPointerDown={(event) => event.stopPropagation()}
        onMouseDown={(event) => event.stopPropagation()}
        onDoubleClick={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation()
          onToggle()
        }}
      >
        <Icon className="h-3.5 w-3.5" />
      </button>
    </PanelResizeHandle>
  )
}

function App() {
  const { openKnowledgeWithStale, confirmDiscardIfNeeded } = useKnowledgeNavigation()
  const [showSearch, setShowSearch] = useState(false)
  const [showNewModal, setShowNewModal] = useState(false)
  const [newKnowledgeSeed, setNewKnowledgeSeed] = useState<{
    initialCategory?: string
    categoryHint?: string
  } | null>(null)
  const [showImportModal, setShowImportModal] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deletePreview, setDeletePreview] = useState<DeletePreview | null>(null)
  const [initError, setInitError] = useState<string | null>(null)
  const [showMoreMenu, setShowMoreMenu] = useState(false)
  const [showKnowledgeGraph, setShowKnowledgeGraph] = useState(false)
  const [showKbSwitcher, setShowKbSwitcher] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [initialized, setInitialized] = useState(false)
  const [readonly, setReadonly] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [kbPath, setKbPath] = useState('')
  const [currentKbName, setCurrentKbName] = useState('')
  const [sortMode, setSortMode] = useState<'recent' | 'title'>('recent')
  const [pendingChangesCount, setPendingChangesCount] = useState(0)
  const [isGitRepo, setIsGitRepo] = useState(true)
  const [mcpConnectionCount, setMcpConnectionCount] = useState(0)
  const [knowledgeListWidth, setKnowledgeListWidth] = useState(() => getStoredNumber(LIST_WIDTH_KEY, 300))
  const [knowledgeListCollapsed, setKnowledgeListCollapsed] = useState(() => getStoredBoolean(LIST_COLLAPSED_KEY))
  const [knowledgeQuery, setKnowledgeQuery] = useState('')
  const [saveFeedback, setSaveFeedback] = useState<'idle' | 'saved' | 'error'>('idle')
  const [listDensity, setListDensity] = useState<'compact' | 'comfortable'>(() => {
    if (typeof window === 'undefined') return 'compact'
    const stored = window.localStorage.getItem(LIST_DENSITY_KEY)
    return stored === 'comfortable' ? 'comfortable' : 'compact'
  })
  const [treeSelection, setTreeSelection] = useState<TreeSelection>({ type: 'folder', path: '' })
  const knowledgeListPanelRef = useRef<PanelImperativeHandle | null>(null)
  const resizeSyncTimerRef = useRef<number | null>(null)

  const {
    setCurrentKnowledge,
    knowledgeList,
    setKnowledgeList,
    appendKnowledgeList,
    setHasMore,
    setOffset,
    offset,
    categories,
    setCategories,
    editorMode,
    setEditorMode,
    setAllTags,
    currentKnowledgeId,
    currentKnowledgeTitle,
    currentKnowledgeCategory,
    currentKnowledgeContent,
    editorSelection,
    hasCurrentKnowledge,
    hasUnsavedChanges,
  } = useAppStore((state) => ({
    setCurrentKnowledge: state.setCurrentKnowledge,
    knowledgeList: state.knowledgeList,
    setKnowledgeList: state.setKnowledgeList,
    appendKnowledgeList: state.appendKnowledgeList,
    setHasMore: state.setHasMore,
    setOffset: state.setOffset,
    offset: state.offset,
    categories: state.categories,
    setCategories: state.setCategories,
    editorMode: state.editorMode,
    setEditorMode: state.setEditorMode,
    setAllTags: state.setAllTags,
    currentKnowledgeId: state.currentKnowledge?.id ?? null,
    currentKnowledgeTitle: state.currentKnowledge?.title ?? '',
    currentKnowledgeCategory: state.currentKnowledge?.category ?? null,
    currentKnowledgeContent: state.currentKnowledgeContent,
    editorSelection: state.editorSelection,
    hasCurrentKnowledge: state.currentKnowledge !== null,
    hasUnsavedChanges: hasKnowledgeUnsavedChanges(
      state.currentKnowledge,
      state.currentKnowledgeBaseline,
      state.currentKnowledgeContent,
    ),
  }), shallow)

  const deferredKnowledgeQuery = useDeferredValue(knowledgeQuery)
  const categoryLabelMap = useMemo(() => {
    const map = new Map<string, string>()
    categories.forEach((category) => {
      map.set(category.id, category.name)
      map.set(category.name, category.name)
    })
    return map
  }, [categories])

  useEffect(() => {
    if (!currentKnowledgeId) return

    setTreeSelection((previous) => {
      if (previous.type === 'knowledge' && previous.path === currentKnowledgeId) {
        return previous
      }
      return { type: 'knowledge', path: currentKnowledgeId }
    })
  }, [currentKnowledgeId])
  const getCategoryLabel = useCallback((categoryId?: string | null) => {
    if (!categoryId) return ''
    return categoryLabelMap.get(categoryId) || categoryId
  }, [categoryLabelMap])

  useEffect(() => {
    if (!currentKnowledgeId) return
    setTreeSelection({ type: 'knowledge', path: currentKnowledgeId })
  }, [currentKnowledgeId])

  useEffect(() => {
    if (saveFeedback === 'idle') return

    const timer = window.setTimeout(() => {
      setSaveFeedback('idle')
    }, 2400)

    return () => window.clearTimeout(timer)
  }, [saveFeedback])

  useEffect(() => {
    if (!hasUnsavedChanges) return

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [hasUnsavedChanges])

  useEffect(() => {
    window.localStorage.setItem(LIST_WIDTH_KEY, String(knowledgeListWidth))
  }, [knowledgeListWidth])

  useEffect(() => {
    window.localStorage.setItem(LIST_COLLAPSED_KEY, String(knowledgeListCollapsed))
  }, [knowledgeListCollapsed])

  useEffect(() => {
    window.localStorage.setItem(LIST_DENSITY_KEY, listDensity)
  }, [listDensity])

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.closest('[data-floating-menu="true"]')) {
        return
      }
      setShowMoreMenu(false)
    }

    window.addEventListener('pointerdown', handlePointerDown)
    return () => window.removeEventListener('pointerdown', handlePointerDown)
  }, [])

  const toggleKnowledgeList = useCallback(() => {
    const panel = knowledgeListPanelRef.current
    if (!panel) return

    if (panel.isCollapsed()) {
      panel.expand()
      setKnowledgeListCollapsed(false)
      return
    }

    panel.collapse()
    setKnowledgeListCollapsed(true)
  }, [])

  const syncResizablePanelState = useCallback(() => {
    if (resizeSyncTimerRef.current) {
      window.clearTimeout(resizeSyncTimerRef.current)
    }

    resizeSyncTimerRef.current = window.setTimeout(() => {
      const knowledgeListPanel = knowledgeListPanelRef.current
      if (knowledgeListPanel) {
        const collapsed = knowledgeListPanel.isCollapsed()
        setKnowledgeListCollapsed((prev) => (prev === collapsed ? prev : collapsed))

        if (!collapsed) {
          const nextWidth = clamp(knowledgeListPanel.getSize().inPixels, LIST_MIN_WIDTH, LIST_MAX_WIDTH)
          setKnowledgeListWidth((prev) => (Math.abs(prev - nextWidth) < 1 ? prev : nextWidth))
        }
      }

      resizeSyncTimerRef.current = null
    }, 96)
  }, [])

  useEffect(() => () => {
    if (resizeSyncTimerRef.current) {
      window.clearTimeout(resizeSyncTimerRef.current)
    }
  }, [])

  useEffect(() => {
    void checkInit()
  }, [])

  // 定期刷新 MCP 连接数量（每 5 秒）
  useEffect(() => {
    if (!initialized) return

    const interval = setInterval(async () => {
      try {
        const count = await tauriService.getMcpConnectionCount()
        setMcpConnectionCount(count)
      } catch (error) {
        console.error('Failed to refresh MCP connection count:', error)
      }
    }, 5000)

    return () => clearInterval(interval)
  }, [initialized])

  // 窗口获得焦点时刷新 MCP 连接数量
  useEffect(() => {
    if (!initialized) return

    const handleFocus = async () => {
      try {
        await loadData()

        const latestKnowledge = useAppStore.getState().currentKnowledge
        const latestEditorMode = useAppStore.getState().editorMode
        if (latestKnowledge?.id && (readonly || latestEditorMode === 'read')) {
          const refreshed = await tauriService.getKnowledgeWithStale(latestKnowledge.id)
          setCurrentKnowledge(refreshed)
        }

        const count = await tauriService.getMcpConnectionCount()
        setMcpConnectionCount(count)
      } catch (error) {
        console.error('Failed to refresh data on focus:', error)
      }
    }

    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [initialized, readonly])

  useEffect(() => {
    if (!initialized) return
    void loadData()
  }, [initialized])

  useEffect(() => {
    if (!initialized) return

    const syncCurrentKnowledge = async () => {
      try {
        if (currentKnowledgeId && currentKnowledgeTitle) {
          await tauriService.selectKnowledge(
            currentKnowledgeId,
            currentKnowledgeTitle,
            currentKnowledgeCategory ?? undefined
          )
        } else {
          await tauriService.clearKnowledge()
        }
      } catch (error) {
        console.error('Failed to sync current knowledge state:', error)
      }
    }

    void syncCurrentKnowledge()
  }, [
    initialized,
    currentKnowledgeCategory,
    currentKnowledgeId,
    currentKnowledgeTitle,
  ])

  const checkInit = async () => {
    try {
      const status = await tauriService.getStatus()
      setReadonly(!!status.readonly)
      if (status.initialized) {
        setInitialized(true)
        await loadData()
        await loadCurrentKbName()
      } else {
        // 尝试自动打开上次的知识库
        try {
          const lastKb = await tauriService.getLastKb()
          if (lastKb) {
            console.log('Auto-opening last knowledge base:', lastKb)
            await tauriService.initKb(lastKb, 'open')
            setInitialized(true)
            setReadonly(false)
            await loadData()
            await loadCurrentKbName()
          }
        } catch (error) {
          console.log('Failed to auto-open last KB, showing init screen')
          setInitError(`最近使用的知识库自动打开失败：${getErrorMessage(error)}`)
        }
      }
    } catch (error) {
      console.error('Failed to check status:', error)
    }
  }

  const loadCurrentKbName = async () => {
    try {
      const kbs = await tauriService.getRecentKbs(10)
      const current = await tauriService.getCurrentKb()
      if (current) {
        const kb = kbs.find(k => k.path === current)
        setCurrentKbName(kb?.name || current.split('/').pop() || '知识库')
      }
    } catch (error) {
      console.error('Failed to load KB name:', error)
    }
  }

  const handleInit = async () => {
    if (!kbPath.trim()) return

    try {
      await tauriService.initKb(kbPath, 'open')
      setInitError(null)
      setInitialized(true)
      setReadonly(false)
      await loadData()
      await loadCurrentKbName()
    } catch (error) {
      console.error('Init failed:', error)
      setInitError(getErrorMessage(error))
    }
  }

  const handleSelectFolder = async () => {
    try {
      const selectedPath = await tauriService.selectFolder()
      if (selectedPath) {
        setKbPath(selectedPath)
        setInitError(null)
      }
    } catch (error) {
      console.error('Failed to select folder:', error)
      setInitError(getErrorMessage(error))
    }
  }

  const handleKbSwitch = async (_path: string) => {
    setInitialized(true)
    await loadData()
    await loadCurrentKbName()
  }

  const loadData = async (reset = true) => {
    try {
      const nextOffset = reset ? 0 : offset

      // 检查是否是 Git 仓库
      const gitRepo = await tauriService.isGitRepo()
      setIsGitRepo(gitRepo)

      // 获取 MCP 连接数量
      const connectionCount = await tauriService.getMcpConnectionCount()
      setMcpConnectionCount(connectionCount)

      const [knowledgeResult, loadedCategories, tags, gitStatus] = await Promise.all([
        tauriService.listKnowledge(1, 5000, nextOffset),
        tauriService.getCategories(),
        tauriService.getTagsWithCounts(),
        (readonly || !gitRepo) ? Promise.resolve<string[]>([]) : tauriService.gitStatus().catch(() => []),
      ])

      if (reset) {
        setKnowledgeList(knowledgeResult.items)
        setOffset(0)
      } else {
        appendKnowledgeList(knowledgeResult.items)
      }

      setHasMore(knowledgeResult.has_more)
      setCategories(loadedCategories)
      setAllTags(tags)
      setPendingChangesCount(gitStatus.length)
      await tauriService.refreshKbState()
    } catch (error) {
      console.error('Failed to load data:', error)
    }
  }

  const sortedKnowledge = useMemo(() => [...knowledgeList].sort((left, right) => {
    if (sortMode === 'title') {
      return left.title.localeCompare(right.title, 'zh-CN')
    }
    return new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime()
  }), [knowledgeList, sortMode])
  const treeFilteredKnowledge = useMemo(() => {
    const normalizedQuery = deferredKnowledgeQuery.trim().toLowerCase()
    if (!normalizedQuery) return sortedKnowledge

    return sortedKnowledge.filter((knowledge) => {
      const haystacks = [
        knowledge.title,
        knowledge.summary ?? '',
        knowledge.id,
        getCategoryLabel(knowledge.category),
        knowledge.tags.join(' '),
      ]

      return haystacks.some((value) => value.toLowerCase().includes(normalizedQuery))
    })
  }, [deferredKnowledgeQuery, getCategoryLabel, sortedKnowledge])
  const selectedFolderKnowledge = useMemo(() => {
    if (treeSelection.type !== 'folder') return []
    return treeFilteredKnowledge.filter((knowledge) => getKnowledgeFolderPath(knowledge.id) === treeSelection.path)
  }, [treeFilteredKnowledge, treeSelection])
  const treeRootNode = useMemo(() => buildKnowledgeTreeRoot(sortedKnowledge), [sortedKnowledge])
  const selectedFolderNode = useMemo(
    () => (treeSelection.type === 'folder' ? findFolderNode(treeRootNode, treeSelection.path) : null),
    [treeRootNode, treeSelection],
  )
  const selectedFolderTitle = useMemo(
    () => getFolderDisplayName(treeSelection.type === 'folder' ? treeSelection.path : getKnowledgeFolderPath(treeSelection.path)),
    [treeSelection],
  )
  const selectedFolderBreadcrumbs = useMemo(
    () => getFolderBreadcrumbs(treeSelection.type === 'folder' ? treeSelection.path : getKnowledgeFolderPath(treeSelection.path)),
    [treeSelection],
  )
  const selectedChildFolders = useMemo(
    () => selectedFolderNode?.children.filter((node) => node.type === 'folder') ?? [],
    [selectedFolderNode],
  )
  const selectedFolderDescendantKnowledge = useMemo(() => {
    if (treeSelection.type !== 'folder') return []
    const folderPath = treeSelection.path
    if (!folderPath) return treeFilteredKnowledge

    return treeFilteredKnowledge.filter((knowledge) => {
      const knowledgeFolderPath = getKnowledgeFolderPath(knowledge.id)
      return knowledgeFolderPath === folderPath || knowledgeFolderPath.startsWith(`${folderPath}/`)
    })
  }, [treeFilteredKnowledge, treeSelection])
  const selectedFolderLatestUpdatedAt = useMemo(() => {
    if (selectedFolderDescendantKnowledge.length === 0) return null
    return selectedFolderDescendantKnowledge.reduce((latest, knowledge) => (
      new Date(knowledge.updated_at).getTime() > new Date(latest).getTime() ? knowledge.updated_at : latest
    ), selectedFolderDescendantKnowledge[0].updated_at)
  }, [selectedFolderDescendantKnowledge])
  const categoryPathSet = useMemo(() => new Set(categories.map((category) => category.id)), [categories])
  const canCreateInSelectedFolder = useMemo(() => {
    if (treeSelection.type !== 'folder') return false
    return treeSelection.path === '' || categoryPathSet.has(treeSelection.path)
  }, [categoryPathSet, treeSelection])
  const selectedFolderCreateHint = useMemo(() => {
    if (treeSelection.type !== 'folder') return ''
    if (treeSelection.path === '') {
      return '根目录下新建文档，不会自动附带分类。'
    }
    if (categoryPathSet.has(treeSelection.path)) {
      return `将按当前分类路径 ${treeSelection.path} 创建新文档。`
    }
    return '当前目录未注册为分类，暂不能直接在此新建；如需固定落在该目录，请先将其注册为分类。'
  }, [categoryPathSet, treeSelection])
  const currentKnowledgeFolderPath = useMemo(
    () => (currentKnowledgeId ? getKnowledgeFolderPath(currentKnowledgeId) : ''),
    [currentKnowledgeId],
  )
  const currentKnowledgeFolderLabel = useMemo(
    () => getFolderDisplayName(currentKnowledgeFolderPath),
    [currentKnowledgeFolderPath],
  )
  const currentDocumentLineCount = useMemo(
    () => (currentKnowledgeContent ? currentKnowledgeContent.split('\n').length : 0),
    [currentKnowledgeContent],
  )
  const currentDocumentWordCount = useMemo(
    () => countDocumentWords(currentKnowledgeContent),
    [currentKnowledgeContent],
  )
  const currentDocumentCharCount = useMemo(
    () => currentKnowledgeContent.length,
    [currentKnowledgeContent],
  )
  const currentEditorModeLabel = useMemo(
    () => getEditorModeLabel(editorMode),
    [editorMode],
  )
  const currentEditorModeBadgeStyle = useMemo(
    () => getEditorModeBadgeStyle(editorMode),
    [editorMode],
  )
  const statusSelectionLabel = useMemo(() => {
    if (!editorSelection) return null
    const lineSpan = editorSelection.endLine - editorSelection.startLine + 1
    return `选区 ${lineSpan} 行 · ${editorSelection.textLength} 字符`
  }, [editorSelection])

  const handleSelectKnowledge = useCallback(async (knowledgeId: string) => {
    try {
      await openKnowledgeWithStale(knowledgeId)
    } catch (error) {
      console.error('Failed to load knowledge:', error)
    }
  }, [openKnowledgeWithStale])

  const handleSelectTreeFolder = useCallback((folderPath: string) => {
    if (!confirmDiscardIfNeeded()) return
    setCurrentKnowledge(null)
    setTreeSelection({ type: 'folder', path: folderPath })
    setShowMoreMenu(false)
    setEditorMode('read')
  }, [confirmDiscardIfNeeded, setCurrentKnowledge, setEditorMode])

  const handleSelectTreeKnowledge = useCallback(async (knowledgeId: string) => {
    setTreeSelection({ type: 'knowledge', path: knowledgeId })
    setShowMoreMenu(false)
    await handleSelectKnowledge(knowledgeId)
  }, [handleSelectKnowledge])

  const openNewKnowledgeModal = useCallback((seed?: { initialCategory?: string; categoryHint?: string }) => {
    setNewKnowledgeSeed(seed ?? null)
    setShowNewModal(true)
  }, [])

  const handleCreateKnowledgeInSelectedFolder = useCallback(() => {
    if (treeSelection.type !== 'folder') {
      openNewKnowledgeModal()
      return
    }

    if (treeSelection.path === '') {
      openNewKnowledgeModal({ categoryHint: selectedFolderCreateHint })
      return
    }

    if (!categoryPathSet.has(treeSelection.path)) {
      openNewKnowledgeModal({ categoryHint: selectedFolderCreateHint })
      return
    }

    openNewKnowledgeModal({
      initialCategory: treeSelection.path,
      categoryHint: selectedFolderCreateHint,
    })
  }, [categoryPathSet, openNewKnowledgeModal, selectedFolderCreateHint, treeSelection])

  const handleExternalKnowledgeChange = useCallback(async (events: import('./services/tauri').Event[]) => {
    await loadData()

    const latestKnowledge = useAppStore.getState().currentKnowledge
    const latestEditorMode = useAppStore.getState().editorMode
    if (!latestKnowledge?.id || (!readonly && latestEditorMode !== 'read')) {
      return
    }

    const touchesCurrentKnowledge = events.some((event) => (
      event.path === latestKnowledge.id ||
      event.path === null ||
      (event.action === 'move' && event.path === latestKnowledge.id)
    ))

    if (!touchesCurrentKnowledge) {
      return
    }

    try {
      const refreshed = await tauriService.getKnowledgeWithStale(latestKnowledge.id)
      setCurrentKnowledge(refreshed)
    } catch (error) {
      console.error('Failed to refresh current knowledge after external update:', error)
    }
  }, [readonly, setCurrentKnowledge])

  const handleTitlebarMouseDown = (event: MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) return

    const target = event.target as HTMLElement | null
    if (target?.closest('.titlebar-no-drag')) {
      return
    }

    void tauriService.startWindowDrag().catch((error) => {
      console.error('Failed to start window drag:', error)
    })
  }

  const handleTitlebarDoubleClick = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement | null
    if (target?.closest('.titlebar-no-drag')) {
      return
    }

    void tauriService.toggleWindowMaximize().catch((error) => {
      console.error('Failed to toggle window maximize:', error)
    })
  }

  const handleSave = async () => {
    const { currentKnowledge: latestKnowledge, currentKnowledgeContent: latestContent } = useAppStore.getState()
    if (!latestKnowledge || isSaving) return

    setIsSaving(true)
    setSaveFeedback('idle')
    try {
      const knowledgePayload = { ...latestKnowledge, content: latestContent }
      const refreshAfterSave = async (expectedTitle: string, expectedCategory: string | null) => {
        try {
          await retryAsync(() => loadData(), 2)
          const refreshed = await retryAsync(() => tauriService.listKnowledge(1, 200, 0), 2)
          const updatedItem = refreshed.items.find((knowledge) => {
            if (knowledge.title !== expectedTitle) return false
            if (!expectedCategory) return true
            return knowledge.category === expectedCategory || knowledge.id.startsWith(`${expectedCategory}/`)
          })
          if (!updatedItem) {
            return
          }

          const fullKnowledge = await retryAsync(() => tauriService.getKnowledgeWithStale(updatedItem.id), 2)
          setCurrentKnowledge(fullKnowledge)
        } catch (error) {
          console.error('Post-save refresh failed:', error)
        }
      }

      if (latestKnowledge.id) {
        const expectedTitle = latestKnowledge.title
        const expectedCategory = latestKnowledge.category ?? null
        let saveConfirmed = false

        try {
          await retryAsync(() => tauriService.updateKnowledge(latestKnowledge.id, knowledgePayload), 2)
          saveConfirmed = true
        } catch (error) {
          if (!isRetriableRequestError(error)) {
            throw error
          }

          try {
            await wait(180)
            const reconciledKnowledge = await retryAsync(() => tauriService.getKnowledge(latestKnowledge.id, 2), 2)
            if (
              reconciledKnowledge.title === expectedTitle &&
              (reconciledKnowledge.category ?? null) === (expectedCategory ?? null) &&
              reconciledKnowledge.content === latestContent
            ) {
              setCurrentKnowledge(reconciledKnowledge)
              saveConfirmed = true
            }
          } catch (reconcileError) {
            console.error('Failed to reconcile save after aborted request:', reconcileError)
          }

          if (!saveConfirmed) {
            throw error
          }
        }

        clearKnowledgeDraft(latestKnowledge.id)
        setCurrentKnowledge({
          ...knowledgePayload,
          updated_at: new Date().toISOString(),
        })
        void refreshAfterSave(expectedTitle, expectedCategory)
      } else {
        const createdId = await retryAsync(() => tauriService.createKnowledge(knowledgePayload), 2)
        clearKnowledgeDraft(createdId)
        const createdKnowledge = await retryAsync(() => tauriService.getKnowledge(createdId, 2), 2)
        setCurrentKnowledge(createdKnowledge)
        void refreshAfterSave(createdKnowledge.title, createdKnowledge.category ?? null)
      }
      setSaveFeedback('saved')
    } catch (error) {
      console.error('Save failed:', error)
      setSaveFeedback('error')
      alert('保存失败: ' + error)
    } finally {
      setIsSaving(false)
    }
  }

  useEffect(() => {
    if (readonly) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault()
        void handleSave()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleSave, readonly])

  const handleDelete = async () => {
    const latestKnowledge = useAppStore.getState().currentKnowledge
    if (!latestKnowledge?.id) return

    try {
      const preview = await tauriService.previewDeleteKnowledge(latestKnowledge.id)
      setDeletePreview(preview)
      setShowDeleteConfirm(true)
      setShowMoreMenu(false)
    } catch (error) {
      console.error('Failed to preview delete:', error)
      alert('预览删除失败: ' + error)
    }
  }

  const confirmDelete = async () => {
    const latestKnowledge = useAppStore.getState().currentKnowledge
    if (!latestKnowledge?.id) return

    try {
      const deletedFolderPath = getKnowledgeFolderPath(latestKnowledge.id)
      await tauriService.deleteKnowledge(latestKnowledge.id)
      setCurrentKnowledge(null)
      setTreeSelection({ type: 'folder', path: deletedFolderPath })
      setShowDeleteConfirm(false)
      setDeletePreview(null)
      await loadData()
    } catch (error) {
      console.error('Failed to delete:', error)
      alert('删除失败: ' + error)
    }
  }

  if (!initialized) {
    return (
      <div className="app-container flex items-center justify-center">
        <div className="w-96 p-6 border rounded-lg bg-white" style={{ borderColor: '#E5E5E5' }}>
          <h2 className="text-xl font-bold mb-4">初始化知识库</h2>
          <div className="flex gap-2 mb-4">
            <Input
              value={kbPath}
              onChange={(event) => setKbPath(event.target.value)}
              placeholder="输入知识库路径，如: ~/memoforge-demo"
              className="flex-1"
            />
            <button
              onClick={handleSelectFolder}
              className="px-3 py-2 border rounded-md hover:bg-gray-50"
              style={{ borderColor: '#E5E5E5' }}
              title="选择目录"
            >
              <FolderOpen className="h-4 w-4" style={{ color: '#737373' }} />
            </button>
          </div>
          <button
            onClick={handleInit}
            disabled={!kbPath.trim()}
            className="w-full bg-blue-500 text-white px-4 py-2 rounded disabled:opacity-50"
          >
            打开或初始化知识库
          </button>
          <p className="mt-2 text-xs" style={{ color: '#737373' }}>
            选择空目录时会自动初始化为新的 MemoForge 知识库。
          </p>
          {initError && (
            <div
              className="mt-3 rounded-md border px-3 py-2 text-sm"
              style={{ borderColor: '#FECACA', backgroundColor: '#FEF2F2', color: '#991B1B' }}
            >
              {initError}
            </div>
          )}
          <div className="mt-4 text-center">
            <button
              onClick={() => setShowKbSwitcher(true)}
              className="text-sm text-indigo-600 hover:underline"
            >
              或选择历史知识库
            </button>
          </div>
          {showKbSwitcher && (
            <KbSwitcher
              onClose={() => setShowKbSwitcher(false)}
              onSwitch={handleKbSwitch}
            />
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="app-container flex flex-col" data-platform={isMacOS ? 'macos' : 'other'}>
      {readonly && <ReadOnlyBanner />}

      <div
        className={`${isMacOS ? 'titlebar-drag' : ''} h-[38px] flex items-center justify-between px-3 border-b`}
        style={{ backgroundColor: '#FAFAFA', borderColor: '#E5E5E5' }}
        data-macos-native-titlebar={isMacOS ? 'true' : 'false'}
        data-tauri-drag-region={isMacOS ? true : undefined}
        onMouseDown={isMacOS ? handleTitlebarMouseDown : undefined}
        onDoubleClick={handleTitlebarDoubleClick}
      >
        <div
          className="flex items-center gap-2"
          data-tauri-drag-region={isMacOS ? true : undefined}
          style={{ minWidth: isMacOS ? 72 : 0 }}
        />
        {isMacOS ? (
          <span className="text-[13px] font-medium select-none" style={{ color: '#737373' }} data-tauri-drag-region>
            MemoForge
          </span>
        ) : (
          <div className="flex-1" />
        )}
        <div className="titlebar-no-drag flex items-center gap-1">
          <button
            onClick={() => setShowKbSwitcher(true)}
            className="titlebar-no-drag flex items-center gap-1 rounded px-2 py-1 hover:bg-gray-200"
            title="切换知识库"
          >
            <Database className="h-4 w-4" style={{ color: '#737373' }} />
            <span className="max-w-[140px] truncate text-xs font-medium" style={{ color: '#525252' }}>
              {currentKbName}
            </span>
          </button>
          <button onClick={() => setShowSearch(true)} className="titlebar-no-drag p-1 hover:bg-gray-200 rounded" title="搜索">
            <Search className="h-4 w-4" style={{ color: '#737373' }} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        <PanelGroup
          orientation="horizontal"
          className="h-full"
          resizeTargetMinimumSize={{ fine: 24, coarse: 36 }}
          onLayoutChanged={syncResizablePanelState}
        >
          <Panel
            id="knowledge-list"
            panelRef={knowledgeListPanelRef}
            collapsible
            collapsedSize={0}
            minSize={LIST_MIN_WIDTH}
            maxSize={LIST_MAX_WIDTH}
            defaultSize={knowledgeListCollapsed ? 0 : clamp(knowledgeListWidth, LIST_MIN_WIDTH, LIST_MAX_WIDTH)}
            groupResizeBehavior="preserve-pixel-size"
            className="h-full bg-white"
          >
            <KnowledgeTreeNav
              rootNode={treeRootNode}
              query={knowledgeQuery}
              selected={treeSelection}
              readonly={readonly}
              mcpConnectionCount={mcpConnectionCount}
              onQueryChange={setKnowledgeQuery}
              onSelectFolder={handleSelectTreeFolder}
              onSelectKnowledge={(knowledgeId) => {
                void handleSelectTreeKnowledge(knowledgeId)
              }}
              onOpenSettings={() => setShowSettings(true)}
              onOpenKnowledgeGraph={() => setShowKnowledgeGraph(true)}
              onOpenImport={!readonly ? () => setShowImportModal(true) : undefined}
            />
          </Panel>

          <ResizableHandle
            collapsed={knowledgeListCollapsed}
            onToggle={toggleKnowledgeList}
            expandTitle="展开知识列表"
            collapseTitle="折叠知识列表"
            collapsedDirection="right"
            expandedDirection="left"
            topOffset={58}
          />

          <Panel id="editor-main" minSize="25%" className="h-full min-w-0 bg-white">
            <div className="flex h-full min-w-0 flex-col bg-white">
              <div className="h-12 flex-shrink-0 flex items-center gap-2 px-4 border-b overflow-visible relative z-20" style={{ borderColor: '#E5E5E5' }}>
                <div className="flex items-center gap-1.5 flex-1 min-w-0">
                  {treeSelection.type === 'folder' ? (
                    <>
                      {treeSelection.path && (
                        <>
                          <span className="text-[13px]" style={{ color: '#A3A3A3' }}>目录</span>
                          <ChevronRight className="h-3.5 w-3.5 flex-shrink-0" style={{ color: '#D4D4D4' }} />
                        </>
                      )}
                      <span className="text-[13px] font-medium truncate" style={{ color: '#0A0A0A' }}>
                        {selectedFolderTitle}
                      </span>
                      <span
                        className="hidden rounded-full px-2 py-1 text-[10px] font-medium md:inline-flex"
                        style={{ backgroundColor: '#F8FAFC', color: '#64748B' }}
                      >
                        {selectedFolderDescendantKnowledge.length} 篇
                      </span>
                      {knowledgeQuery.trim() && (
                        <span
                          className="hidden max-w-[180px] truncate rounded-full px-2 py-1 text-[10px] font-medium md:inline-flex"
                          style={{ backgroundColor: '#EEF2FF', color: '#4338CA' }}
                          title={`当前搜索：${knowledgeQuery}`}
                        >
                          搜索：{knowledgeQuery}
                        </span>
                      )}
                    </>
                  ) : hasCurrentKnowledge && (
                    <>
                      {currentKnowledgeFolderPath && (
                        <>
                          <span className="text-[13px]" style={{ color: '#A3A3A3' }}>{currentKnowledgeFolderLabel}</span>
                          <ChevronRight className="h-3.5 w-3.5 flex-shrink-0" style={{ color: '#D4D4D4' }} />
                        </>
                      )}
                      <span className="text-[13px] font-medium truncate" style={{ color: '#0A0A0A' }}>{currentKnowledgeTitle}</span>
                    </>
                  )}
                </div>

                {treeSelection.type === 'folder' && (
                  <div className="flex items-center gap-1.5 rounded-xl border px-2 py-1.5" style={{ borderColor: '#E5E5E5', backgroundColor: '#FAFAFA' }}>
                    <div className="flex items-center gap-1 rounded-lg p-0.5" style={{ backgroundColor: '#FFFFFF' }}>
                      <button
                        type="button"
                        onClick={() => setSortMode('recent')}
                        className="rounded-md px-2 py-1 text-[11px] font-medium"
                        style={{
                          backgroundColor: sortMode === 'recent' ? '#EEF2FF' : 'transparent',
                          color: sortMode === 'recent' ? '#4338CA' : '#737373',
                        }}
                      >
                        最近
                      </button>
                      <button
                        type="button"
                        onClick={() => setSortMode('title')}
                        className="rounded-md px-2 py-1 text-[11px] font-medium"
                        style={{
                          backgroundColor: sortMode === 'title' ? '#EEF2FF' : 'transparent',
                          color: sortMode === 'title' ? '#4338CA' : '#737373',
                        }}
                      >
                        标题
                      </button>
                    </div>

                    <div className="flex items-center gap-1 rounded-lg p-0.5" style={{ backgroundColor: '#FFFFFF' }}>
                      <button
                        type="button"
                        onClick={() => setListDensity('compact')}
                        className="rounded-md px-2 py-1 text-[11px] font-medium"
                        style={{
                          backgroundColor: listDensity === 'compact' ? '#EEF2FF' : 'transparent',
                          color: listDensity === 'compact' ? '#4338CA' : '#737373',
                        }}
                      >
                        紧凑
                      </button>
                      <button
                        type="button"
                        onClick={() => setListDensity('comfortable')}
                        className="rounded-md px-2 py-1 text-[11px] font-medium"
                        style={{
                          backgroundColor: listDensity === 'comfortable' ? '#EEF2FF' : 'transparent',
                          color: listDensity === 'comfortable' ? '#4338CA' : '#737373',
                        }}
                      >
                        预览
                      </button>
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {!readonly && (
                    <button
                      type="button"
                      onClick={() => {
                        if (treeSelection.type === 'folder') {
                          handleCreateKnowledgeInSelectedFolder()
                          return
                        }
                        openNewKnowledgeModal()
                      }}
                      className="inline-flex h-8 items-center gap-1 rounded-md px-2.5 py-1.5 text-[11px] font-medium text-white"
                      style={{ backgroundColor: '#6366F1' }}
                      title="新建知识"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      新建
                    </button>
                  )}
                </div>

                {!readonly && treeSelection.type === 'knowledge' && (
                  <div className="browser-mode-switch w-auto max-w-[320px] flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => setEditorMode('read')}
                      className={`browser-mode-switch__button ${editorMode === 'read' ? 'browser-mode-switch__button--active' : ''}`}
                    >
                      阅读
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditorMode('markdown')}
                      className={`browser-mode-switch__button ${editorMode === 'markdown' ? 'browser-mode-switch__button--active' : ''}`}
                    >
                      Markdown
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditorMode('rich')}
                      className={`browser-mode-switch__button ${editorMode === 'rich' ? 'browser-mode-switch__button--active' : ''}`}
                    >
                      高级编辑
                    </button>
                  </div>
                )}

                {!readonly && treeSelection.type === 'knowledge' && hasCurrentKnowledge && (
                  <div className="relative flex-shrink-0" data-floating-menu="true">
                    <button
                      onClick={() => setShowMoreMenu((open) => !open)}
                      className="h-8 w-8 rounded-md inline-flex items-center justify-center"
                      style={{ border: '1px solid #E5E5E5' }}
                    >
                      <MoreHorizontal className="h-4 w-4" style={{ color: '#737373' }} />
                    </button>
                    {showMoreMenu && (
                      <div
                        className="absolute right-0 top-full mt-2 min-w-[156px] rounded-2xl border p-1.5 shadow-xl z-50"
                        style={{
                          borderColor: '#E5E5E5',
                          backgroundColor: 'rgba(255, 255, 255, 0.98)',
                          boxShadow: '0 20px 44px rgba(15, 23, 42, 0.14)',
                          backdropFilter: 'blur(10px)',
                        }}
                      >
                        <button
                          onClick={handleDelete}
                          className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm hover:bg-red-50"
                          style={{ color: '#EF4444' }}
                        >
                          <Trash2 className="h-4 w-4" />
                          删除知识
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {!readonly && treeSelection.type === 'knowledge' && (hasUnsavedChanges || isSaving || saveFeedback === 'error') && (
                  <button
                    onClick={handleSave}
                    disabled={isSaving || !hasCurrentKnowledge || !hasUnsavedChanges}
                    className="flex-shrink-0 flex h-8 items-center gap-1 px-2.5 py-1 rounded-md text-white text-xs font-medium"
                    style={{
                      backgroundColor: saveFeedback === 'error' ? '#DC2626' : '#6366F1',
                      opacity: isSaving || !hasCurrentKnowledge || !hasUnsavedChanges ? 0.7 : 1,
                      cursor: isSaving || !hasCurrentKnowledge || !hasUnsavedChanges ? 'not-allowed' : 'pointer',
                    }}
                    title={`${isMacOS ? '⌘' : 'Ctrl'}+S`}
                  >
                    {saveFeedback === 'error' ? (
                      <AlertCircle className="h-3.5 w-3.5" />
                    ) : (
                      <Save className="h-3.5 w-3.5" />
                    )}
                    {isSaving ? '保存中...' : saveFeedback === 'error' ? '重试保存' : '保存'}
                  </button>
                )}
              </div>

              <div className="flex-1 min-h-0 flex overflow-hidden">
                {treeSelection.type === 'folder' ? (
                  <div className="flex-1 min-w-0 overflow-hidden">
                    <DirectoryKnowledgeBrowser
                      title={selectedFolderTitle}
                      description={treeSelection.path ? `当前目录：${treeSelection.path}` : '根目录下的文档会在这里以卡片方式展示。'}
                      knowledgeList={selectedFolderKnowledge}
                      childFolders={selectedChildFolders}
                      breadcrumbs={selectedFolderBreadcrumbs}
                      folderTotalCount={selectedFolderDescendantKnowledge.length}
                      latestUpdatedAt={selectedFolderLatestUpdatedAt}
                      currentKnowledgeId={currentKnowledgeId}
                      listDensity={listDensity}
                      createAction={!readonly ? {
                        disabled: !canCreateInSelectedFolder,
                        hint: selectedFolderCreateHint,
                      } : undefined}
                      onSelectFolder={handleSelectTreeFolder}
                      onSelectKnowledge={(knowledgeId) => {
                        void handleSelectTreeKnowledge(knowledgeId)
                      }}
                      getCategoryLabel={getCategoryLabel}
                      formatDate={formatDate}
                    />
                  </div>
                ) : (
                  <div className="flex-1 min-w-0 overflow-y-auto" style={{ padding: '32px 24px 32px 48px' }}>
                    <CurrentKnowledgeEditorPane
                      readonly={readonly}
                      editorMode={editorMode}
                    />
                  </div>
                )}

                <RightPanel
                  readonly={readonly}
                  isGitRepo={isGitRepo}
                  hasKnowledge={treeSelection.type === 'knowledge' && hasCurrentKnowledge}
                  folderMode={treeSelection.type === 'folder'}
                  pendingChangesCount={pendingChangesCount}
                  onGitStatusChange={setPendingChangesCount}
                />
              </div>
            </div>
          </Panel>
        </PanelGroup>
      </div>

      <div
        className="flex h-8 flex-shrink-0 items-center justify-between gap-3 border-t px-3 text-[11px]"
        style={{ borderColor: '#E5E5E5', backgroundColor: '#FAFAFA', color: '#737373' }}
      >
        <div className="flex min-w-0 items-center gap-2 overflow-hidden">
          {treeSelection.type === 'knowledge' && hasCurrentKnowledge ? (
            <>
              <span className="truncate font-medium" style={{ color: '#404040' }}>{currentKnowledgeTitle}</span>
              {currentKnowledgeFolderPath && (
                <span
                  className="hidden rounded-full px-2 py-0.5 sm:inline-flex"
                  style={{ backgroundColor: '#FFFFFF', border: '1px solid #E5E7EB', color: '#64748B' }}
                >
                  {currentKnowledgeFolderLabel}
                </span>
              )}
              {statusSelectionLabel && (
                <span
                  className="hidden rounded-full px-2 py-0.5 md:inline-flex"
                  style={{ backgroundColor: '#EEF2FF', color: '#4338CA' }}
                >
                  {statusSelectionLabel}
                </span>
              )}
            </>
          ) : (
            <>
              <span className="truncate font-medium" style={{ color: '#404040' }}>{selectedFolderTitle}</span>
              <span
                className="rounded-full px-2 py-0.5"
                style={{ backgroundColor: '#FFFFFF', border: '1px solid #E5E7EB', color: '#64748B' }}
              >
                目录 {selectedChildFolders.length} 个
              </span>
              <span
                className="hidden rounded-full px-2 py-0.5 sm:inline-flex"
                style={{ backgroundColor: '#FFFFFF', border: '1px solid #E5E7EB', color: '#64748B' }}
              >
                文档 {selectedFolderDescendantKnowledge.length} 篇
              </span>
            </>
          )}
        </div>

        <div className="flex flex-shrink-0 items-center gap-2 overflow-hidden">
          {treeSelection.type === 'knowledge' && hasCurrentKnowledge ? (
            <>
              <span>行 {currentDocumentLineCount}</span>
              <span className="hidden sm:inline">词 {currentDocumentWordCount}</span>
              <span className="hidden md:inline">字 {currentDocumentCharCount}</span>
              <span
                className="rounded-full px-2 py-0.5"
                style={readonly ? {
                  backgroundColor: '#FFFFFF',
                  border: '1px solid #E5E7EB',
                  color: '#64748B',
                } : currentEditorModeBadgeStyle}
              >
                {readonly ? '只读' : currentEditorModeLabel}
              </span>
            </>
          ) : (
            <>
              {knowledgeQuery.trim() && <span className="hidden md:inline">筛选：{knowledgeQuery}</span>}
              <span>{sortMode === 'recent' ? '按最近更新' : '按标题'}</span>
              <span className="hidden sm:inline">{listDensity === 'compact' ? '紧凑视图' : '预览视图'}</span>
            </>
          )}
        </div>
      </div>

      {showSearch && <SearchPanel onClose={() => setShowSearch(false)} />}
      {!readonly && showNewModal && (
        <NewKnowledgeModal
          onClose={() => {
            setShowNewModal(false)
            setNewKnowledgeSeed(null)
          }}
          initialCategory={newKnowledgeSeed?.initialCategory}
          categoryHint={newKnowledgeSeed?.categoryHint}
          onCreated={async () => {
            await loadData()
          }}
        />
      )}
      {!readonly && showImportModal && (
        <ImportModal
          onClose={() => {
            setShowImportModal(false)
            void loadData()
          }}
        />
      )}
      <ToastNotifications onKnowledgeChange={handleExternalKnowledgeChange} />

      {showKnowledgeGraph && (
        <Suspense
          fallback={(
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
              <div className="rounded-xl bg-white px-4 py-3 text-sm text-neutral-600 shadow-xl">
                加载知识图谱中...
              </div>
            </div>
          )}
        >
          <KnowledgeGraphPanel
            onClose={() => setShowKnowledgeGraph(false)}
            onSelectKnowledge={async (id) => {
              await openKnowledgeWithStale(id)
            }}
          />
        </Suspense>
      )}

      {showDeleteConfirm && deletePreview && (
        <ConfirmDialog
          title="确认删除知识"
          message={`确定要删除「${deletePreview.title}」吗？此操作不可撤销。`}
          references={deletePreview.references}
          confirmLabel="删除"
          confirmStyle="danger"
          onConfirm={confirmDelete}
          onCancel={() => {
            setShowDeleteConfirm(false)
            setDeletePreview(null)
          }}
        />
      )}

      {showKbSwitcher && (
        <KbSwitcher
          onClose={() => setShowKbSwitcher(false)}
          onSwitch={handleKbSwitch}
        />
      )}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  )
}

export default App
