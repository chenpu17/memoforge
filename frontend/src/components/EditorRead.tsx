import React, { useCallback, useEffect, useId, useMemo, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import { Link2, Check, Copy, X, ExternalLink, Info, Lightbulb, AlertTriangle, ChevronRight, ChevronUp, ChevronDown, ListTree, Workflow, CornerDownRight, Diamond, RotateCcw, Sparkles, Table2, LayoutGrid, Rows3, Search, Download } from 'lucide-react'
import {
  decodeWikiLinkHref,
  isExternalUrl,
  remarkWikiLinks,
} from '../lib/wikiLinks'
import { getShowLineNumbersSetting, SETTINGS_CHANGED_EVENT } from '../lib/settings'
import {
  buildWorkflowOutline,
  parseWorkflowNodes,
  presentWorkflowNode,
  summarizeWorkflow,
  type WorkflowPresentation,
} from '../lib/workflowRender'
import {
  buildMarkdownSectionAncestorMap,
  flattenMarkdownSectionHeadings,
  parseMarkdownSections,
  type MarkdownSection,
  type MarkdownSectionHeading,
} from '../lib/markdownSections'
import { parseMarkdownTableNode } from '../lib/markdownTable'
import { updateMarkdownTaskState } from '../lib/markdownTasks'
import type { EditorProps } from './Editor'
import { useKnowledgeNavigation } from '../hooks/useKnowledgeNavigation'

type LoadedSyntaxHighlighter = {
  SyntaxHighlighter: React.ComponentType<any>
  style: Record<string, React.CSSProperties>
}

type SyntaxHighlighterComponent = React.ComponentType<any> & {
  registerLanguage?: (name: string, syntax: unknown) => void
}

type MermaidModule = {
  initialize: (config: Record<string, unknown>) => void
  render: (id: string, text: string) => Promise<{ svg: string }>
}

type CalloutKind = 'NOTE' | 'TIP' | 'WARNING' | 'IMPORTANT'

let syntaxHighlighterLoader: Promise<LoadedSyntaxHighlighter> | null = null
let mermaidLoader: Promise<MermaidModule> | null = null
const loadedSyntaxLanguages = new Set<string>()

const syntaxLanguageAliases: Record<string, string> = {
  js: 'javascript',
  jsx: 'jsx',
  ts: 'typescript',
  tsx: 'tsx',
  sh: 'bash',
  shell: 'bash',
  yml: 'yaml',
  md: 'markdown',
  rs: 'rust',
  py: 'python',
}

const syntaxLanguageLoaders: Record<string, () => Promise<{ default: unknown }>> = {
  bash: () => import('react-syntax-highlighter/dist/esm/languages/prism/bash'),
  javascript: () => import('react-syntax-highlighter/dist/esm/languages/prism/javascript'),
  jsx: () => import('react-syntax-highlighter/dist/esm/languages/prism/jsx'),
  json: () => import('react-syntax-highlighter/dist/esm/languages/prism/json'),
  markdown: () => import('react-syntax-highlighter/dist/esm/languages/prism/markdown'),
  python: () => import('react-syntax-highlighter/dist/esm/languages/prism/python'),
  rust: () => import('react-syntax-highlighter/dist/esm/languages/prism/rust'),
  sql: () => import('react-syntax-highlighter/dist/esm/languages/prism/sql'),
  toml: () => import('react-syntax-highlighter/dist/esm/languages/prism/toml'),
  tsx: () => import('react-syntax-highlighter/dist/esm/languages/prism/tsx'),
  typescript: () => import('react-syntax-highlighter/dist/esm/languages/prism/typescript'),
  yaml: () => import('react-syntax-highlighter/dist/esm/languages/prism/yaml'),
}

const CALLOUT_REGEX = /^\s*\[!(NOTE|TIP|WARNING|IMPORTANT)\]\s*(.*)$/i
const CALLOUT_CONFIG: Record<CalloutKind, {
  label: string
  icon: React.ComponentType<{ className?: string }>
  containerClassName: string
  iconClassName: string
}> = {
  NOTE: {
    label: '说明',
    icon: Info,
    containerClassName: 'border-sky-200 bg-sky-50 text-sky-900',
    iconClassName: 'text-sky-600',
  },
  TIP: {
    label: '提示',
    icon: Lightbulb,
    containerClassName: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    iconClassName: 'text-emerald-600',
  },
  WARNING: {
    label: '注意',
    icon: AlertTriangle,
    containerClassName: 'border-amber-200 bg-amber-50 text-amber-900',
    iconClassName: 'text-amber-600',
  },
  IMPORTANT: {
    label: '重点',
    icon: Info,
    containerClassName: 'border-violet-200 bg-violet-50 text-violet-900',
    iconClassName: 'text-violet-600',
  },
}

function isTauri() {
  if (typeof window === 'undefined') return false
  return '__TAURI__' in window || '__TAURI_INTERNALS__' in window
}

function extractText(node: React.ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(extractText).join('')
  if (React.isValidElement(node)) return extractText(node.props.children)
  return ''
}

function parseRenderedTable(children: React.ReactNode) {
  const childNodes = React.Children.toArray(children)
  const headerSource = childNodes.find((child) => React.isValidElement(child) && child.type === 'thead')
  const bodySource = childNodes.find((child) => React.isValidElement(child) && child.type === 'tbody')

  const headerRow = React.isValidElement(headerSource)
    ? React.Children.toArray(headerSource.props.children).find((row) => React.isValidElement(row))
    : null

  const headers = React.isValidElement(headerRow)
    ? React.Children.toArray(headerRow.props.children).map((cell) => ({ text: extractText(cell).trim() }))
    : []

  const rows = React.isValidElement(bodySource)
    ? React.Children.toArray(bodySource.props.children)
        .filter((row) => React.isValidElement(row))
        .map((row) => React.Children.toArray((row as React.ReactElement<any>).props.children).map((cell) => ({ text: extractText(cell).trim() })))
    : []

  return { headers, rows }
}

function stripCalloutMarker(node: React.ReactNode): {
  matched: { kind: CalloutKind; title?: string } | null
  node: React.ReactNode
} {
  if (typeof node === 'string' || typeof node === 'number') {
    const text = String(node)
    const match = text.match(CALLOUT_REGEX)
    if (!match) {
      return { matched: null, node }
    }

    return {
      matched: {
        kind: match[1].toUpperCase() as CalloutKind,
        title: match[2].trim() || undefined,
      },
      node: text.replace(CALLOUT_REGEX, '').trimStart(),
    }
  }

  if (Array.isArray(node)) {
    let matched: { kind: CalloutKind; title?: string } | null = null
    const next = node.map((child) => {
      if (matched) return child
      const result = stripCalloutMarker(child)
      if (result.matched) {
        matched = result.matched
        return result.node
      }
      return child
    })

    return { matched, node: next }
  }

  if (React.isValidElement(node)) {
    const result = stripCalloutMarker(node.props.children)
    if (!result.matched) {
      return { matched: null, node }
    }

    return {
      matched: result.matched,
      node: React.cloneElement(node, { ...node.props }, result.node),
    }
  }

  return { matched: null, node }
}

function getImageDisplayText(src: string, alt?: string) {
  if (alt?.trim()) return alt.trim()

  try {
    const url = new URL(src, window.location.href)
    const fileName = url.pathname.split('/').filter(Boolean).pop()
    return fileName || src
  } catch {
    return src.split('/').filter(Boolean).pop() || src
  }
}

function triggerDownload(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

function getCodeBlockExtension(language: string) {
  const normalizedLanguage = syntaxLanguageAliases[language.toLowerCase()] || language.toLowerCase()

  switch (normalizedLanguage) {
    case 'javascript':
      return 'js'
    case 'typescript':
      return 'ts'
    case 'bash':
      return 'sh'
    case 'markdown':
      return 'md'
    case 'python':
      return 'py'
    default:
      return normalizedLanguage || 'txt'
  }
}

function sanitizeDownloadSegment(value: string) {
  return value
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

function getDownloadBaseName(knowledgePath?: string) {
  const fileName = knowledgePath?.split('/').filter(Boolean).pop() || 'document'
  const stem = fileName.replace(/\.[^.]+$/, '')
  return sanitizeDownloadSegment(stem) || 'document'
}

function clearReaderSearchHighlights(root: HTMLElement) {
  const marks = Array.from(root.querySelectorAll('mark.reader-search-highlight'))
  marks.forEach((mark) => {
    const parent = mark.parentNode
    if (!parent) return
    parent.replaceChild(document.createTextNode(mark.textContent || ''), mark)
    parent.normalize()
  })
}

function applyReaderSearchHighlights(root: HTMLElement, query: string) {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) return [] as HTMLElement[]

  const highlights: HTMLElement[] = []
  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node) {
        const text = node.textContent || ''
        if (!text.trim()) return NodeFilter.FILTER_REJECT

        const parent = node.parentElement
        if (!parent) return NodeFilter.FILTER_REJECT

        if (
          parent.closest('.reader-searchbar') ||
          parent.closest('button, input, textarea, select, script, style') ||
          parent.closest('.mermaid-block__canvas svg') ||
          parent.closest('.reader-search-highlight')
        ) {
          return NodeFilter.FILTER_REJECT
        }

        return text.toLowerCase().includes(normalizedQuery)
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_REJECT
      },
    },
  )

  const textNodes: Text[] = []
  let currentNode = walker.nextNode()
  while (currentNode) {
    textNodes.push(currentNode as Text)
    currentNode = walker.nextNode()
  }

  textNodes.forEach((node) => {
    const text = node.textContent || ''
    const lowerText = text.toLowerCase()
    let searchIndex = 0
    let foundIndex = lowerText.indexOf(normalizedQuery, searchIndex)

    if (foundIndex < 0) return

    const fragment = document.createDocumentFragment()

    while (foundIndex >= 0) {
      if (foundIndex > searchIndex) {
        fragment.appendChild(document.createTextNode(text.slice(searchIndex, foundIndex)))
      }

      const matchEnd = foundIndex + normalizedQuery.length
      const mark = document.createElement('mark')
      mark.className = 'reader-search-highlight'
      mark.textContent = text.slice(foundIndex, matchEnd)
      fragment.appendChild(mark)
      highlights.push(mark)

      searchIndex = matchEnd
      foundIndex = lowerText.indexOf(normalizedQuery, searchIndex)
    }

    if (searchIndex < text.length) {
      fragment.appendChild(document.createTextNode(text.slice(searchIndex)))
    }

    node.parentNode?.replaceChild(fragment, node)
  })

  return highlights
}

