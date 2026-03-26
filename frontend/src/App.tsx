import { useCallback, useEffect, useState, type MouseEvent } from 'react'
import { Search, Plus, Save, ArrowUpDown, ChevronRight, MoreHorizontal, Trash2, GitBranch, FolderOpen, X, Minus, Square } from 'lucide-react'
import { Sidebar } from './components/Sidebar'
import { Editor } from './components/Editor'
import { SearchPanel } from './components/SearchPanel'
import { NewKnowledgeModal } from './components/NewKnowledgeModal'
import { ImportModal } from './components/ImportModal'
import { ToastNotifications } from './components/ToastNotifications'
import { ConfirmDialog } from './components/ConfirmDialog'
import { ReadOnlyBanner } from './components/ReadOnlyBanner'
import { Input } from './components/ui/Input'
import { KnowledgeGraphPanel } from './components/KnowledgeGraphPanel'
import { KbSwitcher } from './components/KbSwitcher'
import { RightPanel } from './components/RightPanel'
import { useAppStore } from './stores/appStore'
import { tauriService, DeletePreview } from './services/tauri'

// 窗口控制函数
async function closeWindow() {
  if (typeof window !== 'undefined' && '__TAURI__' in window) {
    const { getCurrentWindow } = await import('@tauri-apps/api/window')
    await getCurrentWindow().close()
  }
}

async function minimizeWindow() {
  if (typeof window !== 'undefined' && '__TAURI__' in window) {
    const { getCurrentWindow } = await import('@tauri-apps/api/window')
    await getCurrentWindow().minimize()
  }
}

async function maximizeWindow() {
  if (typeof window !== 'undefined' && '__TAURI__' in window) {
    const { getCurrentWindow } = await import('@tauri-apps/api/window')
    const win = getCurrentWindow()
    if (await win.isMaximized()) {
      await win.unmaximize()
    } else {
      await win.maximize()
    }
  }
}

