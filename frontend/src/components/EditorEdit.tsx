import React, { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { markdown } from '@codemirror/lang-markdown'
import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
  type Completion,
  type CompletionContext,
} from '@codemirror/autocomplete'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import {
  bracketMatching,
  defaultHighlightStyle,
  foldGutter,
  foldKeymap,
  indentOnInput,
  syntaxHighlighting,
} from '@codemirror/language'
import { EditorState } from '@codemirror/state'
import { EditorView, keymap, lineNumbers, type ViewUpdate } from '@codemirror/view'
import { SearchQuery, findNext, findPrevious, getSearchQuery, search, setSearchQuery } from '@codemirror/search'
import { Heading1, Heading2, Bold, Italic, Quote, List, ListTodo, Code2, Link2, Brackets, Table2, Minus, Command, Paperclip, MoreHorizontal, Search, ChevronDown, ChevronUp, X } from 'lucide-react'
import { useEditorStatePublisher } from '../hooks/useEditorStatePublisher'
import { tauriService } from '../services/tauri'
import type { KnowledgeLinkCompletion } from '../types'
import { buildWikiLinkInsertText } from '../lib/wikiLinks'
import type { EditorProps } from './Editor'
import { useAppStore } from '../stores/appStore'

const isMacOS = typeof navigator !== 'undefined' && navigator.userAgent.includes('Mac')

interface EditorCommandAction {
  id: string
  label: string
  shortcut?: string
  keywords?: string
  section: '格式' | '插入' | '大纲'
  onSelect: () => void
}

interface ToolbarAction {
  id: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  shortcut: string
  onClick: () => void
}

const IMAGE_MIME_PREFIX = 'image/'

function toAssetReferencePath(fileName: string) {
  return `./assets/${fileName}`
}

function buildAssetMarkdown(file: File) {
  const assetPath = toAssetReferencePath(file.name)
  if (file.type.startsWith(IMAGE_MIME_PREFIX)) {
    const altText = file.name.replace(/\.[^.]+$/, '')
    return `![${altText}](${assetPath})`
  }

  return `[${file.name}](${assetPath})`
}

function getDocumentSearchStats(state: EditorState) {
  const query = getSearchQuery(state)
  if (!query.search || !query.valid) {
    return {
      query: query.search,
      valid: query.valid,
      total: 0,
      current: 0,
    }
  }

  const cursor = query.getCursor(state)
  const selection = state.selection.main
  let total = 0
  let current = 0
  let firstAfter = 0

  while (true) {
    const nextMatch = cursor.next() as IteratorResult<{ from: number; to: number }>
    if (nextMatch.done) break

    const match = nextMatch.value
    total += 1

    const selectionInsideMatch = selection.from >= match.from && selection.from <= match.to
    const exactMatchSelected = selection.from === match.from && selection.to === match.to

    if (!current && (selectionInsideMatch || exactMatchSelected)) {
      current = total
    } else if (!firstAfter && match.from >= selection.from) {
      firstAfter = total
    }
  }

  if (!current && total > 0) {
    current = firstAfter || 1
  }

  return {
    query: query.search,
    valid: query.valid,
    total,
    current,
  }
}

