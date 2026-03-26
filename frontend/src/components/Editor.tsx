import React, { useCallback, useRef, useEffect } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { markdown } from '@codemirror/lang-markdown'
import { EditorView } from '@codemirror/view'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { useEditorStatePublisher } from '../hooks/useEditorStatePublisher'

interface EditorProps {
  value: string
  onChange: (value: string) => void
  mode: 'read' | 'edit'
  knowledgePath?: string  // 当前知识点路径
  knowledgeTitle?: string // 当前知识点标题
  knowledgeCategory?: string // 当前知识点分类
}

// Helper to detect Tauri environment
const isTauri = () => {
  if (typeof window === 'undefined') return false
  return '__TAURI__' in window || '__TAURI_INTERNALS__' in window
}

// Open external link in system browser
const openExternalLink = async (href: string) => {
  if (isTauri()) {
    try {
      const { open } = await import('@tauri-apps/plugin-shell')
      await open(href)
    } catch (error) {
      console.error('Failed to open external link:', error)
      // Fallback to window.open
      window.open(href, '_blank', 'noopener,noreferrer')
    }
  } else {
    window.open(href, '_blank', 'noopener,noreferrer')
  }
}

export const Editor: React.FC<EditorProps> = ({
  value,
  onChange,
  mode,
  knowledgePath,
  knowledgeTitle: _knowledgeTitle,
  knowledgeCategory: _knowledgeCategory,
}) => {
  const { updateSelection, clearSelection } = useEditorStatePublisher()
  const lastSelectionRef = useRef<{ startLine: number; endLine: number } | null>(null)
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null)

  // 处理选区变化（带防抖，避免频繁写入）
  // 注意：选区仅在编辑模式下发布（阅读模式下没有编辑器选区）
  const handleSelectionChange = useCallback((event: any) => {
    if (!knowledgePath || mode !== 'edit') return

    const selection = event.state.selection
    if (!selection) return

    // 立即更新临时选区状态（用于快速响应 UI）
    const from = selection.main.from
    const to = selection.main.to

    // 没有选中文本（光标位置）
    if (from === undefined || to === undefined || from === to) {
      // 清除之前的定时器
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
        debounceTimerRef.current = null
      }
      // 立即清除选区状态
      if (lastSelectionRef.current !== null) {
        lastSelectionRef.current = null
        clearSelection()
      }
      return
    }

    // 计算行号（1-based）
    const lines = value.substring(0, from).split('\n')
    const startLine = lines.length
    const endLines = value.substring(0, to).split('\n')
    const endLine = endLines.length
    const selectedTextLength = value.substring(from, to).length

    // 立即更新本地状态（快速响应）
    lastSelectionRef.current = { startLine, endLine }

    // 清除之前的定时器
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
    }

    // 防抖 100ms 后写入到后端（实时响应）
    debounceTimerRef.current = setTimeout(() => {
      // 再次检查是否仍然有选区
      if (lastSelectionRef.current !== null) {
        // 不发送选中文本内容（隐私保护）
        updateSelection(startLine, endLine, selectedTextLength)
      }
      debounceTimerRef.current = null
    }, 100)
  }, [value, knowledgePath, mode, updateSelection, clearSelection])

  // 组件卸载时清理定时器
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
    }
  }, [])

  // Handle link clicks in markdown
  const handleLinkClick = useCallback((href: string, e: React.MouseEvent) => {
    // Check if it's an external link (http/https)
    if (href.startsWith('http://') || href.startsWith('https://')) {
      e.preventDefault()
      openExternalLink(href)
    }
    // Wiki links and internal links will be handled normally
  }, [])

  // Custom components for ReactMarkdown
  const components = {
    // Custom link handling
    a: ({ href, children, ...props }: any) => (
      <a
        href={href}
        onClick={(e: React.MouseEvent) => handleLinkClick(href, e)}
        className="text-indigo-600 hover:text-indigo-800 hover:underline cursor-pointer"
        {...props}
      >
        {children}
      </a>
    ),
    // Code block with syntax highlighting
    code: ({ node, inline, className, children, ...props }: any) => {
      const match = /language-(\w+)/.exec(className || '')
      const language = match ? match[1] : ''

      if (!inline && language) {
        return (
          <SyntaxHighlighter
            style={vscDarkPlus}
            language={language}
            PreTag="div"
            className="rounded-lg text-xs !bg-gray-900 !my-3"
            customStyle={{
              margin: '0.75rem 0',
              padding: '1rem',
              fontSize: '0.75rem',
              borderRadius: '0.5rem',
            }}
            {...props}
          >
            {String(children).replace(/\n$/, '')}
          </SyntaxHighlighter>
        )
      }

      // Inline code
      return (
        <code
          className="bg-gray-100 text-pink-600 px-1.5 py-0.5 rounded text-xs font-mono"
          {...props}
        >
          {children}
        </code>
      )
    },
    // Pre tag for code blocks without language
    pre: ({ children, ...props }: any) => {
      // If it's already a SyntaxHighlighter, just return it
      if (children?.type?.name === 'SyntaxHighlighter' || children?.props?.className?.includes('language-')) {
        return children
      }
      return (
        <pre
          className="bg-gray-900 text-gray-100 rounded-lg p-4 overflow-x-auto text-xs font-mono my-3"
          {...props}
        >
          {children}
        </pre>
      )
    },
    // Headings
    h1: ({ children }: any) => (
      <h1 className="text-xl font-bold text-gray-900 mt-6 mb-3 pb-2 border-b border-gray-200">{children}</h1>
    ),
    h2: ({ children }: any) => (
      <h2 className="text-lg font-semibold text-gray-900 mt-5 mb-2">{children}</h2>
    ),
    h3: ({ children }: any) => (
      <h3 className="text-base font-semibold text-gray-800 mt-4 mb-2">{children}</h3>
    ),
    // Paragraph
    p: ({ children }: any) => (
      <p className="text-sm text-gray-700 leading-relaxed mb-3">{children}</p>
    ),
    // Lists
    ul: ({ children }: any) => (
      <ul className="list-disc list-inside text-sm text-gray-700 mb-3 space-y-1">{children}</ul>
    ),
    ol: ({ children }: any) => (
      <ol className="list-decimal list-inside text-sm text-gray-700 mb-3 space-y-1">{children}</ol>
    ),
    li: ({ children }: any) => (
      <li className="text-sm text-gray-700">{children}</li>
    ),
    // Blockquote
    blockquote: ({ children }: any) => (
      <blockquote className="border-l-4 border-indigo-500 pl-4 py-1 my-3 bg-indigo-50 text-sm text-gray-600 italic">
        {children}
      </blockquote>
    ),
    // Table
    table: ({ children }: any) => (
      <div className="overflow-x-auto my-3">
        <table className="min-w-full text-sm border-collapse border border-gray-200">
          {children}
        </table>
      </div>
    ),
    thead: ({ children }: any) => (
      <thead className="bg-gray-50">{children}</thead>
    ),
    th: ({ children }: any) => (
      <th className="border border-gray-200 px-3 py-2 text-left text-xs font-semibold text-gray-700">{children}</th>
    ),
    td: ({ children }: any) => (
      <td className="border border-gray-200 px-3 py-2 text-xs text-gray-600">{children}</td>
    ),
    // Horizontal rule
    hr: () => (
      <hr className="my-6 border-gray-200" />
    ),
    // Image
    img: ({ src, alt }: any) => (
      <img
        src={src}
        alt={alt}
        className="max-w-full h-auto rounded-lg my-3"
        onClick={(e: React.MouseEvent) => {
          e.stopPropagation()
          if (src && (src.startsWith('http://') || src.startsWith('https://'))) {
            openExternalLink(src)
          }
        }}
      />
    ),
  }

  if (mode === 'read') {
    return (
      <div className="h-full w-full overflow-auto">
        <div className="max-w-3xl">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={components}
          >
            {value || '*暂无内容*'}
          </ReactMarkdown>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full w-full">
      <CodeMirror
        value={value}
        height="100%"
        extensions={[
          markdown(),
          EditorView.updateListener.of(handleSelectionChange)
        ]}
        onChange={onChange}
        className="text-sm"
        theme="light"
        basicSetup={{
          lineNumbers: true,
          highlightActiveLineGutter: false,
          highlightSpecialChars: true,
          foldGutter: true,
          drawSelection: true,
          dropCursor: true,
          allowMultipleSelections: true,
          indentOnInput: true,
          bracketMatching: true,
          closeBrackets: true,
          autocompletion: true,
          rectangularSelection: true,
          crosshairCursor: true,
          highlightActiveLine: false,
          highlightSelectionMatches: true,
          closeBracketsKeymap: true,
          defaultKeymap: true,
          searchKeymap: true,
          historyKeymap: true,
          foldKeymap: true,
          completionKeymap: true,
          lintKeymap: true,
        }}
      />
    </div>
  )
}
