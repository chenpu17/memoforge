import React, { useEffect, useState } from 'react'
import { tauriService, TemplateInfo, getErrorMessage } from '../services/tauri'
import { FolderOpen, Check } from 'lucide-react'

interface TemplatePickerProps {
  onSelect: (templateId: string) => void
  onCancel: () => void
}

const TEMPLATE_ICONS: Record<string, { icon: string; color: string; bg: string }> = {
  'developer-kb': { icon: '💻', color: 'var(--brand-primary-strong)', bg: 'var(--brand-primary-soft)' },
  'project-retrospective': { icon: '🔄', color: '#B45309', bg: '#FEF3C7' },
  'tech-reading': { icon: '📖', color: '#047857', bg: '#ECFDF5' },
}

export const TemplatePicker: React.FC<TemplatePickerProps> = ({ onSelect, onCancel }) => {
  const [templates, setTemplates] = useState<TemplateInfo[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadTemplates()
  }, [])

  const loadTemplates = async () => {
    try {
      const list = await tauriService.listTemplates()
      setTemplates(list)
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }

  const handleSelect = async () => {
    if (!selectedId) return
    setIsLoading(true)
    setError(null)
    try {
      onSelect(selectedId)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-medium mb-1" style={{ color: '#0A0A0A' }}>选择模板</h3>
        <p className="text-xs" style={{ color: '#737373' }}>模板会预置分类目录和示例配置</p>
      </div>

      {error && (
        <div
          className="rounded-md border px-3 py-2 text-sm"
          style={{ borderColor: '#FECACA', backgroundColor: '#FEF2F2', color: '#991B1B' }}
        >
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3">
        {templates.map((template) => {
          const style = TEMPLATE_ICONS[template.id] ?? { icon: '📄', color: 'var(--brand-primary)', bg: '#F5F5F5' }
          const isSelected = selectedId === template.id

          return (
            <button
              key={template.id}
              onClick={() => setSelectedId(template.id)}
              className="w-full text-left rounded-xl border p-4 transition-all"
              style={{
                borderColor: isSelected ? 'var(--brand-primary)' : '#E5E5E5',
                backgroundColor: isSelected ? 'var(--brand-primary-surface)' : '#FFFFFF',
                boxShadow: isSelected ? '0 0 0 1px var(--brand-primary)' : 'none',
              }}
            >
              <div className="flex items-start gap-3">
                <div
                  className="flex h-10 w-10 items-center justify-center rounded-lg text-lg flex-shrink-0"
                  style={{ backgroundColor: style.bg }}
                >
                  {style.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium" style={{ color: '#0A0A0A' }}>
                      {template.name}
                    </span>
                    {isSelected && <Check className="h-4 w-4 flex-shrink-0" style={{ color: 'var(--brand-primary)' }} />}
                  </div>
                  <p className="mt-0.5 text-xs" style={{ color: '#737373' }}>
                    {template.description}
                  </p>
                  {template.categories.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {template.categories.map((cat) => (
                        <span
                          key={cat.path}
                          className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px]"
                          style={{ backgroundColor: style.bg, color: style.color }}
                        >
                          <FolderOpen className="h-3 w-3" />
                          {cat.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </button>
          )
        })}
      </div>

      <div className="flex items-center justify-between pt-2">
        <button
          onClick={onCancel}
          className="px-4 py-2 text-sm rounded-lg border"
          style={{ borderColor: '#E5E5E5', color: '#525252' }}
        >
          返回
        </button>
        <button
          onClick={handleSelect}
          disabled={!selectedId || isLoading}
          className="px-5 py-2 text-sm rounded-lg text-white font-medium disabled:opacity-50"
          style={{ backgroundColor: 'var(--brand-primary)' }}
        >
          使用此模板
        </button>
      </div>
    </div>
  )
}
