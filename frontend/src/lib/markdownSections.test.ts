import { describe, expect, it } from 'vitest'
import {
  buildMarkdownSectionAncestorMap,
  flattenMarkdownSectionHeadings,
  parseMarkdownSections,
} from './markdownSections'

describe('markdownSections', () => {
  it('parses nested heading sections and preserves h1 as root section', () => {
    const doc = parseMarkdownSections(`# 标题

开场说明

## 第一节
第一节内容

### 子节
子节内容

## 第二节
第二节内容`)

    expect(doc.intro).toBe('')
    expect(doc.sections).toHaveLength(1)
    expect(doc.sections[0]).toMatchObject({
      level: 1,
      title: '标题',
      body: '开场说明',
    })
    expect(doc.sections[0]?.children).toHaveLength(2)
    expect(doc.sections[0]?.children[0]).toMatchObject({
      level: 2,
      title: '第一节',
      body: '第一节内容',
    })
    expect(doc.sections[0]?.children[0]?.children[0]).toMatchObject({
      level: 3,
      title: '子节',
      body: '子节内容',
    })
  })

  it('ignores heading-like markers inside fenced code blocks', () => {
    const doc = parseMarkdownSections(`## 外层
\`\`\`md
## 不应该算标题
\`\`\`

正文`)

    expect(doc.sections).toHaveLength(1)
    expect(doc.sections[0]?.body).toContain('## 不应该算标题')
    expect(doc.sections[0]?.children).toHaveLength(0)
  })

  it('flattens headings and tracks ancestor chains', () => {
    const doc = parseMarkdownSections(`## Alpha
内容
### Beta
内容
## Gamma`)

    const headings = flattenMarkdownSectionHeadings(doc.sections)
    expect(headings.map((heading) => heading.text)).toEqual(['Alpha', 'Beta', 'Gamma'])

    const ancestors = buildMarkdownSectionAncestorMap(doc.sections)
    expect(ancestors.get('beta')).toEqual(['alpha'])
    expect(ancestors.get('gamma')).toEqual([])
  })
})
