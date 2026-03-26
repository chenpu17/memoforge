import React, { useState } from 'react'
import { tauriService } from '../services/tauri'
import { X, FolderOpen, FileText, Tag, AlertCircle } from 'lucide-react'

interface ImportStats {
  total_files: number
  files_with_frontmatter: number
  files_imported: number
  categories_created: number
  results: Array<{
    path: string
    title: string
    had_frontmatter: boolean
    generated_frontmatter: boolean
  }>
}

export const ImportModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [sourcePath, setSourcePath] = useState('')
  const [generateFrontmatter, setGenerateFrontmatter] = useState(true)
  const [autoCategories, setAutoCategories] = useState(true)
  const [isLoading, setIsLoading] = useState(false)
  const [previewStats, setPreviewStats] = useState<ImportStats | null>(null)
  const [importStats, setImportStats] = useState<ImportStats | null>(null)
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
        false // dry_run = false
      )
      setImportStats(stats)
      setPreviewStats(null)
    } catch (err) {
      setError(String(err))
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white rounded-lg shadow-xl w-[600px] max-h-[80vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: '#E5E5E5' }}>
          <h2 className="text-lg font-semibold">导入 Markdown 文件夹</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X className="h-5 w-5" style={{ color: '#737373' }} />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-4 space-y-4 overflow-y-auto max-h-[calc(80vh-140px)]">
          {/* Source Path */}
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: '#374151' }}>
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
                className="px-4 py-2 border rounded-md text-sm flex items-center gap-1.5 disabled:opacity-50"
                style={{ borderColor: '#E5E5E5' }}
              >
                <FolderOpen className="h-4 w-4" />
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
              />
              <span className="text-sm" style={{ color: '#374151' }}>
                自动将顶层目录注册为分类
              </span>
            </label>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2 p-3 rounded-md bg-red-50 border border-red-200">
              <AlertCircle className="h-5 w-5 flex-shrink-0" style={{ color: '#EF4444' }} />
              <p className="text-sm" style={{ color: '#DC2626' }}>{error}</p>
            </div>
          )}

          {/* Preview Results */}
          {previewStats && !importStats && (
            <div className="border rounded-lg p-4" style={{ borderColor: '#E5E5E5', backgroundColor: '#FAFAFA' }}>
              <h3 className="font-medium text-sm mb-3">预览结果</h3>
              <div className="grid grid-cols-2 gap-3 text-sm mb-3">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4" style={{ color: '#6366F1' }} />
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
                          <span className="px-1.5 py-0.5 bg-indigo-100 text-indigo-600 rounded text-[10px]">
                            新
                          </span>
                        )}
                      </li>
                    ))}
                    {previewStats.results.length > 10 && (
                      <li className="text-gray-400">... 还有 {previewStats.results.length - 10} 个文件</li>
                    )}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Import Results */}
          {importStats && (
            <div className="border rounded-lg p-4" style={{ borderColor: '#22C55E', backgroundColor: '#F0FDF4' }}>
              <h3 className="font-medium text-sm mb-3 text-green-700">导入完成</h3>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>处理文件: <strong>{importStats.total_files}</strong></div>
                <div>生成 Frontmatter: <strong>{importStats.files_imported}</strong></div>
                <div>已有 Frontmatter: <strong>{importStats.files_with_frontmatter}</strong></div>
                <div>创建分类: <strong>{importStats.categories_created}</strong></div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-6 py-4 border-t" style={{ borderColor: '#E5E5E5' }}>
          <button
            onClick={onClose}
            className="px-4 py-2 border rounded-md text-sm"
            style={{ borderColor: '#E5E5E5' }}
          >
            {importStats ? '关闭' : '取消'}
          </button>
          {!importStats && (
            <button
              onClick={handleImport}
              disabled={isLoading || !sourcePath.trim()}
              className="px-4 py-2 rounded-md text-white text-sm font-medium disabled:opacity-50"
              style={{ backgroundColor: '#6366F1' }}
            >
              {isLoading ? '导入中...' : '开始导入'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
