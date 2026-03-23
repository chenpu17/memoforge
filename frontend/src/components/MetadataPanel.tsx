import React from 'react'
import { Input } from './ui/Input'
// import { Button } from './ui/Button'
import { useAppStore } from '../stores/appStore'
import { X } from 'lucide-react'

export const MetadataPanel: React.FC = () => {
  const { currentKnowledge, setCurrentKnowledge } = useAppStore()

  if (!currentKnowledge) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        选择或创建知识以查看元数据
      </div>
    )
  }

  const updateField = (field: keyof typeof currentKnowledge, value: any) => {
    setCurrentKnowledge({ ...currentKnowledge, [field]: value })
  }

  const addTag = (tag: string) => {
    if (tag && !currentKnowledge.tags.includes(tag)) {
      updateField('tags', [...currentKnowledge.tags, tag])
    }
  }

  const removeTag = (tag: string) => {
    updateField('tags', currentKnowledge.tags.filter(t => t !== tag))
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <label className="text-sm font-medium mb-2 block">标题</label>
        <Input
          value={currentKnowledge.title}
          onChange={(e) => updateField('title', e.target.value)}
          placeholder="输入标题"
        />
      </div>

      <div>
        <label className="text-sm font-medium mb-2 block">分类</label>
        <Input
          value={currentKnowledge.category}
          onChange={(e) => updateField('category', e.target.value)}
          placeholder="输入分类"
        />
      </div>

      <div>
        <label className="text-sm font-medium mb-2 block">标签</label>
        <div className="flex flex-wrap gap-2 mb-2">
          {currentKnowledge.tags.map(tag => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 px-2 py-1 bg-secondary rounded text-sm"
            >
              {tag}
              <button onClick={() => removeTag(tag)} className="hover:text-destructive">
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
        <Input
          placeholder="添加标签后按回车"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              addTag(e.currentTarget.value)
              e.currentTarget.value = ''
            }
          }}
        />
      </div>

      <div>
        <label className="text-sm font-medium mb-2 block">摘要</label>
        <textarea
          className="w-full min-h-[100px] rounded-lg border border-input bg-background px-3 py-2 text-sm"
          value={currentKnowledge.summary || ''}
          onChange={(e) => updateField('summary', e.target.value)}
          placeholder="输入摘要"
        />
      </div>
    </div>
  )
}