function getWorkflowToneStyles(tone: WorkflowPresentation['tone']) {
  switch (tone) {
    case 'sky':
      return {
        badgeBg: '#F0F9FF',
        badgeFg: '#0369A1',
        iconBg: '#F0F9FF',
        iconFg: '#0284C7',
        border: '#BAE6FD',
      }
    case 'emerald':
      return {
        badgeBg: '#ECFDF5',
        badgeFg: '#047857',
        iconBg: '#ECFDF5',
        iconFg: '#059669',
        border: '#A7F3D0',
      }
    case 'rose':
      return {
        badgeBg: '#FFF1F2',
        badgeFg: '#BE123C',
        iconBg: '#FFF1F2',
        iconFg: '#E11D48',
        border: '#FDA4AF',
      }
    case 'amber':
      return {
        badgeBg: '#FFFBEB',
        badgeFg: '#B45309',
        iconBg: '#FFFBEB',
        iconFg: '#D97706',
        border: '#FCD34D',
      }
    case 'slate':
      return {
        badgeBg: '#F8FAFC',
        badgeFg: '#475569',
        iconBg: '#F8FAFC',
        iconFg: '#64748B',
        border: '#CBD5E1',
      }
    case 'indigo':
    default:
      return {
        badgeBg: 'var(--brand-primary-soft)',
        badgeFg: 'var(--brand-primary-strong)',
        iconBg: 'var(--brand-primary-soft)',
        iconFg: 'var(--brand-primary)',
        border: 'var(--brand-primary-border)',
      }
  }
}

