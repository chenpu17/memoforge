import React, { useEffect, useMemo, useRef } from 'react'
import { List, type ListImperativeAPI, type RowComponentProps } from 'react-window'
import type { Knowledge } from '../types'
import { KnowledgeListItem } from './KnowledgeListItem'

type ListDensity = 'compact' | 'comfortable'

interface VirtualKnowledgeListProps {
  knowledgeList: Knowledge[]
  currentKnowledgeId: string | null
  activeKnowledgeId?: string | null
  listDensity: ListDensity
  hasMore: boolean
  emptyStateText?: string
  onLoadMore: () => void
  onSelect: (knowledgeId: string) => void
  getCategoryLabel: (categoryId?: string | null) => string
  formatDate: (dateStr: string) => string
}

interface RowData {
  knowledgeList: Knowledge[]
  currentKnowledgeId: string | null
  activeKnowledgeId?: string | null
  listDensity: ListDensity
  onLoadMore: () => void
  onSelect: (knowledgeId: string) => void
  getCategoryLabel: (categoryId?: string | null) => string
  formatDate: (dateStr: string) => string
}

const LOAD_MORE_ROW_HEIGHT = 72

const getKnowledgeRowHeight = (
  knowledge: Knowledge,
  isSelected: boolean,
  listDensity: ListDensity,
) => {
  if (listDensity === 'comfortable') {
    return knowledge.summary ? 142 : 104
  }

  if (isSelected) {
    return knowledge.summary ? 126 : 96
  }

  return 80
}

const ListRow = ({
  index,
  style,
  ariaAttributes,
  knowledgeList,
  currentKnowledgeId,
  activeKnowledgeId,
  listDensity,
  onLoadMore,
  onSelect,
  getCategoryLabel,
  formatDate,
}: RowComponentProps<RowData>) => {
  if (index >= knowledgeList.length) {
    return (
      <div style={style} {...ariaAttributes} className="p-3">
        <button
          onClick={onLoadMore}
          className="w-full py-2 text-sm font-medium text-center rounded-lg border hover:bg-gray-50 transition-colors"
          style={{ color: 'var(--brand-primary)', borderColor: '#E5E7EB' }}
        >
          加载更多
        </button>
      </div>
    )
  }

  const knowledge = knowledgeList[index]
  const isSelected = currentKnowledgeId === knowledge.id
  const isActive = activeKnowledgeId === knowledge.id

  return (
    <KnowledgeListItem
      knowledge={knowledge}
      isSelected={isSelected}
      isActive={isActive}
      listDensity={listDensity}
      categoryLabel={getCategoryLabel(knowledge.category)}
      onSelect={onSelect}
      formatDate={formatDate}
      style={style}
      ariaAttributes={ariaAttributes}
    />
  )
}

export const VirtualKnowledgeList: React.FC<VirtualKnowledgeListProps> = ({
  knowledgeList,
  currentKnowledgeId,
  activeKnowledgeId,
  listDensity,
  hasMore,
  emptyStateText = '暂无知识',
  onLoadMore,
  onSelect,
  getCategoryLabel,
  formatDate,
}) => {
  const listRef = useRef<ListImperativeAPI | null>(null)

  useEffect(() => {
    const targetKnowledgeId = activeKnowledgeId || currentKnowledgeId
    if (!targetKnowledgeId) return

    const selectedIndex = knowledgeList.findIndex((knowledge) => knowledge.id === targetKnowledgeId)
    if (selectedIndex >= 0) {
      listRef.current?.scrollToRow({ index: selectedIndex, align: 'smart' })
    }
  }, [activeKnowledgeId, currentKnowledgeId, knowledgeList])

  const itemData = useMemo<RowData>(() => ({
    knowledgeList,
    currentKnowledgeId,
    activeKnowledgeId,
    listDensity,
    onLoadMore,
    onSelect,
    getCategoryLabel,
    formatDate,
  }), [
    knowledgeList,
    currentKnowledgeId,
    activeKnowledgeId,
    listDensity,
    onLoadMore,
    onSelect,
    getCategoryLabel,
    formatDate,
  ])

  const itemCount = knowledgeList.length + (hasMore ? 1 : 0)

  return (
    <div className="flex-1 min-h-0">
      {itemCount > 0 ? (
        <List
          listRef={listRef}
          rowComponent={ListRow}
          rowCount={itemCount}
          rowProps={itemData}
          overscanCount={6}
          style={{ height: '100%' }}
          rowHeight={(index) => {
            if (index >= knowledgeList.length) return LOAD_MORE_ROW_HEIGHT
            return getKnowledgeRowHeight(
              knowledgeList[index],
              currentKnowledgeId === knowledgeList[index].id,
              listDensity,
            )
          }}
        />
      ) : itemCount === 0 ? (
        <div className="flex h-full items-center justify-center text-sm text-neutral-400">
          {emptyStateText}
        </div>
      ) : null}
    </div>
  )
}
