export interface WikiLinkInsertResult {
  text: string
  displayStart: number | null
  displayEnd: number | null
}

export const WIKI_LINK_PREFIX = 'memoforge://knowledge/'
export const WIKI_LINK_PATTERN = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g

export const encodeWikiLinkHref = (target: string) => `${WIKI_LINK_PREFIX}${encodeURIComponent(target)}`

export const decodeWikiLinkHref = (href: string) => {
  if (!href.startsWith(WIKI_LINK_PREFIX)) return null
  return decodeURIComponent(href.slice(WIKI_LINK_PREFIX.length))
}

export const isExternalUrl = (value: string | undefined) => {
  if (!value) return false
  return value.startsWith('http://') || value.startsWith('https://')
}

export const buildWikiLinkInsertText = (
  target: string,
  title: string,
  alreadyClosed: boolean
): WikiLinkInsertResult => {
  const normalizedTitle = title.trim()
  const hasDisplayText = normalizedTitle.length > 0 && normalizedTitle !== target
  const suffix = alreadyClosed ? '' : ']]'
  const text = hasDisplayText ? `${target}|${normalizedTitle}${suffix}` : `${target}${suffix}`

  if (!hasDisplayText) {
    return {
      text,
      displayStart: null,
      displayEnd: null,
    }
  }

  return {
    text,
    displayStart: target.length + 1,
    displayEnd: target.length + 1 + normalizedTitle.length,
  }
}

const transformWikiLinks = (node: any) => {
  if (!node || typeof node !== 'object') return

  if (!Array.isArray(node.children) || node.type === 'link' || node.type === 'inlineCode' || node.type === 'code') {
    return
  }

  const nextChildren: any[] = []

  for (const child of node.children) {
    if (child?.type === 'text' && typeof child.value === 'string') {
      let lastIndex = 0
      let hasMatch = false
      WIKI_LINK_PATTERN.lastIndex = 0

      for (const match of child.value.matchAll(WIKI_LINK_PATTERN)) {
        const fullMatch = match[0]
        const target = match[1]?.trim()
        const display = match[2]?.trim()
        const start = match.index ?? 0

        if (!target) continue
        hasMatch = true

        if (start > lastIndex) {
          nextChildren.push({
            type: 'text',
            value: child.value.slice(lastIndex, start),
          })
        }

        nextChildren.push({
          type: 'link',
          url: encodeWikiLinkHref(target),
          children: [
            {
              type: 'text',
              value: display || target,
            },
          ],
        })

        lastIndex = start + fullMatch.length
      }

      if (!hasMatch) {
        nextChildren.push(child)
        continue
      }

      if (lastIndex < child.value.length) {
        nextChildren.push({
          type: 'text',
          value: child.value.slice(lastIndex),
        })
      }

      continue
    }

    transformWikiLinks(child)
    nextChildren.push(child)
  }

  node.children = nextChildren
}

export const remarkWikiLinks = () => (tree: any) => {
  transformWikiLinks(tree)
}