const ReaderTable: React.FC<{
  node?: any
  children: React.ReactNode
}> = ({ node, children }) => {
  const tableRef = React.useRef<HTMLTableElement | null>(null)
  const [domTableData, setDomTableData] = useState<ReturnType<typeof parseRenderedTable> | null>(null)
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table')
  const [compact, setCompact] = useState(false)

  useEffect(() => {
    const table = tableRef.current
    if (!table) return

    const headers = Array.from(table.querySelectorAll('thead th')).map((cell) => ({
      text: cell.textContent?.trim() ?? '',
    }))
    const rows = Array.from(table.querySelectorAll('tbody tr')).map((row) => (
      Array.from(row.querySelectorAll('td')).map((cell) => ({
        text: cell.textContent?.trim() ?? '',
      }))
    ))

    setDomTableData({ headers, rows })
  }, [children])

  const fallbackTableData = useMemo(() => {
    const parsedFromChildren = parseRenderedTable(children)
    if (parsedFromChildren.headers.length > 0 || parsedFromChildren.rows.length > 0) {
      return parsedFromChildren
    }
    return parseMarkdownTableNode(node)
  }, [children, node])
  const tableData = domTableData ?? fallbackTableData

  const rowCount = tableData?.rows.length ?? 0
  const columnCount = tableData?.headers.length ?? 0
  const canUseCards = Boolean(tableData && rowCount > 0 && columnCount > 1)
  const firstHeader = tableData?.headers[0]?.text || '条目'
  const detailHeaders = tableData?.headers.slice(1) ?? []

  if (viewMode === 'cards' && canUseCards && tableData) {
    return (
      <div className="reader-table my-4 rounded-2xl border border-slate-200 bg-white">
        <div className="reader-table__toolbar">
          <div className="reader-table__meta">
            <span className="reader-table__meta-icon"><Table2 className="h-3.5 w-3.5" /></span>
            <span>{rowCount} 行</span>
            <span>{columnCount} 列</span>
          </div>
          <div className="reader-table__controls">
            <button type="button" className="reader-table__toggle" onClick={() => setCompact((value) => !value)} data-active={compact ? 'true' : 'false'}>
              <Rows3 className="h-3.5 w-3.5" />
              {compact ? '标准' : '紧凑'}
            </button>
            <div className="reader-table__segmented">
              <button type="button" className="reader-table__segment" data-active="false" onClick={() => setViewMode('table')}>
                <Table2 className="h-3.5 w-3.5" />
                表格
              </button>
              <button type="button" className="reader-table__segment" data-active="true" onClick={() => setViewMode('cards')}>
                <LayoutGrid className="h-3.5 w-3.5" />
                摘要
              </button>
            </div>
          </div>
        </div>
        <div className={`reader-table__cards ${compact ? 'reader-table__cards--compact' : ''}`}>
          {tableData.rows.map((row, index) => {
            const title = row[0]?.text || `${firstHeader} ${index + 1}`
            const details = row.slice(1)

            return (
              <article key={`${title}-${index}`} className="reader-table__card">
                <div className="reader-table__card-title">{title}</div>
                <div className="reader-table__card-grid">
                  {details.map((cell, cellIndex) => (
                    <div key={`${title}-${cellIndex}`} className="reader-table__card-field">
                      <div className="reader-table__card-label">
                        {detailHeaders[cellIndex]?.text || `字段 ${cellIndex + 2}`}
                      </div>
                      <div className="reader-table__card-value">{cell.text || '—'}</div>
                    </div>
                  ))}
                </div>
              </article>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div className="reader-table my-4 rounded-2xl border border-slate-200 bg-white">
      <div className="reader-table__toolbar">
        <div className="reader-table__meta">
          <span className="reader-table__meta-icon"><Table2 className="h-3.5 w-3.5" /></span>
          <span>{rowCount} 行</span>
          <span>{columnCount} 列</span>
        </div>
        <div className="reader-table__controls">
          <button type="button" className="reader-table__toggle" onClick={() => setCompact((value) => !value)} data-active={compact ? 'true' : 'false'}>
            <Rows3 className="h-3.5 w-3.5" />
            {compact ? '标准' : '紧凑'}
          </button>
          {canUseCards && (
            <div className="reader-table__segmented">
              <button type="button" className="reader-table__segment" data-active={viewMode === 'table' ? 'true' : 'false'} onClick={() => setViewMode('table')}>
                <Table2 className="h-3.5 w-3.5" />
                表格
              </button>
              <button type="button" className="reader-table__segment" data-active={viewMode === 'cards' ? 'true' : 'false'} onClick={() => setViewMode('cards')}>
                <LayoutGrid className="h-3.5 w-3.5" />
                摘要
              </button>
            </div>
          )}
        </div>
      </div>
      <div className={`reader-table__viewport ${compact ? 'reader-table__viewport--compact' : ''}`}>
        <table ref={tableRef} className="min-w-[42rem] w-full border-collapse text-sm">
          {children}
        </table>
      </div>
    </div>
  )
}

function getWorkflowKindMeta(presentation: WorkflowPresentation) {
  switch (presentation.kind) {
    case 'decision':
      return {
        icon: Diamond,
        accentLabel: '判断',
      }
    case 'success':
      return {
        icon: Check,
        accentLabel: '通过',
      }
    case 'failure':
      return {
        icon: X,
        accentLabel: '失败',
      }
    case 'repair':
      return {
        icon: RotateCcw,
        accentLabel: '修复',
      }
    case 'finally':
      return {
        icon: Sparkles,
        accentLabel: '收尾',
      }
    case 'neutral':
      return {
        icon: CornerDownRight,
        accentLabel: '分支',
      }
    case 'step':
    default:
      return {
        icon: null,
        accentLabel: '步骤',
      }
  }
}

const WorkflowBlock: React.FC<{ text: string }> = ({ text }) => {
  const nodes = useMemo(() => parseWorkflowNodes(text), [text])
  const [collapsed, setCollapsed] = useState(false)
  const [copied, setCopied] = useState(false)
  const [activeGroup, setActiveGroup] = useState<number | null>(null)

  if (!nodes) {
    return <p className="text-sm text-gray-700 leading-relaxed mb-3 whitespace-pre-wrap">{text}</p>
  }

  const root = nodes[0]
  const branches = nodes.slice(1)
  const summary = summarizeWorkflow(nodes)
  const branchCountsByGroup = useMemo(() => {
    const counts = new Map<number, number>()
    let currentGroup = 0

    for (const node of branches) {
      const presentation = presentWorkflowNode(node)
      const displayAsBranch = node.level > 1 || presentation.branch

      if (displayAsBranch) {
        counts.set(currentGroup, (counts.get(currentGroup) ?? 0) + 1)
      } else {
        currentGroup += 1
      }
    }

    return counts
  }, [branches])
  let primaryIndex = 0
  let currentGroupIndex = 0

  const handleCopyOutline = async () => {
    try {
      await navigator.clipboard.writeText(buildWorkflowOutline(nodes))
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch (error) {
      console.error('Failed to copy workflow outline:', error)
    }
  }

  return (
    <div className="workflow-block my-4 rounded-3xl border border-slate-200 bg-[linear-gradient(180deg,#fcfcfd_0%,#f8fafc_100%)] p-4 shadow-[0_8px_28px_rgba(15,23,42,0.04)]">
      <div className="flex items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
            <Workflow className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">流程视图</div>
            <div className="mt-1 text-base font-semibold text-slate-900">{root.label}</div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                主步骤 {summary.stepCount}
              </span>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                分支 {summary.branchCount}
              </span>
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => void handleCopyOutline()}
            className="inline-flex h-8 items-center gap-1 rounded-full border border-slate-200 bg-white px-3 text-[11px] font-medium text-slate-500 transition-colors hover:border-indigo-200 hover:text-indigo-600"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? '已复制' : '复制大纲'}
          </button>
          <button
            type="button"
            onClick={() => setCollapsed((value) => !value)}
            className="inline-flex h-8 items-center gap-1 rounded-full border border-slate-200 bg-white px-3 text-[11px] font-medium text-slate-500 transition-colors hover:border-indigo-200 hover:text-indigo-600"
          >
            <ChevronRight className={`h-3.5 w-3.5 transition-transform ${collapsed ? '' : 'rotate-90'}`} />
            {collapsed ? '展开流程' : '收起流程'}
          </button>
        </div>
      </div>

      {!collapsed && (
      <div className="workflow-block__steps mt-3 space-y-2.5">
        {branches.map((node) => {
          const presentation = presentWorkflowNode(node)
          const toneStyles = getWorkflowToneStyles(presentation.tone)
          const kindMeta = getWorkflowKindMeta(presentation)
          const KindIcon = kindMeta.icon
          const displayAsBranch = node.level > 1 || presentation.branch
          const stepIndex = displayAsBranch ? primaryIndex : ++primaryIndex
          const groupIndex = displayAsBranch ? currentGroupIndex : ++currentGroupIndex
          const branchCount = branchCountsByGroup.get(groupIndex) ?? 0
          const isSelectionMode = activeGroup !== null
          const isSelected = activeGroup === groupIndex
          const isPrimarySelected = isSelected && !displayAsBranch
          const isRelatedBranch = isSelected && displayAsBranch
          const rowState = isSelectionMode
            ? (isSelected ? (displayAsBranch ? 'related' : 'selected') : 'dimmed')
            : 'idle'
          const helperText = isPrimarySelected
            ? ''
            : isRelatedBranch
              ? '与当前步骤关联'
              : isSelectionMode
                ? '点击切换到此步骤'
                : (displayAsBranch ? `关联步骤 ${groupIndex}` : '')

          return (
            <button
              type="button"
              key={node.id}
              className={`workflow-block__item relative flex w-full items-start gap-2 rounded-2xl border bg-white/92 px-3 py-2.5 text-left ${displayAsBranch ? 'workflow-block__item--branch' : ''}`}
              data-state={rowState}
              data-branch={displayAsBranch ? 'true' : 'false'}
              data-kind={presentation.kind}
              aria-pressed={isSelected}
              title={displayAsBranch ? `查看步骤 ${groupIndex} 的关联分支` : `聚焦步骤 ${stepIndex}`}
              style={{
                marginLeft: `${((displayAsBranch ? Math.max(node.level, 2) : node.level) - 1) * 24}px`,
                borderColor: isPrimarySelected
                  ? toneStyles.iconFg
                  : (displayAsBranch ? toneStyles.border : '#E2E8F0'),
                opacity: isSelectionMode ? (isSelected ? 1 : 0.26) : 1,
                transform: isPrimarySelected
                  ? 'translateX(4px) scale(1.01)'
                  : (isRelatedBranch ? 'translateX(2px)' : (isSelectionMode ? 'translateX(-2px) scale(0.985)' : 'translateX(0)')),
                boxShadow: isPrimarySelected
                  ? '0 18px 38px var(--brand-primary-shadow-strong)'
                  : (isRelatedBranch
                    ? '0 12px 28px rgba(15, 23, 42, 0.08)'
                    : (displayAsBranch ? '0 6px 18px rgba(15, 23, 42, 0.04)' : 'none')),
                filter: isSelectionMode && !isSelected ? 'saturate(0.68)' : 'none',
                background: isPrimarySelected
                  ? `linear-gradient(180deg, ${toneStyles.badgeBg} 0%, rgba(255, 255, 255, 0.98) 72%)`
                  : 'rgba(255, 255, 255, 0.92)',
                ['--workflow-accent' as string]: toneStyles.iconFg,
                ['--workflow-accent-soft' as string]: toneStyles.badgeBg,
              }}
              onClick={() => setActiveGroup((current) => (current === groupIndex ? null : groupIndex))}
            >
              <span
                className="workflow-block__item-index inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-xl text-[11px] font-semibold"
                style={{
                  backgroundColor: toneStyles.iconBg,
                  color: toneStyles.iconFg,
                }}
              >
                {displayAsBranch ? (
                  KindIcon ? <KindIcon className="h-3.5 w-3.5" /> : <CornerDownRight className="h-3.5 w-3.5" />
                ) : (
                  stepIndex
                )}
              </span>
              <div className="workflow-block__item-body min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                    style={{
                      backgroundColor: toneStyles.badgeBg,
                      color: toneStyles.badgeFg,
                    }}
                  >
                    {presentation.laneLabel}
                  </span>
                  {!displayAsBranch && branchCount > 0 && (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                      {branchCount} 条分支
                    </span>
                  )}
                  {isPrimarySelected && (
                    <span className="rounded-full bg-indigo-600/10 px-2 py-0.5 text-[10px] font-semibold text-indigo-700">
                      当前步骤
                    </span>
                  )}
                  {isRelatedBranch && (
                    <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ backgroundColor: toneStyles.badgeBg, color: toneStyles.badgeFg }}>
                      关联分支
                    </span>
                  )}
                  {displayAsBranch && (
                    <span className="text-[10px] font-medium uppercase tracking-[0.14em]" style={{ color: toneStyles.badgeFg }}>
                      {presentation.title}
                    </span>
                  )}
                  {helperText && (
                    <span className="workflow-block__item-assist text-[10px] text-slate-400">
                      {helperText}
                    </span>
                  )}
                </div>
                <div className="mt-1 break-words text-[13px] font-medium leading-6 text-slate-800">
                  {displayAsBranch && presentation.detail ? presentation.detail : presentation.title}
                </div>
                {!displayAsBranch && presentation.detail && (
                  <div className="mt-1 text-xs leading-5 text-slate-500">
                    {presentation.detail}
                  </div>
                )}
              </div>
            </button>
          )
        })}
      </div>
      )}
    </div>
  )
}

function loadSyntaxHighlighter() {
  if (!syntaxHighlighterLoader) {
    syntaxHighlighterLoader = Promise.all([
      import('react-syntax-highlighter/dist/esm/prism-light'),
      import('react-syntax-highlighter/dist/esm/styles/prism'),
    ]).then(([highlighterModule, stylesModule]) => ({
      SyntaxHighlighter: highlighterModule.default,
      style: stylesModule.vscDarkPlus,
    }))
  }

  return syntaxHighlighterLoader
}

function loadMermaid() {
  if (!mermaidLoader) {
    mermaidLoader = import('mermaid').then((module) => {
      const mermaid = module.default as MermaidModule
      const getBrandColor = (name: string, fallback: string) => {
        if (typeof window === 'undefined') return fallback
        const value = window.getComputedStyle(document.documentElement).getPropertyValue(name).trim()
        return value || fallback
      }

      mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
        theme: 'base',
        themeVariables: {
          primaryColor: getBrandColor('--brand-primary-soft', '#EEF2FF'),
          primaryTextColor: '#0F172A',
          primaryBorderColor: getBrandColor('--brand-primary-border', '#C7D2FE'),
          lineColor: '#64748B',
          secondaryColor: '#F8FAFC',
          tertiaryColor: '#FFFFFF',
          fontFamily: 'ui-sans-serif, system-ui, sans-serif',
        },
      })
      return mermaid
    })
  }

  return mermaidLoader
}

