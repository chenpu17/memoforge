import React, { Fragment, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'
import StarterKit from '@tiptap/starter-kit'
import { Markdown } from '@tiptap/markdown'
import Link from '@tiptap/extension-link'
import ImageExtension from '@tiptap/extension-image'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import { TableKit } from '@tiptap/extension-table'
import Placeholder from '@tiptap/extension-placeholder'
import {
  Bold,
  Brackets,
  Code2,
  Heading1,
  Heading2,
  Image as ImageIcon,
  Italic,
  Link2,
  List,
  ListOrdered,
  ListTodo,
  Minus,
  Paperclip,
  Plus,
  Quote,
  Redo2,
  Table2,
  Trash2,
  Undo2,
} from 'lucide-react'
import type { EditorProps } from './Editor'
import type { KnowledgeLinkCompletion } from '../types'
import { tauriService } from '../services/tauri'
import { EditorRichWikiLink } from './EditorRichWikiLink'

type RichToolbarButtonProps = {
  label: string
  icon: React.ComponentType<{ className?: string }>
  onClick: () => void
  active?: boolean
  disabled?: boolean
  buttonRef?: React.Ref<HTMLButtonElement>
}

type SlashCommand = {
  id: string
  label: string
  description: string
  keywords: string
  section: '格式' | '插入'
  icon: React.ComponentType<{ className?: string }>
  run: () => void
}

type ImageDraft = {
  src: string
  alt: string
}

const isVitestEnvironment = Boolean((import.meta as ImportMeta & { vitest?: boolean }).vitest)

const RichToolbarButton: React.FC<RichToolbarButtonProps> = ({
  label,
  icon: Icon,
  onClick,
  active = false,
  disabled = false,
  buttonRef,
}) => (
  <button
    type="button"
    ref={buttonRef}
    onClick={onClick}
    disabled={disabled}
    className="editor-rich-toolbar__button"
    data-active={active ? 'true' : 'false'}
    title={label}
    aria-label={label}
  >
    <Icon className="h-3.5 w-3.5" />
    <span>{label}</span>
  </button>
)

function createRichExtensions() {
  return [
    StarterKit.configure({
      link: false,
    }),
    Markdown.configure({
      markedOptions: {
        gfm: true,
      },
    }),
    Link.configure({
      openOnClick: false,
      autolink: true,
      defaultProtocol: 'https',
      isAllowedUri: (url, context) => {
        if (url.startsWith('./') || url.startsWith('../') || url.startsWith('/')) {
          return true
        }
        return context.defaultValidate(url)
      },
    }),
    EditorRichWikiLink,
    ImageExtension.configure({
      inline: false,
      allowBase64: true,
    }),
    TaskList,
    TaskItem.configure({
      nested: true,
    }),
    TableKit.configure({
      table: {
        resizable: false,
      },
    }),
    Placeholder.configure({
      placeholder: '在这里直接输入内容，系统会自动保存为 Markdown',
      emptyEditorClass: 'is-editor-empty',
    }),
  ]
}

function getActiveSlashQuery(editor: Editor | null) {
  if (!editor) return null

  const { state } = editor
  const selection = state.selection
  if (!selection.empty) return null

  const { $from } = selection
  if (!$from.parent.isTextblock) return null

  const textBefore = $from.parent.textBetween(0, $from.parentOffset, ' ', '\uFFFC')
  const match = /(?:^|\s)\/([^\s/]*)$/.exec(textBefore)
  if (!match) return null

  const fullMatch = match[0]
  const query = match[1] ?? ''
  const slashOffset = textBefore.length - fullMatch.length + (fullMatch.startsWith(' ') ? 1 : 0)

  return {
    query,
    from: $from.start() + slashOffset,
    to: selection.from,
  }
}

function renderHighlightedText(text: string, query: string) {
  const normalizedQuery = query.trim()
  if (!normalizedQuery) {
    return text
  }

  const lowerText = text.toLowerCase()
  const lowerQuery = normalizedQuery.toLowerCase()
  const matchIndex = lowerText.indexOf(lowerQuery)
  if (matchIndex === -1) {
    return text
  }

  const matchEnd = matchIndex + normalizedQuery.length
  return (
    <>
      {text.slice(0, matchIndex)}
      <mark className="editor-rich-picker__highlight">{text.slice(matchIndex, matchEnd)}</mark>
      {text.slice(matchEnd)}
    </>
  )
}

function normalizeRichMarkdown(markdown: string) {
  return markdown.trimEnd()
}

export const EditorRich: React.FC<EditorProps> = ({
  value,
  onChange,
  knowledgePath,
  knowledgeTitle,
  readOnly = false,
}) => {
  const deferredValue = useDeferredValue(value)
  const suppressUpdateRef = useRef(false)
  const changeFrameRef = useRef<number | null>(null)
  const pendingMarkdownRef = useRef<string | null>(null)
  const onChangeRef = useRef(onChange)
  const wikiButtonRef = useRef<HTMLButtonElement | null>(null)
  const wikiInputRef = useRef<HTMLInputElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const surfaceRef = useRef<HTMLDivElement | null>(null)
  const extensions = useMemo(() => createRichExtensions(), [])
  const [showWikiPicker, setShowWikiPicker] = useState(false)
  const [wikiQuery, setWikiQuery] = useState('')
  const [wikiResults, setWikiResults] = useState<KnowledgeLinkCompletion[]>([])
  const [wikiLoading, setWikiLoading] = useState(false)
  const [wikiError, setWikiError] = useState<string | null>(null)
  const [wikiActiveIndex, setWikiActiveIndex] = useState(0)
  const [assetNotice, setAssetNotice] = useState<{ message: string; detail?: string } | null>(null)
  const [isImportingAssets, setIsImportingAssets] = useState(false)
  const [pendingImportCount, setPendingImportCount] = useState(0)
  const [isFileDragActive, setIsFileDragActive] = useState(false)
  const [showSlashPicker, setShowSlashPicker] = useState(false)
  const [slashQuery, setSlashQuery] = useState('')
  const [slashRange, setSlashRange] = useState<{ from: number; to: number } | null>(null)
  const [slashActiveIndex, setSlashActiveIndex] = useState(0)
  const [imageDraft, setImageDraft] = useState<ImageDraft>({ src: '', alt: '' })
  const deferredWikiQuery = useDeferredValue(wikiQuery)

  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  useEffect(() => {
    if (!assetNotice) return

    const timer = window.setTimeout(() => {
      setAssetNotice(null)
    }, 2600)

    return () => window.clearTimeout(timer)
  }, [assetNotice])

  useEffect(() => () => {
    if (changeFrameRef.current !== null) {
      window.cancelAnimationFrame(changeFrameRef.current)
    }
  }, [])

  const editor = useEditor({
    extensions,
    content: value,
    contentType: 'markdown',
    editable: !readOnly,
    immediatelyRender: true,
    editorProps: {
      attributes: {
        class: 'editor-rich__content',
      },
    },
    onUpdate({ editor: instance }) {
      if (suppressUpdateRef.current) return

      pendingMarkdownRef.current = normalizeRichMarkdown(instance.getMarkdown())
      if (changeFrameRef.current !== null) {
        return
      }

      changeFrameRef.current = window.requestAnimationFrame(() => {
        changeFrameRef.current = null
        const nextMarkdown = pendingMarkdownRef.current
        pendingMarkdownRef.current = null
        if (nextMarkdown !== null) {
          onChangeRef.current(nextMarkdown)
        }
      })
    },
  }, [readOnly])

  const editorUiState = useEditorState({
    editor,
    selector: ({ editor: instance }) => {
      const isImageSelected = instance.isActive('image')
      const imageAttrs = isImageSelected
        ? instance.getAttributes('image')
        : { src: '', alt: '' }

      return {
        isInTable: instance.isActive('table'),
        hasActiveWikiLink: instance.isActive('wikiLink'),
        isImageSelected,
        imageAttrs: {
          src: String(imageAttrs.src ?? ''),
          alt: String(imageAttrs.alt ?? ''),
        },
      }
    },
  }) ?? {
    isInTable: false,
    hasActiveWikiLink: false,
    isImageSelected: false,
    imageAttrs: { src: '', alt: '' },
  }

  useEffect(() => {
    if (!editor) return

    const nextValue = normalizeRichMarkdown(deferredValue || '')
    const currentValue = normalizeRichMarkdown(editor.getMarkdown())
    if (nextValue === currentValue) {
      return
    }

    suppressUpdateRef.current = true
    editor.commands.setContent(nextValue, {
      contentType: 'markdown',
    })
    queueMicrotask(() => {
      suppressUpdateRef.current = false
    })
  }, [deferredValue, editor])

  useEffect(() => {
    if (!editorUiState.isImageSelected) {
      setImageDraft((current) => (
        current.src || current.alt ? { src: '', alt: '' } : current
      ))
      return
    }

    setImageDraft((current) => (
      current.src === editorUiState.imageAttrs.src && current.alt === editorUiState.imageAttrs.alt
        ? current
        : {
            src: editorUiState.imageAttrs.src,
            alt: editorUiState.imageAttrs.alt,
          }
    ))
  }, [
    editorUiState.imageAttrs.alt,
    editorUiState.imageAttrs.src,
    editorUiState.isImageSelected,
  ])

  useEffect(() => {
    if (!showWikiPicker) return

    queueMicrotask(() => {
      wikiInputRef.current?.focus()
      wikiInputRef.current?.select()
    })
  }, [showWikiPicker])

  useEffect(() => {
    if (!showWikiPicker) return

    let cancelled = false
    setWikiLoading(true)
    setWikiError(null)

    void tauriService.completeKnowledgeLinks(deferredWikiQuery.trim(), 8)
      .then((entries) => {
        if (cancelled) return
        setWikiResults(entries)
        setWikiActiveIndex((current) => {
          if (entries.length === 0) return 0
          return Math.min(current, entries.length - 1)
        })
      })
      .catch((error) => {
        if (cancelled) return
        console.error('Failed to load wiki link completions:', error)
        setWikiResults([])
        setWikiError('知识链接候选加载失败')
      })
      .finally(() => {
        if (!cancelled) {
          setWikiLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [deferredWikiQuery, showWikiPicker])

  const resetSlashPicker = useCallback(() => {
    setShowSlashPicker(false)
    setSlashQuery('')
    setSlashRange(null)
    setSlashActiveIndex(0)
  }, [])

  useEffect(() => {
    const root = surfaceRef.current
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
  }, [editor, knowledgePath])

  const applyLink = useCallback(() => {
    if (!editor) return

    const previousHref = editor.getAttributes('link').href ?? ''
    const nextHref = window.prompt('输入链接地址，留空则移除链接', previousHref)
    if (nextHref === null) return

    const normalizedHref = nextHref.trim()
    if (!normalizedHref) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
      return
    }

    editor.chain().focus().extendMarkRange('link').setLink({ href: normalizedHref }).run()
  }, [editor])

  const insertImage = useCallback(() => {
    if (!editor) return

    const src = window.prompt('输入图片地址')
    if (!src) return

    editor.chain().focus().setImage({ src: src.trim(), alt: knowledgeTitle || 'image' }).run()
  }, [editor, knowledgeTitle])

  const insertTable = useCallback(() => {
    if (!editor) return
    editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
  }, [editor])

  const showAssetInsertedNotice = useCallback((message: string, detail?: string) => {
    setAssetNotice({ message, detail })
  }, [])

  const clearAssetNotice = useCallback(() => {
    setAssetNotice(null)
  }, [])

  const applyImageAttributes = useCallback(() => {
    if (!editor || !editorUiState.isImageSelected) return

    const nextSrc = imageDraft.src.trim()
    if (!nextSrc) {
      showAssetInsertedNotice('图片地址不能为空。')
      return
    }

    const nextAlt = imageDraft.alt.trim()
    editor.chain().focus().updateAttributes('image', {
      src: nextSrc,
      alt: nextAlt || knowledgeTitle || 'image',
    }).run()

    showAssetInsertedNotice(
      '已更新当前图片。',
      nextAlt ? `alt: ${nextAlt}` : nextSrc,
    )
  }, [editor, editorUiState.isImageSelected, imageDraft.alt, imageDraft.src, knowledgeTitle, showAssetInsertedNotice])

  const removeSelectedImage = useCallback(() => {
    if (!editor || !editorUiState.isImageSelected) return

    editor.chain().focus().deleteNode('image').run()
    showAssetInsertedNotice('已移除当前图片。')
  }, [editor, editorUiState.isImageSelected, showAssetInsertedNotice])

  const openFilePicker = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const removeSlashTrigger = useCallback(() => {
    if (!editor || !slashRange) return

    editor.chain().focus().deleteRange(slashRange).run()
    setSlashRange(null)
  }, [editor, slashRange])

  const dismissSlashPicker = useCallback(() => {
    if (editor && slashRange) {
      editor.chain().focus().deleteRange(slashRange).run()
    }
    resetSlashPicker()
  }, [editor, resetSlashPicker, slashRange])

  const insertImportedAssets = useCallback((assets: Array<{ file_name: string; relative_path: string; markdown: string; reused: boolean }>) => {
    if (!editor) return

    assets.forEach((asset, index) => {
      const isImageAsset = asset.markdown.startsWith('![')
      if (isImageAsset) {
        const alt = asset.file_name.replace(/\.[^.]+$/, '')
        editor.chain().focus().setImage({ src: asset.relative_path, alt }).run()
      } else {
        editor.chain().focus().insertContent({
          type: 'text',
          text: asset.file_name,
          marks: [
            {
              type: 'link',
              attrs: { href: asset.relative_path },
            },
          ],
        }).run()
      }

      if (index !== assets.length - 1) {
        editor.chain().focus().createParagraphNear().run()
      }
    })
  }, [editor])

  const insertAssetReferences = useCallback(async (files: File[]) => {
    if (!editor || files.length === 0) return

    if (!knowledgePath) {
      showAssetInsertedNotice(
        '当前知识尚未持久化，暂不能自动导入素材。',
        '请先保存知识，再通过拖拽、粘贴或文件选择器导入图片/附件。',
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

      insertImportedAssets(imported)
      const reusedCount = imported.filter((asset) => asset.reused).length
      const importedCount = imported.length - reusedCount
      showAssetInsertedNotice(
        reusedCount > 0
          ? `已写入 ${importedCount} 个素材，复用 ${reusedCount} 个现有文件。`
          : `已导入 ${imported.length} 个素材到当前知识的 assets 目录。`,
        imported.slice(0, 3).map((asset) => asset.relative_path).join(' · '),
      )
    } catch (error) {
      console.error('Failed to import assets in rich editor:', error)
      showAssetInsertedNotice(
        '自动导入素材失败。',
        '请确认当前文档已保存，并在桌面模式下再次尝试。',
      )
    } finally {
      setIsImportingAssets(false)
      setPendingImportCount(0)
    }
  }, [editor, insertImportedAssets, knowledgePath, showAssetInsertedNotice])

  const openWikiPicker = useCallback(() => {
    if (!editor) return

    const selection = editor.state.selection
    const selectedText = selection.empty
      ? ''
      : editor.state.doc.textBetween(selection.from, selection.to, ' ').trim()
    const currentTarget = editor.getAttributes('wikiLink').target ?? ''

    setWikiQuery(currentTarget || selectedText || '')
    setWikiActiveIndex(0)
    setWikiError(null)
    setShowWikiPicker(true)
  }, [editor])

  const closeWikiPicker = useCallback(() => {
    setShowWikiPicker(false)
    setWikiError(null)
    setWikiLoading(false)
  }, [])

  const slashCommands = useMemo<SlashCommand[]>(() => [
    {
      id: 'heading1',
      label: '标题 1',
      description: '创建一级标题，适合章节开头',
      keywords: 'h1 title heading 标题 一级',
      section: '格式',
      icon: Heading1,
      run: () => {
        removeSlashTrigger()
        editor?.chain().focus().toggleHeading({ level: 1 }).run()
      },
    },
    {
      id: 'heading2',
      label: '标题 2',
      description: '创建二级标题，适合小节分组',
      keywords: 'h2 title heading 标题 二级',
      section: '格式',
      icon: Heading2,
      run: () => {
        removeSlashTrigger()
        editor?.chain().focus().toggleHeading({ level: 2 }).run()
      },
    },
    {
      id: 'bullet',
      label: '无序列表',
      description: '插入项目符号列表',
      keywords: 'list bullet 列表 无序',
      section: '格式',
      icon: List,
      run: () => {
        removeSlashTrigger()
        editor?.chain().focus().toggleBulletList().run()
      },
    },
    {
      id: 'ordered',
      label: '有序列表',
      description: '插入有顺序编号的列表',
      keywords: 'list ordered 列表 有序',
      section: '格式',
      icon: ListOrdered,
      run: () => {
        removeSlashTrigger()
        editor?.chain().focus().toggleOrderedList().run()
      },
    },
    {
      id: 'task',
      label: '任务列表',
      description: '插入可勾选的待办清单',
      keywords: 'task todo checklist 待办 任务',
      section: '格式',
      icon: ListTodo,
      run: () => {
        removeSlashTrigger()
        editor?.chain().focus().toggleTaskList().run()
      },
    },
    {
      id: 'quote',
      label: '引用块',
      description: '突出引用内容或备注说明',
      keywords: 'quote block 引用',
      section: '格式',
      icon: Quote,
      run: () => {
        removeSlashTrigger()
        editor?.chain().focus().toggleBlockquote().run()
      },
    },
    {
      id: 'code',
      label: '代码块',
      description: '插入多行代码或命令片段',
      keywords: 'code block 代码',
      section: '格式',
      icon: Code2,
      run: () => {
        removeSlashTrigger()
        editor?.chain().focus().toggleCodeBlock().run()
      },
    },
    {
      id: 'table',
      label: '插入表格',
      description: '快速插入 3 x 3 表格',
      keywords: 'table 插入 表格',
      section: '插入',
      icon: Table2,
      run: () => {
        removeSlashTrigger()
        insertTable()
      },
    },
    {
      id: 'divider',
      label: '分隔线',
      description: '在内容之间插入视觉分割',
      keywords: 'divider hr separator 分隔线',
      section: '格式',
      icon: Minus,
      run: () => {
        removeSlashTrigger()
        editor?.chain().focus().setHorizontalRule().run()
      },
    },
    {
      id: 'wiki',
      label: '知识链接',
      description: '链接到知识库中的其他文档',
      keywords: 'wiki knowledge link 知识 链接',
      section: '插入',
      icon: Brackets,
      run: () => {
        removeSlashTrigger()
        openWikiPicker()
      },
    },
    {
      id: 'file',
      label: '导入文件',
      description: '插入图片或附件，并写入 assets',
      keywords: 'file image upload import 文件 图片 导入',
      section: '插入',
      icon: Paperclip,
      run: () => {
        removeSlashTrigger()
        openFilePicker()
      },
    },
  ], [editor, insertTable, openFilePicker, openWikiPicker, removeSlashTrigger])

  const filteredSlashCommands = useMemo(() => {
    const normalizedQuery = slashQuery.trim().toLowerCase()
    if (!normalizedQuery) return slashCommands

    return slashCommands.filter((command) => (
      command.label.toLowerCase().includes(normalizedQuery) ||
      command.keywords.toLowerCase().includes(normalizedQuery)
    ))
  }, [slashCommands, slashQuery])

  const groupedSlashCommands = useMemo(() => {
    const groups: Array<{ section: SlashCommand['section']; commands: SlashCommand[] }> = []
    filteredSlashCommands.forEach((command) => {
      const existingGroup = groups.find((group) => group.section === command.section)
      if (existingGroup) {
        existingGroup.commands.push(command)
        return
      }

      groups.push({
        section: command.section,
        commands: [command],
      })
    })
    return groups
  }, [filteredSlashCommands])

  useEffect(() => {
    const active = getActiveSlashQuery(editor)
    if (!active) {
      if (showSlashPicker) {
        resetSlashPicker()
      }
      return
    }

    setShowSlashPicker(true)
    setSlashRange({ from: active.from, to: active.to })
    setSlashQuery(active.query)
    setSlashActiveIndex((current) => {
      const nextLength = filteredSlashCommands.length || slashCommands.length
      return Math.min(current, Math.max(0, nextLength - 1))
    })
  }, [editor, filteredSlashCommands.length, resetSlashPicker, showSlashPicker, slashCommands.length, value])

  const applyWikiLink = useCallback((entry: KnowledgeLinkCompletion) => {
    if (!editor) return

    const selection = editor.state.selection
    const selectedText = selection.empty
      ? ''
      : editor.state.doc.textBetween(selection.from, selection.to, ' ').trim()
    const displayText = selectedText || entry.title || entry.id

    if (selection.empty) {
      editor.chain().focus().insertContent({
        type: 'text',
        text: displayText,
        marks: [
          {
            type: 'wikiLink',
            attrs: { target: entry.id },
          },
        ],
      }).run()
    } else {
      editor.chain().focus().setWikiLink({ target: entry.id }).run()
    }

    closeWikiPicker()
  }, [closeWikiPicker, editor])

  const removeWikiLink = useCallback(() => {
    if (!editor) return
    editor.chain().focus().unsetWikiLink().run()
    closeWikiPicker()
  }, [closeWikiPicker, editor])

  const toggleBlock = useCallback((run: (editor: Editor) => boolean) => {
    if (!editor) return
    run(editor)
  }, [editor])

  const handleWikiPickerKeyDown = useCallback((event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      closeWikiPicker()
      return
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setWikiActiveIndex((current) => (
        wikiResults.length === 0 ? 0 : (current + 1) % wikiResults.length
      ))
      return
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setWikiActiveIndex((current) => (
        wikiResults.length === 0 ? 0 : (current - 1 + wikiResults.length) % wikiResults.length
      ))
      return
    }

    if (event.key === 'Enter' && wikiResults[wikiActiveIndex]) {
      event.preventDefault()
      applyWikiLink(wikiResults[wikiActiveIndex])
    }
  }, [applyWikiLink, closeWikiPicker, wikiActiveIndex, wikiResults])

  const handleRichEditorKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!showSlashPicker) return

    if (event.key === 'Escape') {
      event.preventDefault()
      dismissSlashPicker()
      return
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setSlashActiveIndex((current) => (
        filteredSlashCommands.length === 0 ? 0 : (current + 1) % filteredSlashCommands.length
      ))
      return
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setSlashActiveIndex((current) => (
        filteredSlashCommands.length === 0 ? 0 : (current - 1 + filteredSlashCommands.length) % filteredSlashCommands.length
      ))
      return
    }

    if (event.key === 'Enter' && filteredSlashCommands[slashActiveIndex]) {
      event.preventDefault()
      filteredSlashCommands[slashActiveIndex].run()
      resetSlashPicker()
    }
  }, [dismissSlashPicker, filteredSlashCommands, resetSlashPicker, showSlashPicker, slashActiveIndex])

  if (!editor) {
    return (
      <div className="flex h-full w-full items-center justify-center text-sm text-neutral-400">
        加载高级编辑器中...
      </div>
    )
  }

  const isInTable = editorUiState.isInTable
  const hasActiveWikiLink = editorUiState.hasActiveWikiLink
  const isImageSelected = editorUiState.isImageSelected
  const imageHasPendingChanges = (
    imageDraft.src !== editorUiState.imageAttrs.src ||
    imageDraft.alt !== editorUiState.imageAttrs.alt
  )

  return (
    <div className="editor-rich" data-readonly={readOnly ? 'true' : 'false'}>
      <div className="editor-rich-toolbar-shell">
        <div className="editor-rich-toolbar">
          <div className="editor-rich-toolbar__group">
            <RichToolbarButton
              label="标题 1"
              icon={Heading1}
              onClick={() => toggleBlock((instance) => instance.chain().focus().toggleHeading({ level: 1 }).run())}
              active={editor.isActive('heading', { level: 1 })}
            />
            <RichToolbarButton
              label="标题 2"
              icon={Heading2}
              onClick={() => toggleBlock((instance) => instance.chain().focus().toggleHeading({ level: 2 }).run())}
              active={editor.isActive('heading', { level: 2 })}
            />
            <RichToolbarButton
              label="加粗"
              icon={Bold}
              onClick={() => toggleBlock((instance) => instance.chain().focus().toggleBold().run())}
              active={editor.isActive('bold')}
            />
            <RichToolbarButton
              label="斜体"
              icon={Italic}
              onClick={() => toggleBlock((instance) => instance.chain().focus().toggleItalic().run())}
              active={editor.isActive('italic')}
            />
            <RichToolbarButton
              label="引用"
              icon={Quote}
              onClick={() => toggleBlock((instance) => instance.chain().focus().toggleBlockquote().run())}
              active={editor.isActive('blockquote')}
            />
          </div>

          <div className="editor-rich-toolbar__group">
            <RichToolbarButton
              label="无序列表"
              icon={List}
              onClick={() => toggleBlock((instance) => instance.chain().focus().toggleBulletList().run())}
              active={editor.isActive('bulletList')}
            />
            <RichToolbarButton
              label="有序列表"
              icon={ListOrdered}
              onClick={() => toggleBlock((instance) => instance.chain().focus().toggleOrderedList().run())}
              active={editor.isActive('orderedList')}
            />
            <RichToolbarButton
              label="任务列表"
              icon={ListTodo}
              onClick={() => toggleBlock((instance) => instance.chain().focus().toggleTaskList().run())}
              active={editor.isActive('taskList')}
            />
            <RichToolbarButton
              label="代码块"
              icon={Code2}
              onClick={() => toggleBlock((instance) => instance.chain().focus().toggleCodeBlock().run())}
              active={editor.isActive('codeBlock')}
            />
            <RichToolbarButton
              label="分隔线"
              icon={Minus}
              onClick={() => toggleBlock((instance) => instance.chain().focus().setHorizontalRule().run())}
            />
          </div>

          <div className="editor-rich-toolbar__group">
            <RichToolbarButton
              label="链接"
              icon={Link2}
              onClick={applyLink}
              active={editor.isActive('link')}
            />
            <RichToolbarButton
              label="知识链接"
              icon={Brackets}
              onClick={openWikiPicker}
              active={hasActiveWikiLink || showWikiPicker}
              buttonRef={wikiButtonRef}
            />
            <RichToolbarButton
              label="图片"
              icon={ImageIcon}
              onClick={insertImage}
            />
            <RichToolbarButton
              label="文件"
              icon={Paperclip}
              onClick={openFilePicker}
            />
            <RichToolbarButton
              label="表格"
              icon={Table2}
              onClick={insertTable}
            />
            <RichToolbarButton
              label="撤销"
              icon={Undo2}
              onClick={() => toggleBlock((instance) => instance.chain().focus().undo().run())}
              disabled={!editor.can().chain().focus().undo().run()}
            />
            <RichToolbarButton
              label="重做"
              icon={Redo2}
              onClick={() => toggleBlock((instance) => instance.chain().focus().redo().run())}
              disabled={!editor.can().chain().focus().redo().run()}
            />
          </div>
        </div>

        {(showWikiPicker || showSlashPicker || isInTable || isImageSelected) && (
          <div className="editor-rich-toolbar__context">
            {showSlashPicker && (
              <div className="editor-rich-picker" data-editor-rich-picker="true">
                <div className="editor-rich-picker__header">
                  <div className="editor-rich-picker__title">斜杠菜单</div>
                  <button
                    type="button"
                    className="editor-rich-picker__dismiss"
                    onClick={dismissSlashPicker}
                  >
                    关闭
                  </button>
                </div>
                <div className="editor-rich-picker__meta">
                  输入关键词即可过滤命令，回车可直接执行当前高亮项。
                </div>
                <div className="editor-rich-picker__results">
                  {groupedSlashCommands.length === 0 ? (
                    <div className="editor-rich-picker__empty">没有匹配的命令。</div>
                  ) : (
                    groupedSlashCommands.map((group) => (
                      <Fragment key={group.section}>
                        <div className="editor-rich-picker__group-label">{group.section}</div>
                        {group.commands.map((command) => {
                          const Icon = command.icon
                          const commandIndex = filteredSlashCommands.findIndex((item) => item.id === command.id)
                          return (
                            <button
                              key={command.id}
                              type="button"
                              className="editor-rich-picker__item"
                              data-active={commandIndex === slashActiveIndex ? 'true' : 'false'}
                              onMouseEnter={() => setSlashActiveIndex(commandIndex)}
                              onClick={() => {
                                command.run()
                                resetSlashPicker()
                              }}
                            >
                              <div className="editor-rich-picker__item-main">
                                <div className="editor-rich-picker__item-title-shell">
                                  <Icon className="h-3.5 w-3.5" />
                                  <div className="editor-rich-picker__item-title">
                                    {renderHighlightedText(command.label, slashQuery)}
                                  </div>
                                </div>
                                <div className="editor-rich-picker__item-badge">
                                  /{command.id}
                                </div>
                              </div>
                              <div className="editor-rich-picker__item-summary">
                                {renderHighlightedText(command.description, slashQuery)}
                              </div>
                            </button>
                          )
                        })}
                      </Fragment>
                    ))
                  )}
                </div>
              </div>
            )}

            {showWikiPicker && (
              <div className="editor-rich-picker" data-editor-rich-picker="true">
                <div className="editor-rich-picker__header">
                  <div className="editor-rich-picker__title">插入知识链接</div>
                  <button
                    type="button"
                    className="editor-rich-picker__dismiss"
                    onClick={closeWikiPicker}
                  >
                    关闭
                  </button>
                </div>
                <div className="editor-rich-picker__search">
                  <Brackets className="h-3.5 w-3.5" />
                  <input
                    ref={wikiInputRef}
                    value={wikiQuery}
                    onChange={(event) => {
                      setWikiQuery(event.target.value)
                      setWikiActiveIndex(0)
                    }}
                    onKeyDown={handleWikiPickerKeyDown}
                    placeholder="搜索知识标题或路径"
                    className="editor-rich-picker__input"
                  />
                </div>
                <div className="editor-rich-picker__results">
                  {wikiLoading && (
                    <div className="editor-rich-picker__empty">加载候选中...</div>
                  )}
                  {!wikiLoading && wikiError && (
                    <div className="editor-rich-picker__empty">{wikiError}</div>
                  )}
                  {!wikiLoading && !wikiError && wikiResults.length === 0 && (
                    <div className="editor-rich-picker__empty">没有匹配到知识，换个关键词试试。</div>
                  )}
                  {!wikiLoading && !wikiError && wikiResults.map((entry, index) => (
                    <button
                      key={entry.id}
                      type="button"
                      className="editor-rich-picker__item"
                      data-active={index === wikiActiveIndex ? 'true' : 'false'}
                      onMouseEnter={() => setWikiActiveIndex(index)}
                      onClick={() => applyWikiLink(entry)}
                    >
                      <div className="editor-rich-picker__item-main">
                        <div className="editor-rich-picker__item-title">{entry.title || entry.id}</div>
                        <div className="editor-rich-picker__item-path">{entry.id}</div>
                      </div>
                      {entry.summary && (
                        <div className="editor-rich-picker__item-summary">
                          {entry.summary}
                        </div>
                      )}
                    </button>
                  ))}
                </div>
                {hasActiveWikiLink && (
                  <div className="editor-rich-picker__footer">
                    <button
                      type="button"
                      className="editor-rich-picker__secondary"
                      onClick={removeWikiLink}
                    >
                      移除当前知识链接
                    </button>
                  </div>
                )}
              </div>
            )}

            {isInTable && (
              <div className="editor-rich-toolbar__table-tools">
                <span className="editor-rich-toolbar__context-label">表格工具</span>
                <div className="editor-rich-toolbar__group">
                  <RichToolbarButton
                    label="加行"
                    icon={Plus}
                    onClick={() => toggleBlock((instance) => instance.chain().focus().addRowAfter().run())}
                    disabled={!editor.can().chain().focus().addRowAfter().run()}
                  />
                  <RichToolbarButton
                    label="加列"
                    icon={Plus}
                    onClick={() => toggleBlock((instance) => instance.chain().focus().addColumnAfter().run())}
                    disabled={!editor.can().chain().focus().addColumnAfter().run()}
                  />
                  <RichToolbarButton
                    label="表头"
                    icon={Table2}
                    onClick={() => toggleBlock((instance) => instance.chain().focus().toggleHeaderRow().run())}
                    active={editor.isActive('tableHeader')}
                    disabled={!editor.can().chain().focus().toggleHeaderRow().run()}
                  />
                  <RichToolbarButton
                    label="删行"
                    icon={Trash2}
                    onClick={() => toggleBlock((instance) => instance.chain().focus().deleteRow().run())}
                    disabled={!editor.can().chain().focus().deleteRow().run()}
                  />
                  <RichToolbarButton
                    label="删列"
                    icon={Trash2}
                    onClick={() => toggleBlock((instance) => instance.chain().focus().deleteColumn().run())}
                    disabled={!editor.can().chain().focus().deleteColumn().run()}
                  />
                  <RichToolbarButton
                    label="删表"
                    icon={Trash2}
                    onClick={() => toggleBlock((instance) => instance.chain().focus().deleteTable().run())}
                    disabled={!editor.can().chain().focus().deleteTable().run()}
                  />
                </div>
              </div>
            )}

            {isImageSelected && (
              <div className="editor-rich-picker" data-editor-rich-picker="true">
                <div className="editor-rich-picker__header">
                  <div className="editor-rich-picker__title">图片工具</div>
                  <button
                    type="button"
                    className="editor-rich-picker__dismiss"
                    onClick={removeSelectedImage}
                  >
                    删除图片
                  </button>
                </div>
                <div className="editor-rich-picker__meta">
                  当前已选中图片。可修改地址与替代文本，保存后会同步写回 Markdown。
                </div>
                <div className="editor-rich-form">
                  <label className="editor-rich-form__field">
                    <span className="editor-rich-form__label">图片地址</span>
                    <input
                      value={imageDraft.src}
                      onChange={(event) => setImageDraft((current) => ({ ...current, src: event.target.value }))}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault()
                          applyImageAttributes()
                        }
                      }}
                      placeholder="https:// 或 ./assets/..."
                      className="editor-rich-picker__input editor-rich-form__input"
                    />
                  </label>
                  <label className="editor-rich-form__field">
                    <span className="editor-rich-form__label">替代文本</span>
                    <input
                      value={imageDraft.alt}
                      onChange={(event) => setImageDraft((current) => ({ ...current, alt: event.target.value }))}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault()
                          applyImageAttributes()
                        }
                      }}
                      placeholder="用于无障碍和图片加载失败时的说明"
                      className="editor-rich-picker__input editor-rich-form__input"
                    />
                  </label>
                </div>
                <div className="editor-rich-picker__footer">
                  <button
                    type="button"
                    className="editor-rich-picker__secondary"
                    onClick={() => {
                      setImageDraft({
                        src: editorUiState.imageAttrs.src,
                        alt: editorUiState.imageAttrs.alt,
                      })
                    }}
                    disabled={!imageHasPendingChanges}
                  >
                    还原
                  </button>
                  <button
                    type="button"
                    className="editor-rich-picker__dismiss"
                    onClick={applyImageAttributes}
                    disabled={!imageDraft.src.trim() || !imageHasPendingChanges}
                  >
                    保存图片设置
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {!isVitestEnvironment && (
        <BubbleMenu
          editor={editor}
          updateDelay={0}
          appendTo={() => document.body}
          options={{
            placement: 'top',
            strategy: 'fixed',
            offset: 12,
          }}
          shouldShow={({ editor: instance, state, view, from, to }) => {
            if (showWikiPicker || showSlashPicker || readOnly) return false
            if (!view.hasFocus()) return false
            if (state.selection.empty) return false

            const selectedText = state.doc.textBetween(from, to, ' ').trim()
            if (!selectedText) return false
            if (instance.isActive('codeBlock') || instance.isActive('image') || instance.isActive('table')) {
              return false
            }

            return true
          }}
        >
          <div
            className="editor-rich-bubble"
            data-editor-rich-bubble="true"
            onMouseDown={(event) => {
              event.preventDefault()
            }}
          >
            <button
              type="button"
              className="editor-rich-bubble__button"
              data-active={editor.isActive('bold') ? 'true' : 'false'}
              onClick={() => toggleBlock((instance) => instance.chain().focus().toggleBold().run())}
              aria-label="浮动加粗"
            >
              <Bold className="h-3.5 w-3.5" />
              <span>加粗</span>
            </button>
            <button
              type="button"
              className="editor-rich-bubble__button"
              data-active={editor.isActive('italic') ? 'true' : 'false'}
              onClick={() => toggleBlock((instance) => instance.chain().focus().toggleItalic().run())}
              aria-label="浮动斜体"
            >
              <Italic className="h-3.5 w-3.5" />
              <span>斜体</span>
            </button>
            <button
              type="button"
              className="editor-rich-bubble__button"
              data-active={editor.isActive('link') ? 'true' : 'false'}
              onClick={applyLink}
              aria-label="浮动链接"
            >
              <Link2 className="h-3.5 w-3.5" />
              <span>链接</span>
            </button>
            <button
              type="button"
              className="editor-rich-bubble__button"
              data-active={hasActiveWikiLink ? 'true' : 'false'}
              onClick={openWikiPicker}
              aria-label="浮动知识链接"
            >
              <Brackets className="h-3.5 w-3.5" />
              <span>知识链接</span>
            </button>
          </div>
        </BubbleMenu>
      )}

      <div
        ref={surfaceRef}
        className="editor-rich__surface"
        onKeyDown={handleRichEditorKeyDown}
      >
        <EditorContent editor={editor} />
      </div>

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
            <div className="editor-drop-overlay__hint">图片会直接插入，普通文件会作为附件链接插入；重复文件会优先复用。</div>
          </div>
        </div>
      )}

      {isImportingAssets && (
        <div className="editor-import-overlay">
          <div className="editor-import-overlay__card">
            正在导入 {pendingImportCount || '...'} 个素材…
          </div>
        </div>
      )}

      <div className="editor-rich__hint">
        富文本编辑会实时写回 Markdown。复杂的 Markdown 特性仍建议切回 Markdown 模式精修。
      </div>

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
          event.target.value = ''
        }}
      />
    </div>
  )
}
