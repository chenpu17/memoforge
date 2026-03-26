import React, { useState } from 'react'
import { useAppStore } from '../stores/appStore'
import { tauriService } from '../services/tauri'
import { Search, X, FileText } from 'lucide-react'
import type { GrepMatch } from '../types'

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
        regex.test(part) ? (
          <mark key={i} className="bg-yellow-200 px-0.5 rounded">{part}</mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </span>
  )
}

export const SearchPanel: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [query, setQuery] = useState('')
  const [searchType, setSearchType] = useState<'all' | 'tags' | 'category'>('all')
  const { grepResults, setGrepResults, setIsSearching, setCurrentKnowledge } = useAppStore()
  const [selectedMatch, setSelectedMatch] = useState<GrepMatch | null>(null)
  const [previewContent, setPreviewContent] = useState<string>('')

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const handleSearch = async () => {
    if (!query.trim()) return

    setIsSearching(true)
    try {
      // The backend will parse tag:xxx from query
      const results = await tauriService.grep(query, undefined, 100)
      setGrepResults(results)
      if (results.length > 0) {
        setSelectedMatch(results[0])
        loadPreview(results[0])
      }
    } catch (error) {
      console.error('Search failed:', error)
    } finally {
      setIsSearching(false)
    }
  }

  const loadPreview = async (match: GrepMatch) => {
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
  }

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

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      {/* Search Top Bar - 64px */}
      <div className="h-16 flex items-center gap-4 px-6 border-b" style={{ borderColor: '#E5E5E5' }}>
        <div className="flex-1 flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg border-2" style={{ backgroundColor: '#FAFAFA', borderColor: '#6366F1' }}>
          <Search className="h-5 w-5" style={{ color: '#6366F1' }} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="搜索知识... (使用 tag:rust 过滤标签)"
            className="flex-1 bg-transparent outline-none text-sm"
            autoFocus
          />
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
            borderColor: searchType === 'all' ? '#6366F1' : 'transparent',
            color: searchType === 'all' ? '#6366F1' : '#737373',
            backgroundColor: searchType === 'all' ? 'white' : 'transparent'
          }}
        >
          全部
        </button>
        <button
          onClick={() => setSearchType('tags')}
          className="px-3.5 py-1.5 rounded-md text-xs font-medium border"
          style={{
            borderColor: searchType === 'tags' ? '#6366F1' : 'transparent',
            color: searchType === 'tags' ? '#6366F1' : '#737373',
            backgroundColor: searchType === 'tags' ? 'white' : 'transparent'
          }}
        >
          标签
        </button>
        <button
          onClick={() => setSearchType('category')}
          className="px-3.5 py-1.5 rounded-md text-xs font-medium border"
          style={{
            borderColor: searchType === 'category' ? '#6366F1' : 'transparent',
            color: searchType === 'category' ? '#6366F1' : '#737373',
            backgroundColor: searchType === 'category' ? 'white' : 'transparent'
          }}
        >
          分类
        </button>
        <div className="flex-1" />
        <span className="text-xs" style={{ color: '#A3A3A3' }}>
          找到 {grepResults.length} 条结果（{Object.keys(groupedResults).length} 个文档）
        </span>
      </div>

      {/* Search Content - Split View */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left - Search Results - 680px */}
        <div className="w-[680px] overflow-y-auto border-r" style={{ borderColor: '#E5E5E5' }}>
          {grepResults.length === 0 ? (
            <div className="flex items-center justify-center h-full" style={{ color: '#A3A3A3' }}>
              输入关键词开始搜索
            </div>
          ) : (
            Object.values(groupedResults).map((group) => (
              <div key={group.id} className="border-b" style={{ borderColor: '#F5F5F5' }}>
                {/* Document Header */}
                <div
                  className="px-4 py-2 flex items-center gap-2 cursor-pointer hover:bg-gray-50"
                  onClick={async () => {
                    try {
                      const fullKnowledge = await tauriService.getKnowledge(group.id, 2)
                      setCurrentKnowledge(fullKnowledge)
                      onClose()
                    } catch (error) {
                      console.error('Failed to load knowledge:', error)
                    }
                  }}
                >
                  <FileText className="h-4 w-4" style={{ color: '#6366F1' }} />
                  <span className="font-semibold text-sm">{group.title}</span>
                  <span className="text-xs" style={{ color: '#A3A3A3' }}>
                    {group.matches.length} 处匹配
                  </span>
                </div>
                {/* Match Lines */}
                {group.matches.slice(0, 3).map((match, idx) => (
                  <div
                    key={`${match.id}-${match.line_number}-${idx}`}
                    className={`px-4 py-2 pl-8 cursor-pointer ${selectedMatch?.id === match.id && selectedMatch?.line_number === match.line_number ? 'bg-indigo-50' : 'hover:bg-gray-50'}`}
                    onClick={async () => {
                      setSelectedMatch(match)
                      loadPreview(match)
                    }}
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
                      const lineNum = selectedMatch.line_number - 5 + idx
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
                  onClick={async () => {
                    try {
                      const fullKnowledge = await tauriService.getKnowledge(selectedMatch.id, 2)
                      setCurrentKnowledge(fullKnowledge)
                      onClose()
                    } catch (error) {
                      console.error('Failed to load knowledge:', error)
                    }
                  }}
                  className="px-4 py-2 rounded-md text-white text-xs font-medium"
                  style={{ backgroundColor: '#6366F1' }}
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
