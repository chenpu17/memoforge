import { describe, expect, it } from 'vitest'
import {
  buildWikiLinkInsertText,
  decodeWikiLinkHref,
  encodeWikiLinkHref,
  isExternalUrl,
  remarkWikiLinks,
} from './wikiLinks'

describe('wikiLinks', () => {
  it('encodes and decodes wiki link hrefs', () => {
    const target = 'programming/rust/async-patterns.md'
    const href = encodeWikiLinkHref(target)

    expect(href).toContain(encodeURIComponent(target))
    expect(decodeWikiLinkHref(href)).toBe(target)
  })

  it('detects external urls only for http and https', () => {
    expect(isExternalUrl('https://example.com/image.png')).toBe(true)
    expect(isExternalUrl('http://example.com')).toBe(true)
    expect(isExternalUrl('/assets/image.png')).toBe(false)
    expect(isExternalUrl('file:///tmp/demo.png')).toBe(false)
    expect(isExternalUrl(undefined)).toBe(false)
  })

  it('builds insert text with selected display text when title differs from target', () => {
    const result = buildWikiLinkInsertText(
      'programming/rust/async-patterns.md',
      'Rust Async Patterns',
      false
    )

    expect(result.text).toBe('programming/rust/async-patterns.md|Rust Async Patterns]]')
    expect(result.displayStart).toBe('programming/rust/async-patterns.md|'.length)
    expect(result.displayEnd).toBe(result.text.length - 2)
  })

  it('builds insert text without display text when title equals target', () => {
    const result = buildWikiLinkInsertText('note.md', 'note.md', true)

    expect(result.text).toBe('note.md')
    expect(result.displayStart).toBeNull()
    expect(result.displayEnd).toBeNull()
  })

  it('transforms wiki links into mdast link nodes', () => {
    const tree = {
      type: 'root',
      children: [
        {
          type: 'paragraph',
          children: [
            { type: 'text', value: 'See [[programming/rust/async-patterns.md|Async Patterns]] now.' },
          ],
        },
      ],
    }

    remarkWikiLinks()(tree)

    const paragraphChildren = tree.children[0].children as any[]
    expect(paragraphChildren).toHaveLength(3)
    expect(paragraphChildren[0].value).toBe('See ')
    expect(paragraphChildren[1].type).toBe('link')
    expect(decodeWikiLinkHref(paragraphChildren[1].url)).toBe('programming/rust/async-patterns.md')
    expect(paragraphChildren[1].children[0].value).toBe('Async Patterns')
    expect(paragraphChildren[2].value).toBe(' now.')
  })
})