async function ensureSyntaxLanguage(language: string, syntaxHighlighter: SyntaxHighlighterComponent) {
  const normalizedLanguage = syntaxLanguageAliases[language.toLowerCase()] || language.toLowerCase()

  if (loadedSyntaxLanguages.has(normalizedLanguage)) {
    return true
  }

  const loadLanguage = syntaxLanguageLoaders[normalizedLanguage]
  if (!loadLanguage || !syntaxHighlighter.registerLanguage) {
    return false
  }

  const languageModule = await loadLanguage()
  syntaxHighlighter.registerLanguage(normalizedLanguage, languageModule.default)
  loadedSyntaxLanguages.add(normalizedLanguage)
  return true
}

async function openExternalLink(href: string) {
  if (isTauri()) {
    try {
      const { open } = await import('@tauri-apps/plugin-shell')
      await open(href)
      return
    } catch (error) {
      console.error('Failed to open external link:', error)
    }
  }

  window.open(href, '_blank', 'noopener,noreferrer')
}

const LazySyntaxCodeBlock: React.FC<{
  language: string
  children: React.ReactNode
  downloadBaseName: string
}> = ({ language, children, downloadBaseName }) => {
  const codeText = useMemo(() => String(children).replace(/\n$/, ''), [children])
  const codeLineCount = useMemo(() => codeText.split('\n').length, [codeText])
  const blockId = useId().replace(/[:]/g, '-')
  const [loaded, setLoaded] = useState<LoadedSyntaxHighlighter | null>(null)
  const [languageReady, setLanguageReady] = useState(false)
  const [copied, setCopied] = useState(false)
  const [defaultShowLineNumbers, setDefaultShowLineNumbers] = useState(() => getShowLineNumbersSetting())
  const [showLineNumbers, setShowLineNumbers] = useState(() => getShowLineNumbersSetting())
  const [wrapLongLines, setWrapLongLines] = useState(false)
  const [expanded, setExpanded] = useState(() => codeLineCount <= 16)
  const isLongCodeBlock = codeLineCount > 16

  useEffect(() => {
    let cancelled = false

    loadSyntaxHighlighter()
      .then(async (result) => {
        const ready = await ensureSyntaxLanguage(
          language,
          result.SyntaxHighlighter as SyntaxHighlighterComponent,
        )

        if (!cancelled) {
          setLoaded(result)
          setLanguageReady(ready)
        }
      })
      .catch((error) => {
        console.error('Failed to load syntax highlighter:', error)
      })

    return () => {
      cancelled = true
    }
  }, [])

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(codeText)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch (error) {
      console.error('Failed to copy code block:', error)
    }
  }, [codeText])

  const handleDownload = useCallback(() => {
    const extension = getCodeBlockExtension(language)
    triggerDownload(
      `${downloadBaseName}-code-${blockId}.${extension}`,
      codeText,
      'text/plain;charset=utf-8',
    )
  }, [blockId, codeText, downloadBaseName, language])

  useEffect(() => {
    setShowLineNumbers(defaultShowLineNumbers)
    setExpanded(codeLineCount <= 16)
  }, [codeLineCount, defaultShowLineNumbers])

  useEffect(() => {
    const handleSettingsChanged = (event: Event) => {
      const detail = (event as CustomEvent<{ key?: string; value?: unknown }>).detail
      if (detail?.key !== 'showLineNumbers') return
      const nextValue = Boolean(detail.value)
      setDefaultShowLineNumbers(nextValue)
      setShowLineNumbers(nextValue)
    }

    window.addEventListener(SETTINGS_CHANGED_EVENT, handleSettingsChanged)
    return () => window.removeEventListener(SETTINGS_CHANGED_EVENT, handleSettingsChanged)
  }, [])

  if (!loaded || !languageReady) {
    return (
      <pre className="bg-gray-900 text-gray-100 rounded-lg p-4 overflow-x-auto text-xs font-mono my-3">
        <code>{codeText}</code>
      </pre>
    )
  }

  const { SyntaxHighlighter, style } = loaded

  return (
    <div className="my-3 overflow-hidden rounded-xl border border-slate-800 bg-slate-950">
      <div className="reader-code-block__toolbar border-b border-slate-800 px-3 py-2 text-[11px]">
        <div className="reader-code-block__toolbar-meta">
          <span className="font-medium uppercase tracking-wide text-slate-400">{language}</span>
          <span className="rounded-full border border-slate-800 bg-slate-900 px-2 py-0.5 text-[10px] font-medium text-slate-500">
            {codeLineCount} 行
          </span>
        </div>
        <div className="reader-code-block__toolbar-actions">
          <button
            type="button"
            onClick={() => setShowLineNumbers((value) => !value)}
            className={`inline-flex items-center gap-1 rounded-md px-2 py-1 transition-colors ${showLineNumbers ? 'bg-slate-800 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white'}`}
            title={showLineNumbers ? '隐藏行号' : '显示行号'}
          >
            <span>行号</span>
          </button>
          <button
            type="button"
            onClick={() => setWrapLongLines((value) => !value)}
            className={`inline-flex items-center gap-1 rounded-md px-2 py-1 transition-colors ${wrapLongLines ? 'bg-slate-800 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white'}`}
            title={wrapLongLines ? '关闭折行' : '长行折行'}
          >
            <span>折行</span>
          </button>
          <button
            type="button"
            onClick={() => void handleCopy()}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-slate-300 transition-colors hover:bg-slate-800 hover:text-white"
            title="复制代码"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
            <span>{copied ? '已复制' : '复制'}</span>
          </button>
          <button
            type="button"
            onClick={handleDownload}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-slate-300 transition-colors hover:bg-slate-800 hover:text-white"
            title="下载代码"
          >
            <Download className="h-3.5 w-3.5" />
            <span>下载</span>
          </button>
          {isLongCodeBlock && (
            <button
              type="button"
              onClick={() => setExpanded((value) => !value)}
              className={`inline-flex items-center gap-1 rounded-md px-2 py-1 transition-colors ${expanded ? 'text-slate-300 hover:bg-slate-800 hover:text-white' : 'bg-slate-800 text-white'}`}
              title={expanded ? '收起长代码块' : '展开长代码块'}
            >
              {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              <span>{expanded ? '收起' : '展开'}</span>
            </button>
          )}
        </div>
      </div>
      <div className={`reader-code-block__content ${!expanded ? 'reader-code-block__content--collapsed' : ''}`} data-collapsed={!expanded ? 'true' : 'false'}>
        <SyntaxHighlighter
          style={style}
          language={language}
          PreTag="div"
          className="!m-0 text-xs !bg-slate-950"
          showLineNumbers={showLineNumbers}
          wrapLongLines={wrapLongLines}
          lineNumberStyle={{
            minWidth: '2.6em',
            paddingRight: '1rem',
            color: '#64748B',
          }}
          customStyle={{
            margin: 0,
            padding: '1rem',
            fontSize: '0.75rem',
            borderRadius: 0,
          }}
        >
          {codeText}
        </SyntaxHighlighter>
      </div>
    </div>
  )
}

const MermaidBlock: React.FC<{
  children: React.ReactNode
  downloadBaseName: string
}> = ({ children, downloadBaseName }) => {
  const diagramId = useId().replace(/[:]/g, '-')
  const codeText = useMemo(() => String(children).replace(/\n$/, ''), [children])
  const [svg, setSvg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [showSource, setShowSource] = useState(false)

  useEffect(() => {
    let cancelled = false

    setSvg(null)
    setError(null)

    loadMermaid()
      .then(async (mermaid) => {
        const renderId = `${diagramId}-${Date.now()}`
        const result = await mermaid.render(renderId, codeText)
        if (!cancelled) {
          setSvg(result.svg)
        }
      })
      .catch((renderError) => {
        if (!cancelled) {
          setError(renderError instanceof Error ? renderError.message : 'Mermaid 渲染失败')
          setShowSource(true)
        }
      })

    return () => {
      cancelled = true
    }
  }, [codeText, diagramId])

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(codeText)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch (copyError) {
      console.error('Failed to copy mermaid code block:', copyError)
    }
  }, [codeText])

  const handleDownload = useCallback(() => {
    if (!svg) return
    triggerDownload(
      `${downloadBaseName}-diagram-${diagramId}.svg`,
      svg,
      'image/svg+xml;charset=utf-8',
    )
  }, [diagramId, downloadBaseName, svg])

  return (
    <div className="mermaid-block my-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
      <div className="mermaid-block__toolbar">
        <div className="mermaid-block__meta">
          <span className="mermaid-block__icon"><Workflow className="h-3.5 w-3.5" /></span>
          <span>Mermaid 图表</span>
        </div>
        <div className="mermaid-block__actions">
          <button type="button" className="mermaid-block__button" onClick={() => setShowSource((value) => !value)}>
            {showSource ? '隐藏源码' : '查看源码'}
          </button>
          <button type="button" className="mermaid-block__button" onClick={() => void handleCopy()}>
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? '已复制' : '复制源码'}
          </button>
          <button type="button" className="mermaid-block__button" onClick={handleDownload} disabled={!svg}>
            <Download className="h-3.5 w-3.5" />
            下载 SVG
          </button>
        </div>
      </div>

      {error && (
        <div className="mermaid-block__error">
          <AlertTriangle className="h-4 w-4" />
          <span>{error}</span>
        </div>
      )}

      {svg && (
        <div
          className="mermaid-block__canvas"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      )}

      {!svg && !error && (
        <div className="mermaid-block__loading">
          正在生成图表...
        </div>
      )}

      {showSource && (
        <pre className="mermaid-block__source">
          <code>{codeText}</code>
        </pre>
      )}
    </div>
  )
}

