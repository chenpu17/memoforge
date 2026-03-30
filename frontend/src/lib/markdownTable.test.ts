import { describe, expect, it } from 'vitest'
import { parseMarkdownTableNode } from './markdownTable'

describe('markdownTable', () => {
  it('parses header and body rows from a markdown table ast node', () => {
    const data = parseMarkdownTableNode({
      type: 'table',
      children: [
        {
          type: 'tableRow',
          children: [
            { type: 'tableCell', children: [{ type: 'text', value: '指标' }] },
            { type: 'tableCell', children: [{ type: 'text', value: '数据' }] },
          ],
        },
        {
          type: 'tableRow',
          children: [
            { type: 'tableCell', children: [{ type: 'strong', children: [{ type: 'text', value: '市场规模' }] }] },
            { type: 'tableCell', children: [{ type: 'text', value: '4550亿元' }] },
          ],
        },
      ],
    })

    expect(data).toEqual({
      headers: [{ text: '指标' }, { text: '数据' }],
      rows: [[{ text: '市场规模' }, { text: '4550亿元' }]],
    })
  })

  it('returns null for non-table nodes', () => {
    expect(parseMarkdownTableNode({ type: 'paragraph' })).toBeNull()
  })
})
