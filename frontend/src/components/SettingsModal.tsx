import React from 'react'
import { X } from 'lucide-react'

interface SettingsModalProps {
  onClose: () => void
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ onClose }) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/30"
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className="relative bg-white rounded-lg shadow-xl w-[400px] max-h-[80vh] overflow-hidden"
        style={{ border: '1px solid #E5E5E5' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: '#E5E5E5' }}>
          <h2 className="text-sm font-semibold" style={{ color: '#0A0A0A' }}>设置</h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-gray-100"
          >
            <X className="h-4 w-4" style={{ color: '#737373' }} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* 关于 */}
          <div className="pb-4 border-b" style={{ borderColor: '#E5E5E5' }}>
            <h3 className="text-xs font-medium mb-2" style={{ color: '#737373' }}>关于</h3>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span style={{ color: '#737373' }}>版本</span>
                <span style={{ color: '#0A0A0A' }}>0.1.0</span>
              </div>
              <div className="flex justify-between text-sm">
                <span style={{ color: '#737373' }}>构建</span>
                <span style={{ color: '#0A0A0A' }}>Tauri v2</span>
              </div>
            </div>
          </div>

          {/* 编辑器设置 */}
          <div className="pb-4 border-b" style={{ borderColor: '#E5E5E5' }}>
            <h3 className="text-xs font-medium mb-2" style={{ color: '#737373' }}>编辑器</h3>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm" style={{ color: '#0A0A0A' }}>默认阅读模式</span>
                <input
                  type="checkbox"
                  defaultChecked
                  className="w-4 h-4 rounded"
                  style={{ accentColor: '#6366F1' }}
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm" style={{ color: '#0A0A0A' }}>显示行号</span>
                <input
                  type="checkbox"
                  className="w-4 h-4 rounded"
                  style={{ accentColor: '#6366F1' }}
                />
              </div>
            </div>
          </div>

          {/* 快捷键 */}
          <div>
            <h3 className="text-xs font-medium mb-2" style={{ color: '#737373' }}>快捷键</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span style={{ color: '#0A0A0A' }}>搜索</span>
                <kbd className="px-1.5 py-0.5 rounded text-xs" style={{ backgroundColor: '#F5F5F5', color: '#737373' }}>⌘K</kbd>
              </div>
              <div className="flex justify-between">
                <span style={{ color: '#0A0A0A' }}>保存</span>
                <kbd className="px-1.5 py-0.5 rounded text-xs" style={{ backgroundColor: '#F5F5F5', color: '#737373' }}>⌘S</kbd>
              </div>
              <div className="flex justify-between">
                <span style={{ color: '#0A0A0A' }}>新建</span>
                <kbd className="px-1.5 py-0.5 rounded text-xs" style={{ backgroundColor: '#F5F5F5', color: '#737373' }}>⌘N</kbd>
              </div>
            </div>
          </div>

          {/* 提示 */}
          <div className="pt-2 text-center">
            <p className="text-xs" style={{ color: '#A3A3A3' }}>
              更多设置功能开发中...
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t flex justify-end" style={{ borderColor: '#E5E5E5' }}>
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm rounded-md"
            style={{ backgroundColor: '#F5F5F5', color: '#0A0A0A' }}
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  )
}
