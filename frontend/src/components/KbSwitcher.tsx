import React, { useState, useEffect, useCallback } from 'react'
import { tauriService, KnowledgeBaseInfo, KbHealth, getErrorMessage } from '../services/tauri'
import { X, Database, Check, FolderOpen, Trash2, Clock, AlertTriangle, CheckCircle2 } from 'lucide-react'

interface KbSwitcherProps {
  onClose: () => void
  onSwitch: (path: string) => void
}

interface KbWithHealth extends KnowledgeBaseInfo {
  health?: KbHealth
  healthLoading?: boolean
}

function HealthBadge({ health, loading }: { health?: KbHealth; loading?: boolean }) {
  if (loading) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px]" style={{ backgroundColor: '#F5F5F5', color: '#A3A3A3' }}>
        检查中...
      </span>
    )
  }
  if (!health) return null

  if (!health.path_exists) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px]" style={{ backgroundColor: '#FEF2F2', color: '#DC2626' }}>
        <AlertTriangle className="h-3 w-3" />
        路径不存在
      </span>
    )
  }

  if (!health.last_open_ok) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px]" style={{ backgroundColor: '#FEF3C7', color: '#B45309' }}>
        未初始化
      </span>
    )
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px]" style={{ backgroundColor: '#ECFDF5', color: '#047857' }}>
      <CheckCircle2 className="h-3 w-3" />
      {health.is_git_repo ? 'Git' : '就绪'}
    </span>
  )
}

