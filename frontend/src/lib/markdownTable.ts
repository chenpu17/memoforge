export interface MarkdownTableCell {
  text: string
}

export interface MarkdownTableData {
  headers: MarkdownTableCell[]
  rows: MarkdownTableCell[][]
}

interface MarkdownAstNode {
  type?: string
  value?: string
  alt?: string
  children?: MarkdownAstNode[]
}

function extractNodeText(node: MarkdownAstNode | undefined): string {
  if (!node) return ''
  if (typeof node.value === 'string') return node.value
  if (node.type === 'image' && typeof node.alt === 'string') return node.alt
  if (!Array.isArray(node.children)) return ''
  return node.children.map((child) => extractNodeText(child)).join('')
}

export function parseMarkdownTableNode(node: MarkdownAstNode | undefined): MarkdownTableData | null {
  if (!node || node.type !== 'table' || !Array.isArray(node.children) || node.children.length === 0) {
    return null
  }

  const [headerRow, ...bodyRows] = node.children
  const headers = Array.isArray(headerRow?.children)
    ? headerRow.children.map((cell) => ({ text: extractNodeText(cell).trim() }))
    : []

  const rows = bodyRows
    .filter((row) => Array.isArray(row.children))
    .map((row) => row.children!.map((cell) => ({ text: extractNodeText(cell).trim() })))

  if (headers.length === 0 && rows.length === 0) {
    return null
  }

  return { headers, rows }
}