const CopyablePreBlock: React.FC<{
  children: React.ReactNode
  downloadBaseName: string
}> = ({ children, downloadBaseName }) => {
  const [copied, setCopied] = useState(false)
  const codeText = useMemo(() => extractText(children).replace(/\n$/, ''), [children])
  const codeLineCount = useMemo(() => codeText.split('\n').length, [codeText])
  const blockId = useId().replace(/[:]/g, '-')
  const [expanded, setExpanded] = useState(() => codeLineCount <= 16)
  const isLongCodeBlock = codeLineCount > 16

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(codeText)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch (error) {
      console.error('Failed to copy code block:', error)
    }
  }, [codeText])

  const handleDownload = useCallback(() => {
    triggerDownload(
      `${downloadBaseName}-code-${blockId}.txt`,
      codeText,
      'text/plain;charset=utf-8',
    )
  }, [blockId, codeText, downloadBaseName])

  useEffect(() => {
    setExpanded(codeLineCount <= 16)
  }, [codeLineCount])

  return (
    <div className="my-3 overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
      <div className="reader-pre-block__toolbar border-b border-slate-200 px-3 py-2 text-[11px]">
        <div className="reader-code-block__toolbar-meta">
          <span className="font-medium text-slate-500">代码块</span>
          <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-medium text-slate-400">
            {codeLineCount} 行
          </span>
        </div>
        <div className="reader-code-block__toolbar-actions">
          <button
            type="button"
            onClick={() => void handleCopy()}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-slate-500 transition-colors hover:bg-white hover:text-slate-900"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
            <span>{copied ? '已复制' : '复制'}</span>
          </button>
          <button
            type="button"
            onClick={handleDownload}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-slate-500 transition-colors hover:bg-white hover:text-slate-900"
          >
            <Download className="h-3.5 w-3.5" />
            <span>下载</span>
          </button>
          {isLongCodeBlock && (
            <button
              type="button"
              onClick={() => setExpanded((value) => !value)}
              className={`inline-flex items-center gap-1 rounded-md px-2 py-1 transition-colors ${expanded ? 'text-slate-500 hover:bg-white hover:text-slate-900' : 'bg-white text-slate-900'}`}
            >
              {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              <span>{expanded ? '收起' : '展开'}</span>
            </button>
          )}
        </div>
      </div>
      <div className={`reader-code-block__content reader-code-block__content--light ${!expanded ? 'reader-code-block__content--collapsed' : ''}`} data-collapsed={!expanded ? 'true' : 'false'}>
        <pre className="overflow-x-auto px-4 py-4 text-xs font-mono text-slate-700">
          <code>{codeText}</code>
        </pre>
      </div>
    </div>
  )
}

