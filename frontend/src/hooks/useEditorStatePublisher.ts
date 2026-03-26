import { useCallback, useEffect, useRef } from 'react'
import { tauriService } from '../services/tauri'

/**
 * Editor State Publisher Hook
 *
 * 用于发布编辑器状态到 AI 协作系统。
 * 仅在 Tauri 桌面应用环境中生效。
 *
 * 参考: 技术实现文档 §2.6.1
 */
export function useEditorStatePublisher() {
  const debounceTimerRef = useRef<number | null>(null)

  /**
   * 选中知识点时发布状态
   */
  const selectKnowledge = useCallback(async (
    path: string,
    title: string,
    category?: string
  ) => {
    try {
      await tauriService.selectKnowledge(path, title, category)
    } catch (e) {
      console.error('[EditorState] 发布知识点状态失败:', e)
    }
  }, [])

  /**
   * 更新文本选择（实时，100ms 防抖）
   */
  const updateSelection = useCallback((
    startLine: number,
    endLine: number,
    textLength: number,
    text?: string
  ) => {
    // 清除之前的定时器
    if (debounceTimerRef.current !== null) {
      clearTimeout(debounceTimerRef.current)
    }

    // 100ms 防抖
    debounceTimerRef.current = window.setTimeout(() => {
      tauriService.updateSelection(startLine, endLine, textLength, text).catch(e => {
        console.error('[EditorState] 发布选区状态失败:', e)
      })
    }, 100)
  }, [])

  /**
   * 清除文本选择（空选区时调用）
   */
  const clearSelection = useCallback(() => {
    // 清除之前的定时器
    if (debounceTimerRef.current !== null) {
      clearTimeout(debounceTimerRef.current)
      debounceTimerRef.current = null
    }

    tauriService.clearSelection().catch(e => {
      console.error('[EditorState] 清除选择状态失败:', e)
    })
  }, [])

  /**
   * 清除知识点选择
   */
  const clearKnowledge = useCallback(async () => {
    try {
      await tauriService.clearKnowledge()
    } catch (e) {
      console.error('[EditorState] 清除知识点状态失败:', e)
    }
  }, [])

  /**
   * 设置当前知识库
   */
  const setKb = useCallback(async (path: string, name: string, count: number) => {
    try {
      await tauriService.setKb(path, name, count)
    } catch (e) {
      console.error('[EditorState] 发布知识库状态失败:', e)
    }
  }, [])

  // 组件卸载时清理定时器
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current !== null) {
        clearTimeout(debounceTimerRef.current)
      }
    }
  }, [])

  return {
    selectKnowledge,
    updateSelection,
    clearSelection,
    clearKnowledge,
    setKb,
  }
}