export const EditorEdit: React.FC<EditorProps> = ({
  value,
  onChange,
  knowledgePath,
}) => {
  const editorRootRef = useRef<HTMLDivElement | null>(null)
  const editorViewRef = useRef<EditorView | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const toolbarMenuButtonRef = useRef<HTMLButtonElement | null>(null)
  const onChangeRef = useRef(onChange)
  const knowledgePathRef = useRef(knowledgePath)
  const isApplyingExternalValueRef = useRef(false)
  const changeFlushFrameRef = useRef<number | null>(null)
  const pendingDocValueRef = useRef<string | null>(null)
  const { updateSelection, clearSelection } = useEditorStatePublisher()
  const setEditorSelection = useAppStore((state) => state.setEditorSelection)
  const clearEditorSelection = useAppStore((state) => state.clearEditorSelection)
  const lastSelectionRef = useRef<{ startLine: number; endLine: number; textLength: number } | null>(null)
  const wikiLinkCompletionCacheRef = useRef<Map<string, KnowledgeLinkCompletion[]>>(new Map())
  const wikiLinkCompletionPromiseCacheRef = useRef<Map<string, Promise<KnowledgeLinkCompletion[]>>>(new Map())
  const deferredValue = useDeferredValue(value)
  const [isFileDragActive, setIsFileDragActive] = useState(false)
  const [assetNotice, setAssetNotice] = useState<{ message: string; detail?: string } | null>(null)
  const [isImportingAssets, setIsImportingAssets] = useState(false)
  const [pendingImportCount, setPendingImportCount] = useState(0)
  const [showToolbarMenu, setShowToolbarMenu] = useState(false)
  const [toolbarMenuPosition, setToolbarMenuPosition] = useState<{ top: number; left: number } | null>(null)
  const documentSearchInputRef = useRef<HTMLInputElement | null>(null)
  const documentSearchQueryRef = useRef('')
  const documentSearchVisibleRef = useRef(false)
  const [showDocumentSearch, setShowDocumentSearch] = useState(false)
  const [documentSearchQuery, setDocumentSearchQuery] = useState('')
  const [documentSearchStats, setDocumentSearchStats] = useState({
    valid: true,
    total: 0,
    current: 0,
  })

  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  useEffect(() => {
    documentSearchQueryRef.current = documentSearchQuery
  }, [documentSearchQuery])

  useEffect(() => {
    documentSearchVisibleRef.current = showDocumentSearch
  }, [showDocumentSearch])

  const flushPendingDocValue = useCallback(() => {
    if (changeFlushFrameRef.current !== null) {
      window.cancelAnimationFrame(changeFlushFrameRef.current)
      changeFlushFrameRef.current = null
    }

    if (pendingDocValueRef.current !== null) {
      onChangeRef.current(pendingDocValueRef.current)
      pendingDocValueRef.current = null
    }
  }, [])

  useEffect(() => () => {
    flushPendingDocValue()
  }, [flushPendingDocValue])

  useEffect(() => {
    if (!assetNotice) return

    const timer = window.setTimeout(() => {
      setAssetNotice(null)
    }, 2600)

    return () => window.clearTimeout(timer)
  }, [assetNotice])

  useEffect(() => {
    if (!showToolbarMenu) return

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.closest('[data-editor-toolbar-menu="true"]')) {
        return
      }
      setShowToolbarMenu(false)
    }

    const updateToolbarMenuPosition = () => {
      const button = toolbarMenuButtonRef.current
      if (!button) return

      const rect = button.getBoundingClientRect()
      setToolbarMenuPosition({
        top: rect.bottom + 8,
        left: rect.right - 220,
      })
    }

    updateToolbarMenuPosition()
    window.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('resize', updateToolbarMenuPosition)
    window.addEventListener('scroll', updateToolbarMenuPosition, true)
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('resize', updateToolbarMenuPosition)
      window.removeEventListener('scroll', updateToolbarMenuPosition, true)
    }
  }, [showToolbarMenu])

  const syncDocumentSearchState = useCallback((state: EditorState) => {
    const next = getDocumentSearchStats(state)
    if (next.query !== documentSearchQueryRef.current) {
      documentSearchQueryRef.current = next.query
      setDocumentSearchQuery(next.query)
    }

    setDocumentSearchStats((current) => (
      current.valid === next.valid &&
      current.total === next.total &&
      current.current === next.current
        ? current
        : {
            valid: next.valid,
            total: next.total,
            current: next.current,
          }
    ))
  }, [])

  useEffect(() => {
    knowledgePathRef.current = knowledgePath
    lastSelectionRef.current = null
    clearEditorSelection()
    clearSelection()
    documentSearchQueryRef.current = ''
    documentSearchVisibleRef.current = false
    setShowDocumentSearch(false)
    setDocumentSearchQuery('')
    setDocumentSearchStats({
      valid: true,
      total: 0,
      current: 0,
    })
  }, [clearEditorSelection, clearSelection, knowledgePath])

  const handleSelectionChange = useCallback((event: ViewUpdate) => {
    if (!knowledgePathRef.current) return
    if (!event.selectionSet) return

    const selection = event.state.selection
    if (!selection) return

    const from = selection.main.from
    const to = selection.main.to

    if (from === undefined || to === undefined || from === to) {
      if (lastSelectionRef.current !== null) {
        lastSelectionRef.current = null
        clearEditorSelection()
        clearSelection()
      }
      return
    }

    const startLine = event.state.doc.lineAt(from).number
    const endLine = event.state.doc.lineAt(to).number
    const selectedTextLength = to - from

    if (
      lastSelectionRef.current?.startLine === startLine &&
      lastSelectionRef.current?.endLine === endLine &&
      lastSelectionRef.current?.textLength === selectedTextLength
    ) {
      return
    }

    lastSelectionRef.current = { startLine, endLine, textLength: selectedTextLength }
    setEditorSelection({ startLine, endLine, textLength: selectedTextLength })
    updateSelection(startLine, endLine, selectedTextLength)
  }, [clearEditorSelection, clearSelection, setEditorSelection, updateSelection])

  const loadWikiLinkCompletions = useCallback(async (query: string) => {
    const normalizedQuery = query.trim().toLowerCase()
    const cached = wikiLinkCompletionCacheRef.current.get(normalizedQuery)
    if (cached) {
      return cached
    }

    const inflight = wikiLinkCompletionPromiseCacheRef.current.get(normalizedQuery)
    if (inflight) {
      return inflight
    }

    const request = tauriService
      .completeKnowledgeLinks(normalizedQuery, 20)
      .then((entries) => {
        wikiLinkCompletionCacheRef.current.set(normalizedQuery, entries)
        wikiLinkCompletionPromiseCacheRef.current.delete(normalizedQuery)
        return entries
      })
      .catch((error) => {
        wikiLinkCompletionPromiseCacheRef.current.delete(normalizedQuery)
        throw error
      })

    wikiLinkCompletionPromiseCacheRef.current.set(normalizedQuery, request)
    return request
  }, [])

  const wikiLinkCompletion = useCallback(async (context: CompletionContext) => {
    const line = context.state.doc.lineAt(context.pos)
    const beforeCursor = line.text.slice(0, context.pos - line.from)
    const openIndex = beforeCursor.lastIndexOf('[[')
    const closeIndex = beforeCursor.lastIndexOf(']]')

    if (openIndex < 0 || closeIndex > openIndex) return null

    const query = beforeCursor.slice(openIndex + 2)
    if (query.includes('|') || query.includes('\n')) return null

    const from = line.from + openIndex + 2
    const to = context.pos
    if (!context.explicit && query.length === 0 && !beforeCursor.endsWith('[[')) {
      return null
    }

    let entries: KnowledgeLinkCompletion[]
    try {
      entries = await loadWikiLinkCompletions(query)
    } catch (error) {
      console.error('Failed to load wiki link completions:', error)
      return null
    }

    if (entries.length === 0) return null

    return {
      from,
      to,
      options: entries.map((entry) => ({
        label: entry.id,
        type: 'text',
        detail: entry.title,
        info: entry.summary || entry.category || '知识链接',
        apply: (view: EditorView, completion: Completion, applyFrom: number, applyTo: number) => {
          const selected = typeof completion.label === 'string' ? completion.label : String(completion.label)
          const afterCursor = view.state.sliceDoc(applyTo, Math.min(view.state.doc.length, applyTo + 2))
          const insertResult = buildWikiLinkInsertText(selected, entry.title, afterCursor.startsWith(']]'))
          const cursorPosition = applyFrom + insertResult.text.length

          view.dispatch({
            changes: { from: applyFrom, to: applyTo, insert: insertResult.text },
            selection: {
              anchor: insertResult.displayStart !== null ? applyFrom + insertResult.displayStart : cursorPosition,
              head: insertResult.displayEnd !== null ? applyFrom + insertResult.displayEnd : cursorPosition,
            },
          })
        },
      })),
    }
  }, [loadWikiLinkCompletions])

  const applyWrap = useCallback((prefix: string, suffix = '', placeholder = '') => {
    const view = editorViewRef.current
    if (!view) return

    const { from, to } = view.state.selection.main
    const selectedText = view.state.sliceDoc(from, to)
    const content = selectedText || placeholder
    const insertText = `${prefix}${content}${suffix}`
    const contentStart = from + prefix.length
    const contentEnd = contentStart + content.length

    view.dispatch({
      changes: { from, to, insert: insertText },
      selection: {
        anchor: contentStart,
        head: contentEnd,
      },
      scrollIntoView: true,
    })
    view.focus()
  }, [])

  const applyLinePrefix = useCallback((prefix: string) => {
    const view = editorViewRef.current
    if (!view) return

    const { from, to } = view.state.selection.main
    const startLine = view.state.doc.lineAt(from)
    const endLine = view.state.doc.lineAt(to)
    const lines = []

    for (let lineNumber = startLine.number; lineNumber <= endLine.number; lineNumber += 1) {
      lines.push(view.state.doc.line(lineNumber))
    }

    const shouldRemove = lines.every((line) => line.text.startsWith(prefix))
    const changes = lines.map((line) => (
      shouldRemove
        ? { from: line.from, to: line.from + prefix.length, insert: '' }
        : { from: line.from, to: line.from, insert: prefix }
    ))

    view.dispatch({
      changes,
      selection: {
        anchor: startLine.from,
        head: endLine.to + (shouldRemove ? -prefix.length : prefix.length) * lines.length,
      },
      scrollIntoView: true,
    })
    view.focus()
  }, [])

  const insertLink = useCallback(() => {
    const view = editorViewRef.current
    if (!view) return

    const { from, to } = view.state.selection.main
    const selectedText = view.state.sliceDoc(from, to) || '链接文本'
    const insertText = `[${selectedText}](https://example.com)`
    const urlStart = from + selectedText.length + 3
    const urlEnd = urlStart + 'https://example.com'.length

    view.dispatch({
      changes: { from, to, insert: insertText },
      selection: {
        anchor: urlStart,
        head: urlEnd,
      },
      scrollIntoView: true,
    })
    view.focus()
  }, [])

  const insertWikiLink = useCallback(() => {
    const view = editorViewRef.current
    if (!view) return

    const { from, to } = view.state.selection.main
    const selectedText = view.state.sliceDoc(from, to) || '知识条目'
    const insertText = `[[${selectedText}]]`

    view.dispatch({
      changes: { from, to, insert: insertText },
      selection: {
        anchor: from + 2,
        head: from + 2 + selectedText.length,
      },
      scrollIntoView: true,
    })
    view.focus()
  }, [])

  const insertSnippet = useCallback((snippet: string, selectionOffset?: { anchor: number; head: number }) => {
    const view = editorViewRef.current
    if (!view) return

    const { from, to } = view.state.selection.main
    view.dispatch({
      changes: { from, to, insert: snippet },
      selection: selectionOffset
        ? {
            anchor: from + selectionOffset.anchor,
            head: from + selectionOffset.head,
          }
        : { anchor: from + snippet.length },
      scrollIntoView: true,
    })
    view.focus()
  }, [])
  const [showCommandPalette, setShowCommandPalette] = useState(false)
  const [commandQuery, setCommandQuery] = useState('')
  const [selectedCommandIndex, setSelectedCommandIndex] = useState(0)
  const commandInputRef = useRef<HTMLInputElement | null>(null)
  const slashTriggerRangeRef = useRef<{ from: number; to: number } | null>(null)

  const insertTableSnippet = useCallback(() => {
    insertSnippet('| 列 1 | 列 2 |\n| --- | --- |\n| 内容 | 内容 |\n', {
      anchor: 2,
      head: 5,
    })
  }, [insertSnippet])
  const insertCurrentDate = useCallback(() => {
    const formatter = new Intl.DateTimeFormat('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
    insertSnippet(formatter.format(new Date()))
  }, [insertSnippet])
  const insertTaskListSnippet = useCallback(() => {
    insertSnippet('- [ ] 待办事项\n- [ ] 下一步\n', {
      anchor: 6,
      head: 10,
    })
  }, [insertSnippet])
  const insertCalloutSnippet = useCallback((kind: 'NOTE' | 'TIP' | 'WARNING') => {
    const titleMap = {
      NOTE: '说明',
      TIP: '提示',
      WARNING: '注意',
    } as const

    const content = `> [!${kind}] ${titleMap[kind]}\n> 在这里补充内容\n`
    insertSnippet(content, {
      anchor: 13 + titleMap[kind].length,
      head: content.length - 1,
    })
  }, [insertSnippet])
  const insertImageSnippet = useCallback(() => {
    insertSnippet('![图片描述](assets/image.png)', {
      anchor: 2,
      head: 6,
    })
  }, [insertSnippet])
  const showAssetInsertedNotice = useCallback((message: string, detail?: string) => {
    setAssetNotice({ message, detail })
  }, [])
  const clearAssetNotice = useCallback(() => {
    setAssetNotice(null)
  }, [])
  const insertAssetReferences = useCallback(async (files: File[]) => {
    if (files.length === 0) return

    if (!knowledgePath) {
      const markdown = files.map(buildAssetMarkdown).join('\n')
      insertSnippet(markdown + '\n')
      showAssetInsertedNotice(
        '当前知识尚未持久化，已插入占位引用。',
        '保存当前知识后，再次导入即可把文件写入同级 assets 目录。',
      )
      return
    }

    setPendingImportCount(files.length)
    setIsImportingAssets(true)
    try {
      const imported = await tauriService.importAssets(
        knowledgePath,
        await Promise.all(files.map(async (file) => ({
          fileName: file.name,
          mimeType: file.type || undefined,
          bytes: Array.from(new Uint8Array(await file.arrayBuffer())),
        }))),
      )

      insertSnippet(imported.map((asset) => asset.markdown).join('\n') + '\n')
      const reusedCount = imported.filter((asset) => asset.reused).length
      const importedCount = imported.length - reusedCount
      showAssetInsertedNotice(
        reusedCount > 0
          ? `已写入 ${importedCount} 个素材，复用 ${reusedCount} 个现有文件。`
          : `已导入 ${imported.length} 个素材到当前知识的 assets 目录。`,
        imported.slice(0, 3).map((asset) => asset.relative_path).join(' · '),
      )
    } catch (error) {
      console.error('Failed to import assets:', error)
      const markdown = files.map(buildAssetMarkdown).join('\n')
      insertSnippet(markdown + '\n')
      showAssetInsertedNotice(
        '自动导入失败，已回退为素材引用模板。',
        '可在保存当前知识后重试，或手动将文件放入同级 assets 目录。',
      )
    } finally {
      setIsImportingAssets(false)
      setPendingImportCount(0)
    }
  }, [insertSnippet, knowledgePath, showAssetInsertedNotice])
  const openFilePicker = useCallback(() => {
    fileInputRef.current?.click()
  }, [])
  const insertAttachmentSnippet = useCallback(() => {
    insertSnippet('[附件名称](./assets/file.ext)', {
      anchor: 1,
      head: 5,
    })
    showAssetInsertedNotice('已插入附件链接模板。', '支持文件选择、拖拽和粘贴图片自动导入。')
  }, [insertSnippet, showAssetInsertedNotice])
  const insertMeetingTemplate = useCallback(() => {
    insertSnippet(
      [
        '# 会议纪要',
        '',
        '## 议题',
        '- ',
        '',
        '## 关键信息',
        '- ',
        '',
        '## 结论',
        '- ',
        '',
        '## 后续行动',
        '- [ ] ',
        '',
      ].join('\n'),
      { anchor: 13, head: 15 },
    )
  }, [insertSnippet])
  const insertDecisionTemplate = useCallback(() => {
    insertSnippet(
      [
        '# 决策记录',
        '',
        '## 背景',
        '',
        '## 方案对比',
        '- 方案 A：',
        '- 方案 B：',
        '',
        '## 决策',
        '',
        '## 影响',
        '- ',
        '',
      ].join('\n'),
      { anchor: 16, head: 18 },
    )
  }, [insertSnippet])
  const insertDailyNoteTemplate = useCallback(() => {
    insertSnippet(
      [
        '# 今日笔记',
        '',
        '## 重点事项',
        '- ',
        '',
        '## 知识摘录',
        '- ',
        '',
        '## 明日跟进',
        '- [ ] ',
        '',
      ].join('\n'),
      { anchor: 13, head: 15 },
    )
  }, [insertSnippet])

  const jumpToLine = useCallback((lineNumber: number) => {
    const view = editorViewRef.current
    if (!view) return

    const safeLineNumber = Math.max(1, Math.min(lineNumber, view.state.doc.lines))
    const line = view.state.doc.line(safeLineNumber)
    view.dispatch({
      selection: { anchor: line.from, head: line.to },
      scrollIntoView: true,
    })
    view.focus()
  }, [])

  const openCommandPalette = useCallback((options?: { query?: string; slashRange?: { from: number; to: number } | null }) => {
    slashTriggerRangeRef.current = options?.slashRange ?? null
    setCommandQuery(options?.query ?? '')
    setSelectedCommandIndex(0)
    setShowCommandPalette(true)
  }, [])

  const openSlashCommandPalette = useCallback((slashRange: { from: number; to: number }) => {
    openCommandPalette({ slashRange })
  }, [openCommandPalette])

  const closeCommandPalette = useCallback(() => {
    slashTriggerRangeRef.current = null
    setShowCommandPalette(false)
    setCommandQuery('')
    setSelectedCommandIndex(0)
    editorViewRef.current?.focus()
  }, [])

  const clearSlashTriggerIfNeeded = useCallback(() => {
    const slashRange = slashTriggerRangeRef.current
    const view = editorViewRef.current
    if (!slashRange || !view) return

    view.dispatch({
      changes: { from: slashRange.from, to: slashRange.to, insert: '' },
      selection: { anchor: slashRange.from, head: slashRange.from },
      scrollIntoView: true,
    })
    slashTriggerRangeRef.current = null
  }, [])

  const tryOpenSlashCommandPalette = useCallback((update: ViewUpdate) => {
    if (!update.docChanged || showCommandPalette) return

    let insertedText = ''
    let insertedFrom = -1
    let insertedTo = -1
    let changeCount = 0
    let simpleInsert = true

    update.changes.iterChanges((fromA, toA, fromB, toB, inserted) => {
      changeCount += 1
      if (fromA !== toA) simpleInsert = false
      insertedText += inserted.toString()
      insertedFrom = fromB
      insertedTo = toB
    })

    if (!simpleInsert || changeCount !== 1 || insertedText !== '/') return

    const cursorPosition = update.state.selection.main.head
    const line = update.state.doc.lineAt(cursorPosition)
    if (line.text.trim() !== '/') return

    openSlashCommandPalette({ from: insertedFrom, to: insertedTo })
  }, [openSlashCommandPalette, showCommandPalette])

  const documentHeadings = useMemo(() => deferredValue
    .split('\n')
    .map((line, index) => ({ line, lineNumber: index + 1 }))
    .map(({ line, lineNumber }) => {
      const match = line.match(/^(#{1,3})\s+(.+)$/)
      if (!match) return null
      return {
        level: match[1].length,
        title: match[2].trim(),
        lineNumber,
      }
    })
    .filter((heading): heading is { level: number; title: string; lineNumber: number } => Boolean(heading)), [deferredValue])

  const toolbarActions = useMemo<ToolbarAction[]>(() => [
    { id: 'heading-1', label: 'H1', icon: Heading1, shortcut: `${isMacOS ? '⌘' : 'Ctrl+'}⌥1`, onClick: () => applyLinePrefix('# ') },
    { id: 'heading-2', label: 'H2', icon: Heading2, shortcut: `${isMacOS ? '⌘' : 'Ctrl+'}⌥2`, onClick: () => applyLinePrefix('## ') },
    { id: 'bold', label: '加粗', icon: Bold, shortcut: `${isMacOS ? '⌘' : 'Ctrl+'}B`, onClick: () => applyWrap('**', '**', '重点内容') },
    { id: 'italic', label: '斜体', icon: Italic, shortcut: `${isMacOS ? '⌘' : 'Ctrl+'}I`, onClick: () => applyWrap('*', '*', '强调内容') },
    { id: 'quote', label: '引用', icon: Quote, shortcut: `${isMacOS ? '⌘' : 'Ctrl+'}⇧>`, onClick: () => applyLinePrefix('> ') },
    { id: 'list', label: '列表', icon: List, shortcut: `${isMacOS ? '⌘' : 'Ctrl+'}⇧7`, onClick: () => applyLinePrefix('- ') },
    { id: 'task-list', label: '待办', icon: ListTodo, shortcut: `${isMacOS ? '⌘' : 'Ctrl+'}⌥T`, onClick: () => applyLinePrefix('- [ ] ') },
    { id: 'code-block', label: '代码', icon: Code2, shortcut: `${isMacOS ? '⌘' : 'Ctrl+'}⌥C`, onClick: () => applyWrap('```\n', '\n```', '代码片段') },
    { id: 'divider', label: '分割线', icon: Minus, shortcut: `${isMacOS ? '⌘' : 'Ctrl+'}⌥-`, onClick: () => insertSnippet('\n---\n') },
    {
      id: 'table',
      label: '表格',
      icon: Table2,
      shortcut: `${isMacOS ? '⌘' : 'Ctrl+'}⌥⇧T`,
      onClick: insertTableSnippet,
    },
    { id: 'file', label: '文件', icon: Paperclip, shortcut: `${isMacOS ? '⌘' : 'Ctrl+'}⌥O`, onClick: openFilePicker },
    { id: 'link', label: '链接', icon: Link2, shortcut: `${isMacOS ? '⌘' : 'Ctrl+'}K`, onClick: insertLink },
    { id: 'wiki-link', label: 'Wiki', icon: Brackets, shortcut: `${isMacOS ? '⌘' : 'Ctrl+'}⇧K`, onClick: insertWikiLink },
  ], [applyLinePrefix, applyWrap, insertLink, insertSnippet, insertTableSnippet, insertWikiLink, openFilePicker])
  const primaryToolbarActionIds = useMemo(() => new Set([
    'heading-1',
    'heading-2',
    'bold',
    'italic',
    'list',
    'task-list',
    'file',
    'wiki-link',
  ]), [])
  const primaryToolbarActions = useMemo(
    () => toolbarActions.filter((action) => primaryToolbarActionIds.has(action.id)),
    [primaryToolbarActionIds, toolbarActions],
  )
  const secondaryToolbarActions = useMemo(
    () => toolbarActions.filter((action) => !primaryToolbarActionIds.has(action.id)),
    [primaryToolbarActionIds, toolbarActions],
  )

  const commandActions = useMemo<EditorCommandAction[]>(() => {
    const formattingActions = toolbarActions.map((action) => ({
      id: `format-${action.id}`,
      label: action.label,
      shortcut: action.shortcut,
      keywords: `${action.label} markdown format`,
      section: '格式' as const,
      onSelect: action.onClick,
    }))
    const insertActions: EditorCommandAction[] = [
      {
        id: 'insert-date',
        label: '插入日期',
        shortcut: `${isMacOS ? '⌘' : 'Ctrl+'}⌥D`,
        keywords: 'date today 日期 今天 时间戳',
        section: '插入',
        onSelect: insertCurrentDate,
      },
      {
        id: 'insert-task-list',
        label: '插入任务清单',
        shortcut: `${isMacOS ? '⌘' : 'Ctrl+'}⌥T`,
        keywords: 'task todo checklist 待办 任务',
        section: '插入',
        onSelect: insertTaskListSnippet,
      },
      {
        id: 'insert-note-callout',
        label: '插入提示块',
        keywords: 'note tip callout 提示块 说明',
        section: '插入',
        onSelect: () => insertCalloutSnippet('NOTE'),
      },
      {
        id: 'insert-warning-callout',
        label: '插入警告块',
        keywords: 'warning callout 注意 风险 警告块',
        section: '插入',
        onSelect: () => insertCalloutSnippet('WARNING'),
      },
      {
        id: 'insert-tip-callout',
        label: '插入技巧块',
        keywords: 'tip callout 建议 技巧',
        section: '插入',
        onSelect: () => insertCalloutSnippet('TIP'),
      },
      {
        id: 'insert-image',
        label: '插入图片模板',
        keywords: 'image 图片 插图 附件 markdown image',
        section: '插入',
        onSelect: insertImageSnippet,
      },
      {
        id: 'insert-attachment',
        label: '插入附件链接模板',
        keywords: 'attachment file 附件 文件 链接 模板',
        section: '插入',
        onSelect: insertAttachmentSnippet,
      },
      {
        id: 'pick-local-files',
        label: '从文件选择器插入素材引用',
        shortcut: `${isMacOS ? '⌘' : 'Ctrl+'}⌥O`,
        keywords: 'open file picker image attachment 打开文件 选择器 插入素材',
        section: '插入',
        onSelect: openFilePicker,
      },
      {
        id: 'insert-meeting-template',
        label: '插入会议纪要模板',
        keywords: 'meeting notes 会议纪要 模板 记录',
        section: '插入',
        onSelect: insertMeetingTemplate,
      },
      {
        id: 'insert-decision-template',
        label: '插入决策记录模板',
        keywords: 'decision log adr 决策记录 模板',
        section: '插入',
        onSelect: insertDecisionTemplate,
      },
      {
        id: 'insert-daily-note-template',
        label: '插入今日笔记模板',
        keywords: 'daily note journal 今日笔记 日记 模板',
        section: '插入',
        onSelect: insertDailyNoteTemplate,
      },
    ]
    const headingActions = documentHeadings.slice(0, 80).map((heading) => ({
      id: `heading-${heading.lineNumber}`,
      label: `${'#'.repeat(heading.level)} ${heading.title}`,
      shortcut: `L${heading.lineNumber}`,
      keywords: `${heading.title} heading outline section`,
      section: '大纲' as const,
      onSelect: () => jumpToLine(heading.lineNumber),
    }))

    return [...formattingActions, ...insertActions, ...headingActions]
  }, [documentHeadings, insertAttachmentSnippet, insertCalloutSnippet, insertCurrentDate, insertDailyNoteTemplate, insertDecisionTemplate, insertImageSnippet, insertMeetingTemplate, insertTaskListSnippet, jumpToLine, openFilePicker, toolbarActions])

  const filteredCommandActions = useMemo(() => {
    const normalizedQuery = commandQuery.trim().toLowerCase()
    if (!normalizedQuery) return commandActions

    return commandActions.filter((action) => (
      action.label.toLowerCase().includes(normalizedQuery) ||
      action.section.toLowerCase().includes(normalizedQuery) ||
      (action.shortcut ?? '').toLowerCase().includes(normalizedQuery) ||
      (action.keywords ?? '').toLowerCase().includes(normalizedQuery)
    ))
  }, [commandActions, commandQuery])

  const groupedCommandActions = useMemo(() => {
    const groups: Array<{ section: EditorCommandAction['section']; actions: Array<EditorCommandAction & { index: number }> }> = []

    filteredCommandActions.forEach((action, index) => {
      const previousGroup = groups[groups.length - 1]
      if (!previousGroup || previousGroup.section !== action.section) {
        groups.push({ section: action.section, actions: [{ ...action, index }] })
        return
      }
      previousGroup.actions.push({ ...action, index })
    })

    return groups
  }, [filteredCommandActions])

  const runToolbarAction = useCallback((action: () => void) => {
    action()
    return true
  }, [])

  const setDocumentSearchValue = useCallback((nextQuery: string, options?: { jumpToMatch?: boolean }) => {
    const view = editorViewRef.current
    setDocumentSearchQuery(nextQuery)
    documentSearchQueryRef.current = nextQuery

    if (!view) return

    view.dispatch({
      effects: setSearchQuery.of(new SearchQuery({
        search: nextQuery,
        caseSensitive: false,
      })),
    })

    if (nextQuery.trim() && options?.jumpToMatch) {
      findNext(view)
    }

    syncDocumentSearchState(view.state)
  }, [syncDocumentSearchState])

  const openDocumentSearch = useCallback(() => {
    const view = editorViewRef.current
    const currentQuery = documentSearchQueryRef.current
    let nextQuery = currentQuery

    if (view && !currentQuery) {
      const { from, to } = view.state.selection.main
      const selectedText = view.state.sliceDoc(from, to).trim()
      if (selectedText && !selectedText.includes('\n') && selectedText.length <= 80) {
        nextQuery = selectedText
      }
    }

    setShowDocumentSearch(true)
    documentSearchVisibleRef.current = true

    if (nextQuery !== currentQuery) {
      setDocumentSearchValue(nextQuery, { jumpToMatch: Boolean(nextQuery) })
    } else if (view) {
      syncDocumentSearchState(view.state)
    }

    window.setTimeout(() => {
      documentSearchInputRef.current?.focus()
      documentSearchInputRef.current?.select()
    }, 0)
  }, [setDocumentSearchValue, syncDocumentSearchState])

  const closeDocumentSearch = useCallback(() => {
    const view = editorViewRef.current
    documentSearchVisibleRef.current = false
    documentSearchQueryRef.current = ''
    setShowDocumentSearch(false)
    setDocumentSearchQuery('')
    setDocumentSearchStats({
      valid: true,
      total: 0,
      current: 0,
    })

    if (view) {
      view.dispatch({
        effects: setSearchQuery.of(new SearchQuery({
          search: '',
          caseSensitive: false,
        })),
      })
      view.focus()
    }
  }, [])

  const moveDocumentSearch = useCallback((direction: 'next' | 'prev') => {
    const view = editorViewRef.current
    if (!view || !documentSearchQueryRef.current.trim()) return

    if (direction === 'next') {
      findNext(view)
    } else {
      findPrevious(view)
    }

    syncDocumentSearchState(view.state)
  }, [syncDocumentSearchState])

  const executeCommandAction = useCallback((action: EditorCommandAction | undefined) => {
    if (!action) return
    clearSlashTriggerIfNeeded()
    action.onSelect()
    closeCommandPalette()
  }, [clearSlashTriggerIfNeeded, closeCommandPalette])

  useEffect(() => {
    if (!showCommandPalette) return
    commandInputRef.current?.focus()
  }, [showCommandPalette])

  useEffect(() => {
    if (!showDocumentSearch) return
    documentSearchInputRef.current?.focus()
    documentSearchInputRef.current?.select()
  }, [showDocumentSearch])

  useEffect(() => {
    setSelectedCommandIndex(0)
  }, [commandQuery, showCommandPalette])

  useEffect(() => {
    if (!editorRootRef.current || editorViewRef.current) return

    const view = new EditorView({
      parent: editorRootRef.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(),
          markdown(),
          history(),
          indentOnInput(),
          bracketMatching(),
          closeBrackets(),
          foldGutter(),
          search(),
          syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
          EditorState.allowMultipleSelections.of(true),
          EditorView.lineWrapping,
          EditorView.theme({
            '&': {
              height: '100%',
              fontSize: '0.875rem',
              backgroundColor: '#FFFFFF',
            },
            '.cm-scroller': {
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, monospace',
              lineHeight: '1.7',
            },
            '.cm-content': {
              padding: '0',
              minHeight: '100%',
            },
            '.cm-gutters': {
              borderRight: '1px solid #F1F5F9',
              backgroundColor: '#FFFFFF',
            },
            '.cm-activeLineGutter': {
              backgroundColor: '#F8FAFC',
            },
            '.cm-activeLine': {
              backgroundColor: 'rgba(99, 102, 241, 0.04)',
            },
            '.cm-searchMatch': {
              backgroundColor: 'rgba(251, 191, 36, 0.24)',
              boxShadow: 'inset 0 0 0 1px rgba(245, 158, 11, 0.18)',
              borderRadius: '3px',
            },
            '.cm-searchMatch.cm-searchMatch-selected': {
              backgroundColor: 'rgba(99, 102, 241, 0.2)',
              boxShadow: 'inset 0 0 0 1px rgba(99, 102, 241, 0.26)',
            },
          }),
          autocompletion({
            override: [wikiLinkCompletion],
            activateOnTyping: true,
            aboveCursor: true,
          }),
          keymap.of([
            { key: 'Mod-f', run: () => runToolbarAction(openDocumentSearch) },
            { key: 'F3', run: () => runToolbarAction(() => moveDocumentSearch('next')) },
            { key: 'Shift-F3', run: () => runToolbarAction(() => moveDocumentSearch('prev')) },
            {
              key: 'Escape',
              run: () => {
                if (!documentSearchVisibleRef.current) return false
                closeDocumentSearch()
                return true
              },
            },
            { key: 'Mod-Shift-p', run: () => runToolbarAction(openCommandPalette) },
            { key: 'Mod-b', run: () => runToolbarAction(() => applyWrap('**', '**', '重点内容')) },
            { key: 'Mod-i', run: () => runToolbarAction(() => applyWrap('*', '*', '强调内容')) },
            { key: 'Mod-k', run: () => runToolbarAction(insertLink) },
            { key: 'Mod-Shift-k', run: () => runToolbarAction(insertWikiLink) },
            { key: 'Mod-Alt-1', run: () => runToolbarAction(() => applyLinePrefix('# ')) },
            { key: 'Mod-Alt-2', run: () => runToolbarAction(() => applyLinePrefix('## ')) },
            { key: 'Mod-Alt-c', run: () => runToolbarAction(() => applyWrap('```\n', '\n```', '代码片段')) },
            { key: 'Mod-Alt-d', run: () => runToolbarAction(insertCurrentDate) },
            { key: 'Mod-Alt-l', run: () => runToolbarAction(() => applyLinePrefix('- ')) },
            { key: 'Mod-Alt-o', run: () => runToolbarAction(openFilePicker) },
            { key: 'Mod-Alt-t', run: () => runToolbarAction(() => applyLinePrefix('- [ ] ')) },
            {
              key: 'Mod-Alt-Shift-t',
              run: () => runToolbarAction(insertTableSnippet),
            },
            indentWithTab,
            ...defaultKeymap,
            ...historyKeymap,
            ...foldKeymap,
            ...closeBracketsKeymap,
            ...completionKeymap,
          ]),
          EditorView.updateListener.of((update) => {
            if (update.docChanged && !isApplyingExternalValueRef.current) {
              pendingDocValueRef.current = update.state.doc.toString()
              if (changeFlushFrameRef.current === null) {
                changeFlushFrameRef.current = window.requestAnimationFrame(() => {
                  flushPendingDocValue()
                })
              }
              tryOpenSlashCommandPalette(update)
            }

            if (update.selectionSet) {
              handleSelectionChange(update)
            }

            if (documentSearchVisibleRef.current || getSearchQuery(update.state).search) {
              syncDocumentSearchState(update.state)
            }
          }),
          EditorView.domEventHandlers({
            blur: () => {
              flushPendingDocValue()
              return false
            },
          }),
        ],
      }),
    })

    editorViewRef.current = view

    return () => {
      clearEditorSelection()
      clearSelection()
      view.destroy()
      editorViewRef.current = null
    }
  }, [applyLinePrefix, applyWrap, closeDocumentSearch, clearEditorSelection, clearSelection, flushPendingDocValue, handleSelectionChange, insertCurrentDate, insertLink, insertTableSnippet, insertWikiLink, moveDocumentSearch, openCommandPalette, openDocumentSearch, openFilePicker, runToolbarAction, syncDocumentSearchState, tryOpenSlashCommandPalette, value, wikiLinkCompletion])

  useEffect(() => {
    const root = editorRootRef.current
    if (!root) return

    const handlePaste = (event: ClipboardEvent) => {
      const files = Array.from(event.clipboardData?.files ?? [])
      if (files.length === 0) return
      event.preventDefault()
      void insertAssetReferences(files)
    }

    const handleDragOver = (event: DragEvent) => {
      if (!event.dataTransfer?.types.includes('Files')) return
      event.preventDefault()
      setIsFileDragActive(true)
    }

    const handleDragLeave = (event: DragEvent) => {
      const relatedTarget = event.relatedTarget as Node | null
      if (relatedTarget && root.contains(relatedTarget)) return
      setIsFileDragActive(false)
    }

    const handleDrop = (event: DragEvent) => {
      const files = Array.from(event.dataTransfer?.files ?? [])
      if (files.length === 0) return
      event.preventDefault()
      setIsFileDragActive(false)
      void insertAssetReferences(files)
    }

    root.addEventListener('paste', handlePaste)
    root.addEventListener('dragover', handleDragOver)
    root.addEventListener('dragleave', handleDragLeave)
    root.addEventListener('drop', handleDrop)

    return () => {
      root.removeEventListener('paste', handlePaste)
      root.removeEventListener('dragover', handleDragOver)
      root.removeEventListener('dragleave', handleDragLeave)
      root.removeEventListener('drop', handleDrop)
    }
  }, [insertAssetReferences])

  useEffect(() => {
    const view = editorViewRef.current
    if (!view) return

    const currentValue = view.state.doc.toString()
    if (currentValue === value) return

    const { anchor, head } = view.state.selection.main
    isApplyingExternalValueRef.current = true

    try {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: value },
        selection: {
          anchor: Math.min(anchor, value.length),
          head: Math.min(head, value.length),
        },
      })
    } finally {
      isApplyingExternalValueRef.current = false
    }
  }, [value])

  return (
    <div className="editor-edit-shell flex h-full w-full flex-col overflow-hidden">
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(event) => {
          const files = Array.from(event.target.files ?? [])
          if (files.length > 0) {
            void insertAssetReferences(files)
          }
          event.currentTarget.value = ''
        }}
      />
      <div className="editor-edit-toolbar">
        <div className="editor-edit-toolbar__actions">
          <button
            type="button"
            className="editor-edit-toolbar__button editor-edit-toolbar__button--accent"
            onClick={() => openCommandPalette()}
            title={`命令面板 ${isMacOS ? '⌘⇧P' : 'Ctrl+Shift+P'}`}
          >
            <Command className="h-3.5 w-3.5" />
            <span>命令</span>
            <span className="editor-edit-toolbar__shortcut">{isMacOS ? '⌘⇧P' : 'Ctrl+Shift+P'}</span>
          </button>
          <button
            type="button"
            className={`editor-edit-toolbar__button ${showDocumentSearch ? 'editor-edit-toolbar__button--accent' : ''}`}
            onClick={showDocumentSearch ? closeDocumentSearch : openDocumentSearch}
            title={`文内搜索 ${isMacOS ? '⌘F' : 'Ctrl+F'}`}
          >
            <Search className="h-3.5 w-3.5" />
            <span>搜索</span>
            <span className="editor-edit-toolbar__shortcut">{isMacOS ? '⌘F' : 'Ctrl+F'}</span>
          </button>
          {primaryToolbarActions.map(({ id, label, icon: Icon, onClick: handleClick, shortcut }) => (
            <button
              key={id}
              type="button"
              className="editor-edit-toolbar__button"
              onClick={handleClick}
              title={`${label} ${shortcut}`}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{label}</span>
              <span className="editor-edit-toolbar__shortcut">{shortcut}</span>
            </button>
          ))}
          {secondaryToolbarActions.length > 0 && (
            <div className="editor-edit-toolbar__overflow" data-editor-toolbar-menu="true">
              <button
                ref={toolbarMenuButtonRef}
                type="button"
                className="editor-edit-toolbar__button"
                onClick={() => setShowToolbarMenu((open) => !open)}
                title="更多格式操作"
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
                <span>更多</span>
              </button>
            </div>
          )}
        </div>
        <div className="editor-edit-toolbar__meta">
          <span>{isMacOS ? '⌘F' : 'Ctrl+F'} 文内搜索</span>
          <span>{isMacOS ? '⌘⇧P' : 'Ctrl+Shift+P'} 命令面板</span>
          <span>/ 打开快速命令</span>
          <span>拖拽 / 粘贴素材</span>
        </div>
      </div>
      {showDocumentSearch && (
        <div className="editor-edit-searchbar">
          <div className="editor-edit-searchbar__field">
            <Search className="h-3.5 w-3.5 text-slate-400" />
            <input
              ref={documentSearchInputRef}
              value={documentSearchQuery}
              onChange={(event) => setDocumentSearchValue(event.target.value, { jumpToMatch: true })}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  moveDocumentSearch(event.shiftKey ? 'prev' : 'next')
                  return
                }

                if (event.key === 'Escape') {
                  event.preventDefault()
                  closeDocumentSearch()
                }
              }}
              placeholder="搜索当前文档，Enter 下一个，Shift+Enter 上一个"
              className="editor-edit-searchbar__input"
            />
          </div>
          <div className="editor-edit-searchbar__meta">
            <span className={`editor-edit-searchbar__count ${!documentSearchStats.valid ? 'editor-edit-searchbar__count--error' : ''}`}>
              {!documentSearchQuery
                ? '输入关键字'
                : !documentSearchStats.valid
                  ? '查询无效'
                  : documentSearchStats.total === 0
                    ? '无结果'
                    : `${documentSearchStats.current} / ${documentSearchStats.total}`}
            </span>
            <button
              type="button"
              className="editor-edit-searchbar__button"
              onClick={() => moveDocumentSearch('prev')}
              disabled={!documentSearchStats.total}
              title="上一个匹配 Shift+Enter / Shift+F3"
            >
              <ChevronUp className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              className="editor-edit-searchbar__button"
              onClick={() => moveDocumentSearch('next')}
              disabled={!documentSearchStats.total}
              title="下一个匹配 Enter / F3"
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              className="editor-edit-searchbar__button"
              onClick={closeDocumentSearch}
              title="关闭搜索"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
      <div ref={editorRootRef} className="min-h-0 flex-1 w-full overflow-hidden" />

      {assetNotice && (
        <div className="editor-asset-notice">
          <div className="min-w-0 flex-1">
            <div>{assetNotice.message}</div>
            {assetNotice.detail && (
              <div className="mt-1 truncate text-[11px]" style={{ color: '#6366F1' }}>
                {assetNotice.detail}
              </div>
            )}
          </div>
          <button type="button" onClick={clearAssetNotice} className="editor-asset-notice__close">
            关闭
          </button>
        </div>
      )}

      {isFileDragActive && (
        <div className="editor-drop-overlay">
          <div className="editor-drop-overlay__card">
            <Paperclip className="h-5 w-5" />
            <div className="editor-drop-overlay__title">释放文件即可写入当前知识的 assets 目录</div>
            <div className="editor-drop-overlay__hint">图片会生成 Markdown 图片链接，其他文件会生成附件链接；重复文件会优先复用。</div>
          </div>
        </div>
      )}

      {showToolbarMenu && toolbarMenuPosition && typeof document !== 'undefined' && createPortal(
        <div
          className="editor-edit-toolbar__menu"
          data-editor-toolbar-menu="true"
          style={{
            position: 'fixed',
            top: toolbarMenuPosition.top,
            left: Math.max(12, toolbarMenuPosition.left),
            right: 'auto',
            zIndex: 80,
          }}
        >
          {secondaryToolbarActions.map(({ id, label, icon: Icon, onClick: handleClick, shortcut }) => (
            <button
              key={id}
              type="button"
              className="editor-edit-toolbar__menu-item"
              onClick={() => {
                handleClick()
                setShowToolbarMenu(false)
              }}
            >
              <span className="editor-edit-toolbar__menu-label">
                <Icon className="h-3.5 w-3.5" />
                <span>{label}</span>
              </span>
              <span className="editor-edit-toolbar__menu-shortcut">{shortcut}</span>
            </button>
          ))}
        </div>,
        document.body,
      )}

      {isImportingAssets && (
        <div className="editor-import-overlay">
          <div className="editor-import-overlay__card">
            正在导入 {pendingImportCount || '...'} 个素材…
          </div>
        </div>
      )}

      {showCommandPalette && (
        <>
          <button
            type="button"
            className="editor-command-palette__backdrop"
            aria-label="关闭命令面板"
            onClick={closeCommandPalette}
          />
          <div className="editor-command-palette">
            <div className="editor-command-palette__header">
              <Command className="h-4 w-4" />
              <input
                ref={commandInputRef}
                value={commandQuery}
                onChange={(event) => setCommandQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    event.preventDefault()
                    closeCommandPalette()
                    return
                  }

                  if (event.key === 'ArrowDown') {
                    event.preventDefault()
                    if (filteredCommandActions.length > 0) {
                      setSelectedCommandIndex((index) => Math.min(index + 1, filteredCommandActions.length - 1))
                    }
                    return
                  }

                  if (event.key === 'ArrowUp') {
                    event.preventDefault()
                    if (filteredCommandActions.length > 0) {
                      setSelectedCommandIndex((index) => Math.max(index - 1, 0))
                    }
                    return
                  }

                  if (event.key === 'Enter') {
                    event.preventDefault()
                    executeCommandAction(filteredCommandActions[selectedCommandIndex])
                  }
                }}
                placeholder="输入命令或标题，例如 加粗 / H2 / 项目复盘，也可在空行输入 /"
                className="editor-command-palette__input"
              />
            </div>
            <div className="editor-command-palette__list">
              {filteredCommandActions.length > 0 ? (
                groupedCommandActions.map((group) => (
                  <div key={group.section} className="editor-command-palette__group">
                    <div className="editor-command-palette__group-title">{group.section}</div>
                    {group.actions.map((action) => (
                        <button
                          key={action.id}
                          type="button"
                          className={`editor-command-palette__item ${action.index === selectedCommandIndex ? 'editor-command-palette__item--active' : ''}`}
                          onMouseEnter={() => setSelectedCommandIndex(action.index)}
                          onClick={() => executeCommandAction(action)}
                        >
                          <span className="editor-command-palette__section">{action.section}</span>
                          <span className="editor-command-palette__label">{action.label}</span>
                          {action.shortcut && (
                            <span className="editor-command-palette__shortcut">{action.shortcut}</span>
                          )}
                        </button>
                    ))}
                  </div>
                ))
              ) : (
                <div className="editor-command-palette__empty">
                  没有匹配命令，可尝试格式名、快捷键或标题关键词
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
