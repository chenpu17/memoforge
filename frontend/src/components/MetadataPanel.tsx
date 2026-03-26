import React from 'react'
import { useAppStore } from '../stores/appStore'
import { X, AlertTriangle } from 'lucide-react'

interface MetadataPanelProps {
  readonly?: boolean
}

export const MetadataPanel: React.FC<MetadataPanelProps> = ({ readonly = false }) => {
  const { currentKnowledge, setCurrentKnowledge } = useAppStore()

  if (!currentKnowledge) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground p-4 text-center text-sm" style={{ color: '#A3A3A3' }}>
        选择或创建知识以查看元数据
      </div>
    )
  }

  const updateField = (field: keyof typeof currentKnowledge, value: any) => {
    if (readonly) return
    setCurrentKnowledge({ ...currentKnowledge, [field]: value })
  }

  const addTag = (tag: string) => {
    if (readonly) return
    if (tag && !currentKnowledge.tags.includes(tag)) {
      updateField('tags', [...currentKnowledge.tags, tag])
    }
  }

  const removeTag = (tag: string) => {
    if (readonly) return
    updateField('tags', currentKnowledge.tags.filter(t => t !== tag))
  }

  return (
    <div className="p-4 space-y-4 h-full overflow-y-auto">
      <div>
        <label className="text-xs font-medium mb-1.5 block" style={{ color: '#737373' }}>标题</label>
        <input
          value={currentKnowledge.title}
          onChange={(e) => updateField('title', e.target.value)}
          placeholder="输入标题"
          disabled={readonly}
          className="w-full px-3 py-2 text-sm border rounded-md outline-none focus:border-indigo-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
          style={{ borderColor: '#E5E5E5' }}
        />
      </div>

      <div>
        <label className="text-xs font-medium mb-1.5 block" style={{ color: '#737373' }}>分类</label>
        <input
          value={currentKnowledge.category || ''}
          onChange={(e) => updateField('category', e.target.value)}
          placeholder="输入分类"
          disabled={readonly}
          className="w-full px-3 py-2 text-sm border rounded-md outline-none focus:border-indigo-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
          style={{ borderColor: '#E5E5E5' }}
        />
      </div>

      <div>
        <label className="text-xs font-medium mb-1.5 block" style={{ color: '#737373' }}>标签</label>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {currentKnowledge.tags.map(tag => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs"
              style={{ backgroundColor: '#EEF2FF', color: '#6366F1' }}
            >
              {tag}
              {!readonly && (
                <button onClick={() => removeTag(tag)} className="hover:opacity-70">
                  <X className="h-3 w-3" />
                </button>
              )}
            </span>
          ))}
        </div>
        {!readonly && (
          <input
            placeholder="添加标签后按回车"
            className="w-full px-3 py-2 text-sm border rounded-md outline-none focus:border-indigo-500"
            style={{ borderColor: '#E5E5E5' }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                const tag = e.currentTarget.value.trim()
                if (tag && !currentKnowledge.tags.includes(tag)) {
                  addTag(tag)
                }
                e.currentTarget.value = ''
              }
            }}
          />
        )}
      </div>

      <div>
        <label className="text-xs font-medium mb-1.5 block" style={{ color: '#737373' }}>摘要</label>
        {!!currentKnowledge.summary_stale && (
          <div
            className="flex items-center gap-2 px-3 py-2 mb-2 rounded-md text-sm"
            style={{ backgroundColor: '#FEF3C7', color: '#92400E' }}
          >
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
            <span>摘要已过期，内容在上次生成摘要后已更新</span>
          </div>
        )}
        <textarea
          className="w-full min-h-[100px] px-3 py-2 text-sm border rounded-md outline-none focus:border-indigo-500 resize-none disabled:bg-gray-100 disabled:cursor-not-allowed"
          style={{ borderColor: '#E5E5E5' }}
          value={currentKnowledge.summary || ''}
          onChange={(e) => updateField('summary', e.target.value)}
          placeholder="输入摘要"
          disabled={readonly}
        />
      </div>
    </div>
  )
}
