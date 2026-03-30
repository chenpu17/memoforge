import { Mark, mergeAttributes } from '@tiptap/core'
import {
  decodeWikiLinkHref,
  encodeWikiLinkHref,
  isExternalUrl,
} from '../lib/wikiLinks'

export interface WikiLinkOptions {
  HTMLAttributes: Record<string, unknown>
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    wikiLink: {
      setWikiLink: (attributes: { target: string }) => ReturnType
      unsetWikiLink: () => ReturnType
    }
  }
}

export const EditorRichWikiLink = Mark.create<WikiLinkOptions>({
  name: 'wikiLink',

  priority: 1100,

  exitable: true,

  inclusive: false,

  addOptions() {
    return {
      HTMLAttributes: {},
    }
  },

  addAttributes() {
    return {
      target: {
        default: null,
        parseHTML: element => element.getAttribute('data-wiki-link-target'),
        renderHTML: attributes => {
          if (!attributes.target) {
            return {}
          }

          return {
            'data-wiki-link-target': attributes.target,
            href: encodeWikiLinkHref(attributes.target),
          }
        },
      },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'a[data-wiki-link-target]',
      },
      {
        tag: 'a[href]',
        getAttrs: node => {
          const href = (node as HTMLElement).getAttribute('href')
          const target = href ? decodeWikiLinkHref(href) : null
          return target ? { target } : false
        },
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    const href = typeof HTMLAttributes.href === 'string' ? HTMLAttributes.href : ''
    const resolvedTarget = typeof HTMLAttributes['data-wiki-link-target'] === 'string'
      ? HTMLAttributes['data-wiki-link-target']
      : decodeWikiLinkHref(href)

    const safeHref = resolvedTarget
      ? encodeWikiLinkHref(resolvedTarget)
      : isExternalUrl(href) ? href : '#'

    return [
      'a',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        class: 'editor-rich__wiki-link',
        href: safeHref,
        'data-wiki-link': 'true',
        spellcheck: 'false',
      }),
      0,
    ]
  },

  parseMarkdown(token, helpers) {
    const target = typeof token.target === 'string' ? token.target.trim() : ''
    if (!target) {
      return helpers.parseInline(token.tokens || [])
    }

    return helpers.applyMark('wikiLink', helpers.parseInline(token.tokens || []), {
      target,
    })
  },

  renderMarkdown(node, helpers) {
    const target = typeof node.attrs?.target === 'string' ? node.attrs.target.trim() : ''
    const display = helpers.renderChildren(node)

    if (!target) {
      return display
    }

    return display && display !== target
      ? `[[${target}|${display}]]`
      : `[[${target}]]`
  },

  markdownTokenizer: {
    name: 'wikiLink',
    level: 'inline',
    start(src) {
      return src.indexOf('[[')
    },
    tokenize(src, _tokens, lexer) {
      const match = /^\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]/.exec(src)
      if (!match) {
        return undefined
      }

      const target = (match[1] || '').trim()
      const display = (match[2] || target).trim()

      if (!target || !display) {
        return undefined
      }

      return {
        type: 'wikiLink',
        raw: match[0],
        target,
        tokens: lexer.inlineTokens(display),
      }
    },
  },

  addCommands() {
    return {
      setWikiLink:
        attributes =>
        ({ commands }) => commands.setMark('wikiLink', attributes),
      unsetWikiLink:
        () =>
        ({ commands }) => commands.unsetMark('wikiLink'),
    }
  },
})
