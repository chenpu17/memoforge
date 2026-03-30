import type { Knowledge } from '../types'

export interface TreeSelection {
  type: 'folder' | 'knowledge'
  path: string
}

export interface KnowledgeTreeNode {
  id: string
  path: string
  type: 'folder' | 'knowledge'
  label: string
  count: number
  knowledge?: Knowledge
  children: KnowledgeTreeNode[]
}

interface MutableKnowledgeTreeNode extends KnowledgeTreeNode {
  children: MutableKnowledgeTreeNode[]
}

export interface TreeBreadcrumbItem {
  path: string
  label: string
}

export function stripKnowledgeExtension(path: string) {
  return path.replace(/\.md$/i, '')
}

export function getKnowledgePathSegments(path: string) {
  return stripKnowledgeExtension(path).split('/').filter(Boolean)
}

export function getKnowledgeFolderPath(path: string) {
  const segments = getKnowledgePathSegments(path)
  return segments.slice(0, -1).join('/')
}

export function getFolderDisplayName(path: string) {
  if (!path) return '全部文档'
  const segments = path.split('/').filter(Boolean)
  return segments[segments.length - 1] || '全部文档'
}

export function buildKnowledgeTreeRoot(knowledgeList: Knowledge[]): KnowledgeTreeNode {
  const root: MutableKnowledgeTreeNode = {
    id: '__root__',
    path: '',
    type: 'folder',
    label: '全部文档',
    count: 0,
    children: [],
  }

  const folderMap = new Map<string, MutableKnowledgeTreeNode>()
  folderMap.set('', root)

  const getOrCreateFolder = (path: string, label: string) => {
    const existing = folderMap.get(path)
    if (existing) return existing

    const parentPath = path.split('/').slice(0, -1).join('/')
    const parentNode = folderMap.get(parentPath) || root
    const folderNode: MutableKnowledgeTreeNode = {
      id: `folder:${path}`,
      path,
      type: 'folder',
      label,
      count: 0,
      children: [],
    }
    parentNode.children.push(folderNode)
    folderMap.set(path, folderNode)
    return folderNode
  }

  knowledgeList.forEach((knowledge) => {
    const segments = getKnowledgePathSegments(knowledge.id)
    if (segments.length === 0) return

    let currentFolderPath = ''
    let currentFolder = root
    currentFolder.count += 1

    segments.slice(0, -1).forEach((segment) => {
      currentFolderPath = currentFolderPath ? `${currentFolderPath}/${segment}` : segment
      currentFolder = getOrCreateFolder(currentFolderPath, segment)
      currentFolder.count += 1
    })

    currentFolder.children.push({
      id: `knowledge:${knowledge.id}`,
      path: knowledge.id,
      type: 'knowledge',
      label: knowledge.title,
      count: 1,
      knowledge,
      children: [],
    })
  })

  const sortNodes = (nodes: MutableKnowledgeTreeNode[]) => {
    nodes.sort((left, right) => {
      if (left.type !== right.type) {
        return left.type === 'folder' ? -1 : 1
      }
      return left.label.localeCompare(right.label, 'zh-CN')
    })
    nodes.forEach((node) => {
      if (node.children.length > 0) {
        sortNodes(node.children)
      }
    })
  }

  sortNodes(root.children)
  return root
}

export function buildKnowledgeTree(knowledgeList: Knowledge[]): KnowledgeTreeNode[] {
  return buildKnowledgeTreeRoot(knowledgeList).children
}

export function filterKnowledgeTree(nodes: KnowledgeTreeNode[], query: string): KnowledgeTreeNode[] {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) return nodes

  const filterNode = (node: KnowledgeTreeNode): KnowledgeTreeNode | null => {
    const matchesSelf = (
      node.label.toLowerCase().includes(normalizedQuery) ||
      node.path.toLowerCase().includes(normalizedQuery)
    )

    if (node.type === 'knowledge') {
      return matchesSelf ? node : null
    }

    const filteredChildren = node.children
      .map(filterNode)
      .filter((child): child is KnowledgeTreeNode => Boolean(child))

    if (!matchesSelf && filteredChildren.length === 0) {
      return null
    }

    return {
      ...node,
      children: filteredChildren,
    }
  }

  return nodes
    .map(filterNode)
    .filter((node): node is KnowledgeTreeNode => Boolean(node))
}

export function getAncestorFolderPaths(path: string) {
  if (!path) return ['']

  const segments = path.split('/').filter(Boolean)
  const ancestors = ['']
  for (let index = 0; index < segments.length; index += 1) {
    ancestors.push(segments.slice(0, index + 1).join('/'))
  }
  return ancestors
}

export function getFolderBreadcrumbs(path: string): TreeBreadcrumbItem[] {
  const ancestors = getAncestorFolderPaths(path)
  return ancestors.map((ancestorPath) => ({
    path: ancestorPath,
    label: getFolderDisplayName(ancestorPath),
  }))
}

export function findFolderNode(root: KnowledgeTreeNode, path: string): KnowledgeTreeNode | null {
  if (root.type === 'folder' && root.path === path) {
    return root
  }

  for (const child of root.children) {
    if (child.type !== 'folder') continue
    const match = findFolderNode(child, path)
    if (match) return match
  }

  return null
}