const getTagColors = (tag: string) => {
  const colors: Record<string, { bg: string; text: string }> = {
    Rust: { bg: '#FEF3C7', text: '#92400E' },
    Python: { bg: '#EFF6FF', text: '#1D4ED8' },
    Docker: { bg: '#EFF6FF', text: '#1D4ED8' },
    TypeScript: { bg: '#EFF6FF', text: '#1D4ED8' },
    内存管理: { bg: '#DCFCE7', text: '#166534' },
    并发: { bg: '#F5F3FF', text: '#6D28D9' },
    Redis: { bg: '#FEE2E2', text: '#991B1B' },
    缓存: { bg: '#F5F5F5', text: '#525252' },
  }
  return colors[tag] || { bg: '#F5F5F5', text: '#525252' }
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

function App() {
  const [showSearch, setShowSearch] = useState(false)
  const [showNewModal, setShowNewModal] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deletePreview, setDeletePreview] = useState<DeletePreview | null>(null)
  const [showMoreMenu, setShowMoreMenu] = useState(false)
  const [showKnowledgeGraph, setShowKnowledgeGraph] = useState(false)
  const [showKbSwitcher, setShowKbSwitcher] = useState(false)
  const [initialized, setInitialized] = useState(false)
  const [readonly, setReadonly] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [kbPath, setKbPath] = useState('')
  const [currentKbName, setCurrentKbName] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [sortMode, setSortMode] = useState<'recent' | 'title'>('recent')
  const [pendingChangesCount, setPendingChangesCount] = useState(0)
  const [isGitRepo, setIsGitRepo] = useState(true)
  const [mcpConnectionCount, setMcpConnectionCount] = useState(0)

  const {
    currentKnowledge,
    setCurrentKnowledge,
    knowledgeList,
    setKnowledgeList,
    appendKnowledgeList,
    setHasMore,
    setOffset,
    hasMore,
    offset,
    categories,
    setCategories,
    editorMode,
    setEditorMode,
    allTags,
    setAllTags,
    selectedTags,
    toggleTag,
  } = useAppStore()

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

  // 分类或标签变化时重新加载数据
  useEffect(() => {
    if (!initialized) return
    void loadData()
  }, [selectedCategory, selectedTags])

  useEffect(() => {
    if (!initialized) return

    const syncCurrentKnowledge = async () => {
      try {
        if (currentKnowledge?.id && currentKnowledge.title) {
          await tauriService.selectKnowledge(
            currentKnowledge.id,
            currentKnowledge.title,
            currentKnowledge.category ?? undefined
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
    currentKnowledge?.id,
    currentKnowledge?.title,
    currentKnowledge?.category,
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
      setInitialized(true)
      setReadonly(false)
      await loadData()
      await loadCurrentKbName()
    } catch (error) {
      console.error('Init failed:', error)
      alert('初始化失败: ' + error)
    }
  }

  const handleSelectFolder = async () => {
    try {
      const selectedPath = await tauriService.selectFolder()
      if (selectedPath) {
        setKbPath(selectedPath)
      }
    } catch (error) {
      console.error('Failed to select folder:', error)
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

      // 获取当前筛选条件
      const currentCategory = selectedCategory ?? undefined
      const currentTags = selectedTags.length > 0 ? selectedTags : undefined

      const [knowledgeResult, loadedCategories, tags, gitStatus] = await Promise.all([
        tauriService.listKnowledge(1, 200, nextOffset, currentCategory, currentTags),
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

  const loadMore = async () => {
    if (!hasMore) return

    const nextOffset = offset + 200
    setOffset(nextOffset)
    try {
      const currentCategory = selectedCategory ?? undefined
      const currentTags = selectedTags.length > 0 ? selectedTags : undefined
      const knowledgeResult = await tauriService.listKnowledge(1, 200, nextOffset, currentCategory, currentTags)
      appendKnowledgeList(knowledgeResult.items)
      setHasMore(knowledgeResult.has_more)
    } catch (error) {
      console.error('Failed to load more:', error)
    }
  }

  const sortedKnowledge = [...knowledgeList].sort((left, right) => {
    if (sortMode === 'title') {
      return left.title.localeCompare(right.title, 'zh-CN')
    }
    return new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime()
  })

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
  }, [readonly, selectedCategory, selectedTags, offset])

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

  const handleSave = async () => {
    const latestKnowledge = useAppStore.getState().currentKnowledge
    if (!latestKnowledge || isSaving) return

    setIsSaving(true)
    try {
      if (latestKnowledge.id) {
        const expectedTitle = latestKnowledge.title
        const expectedCategory = latestKnowledge.category
        await tauriService.updateKnowledge(latestKnowledge.id, latestKnowledge)
        await loadData()
        const refreshed = await tauriService.listKnowledge(1, 200, 0)
        const updatedItem = refreshed.items.find((knowledge) => {
          if (knowledge.title !== expectedTitle) return false
          if (!expectedCategory) return true
          return knowledge.category === expectedCategory || knowledge.id.startsWith(`${expectedCategory}/`)
        })
        if (updatedItem) {
          const fullKnowledge = await tauriService.getKnowledgeWithStale(updatedItem.id)
          setCurrentKnowledge(fullKnowledge)
        }
      } else {
        const createdId = await tauriService.createKnowledge(latestKnowledge)
        const createdKnowledge = await tauriService.getKnowledge(createdId, 2)
        setCurrentKnowledge(createdKnowledge)
        await loadData()
      }
    } catch (error) {
      console.error('Save failed:', error)
      alert('保存失败: ' + error)
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!currentKnowledge?.id) return

    try {
      const preview = await tauriService.previewDeleteKnowledge(currentKnowledge.id)
      setDeletePreview(preview)
      setShowDeleteConfirm(true)
      setShowMoreMenu(false)
    } catch (error) {
      console.error('Failed to preview delete:', error)
      alert('预览删除失败: ' + error)
    }
  }

  const confirmDelete = async () => {
    if (!currentKnowledge?.id) return

    try {
      await tauriService.deleteKnowledge(currentKnowledge.id)
      setCurrentKnowledge(null)
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
            打开知识库
          </button>
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
    <div className="app-container flex flex-col">
      {readonly && <ReadOnlyBanner />}

      <div
        className="titlebar-drag h-[38px] flex items-center justify-between px-3 border-b"
        style={{ backgroundColor: '#FAFAFA', borderColor: '#E5E5E5' }}
        data-tauri-drag-region
        onMouseDown={handleTitlebarMouseDown}
      >
        <div className="flex items-center gap-2" data-tauri-drag-region>
          <div className="flex items-center gap-1.5">
            <button
              onClick={closeWindow}
              className="w-3 h-3 rounded-full flex items-center justify-center hover:brightness-90 transition-all group"
              style={{ backgroundColor: '#FF5F57' }}
              title="关闭"
            >
              <X className="h-2 w-2 opacity-0 group-hover:opacity-100 text-black/60" />
            </button>
            <button
              onClick={minimizeWindow}
              className="w-3 h-3 rounded-full flex items-center justify-center hover:brightness-90 transition-all group"
              style={{ backgroundColor: '#FFBD2E' }}
              title="最小化"
            >
              <Minus className="h-2 w-2 opacity-0 group-hover:opacity-100 text-black/60" />
            </button>
            <button
              onClick={maximizeWindow}
              className="w-3 h-3 rounded-full flex items-center justify-center hover:brightness-90 transition-all group"
              style={{ backgroundColor: '#28C840' }}
              title="最大化"
            >
              <Square className="h-1.5 w-1.5 opacity-0 group-hover:opacity-100 text-black/60" />
            </button>
          </div>
        </div>
        <span className="text-[13px] font-medium select-none" style={{ color: '#737373' }} data-tauri-drag-region>
          MemoForge
        </span>
        <div className="titlebar-no-drag flex items-center gap-1">
          <button onClick={() => setShowKnowledgeGraph(true)} className="titlebar-no-drag p-1 hover:bg-gray-200 rounded" title="知识图谱">
            <GitBranch className="h-4 w-4" style={{ color: '#737373' }} />
          </button>
          <button onClick={() => setShowSearch(true)} className="titlebar-no-drag p-1 hover:bg-gray-200 rounded" title="搜索">
            <Search className="h-4 w-4" style={{ color: '#737373' }} />
          </button>
          {!readonly && (
            <button
              onClick={() => setShowNewModal(true)}
              className="titlebar-no-drag flex items-center gap-1 px-2.5 py-1 rounded text-white text-xs font-medium"
              style={{ backgroundColor: '#6366F1' }}
            >
              <Plus className="h-3.5 w-3.5" />
              新建
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className="w-[240px] min-w-[240px] flex-shrink-0 border-r" style={{ backgroundColor: '#FAFAFA', borderColor: '#E5E5E5' }}>
          <Sidebar
            onImport={() => setShowImportModal(true)}
            onOpenSearch={() => setShowSearch(true)}
            readonly={readonly}
            selectedCategory={selectedCategory}
            onSelectCategory={setSelectedCategory}
            pendingChangesCount={pendingChangesCount}
            currentKbName={currentKbName}
            isGitRepo={isGitRepo}
            mcpConnectionCount={mcpConnectionCount}
          />
        </div>

        <div className="w-[300px] min-w-[300px] flex-shrink-0 flex flex-col border-r bg-white" style={{ borderColor: '#E5E5E5' }}>
          <div className="px-3 pt-3">
            <div className="flex items-center gap-1.5 mb-2">
              <span className="text-[13px]" style={{ color: '#A3A3A3' }}>
                {selectedCategory
                  ? (categories.find((category) => category.id === selectedCategory)?.name || selectedCategory)
                  : '全部知识'}
              </span>
              <div className="flex-1" />
              <button
                onClick={() => setSortMode((mode) => (mode === 'recent' ? 'title' : 'recent'))}
                className="flex items-center gap-1 px-2 py-1 rounded-[5px]"
                style={{ border: '1px solid #E5E5E5' }}
              >
                <ArrowUpDown className="h-3 w-3" style={{ color: '#737373' }} />
                <span className="text-[11px]" style={{ color: '#737373' }}>
                  {sortMode === 'recent' ? '最近' : '标题'}
                </span>
              </button>
              <span className="text-[11px] px-2 py-0.5 rounded-full" style={{ backgroundColor: '#F5F5F5', color: '#737373' }}>
                {sortedKnowledge.length} 条
              </span>
            </div>

            <div className="flex gap-1.5 flex-wrap pb-2.5">
              <button
                onClick={() => selectedTags.length > 0 && useAppStore.setState({ selectedTags: [] })}
                className="px-2.5 py-[3px] text-[11px] rounded-full font-medium"
                style={{
                  backgroundColor: selectedTags.length === 0 ? '#6366F1' : 'transparent',
                  color: selectedTags.length === 0 ? '#FFFFFF' : '#737373',
                  border: selectedTags.length === 0 ? 'none' : '1px solid #E5E5E5',
                }}
              >
                全部
              </button>
              {allTags.map(({ tag, count }) => (
                <button
                  key={tag}
                  onClick={() => toggleTag(tag)}
                  className="px-2.5 py-[3px] text-[11px] rounded-full font-medium"
                  style={{
                    backgroundColor: selectedTags.includes(tag) ? '#6366F1' : 'transparent',
                    color: selectedTags.includes(tag) ? '#FFFFFF' : '#737373',
                    border: selectedTags.includes(tag) ? 'none' : '1px solid #E5E5E5',
                  }}
                >
                  {tag} ({count})
                </button>
              ))}
            </div>
          </div>

          <div className="h-px" style={{ backgroundColor: '#E5E5E5' }} />

          <div className="flex-1 overflow-y-auto">
            {sortedKnowledge.map((knowledge) => {
              const isSelected = currentKnowledge?.id === knowledge.id
              return (
                <div
                  key={knowledge.id}
                  className="p-3 border-b cursor-pointer"
                  style={{
                    backgroundColor: isSelected ? '#EEF2FF' : 'transparent',
                    borderColor: isSelected ? '#C7D2FE' : '#E5E5E5',
                  }}
                  onClick={async () => {
                    try {
                      const fullKnowledge = await tauriService.getKnowledgeWithStale(knowledge.id)
                      setCurrentKnowledge(fullKnowledge)
                    } catch (error) {
                      console.error('Failed to load knowledge:', error)
                    }
                  }}
                >
                  <h3 className="text-[13px] font-semibold mb-1.5 truncate" style={{ color: isSelected ? '#3730A3' : '#0A0A0A' }}>
                    {knowledge.title}
                  </h3>
                  {knowledge.summary && (
                    <p className="text-xs mb-2 line-clamp-2 leading-relaxed" style={{ color: isSelected ? '#6366F1' : '#737373' }}>
                      {knowledge.summary}
                    </p>
                  )}
                  <div className="flex items-center justify-between">
                    <div className="flex flex-wrap gap-1.5">
                      {knowledge.tags.slice(0, 3).map((tag) => {
                        const tagColors = getTagColors(tag)
                        return (
                          <span
                            key={tag}
                            className="px-1.5 py-0.5 text-[10px] rounded font-medium"
                            style={{ backgroundColor: tagColors.bg, color: tagColors.text }}
                          >
                            {tag}
                          </span>
                        )
                      })}
                    </div>
                    <span className="text-[11px]" style={{ color: isSelected ? '#818CF8' : '#A3A3A3' }}>
                      {formatDate(knowledge.updated_at)}
                    </span>
                  </div>
                </div>
              )
            })}

            {hasMore && (
              <div className="p-3">
                <button
                  onClick={loadMore}
                  className="w-full py-2 text-sm font-medium text-center rounded-lg border hover:bg-gray-50 transition-colors"
                  style={{ color: '#6366F1', borderColor: '#E5E7EB' }}
                >
                  加载更多
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 min-w-0 flex flex-col bg-white">
          <div className="h-12 flex-shrink-0 flex items-center gap-2 px-4 border-b overflow-visible relative z-20" style={{ borderColor: '#E5E5E5' }}>
            <div className="flex items-center gap-1.5 flex-1 min-w-0">
              {currentKnowledge && (
                <>
                  {currentKnowledge.category && (
                    <>
                      <span className="text-[13px]" style={{ color: '#A3A3A3' }}>{currentKnowledge.category}</span>
                      <ChevronRight className="h-3.5 w-3.5 flex-shrink-0" style={{ color: '#D4D4D4' }} />
                    </>
                  )}
                  <span className="text-[13px] font-medium truncate" style={{ color: '#0A0A0A' }}>{currentKnowledge.title}</span>
                </>
              )}
            </div>

            {!readonly && (
              <div className="flex rounded-md overflow-hidden flex-shrink-0" style={{ border: '1px solid #E5E5E5' }}>
                <button
                  onClick={() => setEditorMode('read')}
                  className="px-3 py-1.5 text-xs"
                  style={{
                    backgroundColor: editorMode === 'read' ? '#F5F5F5' : '#FFFFFF',
                    color: editorMode === 'read' ? '#0A0A0A' : '#737373',
                    fontWeight: editorMode === 'read' ? 500 : 'normal',
                  }}
                >
                  阅读
                </button>
                <button
                  onClick={() => setEditorMode('edit')}
                  className="px-3 py-1.5 text-xs"
                  style={{
                    backgroundColor: editorMode === 'edit' ? '#F5F5F5' : '#FFFFFF',
                    color: editorMode === 'edit' ? '#0A0A0A' : '#737373',
                    fontWeight: editorMode === 'edit' ? 500 : 'normal',
                  }}
                >
                  编辑
                </button>
              </div>
            )}

            {!readonly && currentKnowledge && (
              <div className="relative flex-shrink-0">
                <button
                  onClick={() => setShowMoreMenu((open) => !open)}
                  className="p-1.5 rounded-[5px]"
                  style={{ border: '1px solid #E5E5E5' }}
                >
                  <MoreHorizontal className="h-4 w-4" style={{ color: '#737373' }} />
                </button>
                {showMoreMenu && (
                  <div
                    className="absolute right-0 top-full mt-1 bg-white border rounded-lg shadow-lg py-1 z-50 min-w-[140px]"
                    style={{ borderColor: '#E5E5E5' }}
                  >
                    <button
                      onClick={handleDelete}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-red-50"
                      style={{ color: '#EF4444' }}
                    >
                      <Trash2 className="h-4 w-4" />
                      删除知识
                    </button>
                  </div>
                )}
              </div>
            )}

            {!readonly && (
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="flex-shrink-0 flex items-center gap-1 px-2.5 py-1 rounded text-white text-xs font-medium"
                style={{
                  backgroundColor: '#6366F1',
                  opacity: isSaving ? 0.7 : 1,
                  cursor: isSaving ? 'not-allowed' : 'pointer',
                }}
              >
                <Save className="h-3.5 w-3.5" />
                {isSaving ? '保存中...' : '保存'}
              </button>
            )}
          </div>

          <div className="flex-1 min-h-0 flex overflow-hidden">
            <div className="flex-1 min-w-0 overflow-y-auto" style={{ padding: '32px 24px 32px 48px' }}>
              {currentKnowledge ? (
                <Editor
                  value={currentKnowledge.content ?? ''}
                  onChange={(content) => setCurrentKnowledge({ ...currentKnowledge, content })}
                  mode={readonly ? 'read' : editorMode}
                  knowledgePath={currentKnowledge.id}
                  knowledgeTitle={currentKnowledge.title}
                  knowledgeCategory={currentKnowledge.category}
                />
              ) : (
                <div className="flex items-center justify-center h-full text-gray-400">
                  选择或创建知识开始编辑
                </div>
              )}
            </div>

            {/* 右侧可折叠面板 */}
            <RightPanel
              readonly={readonly}
              isGitRepo={isGitRepo}
              hasKnowledge={!!currentKnowledge}
              pendingChangesCount={pendingChangesCount}
              onGitStatusChange={setPendingChangesCount}
            />
          </div>
        </div>
      </div>

      {showSearch && <SearchPanel onClose={() => setShowSearch(false)} />}
      {!readonly && showNewModal && <NewKnowledgeModal onClose={() => setShowNewModal(false)} />}
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
        <KnowledgeGraphPanel
          onClose={() => setShowKnowledgeGraph(false)}
          onSelectKnowledge={async (id) => {
            const knowledge = await tauriService.getKnowledge(id, 2)
            setCurrentKnowledge(knowledge)
          }}
        />
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
    </div>
  )
}

export default App
