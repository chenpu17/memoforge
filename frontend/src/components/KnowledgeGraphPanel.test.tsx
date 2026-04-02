import { describe, expect, it } from 'vitest'
import { convertToReactFlow } from './KnowledgeGraphPanel'

describe('KnowledgeGraphPanel', () => {
  it('creates unique edge ids for repeated source-target pairs', () => {
    const { edges } = convertToReactFlow({
      nodes: [
        { id: 'alpha', title: 'Alpha', category_id: 'programming', tags: [] },
        { id: 'beta', title: 'Beta', category_id: 'programming', tags: [] },
      ],
      edges: [
        { source: 'alpha', target: 'beta', relation: 'WikiLink' },
        { source: 'alpha', target: 'beta', relation: 'SharedTag' },
        { source: 'alpha', target: 'beta', relation: 'SameCategory' },
      ],
    })

    expect(new Set(edges.map((edge) => edge.id)).size).toBe(edges.length)
  })
})