export const KbSwitcher: React.FC<KbSwitcherProps> = ({ onClose, onSwitch }) => {
  const [kbList, setKbList] = useState<KbWithHealth[]>([])
  const [currentKb, setCurrentKb] = useState<string | null>(null)
  const [newKbPath, setNewKbPath] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [openError, setOpenError] = useState<string | null>(null)

  useEffect(() => {
    loadKbList()
  }, [])

  const checkHealth = useCallback(async (path: string): Promise<KbHealth> => {
    try {
      return await tauriService.getKbHealth(path)
    } catch {
      return { path_exists: false, last_open_ok: false, is_git_repo: false }
    }
  }, [])

  const loadKbList = async () => {
    try {
      const [list, current] = await Promise.all([
        tauriService.getRecentKbs(20),
        tauriService.getCurrentKb()
      ])
      const itemsWithHealth: KbWithHealth[] = list.map((kb) => ({
        ...kb,
        healthLoading: true,
      }))
      setKbList(itemsWithHealth)
      setCurrentKb(current)

      // Load health for each KB in parallel
      const healthResults = await Promise.all(
        list.map((kb) => checkHealth(kb.path))
      )
      setKbList((prev) =>
        prev.map((item, i) => ({
          ...item,
          health: healthResults[i],
          healthLoading: false,
        }))
      )
    } catch (error) {
      console.error('Failed to load KB list:', error)
    }
  }

  const handleSwitch = async (path: string) => {
    setIsLoading(true)
    try {
      await tauriService.switchKb(path)
      onSwitch(path)
      onClose()
    } catch (error) {
      console.error('Failed to switch KB:', error)
      alert('切换知识库失败: ' + error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleSelectFolder = async () => {
    try {
      const selectedPath = await tauriService.selectFolder()
      if (selectedPath) {
        setNewKbPath(selectedPath)
        setOpenError(null)
      }
    } catch (error) {
      console.error('Failed to select folder:', error)
      setOpenError(getErrorMessage(error))
    }
  }

  const handleOpenKb = async () => {
    if (!newKbPath.trim()) return

    setIsLoading(true)
    try {
      const openedPath = newKbPath
      await tauriService.initKb(openedPath, 'open')
      const currentPath = await tauriService.getCurrentKb()
      setNewKbPath('')
      setOpenError(null)
      onSwitch(currentPath || openedPath)
      onClose()
    } catch (error) {
      console.error('Failed to open KB:', error)
      setOpenError(getErrorMessage(error))
    } finally {
      setIsLoading(false)
    }
  }

  const handleRemoveKb = async (path: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm('确定要移除此知识库吗？（不会删除文件）')) return

    try {
      await tauriService.unregisterKb(path)
      await loadKbList()
    } catch (error) {
      console.error('Failed to remove KB:', error)
    }
  }

  const formatLastAccessed = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / (1000 * 60))
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

    if (diffMins < 1) return '刚刚'
    if (diffMins < 60) return `${diffMins}分钟前`
    if (diffHours < 24) return `${diffHours}小时前`
    if (diffDays < 7) return `${diffDays}天前`
    return date.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div
        className="relative bg-white rounded-lg shadow-xl w-[550px] max-h-[70vh] overflow-hidden"
        style={{ border: '1px solid #E5E5E5' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: '#E5E5E5' }}>
          <h2 className="text-base font-semibold" style={{ color: '#0A0A0A' }}>知识库管理</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100">
            <X className="h-4 w-4" style={{ color: '#737373' }} />
          </button>
        </div>

        {/* Content */}
        <div className="px-5 py-4 overflow-y-auto max-h-[calc(70vh-140px)]">
          {/* KB List */}
          <div className="space-y-2 mb-4">
            {kbList.length === 0 ? (
              <div className="text-center py-8" style={{ color: '#737373' }}>
                <Database className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>暂无已注册的知识库</p>
                <p className="text-sm">请打开或创建一个知识库</p>
              </div>
            ) : (
              kbList.map((kb) => {
                const isCurrent = currentKb === kb.path
                const hasIssue = kb.health && (!kb.health.path_exists || !kb.health.last_open_ok)

                return (
                  <div
                    key={kb.path}
                    onClick={() => !hasIssue && handleSwitch(kb.path)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-lg border transition-colors group ${
                      hasIssue
                        ? 'border-amber-200 bg-amber-50/50 cursor-default'
                        : 'cursor-pointer hover:bg-gray-50'
                    }`}
                    style={
                      isCurrent
                        ? { borderColor: 'var(--brand-primary)', backgroundColor: 'var(--brand-primary-soft)' }
                        : undefined
                    }
                  >
                    <Database className="h-5 w-5 flex-shrink-0" style={{ color: isCurrent ? 'var(--brand-primary)' : '#737373' }} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate text-sm" style={{ color: isCurrent ? 'var(--brand-primary-strong)' : '#0A0A0A' }}>
                          {kb.name}
                        </span>
                        {kb.is_default && (
                          <span className="px-1.5 py-0.5 text-[10px] rounded bg-indigo-100 text-indigo-600">
                            默认
                          </span>
                        )}
                        <HealthBadge health={kb.health} loading={kb.healthLoading} />
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <p className="text-xs truncate flex-1" style={{ color: '#737373' }}>
                          {kb.path}
                        </p>
                        <div className="flex items-center gap-1 text-xs flex-shrink-0" style={{ color: '#A3A3A3' }}>
                          <Clock className="h-3 w-3" />
                          {formatLastAccessed(kb.last_accessed)}
                        </div>
                      </div>
                    </div>
                    {isCurrent && (
                      <Check className="h-5 w-5 flex-shrink-0" style={{ color: 'var(--brand-primary)' }} />
                    )}
                    <button
                      onClick={(e) => handleRemoveKb(kb.path, e)}
                      className="p-1 hover:bg-red-100 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                      style={{ opacity: isCurrent ? 0.3 : undefined }}
                      disabled={isCurrent}
                    >
                      <Trash2 className="h-4 w-4" style={{ color: '#EF4444' }} />
                    </button>
                  </div>
                )
              })
            )}
          </div>

          {/* Add New KB */}
          <div className="border-t pt-4" style={{ borderColor: '#E5E5E5' }}>
            <label className="block text-xs font-medium mb-2" style={{ color: '#737373' }}>
              打开其他知识库
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={newKbPath}
                onChange={(e) => setNewKbPath(e.target.value)}
                placeholder="输入知识库路径或选择目录..."
                className="flex-1 px-3 py-2 border rounded-md text-sm outline-none focus:border-indigo-500"
                style={{ borderColor: '#E5E5E5' }}
              />
              <button
                onClick={handleSelectFolder}
                className="px-3 py-2 border rounded-md text-sm flex items-center gap-1.5 hover:bg-gray-50"
                style={{ borderColor: '#E5E5E5' }}
                title="选择目录"
              >
                <FolderOpen className="h-4 w-4" style={{ color: '#737373' }} />
              </button>
              <button
                onClick={handleOpenKb}
                disabled={isLoading || !newKbPath.trim()}
                className="px-3 py-2 border rounded-md text-sm flex items-center gap-1.5 disabled:opacity-50 bg-indigo-50 hover:bg-indigo-100"
                style={{ borderColor: 'var(--brand-primary)', color: 'var(--brand-primary-strong)', backgroundColor: 'var(--brand-primary-soft)' }}
              >
                打开 / 初始化
              </button>
            </div>
            <p className="mt-2 text-xs" style={{ color: '#737373' }}>
              选择空目录时会自动初始化为新的 ForgeNerve 知识库。
            </p>
            {openError && (
              <div
                className="mt-3 rounded-md border px-3 py-2 text-sm"
                style={{ borderColor: '#FECACA', backgroundColor: '#FEF2F2', color: '#991B1B' }}
              >
                {openError}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-5 py-3 border-t" style={{ borderColor: '#E5E5E5' }}>
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-sm rounded-lg border"
            style={{ borderColor: '#E5E5E5', color: '#525252' }}
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  )
}