const EditorReadInner: React.FC<EditorProps> = ({
  value,
  onChange,
  onTransformContent,
  knowledgePath,
  readOnly = false,
}) => {
  const { openKnowledgeWithStale } = useKnowledgeNavigation()
  const containerRef = React.useRef<HTMLDivElement | null>(null)
  const readerSearchRootRef = React.useRef<HTMLDivElement | null>(null)
  const readerSearchInputRef = React.useRef<HTMLInputElement | null>(null)
  const readerSearchMatchesRef = React.useRef<HTMLElement[]>([])
  const [loadedExternalImages, setLoadedExternalImages] = useState<Set<string>>(new Set())
  const [copiedHeadingId, setCopiedHeadingId] = useState<string | null>(null)
  const [activeHeadingId, setActiveHeadingId] = useState<string | null>(null)
  const [showBackToTop, setShowBackToTop] = useState(false)
  const [lightboxImage, setLightboxImage] = useState<{ src: string; alt?: string } | null>(null)
  const [showDocumentSearch, setShowDocumentSearch] = useState(false)
  const [documentSearchQuery, setDocumentSearchQuery] = useState('')
  const [documentSearchActiveIndex, setDocumentSearchActiveIndex] = useState(-1)
  const [documentSearchMatchCount, setDocumentSearchMatchCount] = useState(0)

  useEffect(() => {
    setLoadedExternalImages(new Set())
  }, [knowledgePath])

  useEffect(() => {
    if (!lightboxImage) return

    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setLightboxImage(null)
      }
    }

    window.addEventListener('keydown', handleKeydown)
    return () => window.removeEventListener('keydown', handleKeydown)
  }, [lightboxImage])

  const markdownDocument = useMemo(() => parseMarkdownSections(value), [value])
  const tocHeadings = useMemo<MarkdownSectionHeading[]>(
    () => flattenMarkdownSectionHeadings(markdownDocument.sections),
    [markdownDocument.sections],
  )
  const navigableTocHeadings = useMemo(() => (
    tocHeadings.filter((heading, index) => !(index === 0 && heading.level === 1))
  ), [tocHeadings])
  const sectionAncestorMap = useMemo(
    () => buildMarkdownSectionAncestorMap(markdownDocument.sections),
    [markdownDocument.sections],
  )
  const showToc = navigableTocHeadings.length > 0
  const activeHeadingText = useMemo(
    () => navigableTocHeadings.find((heading) => heading.id === activeHeadingId)?.text ?? navigableTocHeadings[0]?.text ?? '',
    [activeHeadingId, navigableTocHeadings],
  )
  const sectionStateStorageKey = useMemo(
    () => `memoforge:reader-section-collapse:${knowledgePath || 'preview'}`,
    [knowledgePath],
  )
  const downloadBaseName = useMemo(() => getDownloadBaseName(knowledgePath), [knowledgePath])
  const [collapsedSectionIds, setCollapsedSectionIds] = useState<Record<string, boolean>>({})

  const handleLinkClick = useCallback(async (href: string | undefined, e: React.MouseEvent) => {
    if (!href) return

    const knowledgeId = decodeWikiLinkHref(href)
    if (knowledgeId) {
      e.preventDefault()
      try {
        await openKnowledgeWithStale(knowledgeId)
      } catch (error) {
        console.error('Failed to open wiki link:', error)
      }
      return
    }

    if (isExternalUrl(href)) {
      e.preventDefault()
      void openExternalLink(href)
    }
  }, [openKnowledgeWithStale])

  const revealExternalImage = useCallback((src: string) => {
    setLoadedExternalImages((prev) => {
      const next = new Set(prev)
      next.add(src)
      return next
    })
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const knownIds = new Set(tocHeadings.map((heading) => heading.id))
    try {
      const raw = window.sessionStorage.getItem(sectionStateStorageKey)
      if (!raw) {
        setCollapsedSectionIds({})
        return
      }

      const parsed = JSON.parse(raw)
      if (!Array.isArray(parsed)) {
        setCollapsedSectionIds({})
        return
      }

      const nextState: Record<string, boolean> = {}
      parsed.forEach((entry) => {
        if (typeof entry === 'string' && knownIds.has(entry)) {
          nextState[entry] = true
        }
      })
      setCollapsedSectionIds(nextState)
    } catch (error) {
      console.error('Failed to restore section collapse state:', error)
      setCollapsedSectionIds({})
    }
  }, [sectionStateStorageKey, tocHeadings])

  useEffect(() => {
    if (typeof window === 'undefined') return

    try {
      const collapsedIds = Object.keys(collapsedSectionIds).filter((id) => collapsedSectionIds[id])
      window.sessionStorage.setItem(sectionStateStorageKey, JSON.stringify(collapsedIds))
    } catch (error) {
      console.error('Failed to persist section collapse state:', error)
    }
  }, [collapsedSectionIds, sectionStateStorageKey])

  const expandHeadingPath = useCallback((headingId: string) => {
    setCollapsedSectionIds((current) => {
      const path = sectionAncestorMap.get(headingId)
      if (!path && !current[headingId]) {
        return current
      }

      const next = { ...current }
      ;[...(path ?? []), headingId].forEach((id) => {
        delete next[id]
      })
      return next
    })
  }, [sectionAncestorMap])

  const jumpToHeading = useCallback((headingId: string) => {
    expandHeadingPath(headingId)

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const target = document.getElementById(headingId)
        if (target) {
          target.scrollIntoView({ behavior: 'smooth', block: 'start' })
          window.history.replaceState(null, '', `#${headingId}`)
        }
      })
    })
  }, [expandHeadingPath])

  const scrollToTop = useCallback(() => {
    containerRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  const focusDocumentSearchInput = useCallback((select = false) => {
    window.requestAnimationFrame(() => {
      const input = readerSearchInputRef.current
      if (!input) return
      input.focus()
      if (select) {
        input.select()
      }
    })
  }, [])

  const openDocumentSearch = useCallback(() => {
    setShowDocumentSearch(true)
    focusDocumentSearchInput(documentSearchQuery.trim().length > 0)
  }, [documentSearchQuery, focusDocumentSearchInput])

  const closeDocumentSearch = useCallback(() => {
    const root = readerSearchRootRef.current
    if (root) {
      clearReaderSearchHighlights(root)
    }
    readerSearchMatchesRef.current = []
    setShowDocumentSearch(false)
    setDocumentSearchQuery('')
    setDocumentSearchActiveIndex(-1)
    setDocumentSearchMatchCount(0)
  }, [])

  const moveDocumentSearchMatch = useCallback((direction: 1 | -1) => {
    const total = readerSearchMatchesRef.current.length
    if (!total) return

    setDocumentSearchActiveIndex((current) => {
      const currentIndex = current >= 0 ? current : (direction > 0 ? -1 : 0)
      return (currentIndex + direction + total) % total
    })
  }, [])

  useEffect(() => {
    const openHashHeading = () => {
      const hash = window.location.hash.replace(/^#/, '').trim()
      if (!hash) return
      window.setTimeout(() => {
        jumpToHeading(hash)
      }, 32)
    }

    openHashHeading()
    window.addEventListener('hashchange', openHashHeading)
    return () => window.removeEventListener('hashchange', openHashHeading)
  }, [jumpToHeading, knowledgePath, tocHeadings])

  useEffect(() => {
    const root = readerSearchRootRef.current
    if (!root) return

    clearReaderSearchHighlights(root)
    readerSearchMatchesRef.current = []

    if (!showDocumentSearch) {
      if (documentSearchMatchCount !== 0) {
        setDocumentSearchMatchCount(0)
      }
      if (documentSearchActiveIndex !== -1) {
        setDocumentSearchActiveIndex(-1)
      }
      return
    }

    const normalizedQuery = documentSearchQuery.trim()
    if (!normalizedQuery) {
      if (documentSearchMatchCount !== 0) {
        setDocumentSearchMatchCount(0)
      }
      if (documentSearchActiveIndex !== -1) {
        setDocumentSearchActiveIndex(-1)
      }
      return
    }

    const matches = applyReaderSearchHighlights(root, normalizedQuery)
    readerSearchMatchesRef.current = matches
    if (documentSearchMatchCount !== matches.length) {
      setDocumentSearchMatchCount(matches.length)
    }

    const nextActiveIndex = matches.length === 0
      ? -1
      : (documentSearchActiveIndex < 0 || documentSearchActiveIndex >= matches.length
        ? 0
        : documentSearchActiveIndex)

    if (nextActiveIndex !== documentSearchActiveIndex) {
      setDocumentSearchActiveIndex(nextActiveIndex)
    }

    return () => {
      clearReaderSearchHighlights(root)
      readerSearchMatchesRef.current = []
    }
  }, [collapsedSectionIds, documentSearchActiveIndex, documentSearchMatchCount, documentSearchQuery, showDocumentSearch, value])

  useEffect(() => {
    const matches = readerSearchMatchesRef.current
    matches.forEach((match, index) => {
      match.classList.toggle('reader-search-highlight--active', index === documentSearchActiveIndex)
    })

    if (documentSearchActiveIndex < 0 || documentSearchActiveIndex >= matches.length) {
      return
    }

    const activeMatch = matches[documentSearchActiveIndex]
    if (activeMatch && typeof activeMatch.scrollIntoView === 'function') {
      activeMatch.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
        inline: 'nearest',
      })
    }
  }, [documentSearchActiveIndex, documentSearchMatchCount])

  useEffect(() => {
    const handleWindowKeydown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f') {
        event.preventDefault()
        openDocumentSearch()
        return
      }

      if (!showDocumentSearch) return

      if (event.key === 'Escape') {
        event.preventDefault()
        closeDocumentSearch()
        return
      }

      const searchInput = readerSearchInputRef.current
      const triggeredFromSearchInput = event.target === searchInput
      const isForwardNavigation = event.key === 'F3' || (triggeredFromSearchInput && event.key === 'Enter' && !event.shiftKey)
      const isBackwardNavigation = (event.key === 'F3' && event.shiftKey) || (triggeredFromSearchInput && event.key === 'Enter' && event.shiftKey)

      if (!documentSearchQuery.trim()) return

      if (isForwardNavigation) {
        event.preventDefault()
        moveDocumentSearchMatch(1)
      } else if (isBackwardNavigation) {
        event.preventDefault()
        moveDocumentSearchMatch(-1)
      }
    }

    window.addEventListener('keydown', handleWindowKeydown)
    return () => window.removeEventListener('keydown', handleWindowKeydown)
  }, [closeDocumentSearch, documentSearchQuery, moveDocumentSearchMatch, openDocumentSearch, showDocumentSearch])

  const copyHeadingLink = useCallback(async (headingId: string) => {
    try {
      const href = `${window.location.href.split('#')[0]}#${headingId}`
      await navigator.clipboard.writeText(href)
      setCopiedHeadingId(headingId)
      window.setTimeout(() => {
        setCopiedHeadingId((current) => (current === headingId ? null : current))
      }, 1800)
    } catch (error) {
      console.error('Failed to copy heading link:', error)
    }
  }, [])

  const toggleSection = useCallback((sectionId: string) => {
    setCollapsedSectionIds((current) => {
      const next = { ...current }
      if (next[sectionId]) {
        delete next[sectionId]
      } else {
        next[sectionId] = true
      }
      return next
    })
  }, [])

  const handleTaskToggle = useCallback((lineNumber: number, checked: boolean) => {
    if (readOnly) return

    if (onTransformContent) {
      onTransformContent((current) => updateMarkdownTaskState(current, lineNumber, checked))
      return
    }

    const nextContent = updateMarkdownTaskState(value, lineNumber, checked)
    if (nextContent && nextContent !== value) {
      onChange(nextContent)
    }
  }, [onChange, onTransformContent, readOnly, value])

  const createMarkdownComponents = useCallback((lineOffset = 1) => ({
    a: ({ href, children, className, ...props }: any) => (
      (() => {
        const isFootnoteRef = 'data-footnote-ref' in props
        const isFootnoteBackref = 'data-footnote-backref' in props

        if (isFootnoteRef) {
          return (
            <a
              href={href}
              onClick={(e: React.MouseEvent) => handleLinkClick(href, e)}
              className={['reader-footnote-ref', className].filter(Boolean).join(' ')}
              {...props}
            >
              {children}
            </a>
          )
        }

        if (isFootnoteBackref) {
          return (
            <a
              href={href}
              onClick={(e: React.MouseEvent) => handleLinkClick(href, e)}
              className={['reader-footnote-backref', className].filter(Boolean).join(' ')}
              {...props}
            >
              {children}
            </a>
          )
        }

        return (
          <a
            href={href}
            onClick={(e: React.MouseEvent) => handleLinkClick(href, e)}
            className={['text-indigo-600 hover:text-indigo-800 hover:underline cursor-pointer', className].filter(Boolean).join(' ')}
            target={isExternalUrl(href) ? '_blank' : undefined}
            rel={isExternalUrl(href) ? 'noopener noreferrer' : undefined}
            {...props}
          >
            {children}
          </a>
        )
      })()
    ),
    code: ({ className, children, ...props }: any) => (
      <code
        className={className || 'bg-gray-100 text-pink-600 px-1.5 py-0.5 rounded text-xs font-mono'}
        {...props}
      >
        {children}
      </code>
    ),
    pre: ({ children, ...props }: any) => {
      if (React.isValidElement(children)) {
        const codeChild = children as React.ReactElement<{ className?: string; children?: React.ReactNode }>
        const className = codeChild.props.className || ''
        const match = /language-(\w+)/.exec(className)
        const language = match ? match[1] : ''
        const codeChildren = codeChild.props.children

        if (language.toLowerCase() === 'mermaid') {
          return <MermaidBlock downloadBaseName={downloadBaseName}>{codeChildren}</MermaidBlock>
        }

        if (language) {
          return (
            <LazySyntaxCodeBlock language={language} downloadBaseName={downloadBaseName}>
              {codeChildren}
            </LazySyntaxCodeBlock>
          )
        }
      }

      return <CopyablePreBlock downloadBaseName={downloadBaseName} {...props}>{children}</CopyablePreBlock>
    },
    h4: ({ children }: any) => (
      <h4 className="mt-4 mb-2 text-sm font-semibold text-slate-800">{children}</h4>
    ),
    section: ({ children, className, ...props }: any) => {
      if ('data-footnotes' in props) {
        return (
          <section className={['reader-footnotes', className].filter(Boolean).join(' ')} {...props}>
            {children}
          </section>
        )
      }

      return <section className={className} {...props}>{children}</section>
    },
    sup: ({ children, className, ...props }: any) => (
      <sup className={['reader-footnote-sup', className].filter(Boolean).join(' ')} {...props}>{children}</sup>
    ),
    p: ({ children }: any) => {
      const plainText = extractText(children)
      const workflowNodes = parseWorkflowNodes(plainText)

      if (workflowNodes) {
        return <WorkflowBlock text={plainText} />
      }

      return <p className="text-sm text-gray-700 leading-relaxed mb-3">{children}</p>
    },
    ul: ({ children }: any) => (
      <ul className="mb-3 list-disc space-y-1 pl-5 text-sm text-gray-700">{children}</ul>
    ),
    ol: ({ children }: any) => (
      <ol className="mb-3 list-decimal space-y-1 pl-5 text-sm text-gray-700">{children}</ol>
    ),
    li: ({ children, node }: any) => {
      const childItems = React.Children.toArray(children)
      const checkboxIndex = childItems.findIndex((child) => (
        React.isValidElement(child) &&
        child.type === 'input' &&
        child.props.type === 'checkbox'
      ))

      if (checkboxIndex >= 0) {
        const checkbox = childItems[checkboxIndex] as React.ReactElement<{ checked?: boolean }>
        const checked = Boolean(checkbox.props.checked)
        const content = childItems.slice(checkboxIndex + 1)
        const lineNumber = typeof node?.position?.start?.line === 'number'
          ? lineOffset + node.position.start.line - 1
          : null

        return (
          <li className="list-none">
            <button
              type="button"
              className="group flex w-full items-start gap-2 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-slate-50 disabled:cursor-default disabled:hover:bg-transparent"
              style={{ backgroundColor: checked ? '#F8FAFC' : 'transparent' }}
              onClick={() => {
                if (lineNumber !== null) {
                  handleTaskToggle(lineNumber, !checked)
                }
              }}
              disabled={readOnly || lineNumber === null}
              aria-pressed={checked}
              title={readOnly ? '只读模式下无法修改待办' : (checked ? '标记为未完成' : '标记为已完成')}
            >
              <span
                className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors"
                style={{
                  borderColor: checked ? 'var(--brand-primary-border-strong)' : '#CBD5E1',
                  backgroundColor: checked ? 'var(--brand-primary-soft)' : '#FFFFFF',
                  color: checked ? 'var(--brand-primary-strong)' : '#CBD5E1',
                  boxShadow: readOnly ? 'none' : '0 0 0 0 transparent',
                }}
              >
                {checked ? <Check className="h-3 w-3" /> : null}
              </span>
              <span className={`min-w-0 flex-1 ${checked ? 'text-slate-400 line-through' : 'text-gray-700'}`}>
                {content}
              </span>
              {!readOnly && (
                <span className="mt-0.5 shrink-0 text-[10px] font-medium text-slate-400 opacity-0 transition-opacity group-hover:opacity-100">
                  {checked ? '点击取消' : '点击完成'}
                </span>
              )}
            </button>
          </li>
        )
      }

      return <li className="text-sm text-gray-700">{children}</li>
    },
    blockquote: ({ children }: any) => {
      const stripped = stripCalloutMarker(children)
      if (stripped.matched) {
        const config = CALLOUT_CONFIG[stripped.matched.kind]
        const Icon = config.icon
        const normalizedChildren = React.Children.toArray(stripped.node).filter((child, index) => (
          !(index === 0 && extractText(child).trim() === '')
        ))

        return (
          <div className={`my-4 rounded-2xl border px-4 py-3 ${config.containerClassName}`}>
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Icon className={`h-4 w-4 ${config.iconClassName}`} />
              <span>{stripped.matched.title || config.label}</span>
            </div>
            {normalizedChildren.length > 0 && (
              <div className="mt-2 text-sm leading-relaxed text-inherit [&_p:last-child]:mb-0">
                {normalizedChildren}
              </div>
            )}
          </div>
        )
      }

      return (
        <blockquote className="border-l-4 border-indigo-500 pl-4 py-1 my-3 bg-indigo-50 text-sm text-gray-600 italic">
          {children}
        </blockquote>
      )
    },
    table: ({ children, node }: any) => (
      <ReaderTable node={node}>
        {children}
      </ReaderTable>
    ),
    thead: ({ children }: any) => (
      <thead className="bg-slate-50/95 backdrop-blur-sm">{children}</thead>
    ),
    tbody: ({ children }: any) => (
      <tbody className="[&_tr:nth-child(even)]:bg-slate-50/70">{children}</tbody>
    ),
    tr: ({ children }: any) => (
      <tr className="border-t border-slate-200">{children}</tr>
    ),
    th: ({ children, ...props }: any) => (
      <th
        {...props}
        className="reader-table__cell reader-table__cell--head whitespace-nowrap px-3 py-2.5 text-left text-xs font-semibold text-gray-700"
      >
        {children}
      </th>
    ),
    td: ({ children, ...props }: any) => (
      <td
        {...props}
        className="reader-table__cell px-3 py-2.5 text-xs leading-6 text-gray-600 align-top break-words"
      >
        {children}
      </td>
    ),
    hr: () => (
      <hr className="my-6 border-gray-200" />
    ),
    img: ({ src, alt }: any) => (
      isExternalUrl(src) && !loadedExternalImages.has(src) ? (
        <div className="my-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <div className="mb-2 text-sm font-medium text-amber-900">
            外链图片已暂停自动加载
          </div>
          <div className="mb-3 text-xs text-amber-800 break-all">
            {src}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => src && revealExternalImage(src)}
              className="rounded-md bg-amber-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-600"
            >
              加载图片
            </button>
            <button
              type="button"
              onClick={() => src && void openExternalLink(src)}
              className="rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-100"
            >
              在浏览器打开
            </button>
          </div>
        </div>
      ) : (
        <figure className="my-4">
          <img
            src={src}
            alt={alt}
            loading="lazy"
            decoding="async"
            referrerPolicy={isExternalUrl(src) ? 'no-referrer' : undefined}
            className="max-w-full h-auto rounded-lg cursor-zoom-in"
            onClick={(e: React.MouseEvent) => {
              e.stopPropagation()
              if (src) {
                setLightboxImage({ src, alt })
              }
            }}
          />
          <figcaption className="mt-2 text-xs text-slate-500">
            点击图片查看大图
            {src ? ` · ${getImageDisplayText(src, alt)}` : ''}
          </figcaption>
        </figure>
      )
    ),
    }),
  [downloadBaseName, handleLinkClick, handleTaskToggle, loadedExternalImages, readOnly, revealExternalImage])

  const renderMarkdownFragment = useCallback((markdown: string, lineOffset = 1) => {
    if (!markdown.trim()) return null

    return (
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath, remarkWikiLinks]}
        rehypePlugins={[rehypeKatex]}
        components={createMarkdownComponents(lineOffset)}
      >
        {markdown}
      </ReactMarkdown>
    )
  }, [createMarkdownComponents])

  const renderSection = (section: MarkdownSection): React.ReactNode => {
    const isCollapsible = section.level >= 2
    const isCollapsed = Boolean(collapsedSectionIds[section.id])
    const childCount = section.children.length
    const hasBody = section.body.trim().length > 0
    const HeadingTag = section.level === 1 ? 'h1' : section.level === 2 ? 'h2' : 'h3'
    const headingClassName = section.level === 1
      ? 'text-xl font-bold text-gray-900'
      : section.level === 2
        ? 'text-lg font-semibold text-gray-900'
        : 'text-base font-semibold text-gray-800'

    return (
      <section
        key={section.id}
        className={`reader-section reader-section--level-${section.level} ${isCollapsible ? 'rounded-2xl border border-slate-200/90 bg-white/80' : ''}`}
        data-collapsed={isCollapsed ? 'true' : 'false'}
      >
        <div
          id={section.id}
          className={`reader-section__heading group scroll-mt-6 ${section.level === 1 ? 'mt-1 mb-5 border-b border-gray-200 pb-3' : 'px-3 py-2.5'}`}
        >
          <div className="flex items-center gap-2">
            {section.level === 1 ? null : isCollapsible ? (
              <button
                type="button"
                onClick={() => toggleSection(section.id)}
                className="reader-section__toggle inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-500 transition-colors hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-600"
                aria-expanded={!isCollapsed}
                title={isCollapsed ? '展开章节' : '收起章节'}
              >
                <ChevronRight className={`h-4 w-4 transition-transform ${isCollapsed ? '' : 'rotate-90'}`} />
              </button>
            ) : (
              <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-50 text-slate-400">
                <ListTree className="h-4 w-4" />
              </span>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                {React.createElement(
                  HeadingTag,
                  { className: headingClassName },
                  <button type="button" className="text-left hover:underline" onClick={() => jumpToHeading(section.id)}>{section.title}</button>,
                )}
                {isCollapsible && (
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                    {isCollapsed ? '已折叠' : '已展开'}
                  </span>
                )}
                {childCount > 0 && (
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                    {childCount} 小节
                  </span>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => void copyHeadingLink(section.id)}
              className={`reader-section__copy transition-opacity ${section.level === 1 ? 'opacity-45 hover:opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
              title="复制标题链接"
            >
              {copiedHeadingId === section.id ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Link2 className="h-3.5 w-3.5 text-gray-400" />}
            </button>
          </div>
        </div>

        {(!isCollapsible || !isCollapsed) && (
          <div className={section.level === 1 ? 'reader-section__content' : 'reader-section__content px-3 pb-3'}>
            {hasBody && renderMarkdownFragment(section.body, section.bodyStartLine ?? section.headingLine)}
            {section.children.length > 0 && (
              <div className={`space-y-3 ${section.level === 1 ? 'mt-4' : 'mt-3'}`}>
                {section.children.map((child) => renderSection(child))}
              </div>
            )}
          </div>
        )}
      </section>
    )
  }

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    let frameId = 0

    const updateReaderState = () => {
      setShowBackToTop(container.scrollTop > 280)

      if (navigableTocHeadings.length === 0) {
        setActiveHeadingId(null)
        return
      }

      let nextActiveHeading = navigableTocHeadings[0]?.id ?? null
      const containerRect = container.getBoundingClientRect()

      navigableTocHeadings.forEach((heading) => {
        const element = document.getElementById(heading.id)
        if (!element) return

        const rect = element.getBoundingClientRect()
        if (rect.top - containerRect.top <= 96) {
          nextActiveHeading = heading.id
        }
      })

      setActiveHeadingId(nextActiveHeading)
    }

    const scheduleReaderStateUpdate = () => {
      if (frameId !== 0) return
      frameId = window.requestAnimationFrame(() => {
        frameId = 0
        updateReaderState()
      })
    }

    updateReaderState()
    container.addEventListener('scroll', scheduleReaderStateUpdate, { passive: true })
    window.addEventListener('resize', scheduleReaderStateUpdate)

    return () => {
      if (frameId !== 0) {
        window.cancelAnimationFrame(frameId)
      }
      container.removeEventListener('scroll', scheduleReaderStateUpdate)
      window.removeEventListener('resize', scheduleReaderStateUpdate)
    }
  }, [navigableTocHeadings])

  return (
    <div ref={containerRef} className="reader-shell h-full w-full overflow-auto">
      <div className={`flex ${showToc ? 'gap-8 2xl:gap-10' : ''}`}>
        <div className="min-w-0 flex-1">
          <div className={showToc ? 'max-w-[56rem]' : 'mx-auto max-w-[56rem]'}>
            <div className="sticky top-2 z-20 mb-3 flex justify-end">
              {showDocumentSearch ? (
                <div className="reader-searchbar">
                  <div className="reader-searchbar__field">
                    <Search className="h-3.5 w-3.5 text-slate-400" />
                    <input
                      ref={readerSearchInputRef}
                      type="text"
                      value={documentSearchQuery}
                      onChange={(event) => {
                        setDocumentSearchQuery(event.target.value)
                        setDocumentSearchActiveIndex(-1)
                      }}
                      placeholder="搜索当前文档"
                      className="reader-searchbar__input"
                    />
                  </div>
                  <div className="reader-searchbar__meta">
                    <span className={`reader-searchbar__count ${documentSearchQuery.trim() && documentSearchMatchCount === 0 ? 'reader-searchbar__count--error' : ''}`}>
                      {documentSearchQuery.trim()
                        ? (documentSearchMatchCount > 0 ? `${documentSearchActiveIndex + 1} / ${documentSearchMatchCount}` : '无结果')
                        : '搜索正文'}
                    </span>
                    <button
                      type="button"
                      className="reader-searchbar__button"
                      onClick={() => moveDocumentSearchMatch(-1)}
                      disabled={documentSearchMatchCount === 0}
                      title="上一个匹配"
                    >
                      <ChevronUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      className="reader-searchbar__button"
                      onClick={() => moveDocumentSearchMatch(1)}
                      disabled={documentSearchMatchCount === 0}
                      title="下一个匹配"
                    >
                      <ChevronDown className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      className="reader-searchbar__button"
                      onClick={closeDocumentSearch}
                      title="关闭搜索"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ) : (
                <button type="button" className="reader-searchbar__launcher" onClick={openDocumentSearch}>
                  <Search className="h-3.5 w-3.5" />
                  查找
                </button>
              )}
            </div>

            {showToc && (
            <details className="reader-toc-inline sticky top-2 z-10 mb-4 rounded-2xl border border-slate-200/90 bg-white/90 p-2 shadow-sm backdrop-blur-sm 2xl:hidden">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-2 py-1.5">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-slate-50 text-slate-500">
                    <ListTree className="h-3.5 w-3.5" />
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-[11px] font-medium text-slate-500">
                      <span>目录</span>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">
                        {navigableTocHeadings.length} 节
                      </span>
                    </div>
                    <div className="truncate text-[13px] font-medium text-slate-700">
                      {activeHeadingText}
                    </div>
                  </div>
                </div>
                <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-50 text-slate-400">
                  <ChevronRight className="reader-toc-inline__chevron h-4 w-4" />
                </span>
              </summary>
              <div className="mt-2 max-h-64 space-y-1 overflow-y-auto border-t border-slate-200/80 pt-2">
                {navigableTocHeadings.map((heading) => (
                  <button
                    key={heading.id}
                    type="button"
                    onClick={() => jumpToHeading(heading.id)}
                    className="block w-full truncate rounded-xl px-2.5 py-1.5 text-left text-sm hover:bg-white"
                    style={{
                      paddingLeft: `${(heading.level - 1) * 12 + 10}px`,
                      color: activeHeadingId === heading.id ? 'var(--brand-primary-strong)' : '#475569',
                      backgroundColor: activeHeadingId === heading.id ? 'var(--brand-primary-soft)' : 'transparent',
                      fontWeight: activeHeadingId === heading.id ? 600 : 400,
                    }}
                  >
                    {heading.text}
                  </button>
                ))}
              </div>
            </details>
            )}

            <div ref={readerSearchRootRef} className="reader-markdown">
              {markdownDocument.intro.trim() && renderMarkdownFragment(markdownDocument.intro, markdownDocument.introStartLine ?? 1)}
              {markdownDocument.sections.length > 0
                ? markdownDocument.sections.map((section) => renderSection(section))
                : (!markdownDocument.intro.trim() && renderMarkdownFragment(value || '*暂无内容*', 1))}
            </div>
          </div>
        </div>

        {showToc && (
          <aside className="sticky top-0 hidden h-fit w-52 rounded-xl border border-slate-200 bg-slate-50/80 p-3 2xl:block">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">目录</div>
            <div className="space-y-1">
              {navigableTocHeadings.map((heading) => (
                <button
                  key={heading.id}
                  type="button"
                  onClick={() => jumpToHeading(heading.id)}
                  className="block w-full truncate rounded-md px-2 py-1 text-left text-sm hover:bg-white"
                  style={{
                    paddingLeft: `${(heading.level - 1) * 12 + 8}px`,
                    color: activeHeadingId === heading.id ? 'var(--brand-primary-strong)' : '#475569',
                    backgroundColor: activeHeadingId === heading.id ? 'var(--brand-primary-soft)' : 'transparent',
                    fontWeight: activeHeadingId === heading.id ? 600 : 400,
                  }}
                >
                  {heading.text}
                </button>
              ))}
            </div>
          </aside>
        )}
      </div>

      {showBackToTop && (
        <button
          type="button"
          onClick={scrollToTop}
          className="sticky bottom-6 ml-auto mt-6 flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 shadow-sm hover:border-indigo-200 hover:text-indigo-600"
        >
          返回顶部
        </button>
      )}

      {lightboxImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6">
          <button
            type="button"
            className="absolute inset-0"
            aria-label="关闭图片预览"
            onClick={() => setLightboxImage(null)}
          />
          <div className="relative z-10 flex max-h-full max-w-6xl flex-col gap-3">
            <div className="flex items-center justify-end gap-2">
              {isExternalUrl(lightboxImage.src) && (
                <button
                  type="button"
                  onClick={() => void openExternalLink(lightboxImage.src)}
                  className="inline-flex items-center gap-1 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-sm text-white transition-colors hover:bg-white/20"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  在浏览器打开
                </button>
              )}
              <button
                type="button"
                onClick={() => setLightboxImage(null)}
                className="inline-flex items-center gap-1 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-sm text-white transition-colors hover:bg-white/20"
              >
                <X className="h-3.5 w-3.5" />
                关闭
              </button>
            </div>
            <img
              src={lightboxImage.src}
              alt={lightboxImage.alt}
              className="max-h-[80vh] max-w-full rounded-2xl object-contain shadow-2xl"
            />
            <div className="text-center text-sm text-white/80">
              {getImageDisplayText(lightboxImage.src, lightboxImage.alt)}
            </div>
            <div className="text-center text-[12px] text-white/50">
              点击空白处或按 `Esc` 关闭
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export const EditorRead = React.memo(EditorReadInner)
