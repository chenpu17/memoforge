import React, { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronRight, FileText, Folder, FolderOpen, Search, Settings, FolderInput, Bot, MoreHorizontal, GitBranch } from 'lucide-react'
import type { KnowledgeTreeNode, TreeSelection } from '../lib/knowledgeTree'
import { filterKnowledgeTree, getAncestorFolderPaths } from '../lib/knowledgeTree'

interface VisibleTreeItem {
  path: string
  type: 'folder' | 'knowledge'
  depth: number
  label: string
}

interface KnowledgeTreeNavProps {
  rootNode: KnowledgeTreeNode
  query: string
  selected: TreeSelection
  readonly?: boolean
  mcpConnectionCount?: number
  onQueryChange: (value: string) => void
  onSelectFolder: (path: string) => void
  onSelectKnowledge: (knowledgeId: string) => void
  onOpenSettings: () => void
  onOpenKnowledgeGraph: () => void
  onOpenImport?: () => void
}

const EXPANDED_STORAGE_KEY = 'memoforge.tree.expanded'

function collectVisibleFolderPaths(nodes: KnowledgeTreeNode[], result = new Set<string>()) {
  nodes.forEach((node) => {
    if (node.type !== 'folder') return
    result.add(node.path)
    if (node.children.length > 0) {
      collectVisibleFolderPaths(node.children, result)
    }
  })
  return result
}

function getVisibleTreeStats(nodes: KnowledgeTreeNode[]) {
  let folderCount = 0
  let knowledgeCount = 0

  const walk = (items: KnowledgeTreeNode[]) => {
    items.forEach((item) => {
      if (item.type === 'folder') {
        folderCount += 1
        walk(item.children)
      } else {
        knowledgeCount += 1
      }
    })
  }

  walk(nodes)
  return { folderCount, knowledgeCount }
}

function renderHighlightedLabel(label: string, query: string) {
  const normalizedQuery = query.trim()
  if (!normalizedQuery) return label

  const lowerLabel = label.toLowerCase()
  const lowerQuery = normalizedQuery.toLowerCase()
  const matchIndex = lowerLabel.indexOf(lowerQuery)
  if (matchIndex < 0) return label

  return (
    <>
      {label.slice(0, matchIndex)}
      <mark
        className="rounded px-0.5"
        style={{ backgroundColor: '#FEF3C7', color: '#92400E' }}
      >
        {label.slice(matchIndex, matchIndex + normalizedQuery.length)}
      </mark>
      {label.slice(matchIndex + normalizedQuery.length)}
    </>
  )
}

function getPathContextLabel(node: KnowledgeTreeNode) {
  if (node.type === 'knowledge') {
    return node.path.split('/').slice(0, -1).join(' / ')
  }
  return node.path.split('/').slice(0, -1).join(' / ')
}

function getStoredExpandedFolders() {
  if (typeof window === 'undefined') return new Set<string>([''])

  const stored = window.localStorage.getItem(EXPANDED_STORAGE_KEY)
  if (!stored) return new Set<string>([''])

  try {
    const parsed = JSON.parse(stored)
    if (Array.isArray(parsed)) {
      return new Set<string>(parsed.filter((value): value is string => typeof value === 'string'))
    }
  } catch (error) {
    console.error('Failed to parse tree expanded state:', error)
  }

  return new Set<string>([''])
}

