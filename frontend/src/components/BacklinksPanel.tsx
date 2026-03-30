import React, { useState, useEffect } from 'react'
import { tauriService, RelatedKnowledge } from '../services/tauri'
import { useAppStore } from '../stores/appStore'
import { ArrowRight, ArrowLeft, Tags, ChevronDown, ChevronRight } from 'lucide-react'
import { useKnowledgeNavigation } from '../hooks/useKnowledgeNavigation'

export const BacklinksPanel: React.FC = () => {
  const currentKnowledgeId = useAppStore((state) => state.currentKnowledge?.id ?? null)
  const { openKnowledgeWithStale } = useKnowledgeNavigation()
  const [related, setRelated] = useState<RelatedKnowledge[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['incoming', 'outgoing', 'shared']))

  useEffect(() => {
    if (currentKnowledgeId) {
      loadLinks()
    }
  }, [currentKnowledgeId])

  const loadLinks = async () => {
    if (!currentKnowledgeId) return

    setIsLoading(true)
    try {
      const relatedResult = await tauriService.getRelated(currentKnowledgeId)
      setRelated(relatedResult.related)
    } catch (error) {
      console.error('Failed to load links:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const toggleSection = (section: string) => {
    const newExpanded = new Set(expandedSections)
    if (newExpanded.has(section)) {
      newExpanded.delete(section)
    } else {
      newExpanded.add(section)
    }
    setExpandedSections(newExpanded)
  }

  const handleOpenKnowledge = async (knowledgeId: string) => {
    try {
      await openKnowledgeWithStale(knowledgeId)
    } catch (error) {
      console.error('Failed to load knowledge:', error)
    }
  }

  // 分类相关知识
  const outgoingLinks = related.filter(r => r.relation_type === 'Outgoing')
  const incomingLinks = related.filter(r => r.relation_type === 'Incoming')
  const sharedTagLinks = related.filter(r => r.relation_type === 'SharedTags')

  if (!currentKnowledgeId) {
    return (
      <div className="side-panel-body">
        <div className="side-panel-empty">
          选择知识后查看链接关系
        </div>
      </div>
    )
  }

  return (
    <div className="side-panel-body">
      <div className="side-panel-card overflow-hidden">
        {isLoading ? (
          <div className="px-3 py-4 text-center text-xs" style={{ color: '#A3A3A3' }}>
            加载中...
          </div>
        ) : (
          <div>
            {related.length > 0 && (
              <div className="side-panel-section">
                <div className="side-panel-heading">关系概览</div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-md bg-[#ECFDF5] px-2.5 py-2 text-center">
                    <div className="text-[10px]" style={{ color: '#047857' }}>被引用</div>
                    <div className="mt-1 text-sm font-semibold" style={{ color: '#065F46' }}>
                      {incomingLinks.length}
                    </div>
                  </div>
                  <div className="rounded-md bg-[#EEF2FF] px-2.5 py-2 text-center">
                    <div className="text-[10px]" style={{ color: '#4338CA' }}>链接到</div>
                    <div className="mt-1 text-sm font-semibold" style={{ color: '#3730A3' }}>
                      {outgoingLinks.length}
                    </div>
                  </div>
                  <div className="rounded-md bg-[#FFFBEB] px-2.5 py-2 text-center">
                    <div className="text-[10px]" style={{ color: '#B45309' }}>共享标签</div>
                    <div className="mt-1 text-sm font-semibold" style={{ color: '#92400E' }}>
                      {sharedTagLinks.length}
                    </div>
                  </div>
                </div>
              </div>
            )}

          {/* 被引用 (Incoming) */}
          {incomingLinks.length > 0 && (
            <div className="side-panel-section">
              <div
                className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 -mx-1 px-1 py-1 rounded-md"
                onClick={() => toggleSection('incoming')}
              >
                {expandedSections.has('incoming') ? (
                  <ChevronDown className="h-3 w-3" style={{ color: '#737373' }} />
                ) : (
                  <ChevronRight className="h-3 w-3" style={{ color: '#737373' }} />
                )}
                <ArrowLeft className="h-3 w-3" style={{ color: '#10B981' }} />
                <span className="text-xs" style={{ color: '#0A0A0A' }}>被引用</span>
                <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ backgroundColor: '#D1FAE5', color: '#065F46' }}>
                  {incomingLinks.length}
                </span>
              </div>
              {expandedSections.has('incoming') && (
                <div className="pt-2">
                  {incomingLinks.map((link) => (
                    <div
                      key={link.id}
                      className="mb-1 rounded-md px-2 py-1.5 cursor-pointer hover:bg-gray-100"
                      onClick={() => void handleOpenKnowledge(link.id)}
                    >
                      <span className="text-xs truncate block" style={{ color: '#374151' }}>{link.title}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 链接到 (Outgoing) */}
          {outgoingLinks.length > 0 && (
            <div className="side-panel-section">
              <div
                className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 -mx-1 px-1 py-1 rounded-md"
                onClick={() => toggleSection('outgoing')}
              >
                {expandedSections.has('outgoing') ? (
                  <ChevronDown className="h-3 w-3" style={{ color: '#737373' }} />
                ) : (
                  <ChevronRight className="h-3 w-3" style={{ color: '#737373' }} />
                )}
                <ArrowRight className="h-3 w-3" style={{ color: '#6366F1' }} />
                <span className="text-xs" style={{ color: '#0A0A0A' }}>链接到</span>
                <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ backgroundColor: '#EEF2FF', color: '#3730A3' }}>
                  {outgoingLinks.length}
                </span>
              </div>
              {expandedSections.has('outgoing') && (
                <div className="pt-2">
                  {outgoingLinks.map((link) => (
                    <div
                      key={link.id}
                      className="mb-1 rounded-md px-2 py-1.5 cursor-pointer hover:bg-gray-100"
                      onClick={() => void handleOpenKnowledge(link.id)}
                    >
                      <span className="text-xs truncate block" style={{ color: '#374151' }}>{link.title}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 共享标签 */}
          {sharedTagLinks.length > 0 && (
            <div className="side-panel-section">
              <div
                className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 -mx-1 px-1 py-1 rounded-md"
                onClick={() => toggleSection('shared')}
              >
                {expandedSections.has('shared') ? (
                  <ChevronDown className="h-3 w-3" style={{ color: '#737373' }} />
                ) : (
                  <ChevronRight className="h-3 w-3" style={{ color: '#737373' }} />
                )}
                <Tags className="h-3 w-3" style={{ color: '#F59E0B' }} />
                <span className="text-xs" style={{ color: '#0A0A0A' }}>共享标签</span>
                <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ backgroundColor: '#FEF3C7', color: '#92400E' }}>
                  {sharedTagLinks.length}
                </span>
              </div>
              {expandedSections.has('shared') && (
                <div className="pt-2">
                  {sharedTagLinks.map((link) => (
                    <div
                      key={link.id}
                      className="mb-1 rounded-md px-2 py-1.5 cursor-pointer hover:bg-gray-100"
                      onClick={() => void handleOpenKnowledge(link.id)}
                    >
                      <span className="text-xs truncate block" style={{ color: '#374151' }}>{link.title}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 无链接 */}
          {related.length === 0 && (
            <div className="side-panel-section">
              <div className="side-panel-empty">
                暂无链接关系
              </div>
            </div>
          )}
          </div>
        )}
      </div>
    </div>
  )
}
