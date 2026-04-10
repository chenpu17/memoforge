import React, { useState } from 'react'
import { tauriService, ImportStats as ImportStatsType } from '../services/tauri'
import { X, FolderOpen, FileText, Tag, AlertCircle, FileEdit, ListChecks, Eye } from 'lucide-react'
import { getImportStrategy } from '../lib/settings'

interface ImportModalProps {
  onClose: () => void
  onViewImported?: () => void
  onFillSummary?: () => void
  onFillTags?: () => void
}

export const ImportModal: React.FC<ImportModalProps> = ({ onClose, onViewImported, onFillSummary, onFillTags }) => {
  const [sourcePath, setSourcePath] = useState('')
  const [generateFrontmatter, setGenerateFrontmatter] = useState(true)
  const [autoCategories, setAutoCategories] = useState(() => getImportStrategy() === 'auto-category')
  const [isLoading, setIsLoading] = useState(false)
  const [previewStats, setPreviewStats] = useState<ImportStatsType | null>(null)
  const [importStats, setImportStats] = useState<ImportStatsType | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handlePreview = async () => {
    if (!sourcePath.trim()) return

    setIsLoading(true)
    setError(null)
    setImportStats(null)

    try {
      const stats = await tauriService.previewImport(sourcePath)
      setPreviewStats(stats)
    } catch (err) {
      setError(String(err))
    } finally {
      setIsLoading(false)
    }
  }

  const handleImport = async () => {
    if (!sourcePath.trim()) return

    setIsLoading(true)
    setError(null)

    try {
      const stats = await tauriService.importFolder(
        sourcePath,
        generateFrontmatter,
        autoCategories,
        false
      )
      setImportStats(stats)
      setPreviewStats(null)
    } catch (err) {
      setError(String(err))
    } finally {
      setIsLoading(false)
    }
  }

  const handleAction = (action: () => void) => {
    onClose()
    action()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div
        className="relative bg-white rounded-xl shadow-xl w-[600px] max-h-[80vh] overflow-hidden"
        style={{ border: '1px solid #E5E5E5' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: '#E5E5E5' }}>
          <h2 className="text-base font-semibold" style={{ color: '#0A0A0A' }}>导入 Markdown 文件夹</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100">
            <X className="h-4 w-4" style={{ color: '#737373' }} />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-4 space-y-4 overflow-y-auto max-h-[calc(80vh-140px)]">
          {/* Source Path */}
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: '#737373' }}>
              源文件夹路径
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={sourcePath}
                onChange={(e) => setSourcePath(e.target.value)}
                placeholder="例如: ~/Documents/notes 或 /path/to/markdown/files"
                className="flex-1 px-3 py-2 border rounded-md text-sm outline-none focus:border-indigo-500"
                style={{ borderColor: '#E5E5E5' }}
              />
              <button
                onClick={handlePreview}
                disabled={isLoading || !sourcePath.trim()}
                className="px-4 py-2 border rounded-md text-sm flex items-center gap-1.5 disabled:opacity-50 hover:bg-gray-50"
                style={{ borderColor: '#E5E5E5' }}
              >
                <FolderOpen className="h-4 w-4" style={{ color: '#737373' }} />
                预览
              </button>
            </div>
          </div>

          {/* Options */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={generateFrontmatter}
                onChange={(e) => setGenerateFrontmatter(e.target.checked)}
                className="rounded"
                style={{ accentColor: 'var(--brand-primary)' }}
              />
              <span className="text-sm" style={{ color: '#374151' }}>
                为无 Frontmatter 的文件自动生成
              </span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={autoCategories}
                onChange={(e) => setAutoCategories(e.target.checked)}
                className="rounded"
                style={{ accentColor: 'var(--brand-primary)' }}
              />
              <span className="text-sm" style={{ color: '#374151' }}>
                自动将顶层目录注册为分类
              </span>
            </label>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2 p-3 rounded-md" style={{ backgroundColor: '#FEF2F2', border: '1px solid #FECACA' }}>
              <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" style={{ color: '#EF4444' }} />
              <p className="text-sm" style={{ color: '#DC2626' }}>{error}</p>
            </div>
          )}

          {/* Preview Results */}
          {previewStats && !importStats && (
            <div className="rounded-lg border p-4" style={{ borderColor: '#E5E5E5', backgroundColor: '#FAFAFA' }}>
              <h3 className="font-medium text-sm mb-3">预览结果</h3>
              <div className="grid grid-cols-2 gap-3 text-sm mb-3">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4" style={{ color: 'var(--brand-primary)' }} />
                  <span>Markdown 文件: <strong>{previewStats.total_files}</strong></span>
                </div>
                <div>
                  已有 Frontmatter: <strong>{previewStats.files_with_frontmatter}</strong>
                </div>
                <div>
                  需要导入: <strong>{previewStats.files_imported}</strong>
                </div>
                <div className="flex items-center gap-2">
                  <Tag className="h-4 w-4" style={{ color: '#F59E0B' }} />
                  <span>将创建分类: <strong>{previewStats.categories_created}</strong></span>
                </div>
              </div>
              {previewStats.results.length > 0 && (
                <div className="mt-3 max-h-40 overflow-y-auto">
                  <p className="text-xs mb-2" style={{ color: '#737373' }}>文件列表:</p>
                  <ul className="text-xs space-y-1">
                    {previewStats.results.slice(0, 10).map((r, i) => (
                      <li key={i} className="flex items-center gap-2">
                        <span className={r.generated_frontmatter ? 'text-indigo-600' : 'text-gray-500'}>
                          {r.title}
                        </span>
                        {r.generated_frontmatter && (
                          <span className="px-1.5 py-0.5 rounded text-[10px]" style={{ backgroundColor: 'var(--brand-primary-soft)', color: 'var(--brand-primary)' }}>
                            新
                          </span>
                        )}
                      </li>
                    ))}
                    {previewStats.results.length > 10 && (
                      <li className="text-xs" style={{ color: '#A3A3A3' }}>... 还有 {previewStats.results.length - 10} 个文件</li>
                    )}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Import Results -- enhanced */}
          {importStats && (
            <div className="rounded-xl border p-4" style={{ borderColor: '#A7F3D0', backgroundColor: '#F0FDF4' }}>
              <h3 className="font-medium text-sm mb-3" style={{ color: '#047857' }}>导入完成</h3>
              <div className="grid grid-cols-2 gap-3 text-sm mb-4">
                <div className="rounded-lg border px-3 py-2" style={{ borderColor: '#D1FAE5', backgroundColor: '#FFFFFF' }}>
                  <div className="text-xs" style={{ color: '#737373' }}>处理文件</div>
                  <div className="text-lg font-semibold" style={{ color: '#0A0A0A' }}>{importStats.total_files}</div>
                </div>
                <div className="rounded-lg border px-3 py-2" style={{ borderColor: '#D1FAE5', backgroundColor: '#FFFFFF' }}>
                  <div className="text-xs" style={{ color: '#737373' }}>成功导入</div>
                  <div className="text-lg font-semibold" style={{ color: '#047857' }}>{importStats.files_imported}</div>
                </div>
                <div className="rounded-lg border px-3 py-2" style={{ borderColor: '#D1FAE5', backgroundColor: '#FFFFFF' }}>
                  <div className="text-xs" style={{ color: '#737373' }}>已有 Frontmatter</div>
                  <div className="text-lg font-semibold" style={{ color: '#0A0A0A' }}>{importStats.files_with_frontmatter}</div>
                </div>
                <div className="rounded-lg border px-3 py-2" style={{ borderColor: '#D1FAE5', backgroundColor: '#FFFFFF' }}>
                  <div className="text-xs" style={{ color: '#737373' }}>创建分类</div>
                  <div className="text-lg font-semibold" style={{ color: '#B45309' }}>{importStats.categories_created}</div>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex flex-wrap gap-2">
                {onViewImported && (
                  <button
                    onClick={() => handleAction(onViewImported)}
                    className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium"
                    style={{ backgroundColor: 'var(--brand-primary-soft)', color: 'var(--brand-primary-strong)' }}
                  >
                    <Eye className="h-3.5 w-3.5" />
                    查看新导入文档
                  </button>
                )}
                {onFillSummary && (
                  <button
                    onClick={() => handleAction(onFillSummary)}
                    className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium"
                    style={{ backgroundColor: '#FEF3C7', color: '#B45309' }}
                  >
                    <FileEdit className="h-3.5 w-3.5" />
                    去补摘要
                  </button>
                )}
                {onFillTags && (
                  <button
                    onClick={() => handleAction(onFillTags)}
                    className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium"
                    style={{ backgroundColor: 'var(--brand-primary-soft)', color: 'var(--brand-primary)' }}
                  >
                    <ListChecks className="h-3.5 w-3.5" />
                    去补标签
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-6 py-3 border-t" style={{ borderColor: '#E5E5E5' }}>
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-sm rounded-lg border"
            style={{ borderColor: '#E5E5E5', color: '#525252' }}
          >
            {importStats ? '关闭' : '取消'}
          </button>
          {!importStats && (
            <button
              onClick={handleImport}
              disabled={isLoading || !sourcePath.trim()}
              className="px-4 py-1.5 rounded-lg text-white text-sm font-medium disabled:opacity-50"
              style={{ backgroundColor: 'var(--brand-primary)' }}
            >
              {isLoading ? '导入中...' : '开始导入'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
