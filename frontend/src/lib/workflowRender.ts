export interface WorkflowNode {
  id: string
  label: string
  level: number
}

export interface WorkflowPresentation {
  title: string
  detail: string | null
  tone: 'indigo' | 'emerald' | 'rose' | 'amber' | 'slate' | 'sky'
  laneLabel: string
  branch: boolean
  kind: 'step' | 'decision' | 'success' | 'failure' | 'repair' | 'finally' | 'neutral'
}

export interface WorkflowSummary {
  rootLabel: string
  stepCount: number
  branchCount: number
}

const BRANCH_SUCCESS_PATTERN = /^(pass|success|done|commit|return|then)\b/i
const BRANCH_FAILURE_PATTERN = /^(fail|failure|error|reject|abort|back-pressure|else)\b/i
const BRANCH_REPAIR_PATTERN = /^(retry|wait|escalate|fallback|repair|recover|timeout)\b/i
const BRANCH_FINALLY_PATTERN = /^(finally|cleanup|finalize|closeout|wrap-up)\b/i
const DECISION_PATTERN = /^(validation|review|check|verify|gate|decision|if)\b/i

const normalizeWorkflowLines = (text: string) => (
  text
    .split('\n')
    .map((line) => line.replace(/\t/g, '  ').replace(/\s+$/g, ''))
    .filter((line) => line.trim().length > 0)
)

export function parseWorkflowNodes(text: string): WorkflowNode[] | null {
  const lines = normalizeWorkflowLines(text)

  if (lines.length < 3 || !lines.some((line) => line.includes('->'))) {
    return null
  }

  const baseIndent = lines.reduce<number>((current, line, index) => {
    if (index === 0) return current
    const arrowMatch = line.match(/^(\s*)->\s*(.+)$/)
    if (!arrowMatch) return current
    const indent = arrowMatch[1].length
    return current === Number.POSITIVE_INFINITY ? indent : Math.min(current, indent)
  }, Number.POSITIVE_INFINITY)

  const nodes: WorkflowNode[] = []

  for (const [index, line] of lines.entries()) {
    const arrowMatch = line.match(/^(\s*)->\s*(.+)$/)

    if (!arrowMatch) {
      if (index === 0) {
        nodes.push({
          id: `workflow-root-${index}`,
          label: line.trim(),
          level: 0,
        })
        continue
      }

      return null
    }

    nodes.push({
      id: `workflow-node-${index}`,
      label: arrowMatch[2].trim(),
      level: 1 + Math.max(0, Math.floor((arrowMatch[1].length - (Number.isFinite(baseIndent) ? baseIndent : 0)) / 2)),
    })
  }

  const hasRoot = nodes.some((node) => node.level === 0)
  const hasBranch = nodes.some((node) => node.level > 0)
  return hasRoot && hasBranch ? nodes : null
}

export function presentWorkflowNode(node: WorkflowNode): WorkflowPresentation {
  const segments = node.label
    .split(/\s*->\s*/)
    .map((segment) => segment.trim())
    .filter(Boolean)

  const title = segments[0] ?? node.label
  const detail = segments.length > 1 ? segments.slice(1).join(' -> ') : null
  const normalized = title.toLowerCase()

  if (BRANCH_SUCCESS_PATTERN.test(normalized)) {
    return { title, detail, tone: 'emerald', laneLabel: '成功分支', branch: true, kind: 'success' }
  }

  if (BRANCH_FAILURE_PATTERN.test(normalized)) {
    return { title, detail, tone: 'rose', laneLabel: '失败分支', branch: true, kind: 'failure' }
  }

  if (BRANCH_REPAIR_PATTERN.test(normalized)) {
    return {
      title,
      detail,
      tone: node.level === 1 ? 'amber' : 'amber',
      laneLabel: node.level === 1 ? '处理步骤' : '修复分支',
      branch: node.level > 1,
      kind: 'repair',
    }
  }

  if (BRANCH_FINALLY_PATTERN.test(normalized)) {
    return {
      title,
      detail,
      tone: 'sky',
      laneLabel: '收尾分支',
      branch: true,
      kind: 'finally',
    }
  }

  if (DECISION_PATTERN.test(normalized)) {
    return {
      title,
      detail,
      tone: 'indigo',
      laneLabel: '判断节点',
      branch: node.level > 1,
      kind: 'decision',
    }
  }

  return {
    title,
    detail,
    tone: node.level === 1 ? 'indigo' : 'slate',
    laneLabel: node.level === 1 ? '主步骤' : `分支层级 ${node.level - 1}`,
    branch: node.level > 1,
    kind: node.level === 1 ? 'step' : 'neutral',
  }
}

export function summarizeWorkflow(nodes: WorkflowNode[]): WorkflowSummary {
  const rootLabel = nodes[0]?.label ?? ''
  const branchCount = nodes.slice(1).filter((node) => {
    const presentation = presentWorkflowNode(node)
    return node.level > 1 || presentation.branch
  }).length

  const stepCount = nodes.slice(1).length - branchCount

  return {
    rootLabel,
    stepCount,
    branchCount,
  }
}

export function buildWorkflowOutline(nodes: WorkflowNode[]): string {
  return nodes
    .map((node) => {
      if (node.level === 0) return node.label
      return `${'  '.repeat(node.level)}-> ${node.label}`
    })
    .join('\n')
}
