import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { shallow } from 'zustand/shallow'
import { useAppStore } from '../stores/appStore'
import { tauriService } from '../services/tauri'
import { Search, X, FileText, CornerDownLeft, ArrowUpDown } from 'lucide-react'
import type { Category, GrepMatch } from '../types'
import { useKnowledgeNavigation } from '../hooks/useKnowledgeNavigation'
import { GettingStartedCard } from './GettingStartedCard'

interface SearchHistoryItem {
  query: string
  searchType: 'all' | 'tags' | 'category'
}

const SEARCH_HISTORY_KEY = 'memoforge.search.history'

// Highlight matching text in a line
const HighlightedText = ({ text, query }: { text: string; query: string }) => {
  // Extract just the keyword part (without tag: prefixes)
  const cleanQuery = query.replace(/tag:\S+\s*/g, '').trim()
  if (!cleanQuery) return <span>{text}</span>

  const regex = new RegExp(`(${cleanQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')
  const parts = text.split(regex)

  return (
    <span>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <mark key={i} className="bg-yellow-200 px-0.5 rounded">{part}</mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </span>
  )
}

export const SearchPanel: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { openKnowledge: openKnowledgeWithGuard } = useKnowledgeNavigation()
  const [query, setQuery] = useState('')
  const [searchType, setSearchType] = useState<'all' | 'tags' | 'category'>('all')
  const { grepResults, categories, isSearching, setGrepResults, setIsSearching } = useAppStore((state) => ({
    grepResults: state.grepResults,
    categories: state.categories,
    isSearching: state.isSearching,
    setGrepResults: state.setGrepResults,
    setIsSearching: state.setIsSearching,
  }), shallow)
  const [selectedMatch, setSelectedMatch] = useState<GrepMatch | null>(null)
  const [previewContent, setPreviewContent] = useState<string>('')
  const [searchHistory, setSearchHistory] = useState<SearchHistoryItem[]>(() => {
    if (typeof window === 'undefined') return []
    try {
      const saved = window.localStorage.getItem(SEARCH_HISTORY_KEY)
      return saved ? JSON.parse(saved) : []
    } catch {
      return []
    }
  })
  const matchRefs = useRef(new Map<string, HTMLDivElement>())

  const getMatchedCategory = useCallback((value: string): Category | null => {
    const normalized = value.trim().toLowerCase()
    if (!normalized) return null

    return categories.find((category) =>
      category.id.toLowerCase() === normalized ||
      category.name.toLowerCase() === normalized,
    ) || categories.find((category) =>
      category.id.toLowerCase().includes(normalized) ||
      category.name.toLowerCase().includes(normalized),
    ) || null
  }, [categories])

  const getSearchPlaceholder = useCallback(() => {
    if (searchType === 'tags') return '输入标签名，例如 rust'
    if (searchType === 'category') return '输入分类名，例如 技术 / 产品'
    return '搜索知识内容... (也支持 tag:rust)'
  }, [searchType])

  const getSearchHint = useCallback(() => {
    if (searchType === 'tags') return '标签模式会返回带该标签的文档摘要，适合快速筛出一组知识。'
    if (searchType === 'category') return '分类模式会匹配分类名或 ID，并展示该分类下的文档摘要。'
    return '全文模式会在正文中 grep 匹配，也支持 tag:xxx 语法叠加过滤。'
  }, [searchType])

  const loadPreview = useCallback(async (match: GrepMatch) => {
    try {
      const knowledge = await tauriService.getKnowledge(match.id, 2)
      const lines = (knowledge.content || '').split('\n')
      const startLine = Math.max(0, match.line_number - 5)
      const endLine = Math.min(lines.length, match.line_number + 5)
      const contextLines = lines.slice(startLine, endLine)
      setPreviewContent(contextLines.join('\n'))
    } catch (error) {
      console.error('Failed to load preview:', error)
    }
  }, [])

  const openKnowledge = useCallback(async (knowledgeId: string) => {
    try {
      const opened = await openKnowledgeWithGuard(knowledgeId)
      if (opened) {
        onClose()
      }
    } catch (error) {
      console.error('Failed to load knowledge:', error)
    }
  }, [onClose, openKnowledgeWithGuard])

  const executeSearch = useCallback(async (nextQuery: string, nextType: typeof searchType) => {
    const normalizedQuery = nextQuery.trim()
    if (!normalizedQuery) {
      if (grepResults.length > 0) {
        setGrepResults([])
      }
      if (selectedMatch !== null) {
        setSelectedMatch(null)
      }
      if (previewContent) {
        setPreviewContent('')
      }
      return
    }

    setIsSearching(true)
    try {
      setSearchHistory((previous) => {
        const next = [
          { query: normalizedQuery, searchType: nextType },
          ...previous.filter((item) => !(item.query === normalizedQuery && item.searchType === nextType)),
        ].slice(0, 8)

        try {
          window.localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(next))
        } catch (error) {
          console.error('Failed to persist search history:', error)
        }

        return next
      })

      let results: GrepMatch[] = []

      if (nextType === 'tags') {
        results = await tauriService.grep('', [normalizedQuery], 100)
      } else if (nextType === 'category') {
        const matchedCategory = getMatchedCategory(normalizedQuery)
        results = matchedCategory
          ? await tauriService.grep('', undefined, 100, matchedCategory.id)
          : []
      } else {
        results = await tauriService.grep(normalizedQuery, undefined, 100)
      }

      setGrepResults(results)
      if (results.length > 0) {
        setSelectedMatch(results[0])
        void loadPreview(results[0])
      } else {
        setSelectedMatch(null)
        setPreviewContent('')
      }
    } catch (error) {
      console.error('Search failed:', error)
    } finally {
      setIsSearching(false)
    }
  }, [getMatchedCategory, grepResults.length, loadPreview, previewContent, searchType, selectedMatch, setGrepResults, setIsSearching])

  useEffect(() => {
    if (!selectedMatch) return

    const key = `${selectedMatch.id}-${selectedMatch.line_number}`
    const element = matchRefs.current.get(key)
    if (element) {
      element.scrollIntoView({ block: 'nearest' })
    }
  }, [selectedMatch])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
        return
      }

      if (grepResults.length > 0 && event.key === 'ArrowDown') {
        event.preventDefault()
        const currentIndex = selectedMatch
          ? grepResults.findIndex((match) => match.id === selectedMatch.id && match.line_number === selectedMatch.line_number)
          : -1
        const nextIndex = Math.min(currentIndex + 1, grepResults.length - 1)
        const nextMatch = grepResults[nextIndex]
        if (nextMatch) {
          setSelectedMatch(nextMatch)
          void loadPreview(nextMatch)
        }
        return
      }

      if (grepResults.length > 0 && event.key === 'ArrowUp') {
        event.preventDefault()
        const currentIndex = selectedMatch
          ? grepResults.findIndex((match) => match.id === selectedMatch.id && match.line_number === selectedMatch.line_number)
          : 0
        const nextIndex = Math.max(currentIndex - 1, 0)
        const nextMatch = grepResults[nextIndex]
        if (nextMatch) {
          setSelectedMatch(nextMatch)
          void loadPreview(nextMatch)
        }
        return
      }

      if (event.key === 'Enter' && selectedMatch) {
        event.preventDefault()
        void openKnowledge(selectedMatch.id)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [grepResults, loadPreview, onClose, openKnowledge, selectedMatch])

  useEffect(() => {
    const normalizedQuery = query.trim()
    if (!normalizedQuery) {
      if (grepResults.length > 0) {
        setGrepResults([])
      }
      if (selectedMatch !== null) {
        setSelectedMatch(null)
      }
      if (previewContent) {
        setPreviewContent('')
      }
      return
    }

    const timer = window.setTimeout(() => {
      void executeSearch(normalizedQuery, searchType)
    }, 260)

    return () => window.clearTimeout(timer)
  }, [executeSearch, grepResults.length, previewContent, query, searchType, selectedMatch, setGrepResults])

  // Group matches by knowledge id
  const groupedResults = grepResults.reduce((acc, match) => {
    if (!acc[match.id]) {
      acc[match.id] = {
        id: match.id,
        title: match.title,
        matches: []
      }
    }
    acc[match.id].matches.push(match)
    return acc
  }, {} as Record<string, { id: string; title: string; matches: GrepMatch[] }>)

  const emptyStateText = useMemo(() => {
    if (!query.trim()) return getSearchHint()
    if (isSearching) return '搜索中...'
    if (searchType === 'category' && !getMatchedCategory(query)) return '没有匹配的分类，可输入更完整的分类名。'
    if (searchType === 'tags') return '没有匹配该标签的文档。'
    if (searchType === 'category') return '该分类下暂无可展示的文档。'
    return '没有找到匹配内容，可尝试更短的关键词或 tag:xxx。'
  }, [getMatchedCategory, getSearchHint, isSearching, query, searchType])
  const previewStartLine = selectedMatch ? Math.max(1, selectedMatch.line_number - 5) : 1

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      {/* Search Top Bar - 64px */}
      <div className="h-16 flex items-center gap-4 px-6 border-b" style={{ borderColor: '#E5E5E5' }}>
        <div className="flex-1 flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg border-2" style={{ backgroundColor: '#FAFAFA', borderColor: 'var(--brand-primary)' }}>
          <Search className="h-5 w-5" style={{ color: 'var(--brand-primary)' }} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={getSearchPlaceholder()}
            className="flex-1 bg-transparent outline-none text-sm"
            autoFocus
            list={searchType === 'category' ? 'search-panel-categories' : undefined}
          />
          {searchType === 'category' && (
            <datalist id="search-panel-categories">
              {categories.map((category) => (
                <option key={category.id} value={category.name} />
              ))}
            </datalist>
          )}
        </div>
        <button
          onClick={onClose}
          className="px-3.5 py-2 border rounded-md text-sm"
          style={{ borderColor: '#E5E5E5' }}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Search Type Bar - 44px */}
      <div className="h-11 flex items-center gap-1 px-6 border-b" style={{ backgroundColor: '#FAFAFA', borderColor: '#E5E5E5' }}>
        <button
          onClick={() => setSearchType('all')}
          className="px-3.5 py-1.5 rounded-md text-xs font-medium border"
          style={{
            borderColor: searchType === 'all' ? 'var(--brand-primary)' : 'transparent',
            color: searchType === 'all' ? 'var(--brand-primary)' : '#737373',
            backgroundColor: searchType === 'all' ? 'white' : 'transparent'
          }}
        >
          全部
        </button>
        <button
          onClick={() => setSearchType('tags')}
          className="px-3.5 py-1.5 rounded-md text-xs font-medium border"
          style={{
            borderColor: searchType === 'tags' ? 'var(--brand-primary)' : 'transparent',
            color: searchType === 'tags' ? 'var(--brand-primary)' : '#737373',
            backgroundColor: searchType === 'tags' ? 'white' : 'transparent'
          }}
        >
          标签
        </button>
        <button
          onClick={() => setSearchType('category')}
          className="px-3.5 py-1.5 rounded-md text-xs font-medium border"
          style={{
            borderColor: searchType === 'category' ? 'var(--brand-primary)' : 'transparent',
            color: searchType === 'category' ? 'var(--brand-primary)' : '#737373',
            backgroundColor: searchType === 'category' ? 'white' : 'transparent'
          }}
        >
          分类
        </button>
        <div className="flex-1" />
        <span className="inline-flex items-center gap-1.5 text-[11px]" style={{ color: '#A3A3A3' }}>
          <ArrowUpDown className="h-3.5 w-3.5" />
          上下选择
          <CornerDownLeft className="h-3.5 w-3.5" />
          打开
        </span>
        <span className="text-xs" style={{ color: '#A3A3A3' }}>
          找到 {grepResults.length} 条结果（{Object.keys(groupedResults).length} 个文档）
        </span>
      </div>

      <div className="px-6 py-2 text-xs" style={{ backgroundColor: '#FCFCFD', color: '#737373', borderBottom: '1px solid #F1F5F9' }}>
        <div>{getSearchHint()}</div>
        {searchHistory.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => {
                setSearchHistory([])
                window.localStorage.removeItem(SEARCH_HISTORY_KEY)
              }}
              className="rounded-full border px-2 py-1 text-[11px]"
              style={{ borderColor: '#F1F5F9', backgroundColor: '#F8FAFC', color: '#64748B' }}
            >
              清空历史
            </button>
            {searchHistory.map((item) => (
              <button
                key={`${item.searchType}-${item.query}`}
                type="button"
                onClick={() => {
                  setSearchType(item.searchType)
                  setQuery(item.query)
                }}
                className="rounded-full border px-2 py-1 text-[11px]"
                style={{ borderColor: '#E5E7EB', backgroundColor: '#FFFFFF', color: '#525252' }}
              >
                {item.searchType === 'all' ? '全文' : item.searchType === 'tags' ? '标签' : '分类'} · {item.query}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Search Content - Split View */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left - Search Results - 680px */}
        <div className="w-[680px] overflow-y-auto border-r" style={{ borderColor: '#E5E5E5' }}>
          {grepResults.length === 0 ? (
            <div className="flex h-full items-center justify-center p-6">
              <GettingStartedCard
                compact
                title={query.trim() ? '没有找到匹配结果' : '开始搜索知识库'}
                description={emptyStateText}
              />
            </div>
          ) : (
            Object.values(groupedResults).map((group) => (
              <div key={group.id} className="border-b" style={{ borderColor: '#F5F5F5' }}>
                {/* Document Header */}
                <div
                  className="px-4 py-2 flex items-center gap-2 cursor-pointer hover:bg-gray-50"
                  onClick={() => void openKnowledge(group.id)}
                >
                  <FileText className="h-4 w-4" style={{ color: 'var(--brand-primary)' }} />
                  <span className="font-semibold text-sm">{group.title}</span>
                  <span className="text-xs" style={{ color: '#A3A3A3' }}>
                    {group.matches.length} 处匹配
                  </span>
                </div>
                {/* Match Lines */}
                {group.matches.slice(0, 3).map((match, idx) => (
                  <div
                    key={`${match.id}-${match.line_number}-${idx}`}
                    ref={(node) => {
                      const refKey = `${match.id}-${match.line_number}`
                      if (node) {
                        matchRefs.current.set(refKey, node)
                      } else {
                        matchRefs.current.delete(refKey)
                      }
                    }}
                    className={`px-4 py-2 pl-8 cursor-pointer ${selectedMatch?.id === match.id && selectedMatch?.line_number === match.line_number ? 'bg-indigo-50' : 'hover:bg-gray-50'}`}
                    onClick={() => {
                      setSelectedMatch(match)
                      void loadPreview(match)
                    }}
                    onDoubleClick={() => void openKnowledge(match.id)}
                  >
                    <div className="flex items-start gap-2">
                      <span className="text-xs font-mono" style={{ color: '#A3A3A3', minWidth: '30px' }}>
                        L{match.line_number}
                      </span>
                      <p className="text-xs flex-1" style={{ color: '#525252' }}>
                        <HighlightedText text={match.line} query={query} />
                      </p>
                    </div>
                  </div>
                ))}
                {group.matches.length > 3 && (
                  <div className="px-4 py-1 pl-8 text-xs" style={{ color: '#A3A3A3' }}>
                    还有 {group.matches.length - 3} 处匹配...
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Right - Preview */}
        <div className="flex-1 flex flex-col overflow-hidden" style={{ backgroundColor: '#FAFAFA' }}>
          {selectedMatch ? (
            <>
              <div className="px-6 py-3 border-b bg-white" style={{ borderColor: '#E5E5E5' }}>
                <h3 className="font-semibold text-sm">{selectedMatch.title}</h3>
                <p className="text-xs mt-1" style={{ color: '#737373' }}>
                  第 {selectedMatch.line_number} 行
                </p>
              </div>
              <div className="flex-1 overflow-y-auto p-6">
                <div className="bg-white rounded-lg border p-4 font-mono text-xs" style={{ borderColor: '#E5E5E5' }}>
                  <pre className="whitespace-pre-wrap break-words">
                    {previewContent.split('\n').map((line, idx) => {
                      const lineNum = previewStartLine + idx
                      const isMatchLine = lineNum === selectedMatch.line_number
                      return (
                        <div
                          key={idx}
                          className={`py-0.5 px-2 -mx-2 ${isMatchLine ? 'bg-yellow-100 rounded' : ''}`}
                        >
                          <span className="inline-block w-8 text-right mr-3" style={{ color: '#A3A3A3' }}>
                            {lineNum}
                          </span>
                          <HighlightedText text={line} query={query} />
                        </div>
                      )
                    })}
                  </pre>
                </div>
              </div>
              <div className="px-6 py-3 border-t bg-white flex justify-end gap-2" style={{ borderColor: '#E5E5E5' }}>
                <button
                  onClick={() => void openKnowledge(selectedMatch.id)}
                  className="px-4 py-2 rounded-md text-white text-xs font-medium"
                  style={{ backgroundColor: 'var(--brand-primary)' }}
                >
                  打开文档
                </button>
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-full" style={{ color: '#A3A3A3' }}>
              选择搜索结果查看预览
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
