import React, { useState, useEffect } from 'react'
import { tauriService, RelatedKnowledge } from '../services/tauri'
import { useAppStore } from '../stores/appStore'
import { Link2, ArrowRight, ArrowLeft, Tags, ChevronDown, ChevronRight } from 'lucide-react'

export const BacklinksPanel: React.FC = () => {
  const { currentKnowledge, setCurrentKnowledge } = useAppStore()
  const [related, setRelated] = useState<RelatedKnowledge[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['incoming', 'outgoing', 'shared']))

  useEffect(() => {
    if (currentKnowledge?.id) {
      loadLinks()
    }
  }, [currentKnowledge?.id])

  const loadLinks = async () => {
    if (!currentKnowledge?.id) return

    setIsLoading(true)
    try {
      const relatedResult = await tauriService.getRelated(currentKnowledge.id)
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

  // 分类相关知识
  const outgoingLinks = related.filter(r => r.relation_type === 'Outgoing')
  const incomingLinks = related.filter(r => r.relation_type === 'Incoming')
  const sharedTagLinks = related.filter(r => r.relation_type === 'SharedTags')

  if (!currentKnowledge) {
    return null
  }

  return (
    <div className="border-t" style={{ borderColor: '#E5E5E5' }}>
      {/* 标题 */}
      <div className="px-3 py-2 flex items-center gap-2 border-b" style={{ backgroundColor: '#FAFAFA', borderColor: '#E5E5E5' }}>
        <Link2 className="h-4 w-4" style={{ color: '#6366F1' }} />
        <span className="text-xs font-medium" style={{ color: '#0A0A0A' }}>链接关系</span>
      </div>

      {isLoading ? (
        <div className="px-3 py-4 text-center text-xs" style={{ color: '#A3A3A3' }}>
          加载中...
        </div>
      ) : (
        <div className="max-h-48 overflow-y-auto">
          {/* 被引用 (Incoming) */}
          {incomingLinks.length > 0 && (
            <div>
              <div
                className="px-3 py-2 flex items-center gap-2 cursor-pointer hover:bg-gray-50"
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
                <div className="px-3 pb-2">
                  {incomingLinks.map((link) => (
                    <div
                      key={link.id}
                      className="py-1.5 px-2 mb-1 rounded cursor-pointer hover:bg-gray-100"
                      onClick={async () => {
                        try {
                          const knowledge = await tauriService.getKnowledge(link.id, 2)
                          setCurrentKnowledge(knowledge)
                        } catch (error) {
                          console.error('Failed to load knowledge:', error)
                        }
                      }}
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
            <div>
              <div
                className="px-3 py-2 flex items-center gap-2 cursor-pointer hover:bg-gray-50"
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
                <div className="px-3 pb-2">
                  {outgoingLinks.map((link) => (
                    <div
                      key={link.id}
                      className="py-1.5 px-2 mb-1 rounded cursor-pointer hover:bg-gray-100"
                      onClick={async () => {
                        try {
                          const knowledge = await tauriService.getKnowledge(link.id, 2)
                          setCurrentKnowledge(knowledge)
                        } catch (error) {
                          console.error('Failed to load knowledge:', error)
                        }
                      }}
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
            <div>
              <div
                className="px-3 py-2 flex items-center gap-2 cursor-pointer hover:bg-gray-50"
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
                <div className="px-3 pb-2">
                  {sharedTagLinks.map((link) => (
                    <div
                      key={link.id}
                      className="py-1.5 px-2 mb-1 rounded cursor-pointer hover:bg-gray-100"
                      onClick={async () => {
                        try {
                          const knowledge = await tauriService.getKnowledge(link.id, 2)
                          setCurrentKnowledge(knowledge)
                        } catch (error) {
                          console.error('Failed to load knowledge:', error)
                        }
                      }}
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
            <div className="px-3 py-4 text-center text-xs" style={{ color: '#A3A3A3' }}>
              暂无链接关系
            </div>
          )}
        </div>
      )}
    </div>
  )
}
