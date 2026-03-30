import { useState } from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { EditorRich } from './EditorRich'

const completeKnowledgeLinksMock = vi.fn()

vi.mock('../services/tauri', () => ({
  tauriService: {
    completeKnowledgeLinks: (...args: unknown[]) => completeKnowledgeLinksMock(...args),
  },
}))

describe('EditorRich', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    completeKnowledgeLinksMock.mockResolvedValue([])
  })

  it('renders stored wiki links as rich inline links', async () => {
    render(
      <EditorRich
        mode="rich"
        value="开始 [[docs/intro|介绍文档]] 结束"
        onChange={vi.fn()}
      />,
    )

    const link = await screen.findByText('介绍文档')
    expect(link.closest('a')).toHaveAttribute('data-wiki-link-target', 'docs/intro')
  })

  it('loads wiki link candidates in the picker', async () => {
    completeKnowledgeLinksMock.mockResolvedValue([
      {
        id: 'docs/intro',
        title: '介绍文档',
        summary: '一篇用于测试的知识',
      },
    ])

    render(
      <EditorRich
        mode="rich"
        value=""
        onChange={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '知识链接' }))

    await waitFor(() => {
      expect(screen.getByPlaceholderText('搜索知识标题或路径')).toBeInTheDocument()
    })

    await waitFor(() => {
      expect(screen.getByText('介绍文档')).toBeInTheDocument()
    })
    expect(screen.getByText('一篇用于测试的知识')).toBeInTheDocument()
  })

  it('shows image tools for the selected image and writes updated markdown back', async () => {
    const onChange = vi.fn()

    function Harness() {
      const [value, setValue] = useState('![旧图片](./assets/old.png)')

      return (
        <EditorRich
          mode="rich"
          value={value}
          onChange={(nextValue) => {
            onChange(nextValue)
            setValue(nextValue)
          }}
          knowledgeTitle="测试知识"
        />
      )
    }

    render(<Harness />)

    const image = await screen.findByRole('img', { name: '旧图片' })
    fireEvent.click(image)

    const srcInput = await screen.findByPlaceholderText('https:// 或 ./assets/...')
    const altInput = screen.getByPlaceholderText('用于无障碍和图片加载失败时的说明')

    fireEvent.change(srcInput, { target: { value: './assets/new-image.png' } })
    fireEvent.change(altInput, { target: { value: '新图片说明' } })
    fireEvent.click(screen.getByRole('button', { name: '保存图片设置' }))

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith('![新图片说明](./assets/new-image.png)')
    })
  })
})
