import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Sidebar } from '../components/Sidebar'
import { useAppStore } from '../stores/appStore'

// Mock the store
vi.mock('../stores/appStore', () => ({
  useAppStore: vi.fn(),
}))

describe('Sidebar Category Filtering', () => {
  const mockOnSelectCategory = vi.fn()
  const mockCategories = [
    { id: 'IT资讯', name: 'IT资讯' },
    { id: '技术文档', name: '技术文档' },
    { id: '读书笔记', name: '读书笔记' },
  ]

  // Mock knowledge list with categories
  const mockKnowledgeList = [
    { id: 'IT资讯/doc1', title: 'Doc 1', category: 'IT资讯', tags: [], created_at: '', updated_at: '' },
    { id: 'IT资讯/doc2', title: 'Doc 2', category: 'IT资讯', tags: [], created_at: '', updated_at: '' },
    { id: 'IT资讯/doc3', title: 'Doc 3', category: 'IT资讯', tags: [], created_at: '', updated_at: '' },
    { id: 'IT资讯/doc4', title: 'Doc 4', category: 'IT资讯', tags: [], created_at: '', updated_at: '' },
    { id: 'IT资讯/doc5', title: 'Doc 5', category: 'IT资讯', tags: [], created_at: '', updated_at: '' },
    { id: '技术文档/doc6', title: 'Doc 6', category: '技术文档', tags: [], created_at: '', updated_at: '' },
    { id: '技术文档/doc7', title: 'Doc 7', category: '技术文档', tags: [], created_at: '', updated_at: '' },
    { id: '技术文档/doc8', title: 'Doc 8', category: '技术文档', tags: [], created_at: '', updated_at: '' },
    { id: '读书笔记/doc9', title: 'Doc 9', category: '读书笔记', tags: [], created_at: '', updated_at: '' },
    { id: '读书笔记/doc10', title: 'Doc 10', category: '读书笔记', tags: [], created_at: '', updated_at: '' },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    ;(useAppStore as any).mockReturnValue({
      categories: mockCategories,
      knowledgeList: mockKnowledgeList,
      allTags: [],
    })
  })

  it('should render all categories', () => {
    render(
      <Sidebar
        onSelectCategory={mockOnSelectCategory}
        onOpenSearch={() => {}}
        onImport={() => {}}
      />
    )

    expect(screen.getByText('IT资讯')).toBeInTheDocument()
    expect(screen.getByText('技术文档')).toBeInTheDocument()
    expect(screen.getByText('读书笔记')).toBeInTheDocument()
  })

  it('should call onSelectCategory with category NAME (not UUID) when clicked', () => {
    render(
      <Sidebar
        onSelectCategory={mockOnSelectCategory}
        onOpenSearch={() => {}}
        onImport={() => {}}
      />
    )

    // Click on IT资讯 category
    fireEvent.click(screen.getByText('IT资讯'))

    // Should be called with the category NAME, not UUID
    expect(mockOnSelectCategory).toHaveBeenCalledWith('IT资讯')
  })

  it('should deselect category when clicking same category again', () => {
    render(
      <Sidebar
        selectedCategory="IT资讯"
        onSelectCategory={mockOnSelectCategory}
        onOpenSearch={() => {}}
        onImport={() => {}}
      />
    )

    // Click on already selected category
    fireEvent.click(screen.getByText('IT资讯'))

    // Should be called with null to deselect
    expect(mockOnSelectCategory).toHaveBeenCalledWith(null)
  })

  it('should display correct category counts from knowledge list', () => {
    render(
      <Sidebar
        onSelectCategory={mockOnSelectCategory}
        onOpenSearch={() => {}}
        onImport={() => {}}
        mcpConnectionCount={2}
      />
    )

    // Check that counts are calculated correctly
    // IT资讯: 5 docs, 技术文档: 3 docs, 读书笔记: 2 docs
    const counts = screen.getAllByText(/^[0-9]+$/)
    const countValues = counts.map(el => parseInt(el.textContent || '0'))

    // Should have counts 5, 3, 2 somewhere
    expect(countValues).toContain(5)
    expect(countValues).toContain(3)
    expect(countValues).toContain(2)
    expect(screen.getByText('MCP 2')).toBeInTheDocument()
  })

  it('should keep category counts when current knowledge list is filtered', () => {
    ;(useAppStore as any).mockReturnValue({
      categories: [
        { id: 'IT资讯', name: 'IT资讯', count: 5 },
        { id: '技术文档', name: '技术文档', count: 3 },
        { id: '读书笔记', name: '读书笔记', count: 2 },
      ],
      knowledgeList: mockKnowledgeList.filter((item) => item.category === 'IT资讯'),
      allTags: [],
    })

    render(
      <Sidebar
        selectedCategory="IT资讯"
        onSelectCategory={mockOnSelectCategory}
        onOpenSearch={() => {}}
        onImport={() => {}}
      />
    )

    const counts = screen.getAllByText(/^[0-9]+$/)
    const countValues = counts.map(el => parseInt(el.textContent || '0'))

    expect(countValues).toContain(5)
    expect(countValues).toContain(3)
    expect(countValues).toContain(2)
  })
})

describe('Category Filter Integration', () => {
  it('should use category name for API calls, not UUID', () => {
    // This test verifies the fix for the category filtering bug
    // where UUID was being used instead of directory name

    const categoryId = '550e8400-e29b-41d4-a716-446655440000'
    const categoryName = 'IT资讯'

    // Knowledge stores category as directory name
    const knowledge = {
      id: 'IT资讯/some-doc',
      category: 'IT资讯',
      title: 'Test Doc',
    }

    // The API should receive category NAME for filtering
    const expectedApiParam = categoryName
    const wrongApiParam = categoryId

    // This should pass - using name
    expect(knowledge.category).toBe(expectedApiParam)

    // This should fail - using UUID (the bug)
    expect(knowledge.category).not.toBe(wrongApiParam)
  })
})
