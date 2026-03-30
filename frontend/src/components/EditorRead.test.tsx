import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { EditorRead } from './EditorRead'

vi.mock('../hooks/useKnowledgeNavigation', () => ({
  useKnowledgeNavigation: () => ({
    openKnowledgeWithStale: vi.fn(),
  }),
}))

describe('EditorRead markdown enhancements', () => {
  it('renders math blocks and inline formulas with KaTeX', () => {
    const { container } = render(
      <EditorRead
        value={'行内公式 $E=mc^2$\n\n$$\n\\int_0^1 x^2\\,dx = \\frac{1}{3}\n$$'}
        onChange={vi.fn()}
        mode="read"
        knowledgePath="tests/math.md"
      />,
    )

    expect(container.querySelector('.katex')).toBeInTheDocument()
    expect(container.querySelector('.katex-display')).toBeInTheDocument()
  })

  it('renders styled footnotes', () => {
    const { container } = render(
      <EditorRead
        value={'脚注引用[^1]\n\n[^1]: 这是一个脚注。'}
        onChange={vi.fn()}
        mode="read"
        knowledgePath="tests/footnotes.md"
      />,
    )

    expect(container.querySelector('.reader-footnotes')).toBeInTheDocument()
    expect(container.querySelector('.reader-footnote-ref')).toBeInTheDocument()
    expect(screen.getByText('这是一个脚注。')).toBeInTheDocument()
  })

  it('supports read mode document search highlights', async () => {
    const { container } = render(
      <EditorRead
        value={'Alpha beta\n\n## Section\n\nbeta gamma beta'}
        onChange={vi.fn()}
        mode="read"
        knowledgePath="tests/search.md"
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '查找' }))
    fireEvent.change(screen.getByPlaceholderText('搜索当前文档'), { target: { value: 'beta' } })

    await waitFor(() => {
      expect(container.querySelectorAll('.reader-search-highlight')).toHaveLength(3)
    })

    expect(container.querySelector('.reader-search-highlight--active')).toBeInTheDocument()
    expect(screen.getByText('1 / 3')).toBeInTheDocument()
  })

  it('collapses long code blocks by default and can expand them', async () => {
    const longCode = Array.from({ length: 24 }, (_, index) => `console.log(${index + 1})`).join('\n')
    const { container } = render(
      <EditorRead
        value={`\`\`\`\n${longCode}\n\`\`\``}
        onChange={vi.fn()}
        mode="read"
        knowledgePath="tests/long-code.md"
      />,
    )

    await waitFor(() => {
      expect(container.querySelector('.reader-code-block__content--collapsed')).not.toBeNull()
    })

    fireEvent.click(screen.getByRole('button', { name: '展开' }))

    await waitFor(() => {
      expect(container.querySelector('.reader-code-block__content--collapsed')).not.toBeInTheDocument()
    })
  })
})