export const KnowledgeTreeNav: React.FC<KnowledgeTreeNavProps> = React.memo(({
  rootNode,
  query,
  selected,
  readonly = false,
  mcpConnectionCount = 0,
  onQueryChange,
  onSelectFolder,
  onSelectKnowledge,
  onOpenSettings,
  onOpenKnowledgeGraph,
  onOpenImport,
}) => {
  const filteredChildren = useMemo(
    () => filterKnowledgeTree(rootNode.children, query),
    [query, rootNode.children],
  )
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(getStoredExpandedFolders)
  const [activeItemPath, setActiveItemPath] = useState<string>(selected.path)
  const [showToolsMenu, setShowToolsMenu] = useState(false)
  const treeContainerRef = useRef<HTMLDivElement | null>(null)
  const queryInputRef = useRef<HTMLInputElement | null>(null)
  const toolsMenuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const targetFolderPath = selected.type === 'folder'
      ? selected.path
      : selected.path.split('/').slice(0, -1).join('/')
    const ancestors = getAncestorFolderPaths(targetFolderPath)
    setExpandedFolders((previous) => {
      const next = new Set(previous)
      ancestors.forEach((path) => next.add(path))
      return next
    })
    setActiveItemPath(selected.path)
  }, [selected])

  useEffect(() => {
    window.localStorage.setItem(EXPANDED_STORAGE_KEY, JSON.stringify(Array.from(expandedFolders)))
  }, [expandedFolders])

  useEffect(() => {
    if (!showToolsMenu) return

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null
      if (toolsMenuRef.current?.contains(target ?? null)) {
        return
      }
      setShowToolsMenu(false)
    }

    window.addEventListener('pointerdown', handlePointerDown)
    return () => window.removeEventListener('pointerdown', handlePointerDown)
  }, [showToolsMenu])

  useEffect(() => {
    const handleGlobalKeydown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || !event.shiftKey || event.key.toLowerCase() !== 'f') {
        return
      }

      const target = event.target as HTMLElement | null
      const isTypingTarget = Boolean(
        target?.closest('input, textarea, select, [contenteditable="true"], .cm-editor, .cm-content'),
      )

      if (isTypingTarget && target !== queryInputRef.current) {
        return
      }

      event.preventDefault()
      queryInputRef.current?.focus()
      queryInputRef.current?.select()
    }

    window.addEventListener('keydown', handleGlobalKeydown)
    return () => window.removeEventListener('keydown', handleGlobalKeydown)
  }, [])

  const toggleFolder = (path: string) => {
    setExpandedFolders((previous) => {
      const next = new Set(previous)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      return next
    })
  }

  const effectiveExpandedFolders = useMemo(() => {
    if (!query.trim()) return expandedFolders
    const next = new Set(expandedFolders)
    next.add('')
    collectVisibleFolderPaths(filteredChildren).forEach((path) => next.add(path))
    return next
  }, [expandedFolders, filteredChildren, query])

  const searchStats = useMemo(() => getVisibleTreeStats(filteredChildren), [filteredChildren])

  const visibleItems = useMemo(() => {
    const items: VisibleTreeItem[] = [{ path: '', type: 'folder', depth: 0, label: rootNode.label }]

    const walk = (nodes: KnowledgeTreeNode[], depth: number) => {
      nodes.forEach((node) => {
        items.push({
          path: node.path,
          type: node.type,
          depth,
          label: node.label,
        })

        if (node.type === 'folder' && effectiveExpandedFolders.has(node.path) && node.children.length > 0) {
          walk(node.children, depth + 1)
        }
      })
    }

    walk(filteredChildren, 1)
    return items
  }, [effectiveExpandedFolders, filteredChildren, rootNode.label])

  const activeItemIndex = Math.max(visibleItems.findIndex((item) => item.path === activeItemPath), 0)

  const handleActivateItem = (item: VisibleTreeItem | undefined) => {
    if (!item) return
    setActiveItemPath(item.path)
    if (item.type === 'folder') {
      onSelectFolder(item.path)
      return
    }
    onSelectKnowledge(item.path)
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (visibleItems.length === 0) return

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      const nextItem = visibleItems[Math.min(activeItemIndex + 1, visibleItems.length - 1)]
      if (nextItem) {
        setActiveItemPath(nextItem.path)
      }
      return
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      const previousItem = visibleItems[Math.max(activeItemIndex - 1, 0)]
      if (previousItem) {
        setActiveItemPath(previousItem.path)
      }
      return
    }

    const activeItem = visibleItems[activeItemIndex]
    if (!activeItem) return

    if (event.key === 'ArrowRight' && activeItem.type === 'folder') {
      event.preventDefault()
      setExpandedFolders((previous) => {
        if (previous.has(activeItem.path)) return previous
        const next = new Set(previous)
        next.add(activeItem.path)
        return next
      })
      return
    }

    if (event.key === 'ArrowLeft' && activeItem.type === 'folder') {
      event.preventDefault()
      setExpandedFolders((previous) => {
        if (!previous.has(activeItem.path) || activeItem.path === '') return previous
        const next = new Set(previous)
        next.delete(activeItem.path)
        return next
      })
      return
    }

    if (event.key === 'Enter') {
      event.preventDefault()
      handleActivateItem(activeItem)
    }
  }

  const renderNodes = (nodes: KnowledgeTreeNode[], depth = 1): React.ReactNode => nodes.map((node) => {
    const isFolder = node.type === 'folder'
    const isExpanded = isFolder && effectiveExpandedFolders.has(node.path)
    const isSelected = selected.type === node.type && selected.path === node.path
    const isActive = activeItemPath === node.path

    return (
      <div key={node.id}>
        <div
          className="flex items-center gap-1.5 rounded-xl px-2 py-1"
          style={{
            paddingLeft: `${8 + depth * 14}px`,
            backgroundColor: isSelected ? '#EEF2FF' : (isActive ? '#F8FAFC' : 'transparent'),
          }}
        >
          {isFolder ? (
            <button
              type="button"
              onClick={() => toggleFolder(node.path)}
              aria-label={isExpanded ? `收起 ${node.label}` : `展开 ${node.label}`}
              aria-expanded={isExpanded}
              className="flex h-7 w-7 items-center justify-center rounded-lg transition-colors hover:bg-white"
              style={{ color: '#94A3B8' }}
              title={isExpanded ? '收起' : '展开'}
            >
              {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            </button>
          ) : (
            <span className="inline-flex h-5 w-5 items-center justify-center" />
          )}

          <button
            type="button"
            onClick={() => handleActivateItem({ path: node.path, type: node.type, depth, label: node.label })}
            onDoubleClick={() => {
              if (isFolder) {
                toggleFolder(node.path)
              }
            }}
            className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-white/80"
            style={{ color: isSelected ? '#312E81' : '#171717' }}
          >
            {isFolder ? (
              isExpanded
                ? <FolderOpen className="h-4 w-4 shrink-0" style={{ color: isSelected ? '#4F46E5' : '#64748B' }} />
                : <Folder className="h-4 w-4 shrink-0" style={{ color: isSelected ? '#4F46E5' : '#64748B' }} />
            ) : (
              <FileText className="h-4 w-4 shrink-0" style={{ color: isSelected ? '#4F46E5' : '#94A3B8' }} />
            )}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium">
                {renderHighlightedLabel(node.label, query)}
              </span>
              {query.trim() && getPathContextLabel(node) && (
                <span className="mt-0.5 block truncate text-[10px]" style={{ color: '#94A3B8' }}>
                  {getPathContextLabel(node)}
                </span>
              )}
            </span>
            {isFolder && (
              <span
                className="shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] leading-none"
                style={{ backgroundColor: '#FFFFFF', color: '#64748B', border: '1px solid #E5E7EB' }}
              >
                {node.count}
              </span>
            )}
          </button>
        </div>

        {isFolder && isExpanded && node.children.length > 0 && (
          <div className="mt-0.5">
            {renderNodes(node.children, depth + 1)}
          </div>
        )}
      </div>
    )
  })

  return (
    <div className="knowledge-tree-shell flex h-full flex-col">
      <div className="border-b px-3 py-3" style={{ borderColor: '#E5E5E5' }}>
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-[13px] font-semibold" style={{ color: '#171717' }}>知识树</div>
            <div className="mt-0.5 text-[11px]" style={{ color: '#737373' }}>
              目录节点浏览文档，叶子节点直接打开内容
            </div>
          </div>
          <span
            className="inline-flex shrink-0 items-center whitespace-nowrap rounded-full border px-2.5 py-1 text-[10px] font-medium leading-none"
            style={{ borderColor: '#E5E7EB', backgroundColor: '#F8FAFC', color: '#64748B' }}
          >
            {rootNode.count} 篇
          </span>
        </div>
        <div
          className="mt-3 flex items-center gap-2 rounded-xl border px-3 py-2"
          style={{ borderColor: '#E5E5E5', backgroundColor: '#FFFFFF' }}
        >
          <Search className="h-3.5 w-3.5 shrink-0" style={{ color: '#A3A3A3' }} />
          <input
            ref={queryInputRef}
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                if (query.trim()) {
                  event.preventDefault()
                  onQueryChange('')
                } else {
                  event.currentTarget.blur()
                }
                return
              }

              if (event.key === 'ArrowDown') {
                event.preventDefault()
                treeContainerRef.current?.focus()
              }
            }}
            placeholder="过滤目录或文档..."
            className="min-w-0 flex-1 bg-transparent text-xs outline-none"
            style={{ color: '#404040' }}
          />
          {query.trim() && (
            <button
              type="button"
              onClick={() => onQueryChange('')}
              className="rounded-md px-2 py-1 text-[11px] font-medium"
              style={{ backgroundColor: '#EEF2FF', color: '#4338CA' }}
            >
              清空
            </button>
          )}
        </div>
        <div className="mt-2 flex items-center justify-between gap-2 text-[10px]" style={{ color: '#94A3B8' }}>
          <span>{typeof navigator !== 'undefined' && navigator.userAgent.includes('Mac') ? '⌘⇧F' : 'Ctrl+Shift+F'} 聚焦搜索</span>
          <span>
            {query.trim()
              ? `匹配 ${searchStats.folderCount} 个目录 · ${searchStats.knowledgeCount} 篇文档`
              : '↑↓ 选择 · Enter 打开'}
          </span>
        </div>
      </div>

      <div
        ref={treeContainerRef}
        className="flex-1 overflow-y-auto px-2 py-2 outline-none"
        tabIndex={0}
        onKeyDown={handleKeyDown}
      >
        <button
          type="button"
          onClick={() => handleActivateItem({ path: '', type: 'folder', depth: 0, label: rootNode.label })}
          className="mb-1 flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-white"
          style={{ backgroundColor: selected.type === 'folder' && selected.path === '' ? '#EEF2FF' : '#F8FAFC' }}
        >
          <FolderOpen className="h-4 w-4 shrink-0" style={{ color: '#4F46E5' }} />
          <span className="min-w-0 flex-1 truncate text-[13px] font-semibold" style={{ color: '#171717' }}>
            {renderHighlightedLabel(rootNode.label, query)}
          </span>
          <span
            className="shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] leading-none"
            style={{ backgroundColor: '#FFFFFF', color: '#64748B', border: '1px solid #E5E7EB' }}
          >
            {rootNode.count}
          </span>
        </button>

        {filteredChildren.length > 0 ? (
          renderNodes(filteredChildren)
        ) : (
          <div className="flex h-full flex-col items-center justify-center px-4 text-center">
            <div className="text-sm text-neutral-400">没有匹配的目录或文档</div>
            <div className="mt-1 text-[12px]" style={{ color: '#94A3B8' }}>
              可以清空搜索词，或回到根目录重新浏览
            </div>
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={() => onQueryChange('')}
                className="rounded-full border px-3 py-1.5 text-[12px] font-medium"
                style={{ borderColor: '#E5E5E5', backgroundColor: '#FFFFFF', color: '#525252' }}
              >
                清空搜索
              </button>
              <button
                type="button"
                onClick={() => onSelectFolder('')}
                className="rounded-full px-3 py-1.5 text-[12px] font-medium text-white"
                style={{ backgroundColor: '#6366F1' }}
              >
                回到根目录
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="border-t px-3 py-3" style={{ borderColor: '#E5E5E5', backgroundColor: '#FAFAFA' }}>
        <div className="space-y-2">
          <div
            className="flex w-full items-center gap-2 rounded-xl border px-3 py-2"
            style={{ backgroundColor: '#FFFFFF', color: '#64748B', borderColor: '#E5E7EB' }}
          >
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: mcpConnectionCount > 0 ? '#10B981' : '#CBD5E1' }}
            />
            <Bot className="h-3.5 w-3.5 shrink-0" style={{ color: mcpConnectionCount > 0 ? '#10B981' : '#94A3B8' }} />
            <span className="min-w-0 truncate text-[11px] font-medium">
              {mcpConnectionCount > 0 ? `MCP 已连接 ${mcpConnectionCount}` : 'MCP 未连接'}
            </span>
          </div>

        <div
          className="grid gap-2"
          style={{
            gridTemplateColumns: readonly || !onOpenImport
              ? 'minmax(0, 1fr) minmax(0, 1fr)'
              : 'minmax(0, 1.15fr) minmax(0, 1fr) minmax(0, 1fr)',
          }}
        >
          {!readonly && onOpenImport && (
            <button
              type="button"
              onClick={onOpenImport}
              className="inline-flex min-w-0 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[11px] font-medium whitespace-nowrap"
              style={{ backgroundColor: '#EEF2FF', color: '#4338CA' }}
              title="导入 Markdown"
            >
              <FolderInput className="h-3.5 w-3.5" />
              <span className="truncate">导入 MD</span>
            </button>
          )}

          <button
            type="button"
            onClick={onOpenSettings}
            className="inline-flex min-w-0 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-[11px] font-medium whitespace-nowrap"
            style={{
              borderColor: '#E5E7EB',
              backgroundColor: '#FFFFFF',
              color: '#525252',
            }}
            title="设置"
          >
            <Settings className="h-3.5 w-3.5" />
            <span className="truncate">设置</span>
          </button>

          <div className="relative" ref={toolsMenuRef}>
            <button
              type="button"
              onClick={() => setShowToolsMenu((open) => !open)}
              className="inline-flex w-full min-w-0 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-[11px] font-medium whitespace-nowrap"
              style={{
                borderColor: showToolsMenu ? '#C7D2FE' : '#E5E7EB',
                backgroundColor: showToolsMenu ? '#EEF2FF' : '#FFFFFF',
                color: showToolsMenu ? '#4338CA' : '#525252',
              }}
              title="更多工具"
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
              <span className="truncate">更多</span>
            </button>

            {showToolsMenu && (
              <div
                className="absolute bottom-[calc(100%+8px)] right-0 z-20 min-w-[168px] rounded-2xl border p-1.5 shadow-xl"
                style={{ borderColor: '#E5E7EB', backgroundColor: 'rgba(255, 255, 255, 0.98)' }}
              >
                <button
                  type="button"
                  onClick={() => {
                    onOpenKnowledgeGraph()
                    setShowToolsMenu(false)
                  }}
                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-medium"
                  style={{ color: '#404040' }}
                >
                  <GitBranch className="h-3.5 w-3.5" />
                  知识图谱
                </button>
              </div>
            )}
          </div>
        </div>
        </div>
      </div>
    </div>
  )
})
