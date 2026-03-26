import React, { useState, useEffect } from 'react'
import { tauriService, KnowledgeBaseInfo } from '../services/tauri'
import { X, Database, Check, FolderOpen, Trash2, Clock } from 'lucide-react'

interface KbSwitcherProps {
  onClose: () => void
  onSwitch: (path: string) => void
}

export const KbSwitcher: React.FC<KbSwitcherProps> = ({ onClose, onSwitch }) => {
  const [kbList, setKbList] = useState<KnowledgeBaseInfo[]>([])
  const [currentKb, setCurrentKb] = useState<string | null>(null)
  const [newKbPath, setNewKbPath] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    loadKbList()
  }, [])

  const loadKbList = async () => {
    try {
      // 获取按访问时间排序的知识库列表
      const [list, current] = await Promise.all([
        tauriService.getRecentKbs(20),
        tauriService.getCurrentKb()
      ])
      setKbList(list)
      setCurrentKb(current)
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
      }
    } catch (error) {
      console.error('Failed to select folder:', error)
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
      onSwitch(currentPath || openedPath)
      onClose()
    } catch (error) {
      console.error('Failed to open KB:', error)
      alert('打开知识库失败: ' + error)
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white rounded-lg shadow-xl w-[550px] max-h-[70vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: '#E5E5E5' }}>
          <h2 className="text-lg font-semibold">知识库管理</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X className="h-5 w-5" style={{ color: '#737373' }} />
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
              kbList.map((kb) => (
                <div
                  key={kb.path}
                  onClick={() => handleSwitch(kb.path)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg cursor-pointer border transition-colors group ${
                    currentKb === kb.path
                      ? 'border-indigo-500 bg-indigo-50'
                      : 'border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <Database className="h-5 w-5 flex-shrink-0" style={{ color: currentKb === kb.path ? '#6366F1' : '#737373' }} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate" style={{ color: currentKb === kb.path ? '#4338CA' : '#0A0A0A' }}>
                        {kb.name}
                      </span>
                      {kb.is_default && (
                        <span className="px-1.5 py-0.5 text-[10px] rounded bg-indigo-100 text-indigo-600">
                          默认
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <p className="text-xs truncate flex-1" style={{ color: '#737373' }}>
                        {kb.path}
                      </p>
                      <div className="flex items-center gap-1 text-xs" style={{ color: '#A3A3A3' }}>
                        <Clock className="h-3 w-3" />
                        {formatLastAccessed(kb.last_accessed)}
                      </div>
                    </div>
                  </div>
                  {currentKb === kb.path && (
                    <Check className="h-5 w-5 flex-shrink-0" style={{ color: '#6366F1' }} />
                  )}
                  <button
                    onClick={(e) => handleRemoveKb(kb.path, e)}
                    className="p-1 hover:bg-red-100 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ opacity: currentKb !== kb.path ? undefined : 0.3 }}
                    disabled={currentKb === kb.path}
                  >
                    <Trash2 className="h-4 w-4" style={{ color: '#EF4444' }} />
                  </button>
                </div>
              ))
            )}
          </div>

          {/* Add New KB */}
          <div className="border-t pt-4" style={{ borderColor: '#E5E5E5' }}>
            <label className="block text-sm font-medium mb-2" style={{ color: '#374151' }}>
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
                <FolderOpen className="h-4 w-4" />
              </button>
              <button
                onClick={handleOpenKb}
                disabled={isLoading || !newKbPath.trim()}
                className="px-3 py-2 border rounded-md text-sm flex items-center gap-1.5 disabled:opacity-50 bg-indigo-50 hover:bg-indigo-100"
                style={{ borderColor: '#6366F1', color: '#4338CA' }}
              >
                打开
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-5 py-4 border-t" style={{ borderColor: '#E5E5E5' }}>
          <button
            onClick={onClose}
            className="px-4 py-2 border rounded-md text-sm"
            style={{ borderColor: '#E5E5E5' }}
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  )
}
