import React, { useState } from 'react'
import { X, Plus } from 'lucide-react'
import { useAppStore } from '../stores/appStore'
import { tauriService } from '../services/tauri'

interface NewKnowledgeModalProps {
  onClose: () => void
}

export const NewKnowledgeModal: React.FC<NewKnowledgeModalProps> = ({ onClose }) => {
  const [step, setStep] = useState(1)
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState('')
  const { setCurrentKnowledge, setKnowledgeList } = useAppStore()

  const handleCreate = async () => {
    try {
      const newKnowledge = {
        id: '',
        title,
        content: '',
        category: category || undefined,
        tags,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      const createdId = await tauriService.createKnowledge(newKnowledge)
      const fullKnowledge = await tauriService.getKnowledge(createdId, 2)
      setCurrentKnowledge(fullKnowledge)

      const knowledgeList = await tauriService.listKnowledge(1)
      setKnowledgeList(knowledgeList.items)

      onClose()
    } catch (error) {
      console.error('Failed to create knowledge:', error)
    }
  }

  const addTag = () => {
    if (tagInput && !tags.includes(tagInput)) {
      setTags([...tags, tagInput])
      setTagInput('')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.25)' }}>
      <div className="w-[560px] rounded-xl bg-white" style={{ boxShadow: '0 20px 60px rgba(0,0,0,0.1)' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b" style={{ borderColor: '#F5F5F5' }}>
          <div>
            <h2 className="text-base font-semibold">新建知识</h2>
            <p className="text-xs mt-0.5" style={{ color: '#A3A3A3' }}>创建一个新的知识条目</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md border hover:bg-gray-50" style={{ borderColor: '#E5E5E5' }}>
            <X className="h-4 w-4" style={{ color: '#737373' }} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5">
          {/* Step Indicator */}
          <div className="flex items-center justify-center gap-2">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium ${step >= 1 ? 'text-white' : ''}`} style={{ backgroundColor: step >= 1 ? '#6366F1' : '#E5E5E5' }}>
              1
            </div>
            <div className="w-12 h-0.5" style={{ backgroundColor: step >= 2 ? '#6366F1' : '#E5E5E5' }} />
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium ${step >= 2 ? 'text-white' : ''}`} style={{ backgroundColor: step >= 2 ? '#6366F1' : '#E5E5E5', color: step < 2 ? '#A3A3A3' : '' }}>
              2
            </div>
          </div>

          {/* Step Labels */}
          <div className="flex justify-center gap-16 text-xs">
            <span style={{ color: step >= 1 ? '#6366F1' : '#A3A3A3' }}>基本信息</span>
            <span style={{ color: step >= 2 ? '#6366F1' : '#A3A3A3' }}>分类标签</span>
          </div>

          {/* Form */}
          {step === 1 ? (
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium mb-1.5 block" style={{ color: '#737373' }}>标题 *</label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="输入知识标题"
                  className="w-full px-3 py-2 text-sm border rounded-md outline-none focus:border-indigo-500"
                  style={{ borderColor: '#E5E5E5' }}
                  autoFocus
                />
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium mb-1.5 block" style={{ color: '#737373' }}>分类</label>
                <input
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="输入分类名称"
                  className="w-full px-3 py-2 text-sm border rounded-md outline-none focus:border-indigo-500"
                  style={{ borderColor: '#E5E5E5' }}
                />
              </div>
              <div>
                <label className="text-xs font-medium mb-1.5 block" style={{ color: '#737373' }}>标签</label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {tags.map(tag => (
                    <span key={tag} className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs" style={{ backgroundColor: '#EEF2FF', color: '#6366F1' }}>
                      {tag}
                      <button onClick={() => setTags(tags.filter(t => t !== tag))}>
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addTag()}
                    placeholder="输入标签"
                    className="flex-1 px-3 py-2 text-sm border rounded-md outline-none focus:border-indigo-500"
                    style={{ borderColor: '#E5E5E5' }}
                  />
                  <button onClick={addTag} className="px-3 py-2 rounded-md border" style={{ borderColor: '#E5E5E5' }}>
                    <Plus className="h-4 w-4" style={{ color: '#737373' }} />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t" style={{ borderColor: '#F5F5F5' }}>
          <div className="text-xs" style={{ color: '#A3A3A3' }}>
            {step === 1 ? '第 1 步，共 2 步' : '第 2 步，共 2 步'}
          </div>
          <div className="flex gap-2">
            {step === 2 && (
              <button onClick={() => setStep(1)} className="px-5 py-2 text-sm rounded-lg border" style={{ borderColor: '#E5E5E5' }}>
                上一步
              </button>
            )}
            <button
              onClick={() => step === 1 ? setStep(2) : handleCreate()}
              disabled={step === 1 && !title.trim()}
              className="px-5 py-2 text-sm rounded-lg text-white font-medium disabled:opacity-50"
              style={{ backgroundColor: '#6366F1' }}
            >
              {step === 1 ? '下一步' : '创建'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
