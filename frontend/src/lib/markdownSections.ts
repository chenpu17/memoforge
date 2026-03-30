export interface MarkdownSection {
  id: string
  level: number
  title: string
  body: string
  headingLine: number
  bodyStartLine: number | null
  children: MarkdownSection[]
}

export interface MarkdownSectionDocument {
  intro: string
  introStartLine: number | null
  sections: MarkdownSection[]
}

export interface MarkdownSectionHeading {
  id: string
  level: number
  text: string
}

interface MutableMarkdownSection extends MarkdownSection {
  children: MutableMarkdownSection[]
  bodyLines: string[]
  bodyLineNumbers: number[]
}

function slugifyHeading(text: string) {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/\s+/g, '-')
}

function trimSectionBody(value: string) {
  return value.replace(/^\n+|\n+$/g, '')
}

export function parseMarkdownSections(text: string): MarkdownSectionDocument {
  const lines = text.split('\n')
  const slugCounts = new Map<string, number>()
  const introLines: string[] = []
  const roots: MutableMarkdownSection[] = []
  const stack: MutableMarkdownSection[] = []
  let activeFence: string | null = null

  const nextHeadingId = (title: string) => {
    const baseSlug = slugifyHeading(title) || 'section'
    const seenCount = slugCounts.get(baseSlug) ?? 0
    slugCounts.set(baseSlug, seenCount + 1)
    return seenCount === 0 ? baseSlug : `${baseSlug}-${seenCount + 1}`
  }

  for (const [index, line] of lines.entries()) {
    const lineNumber = index + 1
    const fenceMatch = line.match(/^\s*(`{3,}|~{3,})/)
    if (fenceMatch) {
      const marker = fenceMatch[1][0]
      if (!activeFence) {
        activeFence = marker
      } else if (activeFence === marker) {
        activeFence = null
      }
    }

    const headingMatch = !activeFence ? line.match(/^(#{1,3})\s+(.+?)\s*#*\s*$/) : null
    if (!headingMatch) {
      const target = stack[stack.length - 1]
      if (target) {
        target.bodyLines.push(line)
        target.bodyLineNumbers.push(lineNumber)
      } else {
        introLines.push(line)
      }
      continue
    }

    const level = headingMatch[1].length
    const title = headingMatch[2].trim()
    const section: MutableMarkdownSection = {
      id: nextHeadingId(title),
      level,
      title,
      body: '',
      headingLine: lineNumber,
      bodyStartLine: null,
      children: [],
      bodyLines: [],
      bodyLineNumbers: [],
    }

    while (stack.length > 0 && stack[stack.length - 1].level >= level) {
      stack.pop()
    }

    const parent = stack[stack.length - 1]
    if (parent) {
      parent.children.push(section)
    } else {
      roots.push(section)
    }
    stack.push(section)
  }

  const firstMeaningfulLine = (linesToCheck: string[], lineNumbers: number[]) => {
    const index = linesToCheck.findIndex((entry) => entry.trim().length > 0)
    return index >= 0 ? (lineNumbers[index] ?? null) : null
  }

  const finalize = (sections: MutableMarkdownSection[]): MarkdownSection[] => (
    sections.map((section) => ({
      id: section.id,
      level: section.level,
      title: section.title,
      body: trimSectionBody(section.bodyLines.join('\n')),
      headingLine: section.headingLine,
      bodyStartLine: firstMeaningfulLine(section.bodyLines, section.bodyLineNumbers),
      children: finalize(section.children),
    }))
  )

  return {
    intro: trimSectionBody(introLines.join('\n')),
    introStartLine: firstMeaningfulLine(introLines, introLines.map((_, index) => index + 1)),
    sections: finalize(roots),
  }
}

export function flattenMarkdownSectionHeadings(sections: MarkdownSection[]): MarkdownSectionHeading[] {
  const result: MarkdownSectionHeading[] = []

  const visit = (nodes: MarkdownSection[]) => {
    nodes.forEach((node) => {
      result.push({
        id: node.id,
        level: node.level,
        text: node.title,
      })
      if (node.children.length > 0) {
        visit(node.children)
      }
    })
  }

  visit(sections)
  return result
}

export function buildMarkdownSectionAncestorMap(sections: MarkdownSection[]) {
  const ancestors = new Map<string, string[]>()

  const visit = (nodes: MarkdownSection[], parentChain: string[]) => {
    nodes.forEach((node) => {
      ancestors.set(node.id, parentChain)
      visit(node.children, [...parentChain, node.id])
    })
  }

  visit(sections, [])
  return ancestors
}
