import React from 'react'
import { ChevronRight, FolderOpen, CornerUpLeft } from 'lucide-react'
import type { Knowledge } from '../types'
import type { KnowledgeTreeNode, TreeBreadcrumbItem } from '../lib/knowledgeTree'
import { KnowledgeListItem } from './KnowledgeListItem'

interface DirectoryCreateAction {
  disabled?: boolean
  hint?: string
}

interface DirectoryKnowledgeBrowserProps {
  title: string
  description: string
  knowledgeList: Knowledge[]
  childFolders: KnowledgeTreeNode[]
  breadcrumbs: TreeBreadcrumbItem[]
  folderTotalCount: number
  latestUpdatedAt?: string | null
  currentKnowledgeId: string | null
  listDensity: 'compact' | 'comfortable'
  createAction?: DirectoryCreateAction
  onSelectFolder: (path: string) => void
  onSelectKnowledge: (knowledgeId: string) => void
  getCategoryLabel: (categoryId?: string | null) => string
  formatDate: (dateStr: string) => string
}

export const DirectoryKnowledgeBrowser: React.FC<DirectoryKnowledgeBrowserProps> = React.memo(({
  title,
  description,
  knowledgeList,
  childFolders,
  breadcrumbs,
  folderTotalCount,
  latestUpdatedAt,
  currentKnowledgeId,
  listDensity,
  createAction,
  onSelectFolder,
  onSelectKnowledge,
  getCategoryLabel,
  formatDate,
}) => {
  const parentFolder = breadcrumbs.length > 1 ? breadcrumbs[breadcrumbs.length - 2] : null
  const stats = [
    { label: '直接文档', value: `${knowledgeList.length} 篇` },
    { label: '子目录', value: `${childFolders.length} 个` },
    { label: '目录总量', value: `${folderTotalCount} 篇` },
    { label: '最近更新', value: latestUpdatedAt ? formatDate(latestUpdatedAt) : '暂无' },
  ]

  return (
    <div className="directory-browser-shell flex h-full flex-col">
      <div className="mx-auto w-full max-w-5xl px-6 pt-8">
        <div className="rounded-2xl border bg-white px-5 py-4" style={{ borderColor: '#E5E7EB' }}>
          <div className="flex flex-wrap items-center gap-2 text-[11px]" style={{ color: '#64748B' }}>
            {breadcrumbs.map((item, index) => (
              <React.Fragment key={item.path || '__root__'}>
                <button
                  type="button"
                  onClick={() => onSelectFolder(item.path)}
                  className="rounded-full px-2 py-1 hover:bg-[#F8FAFC]"
                >
                  {item.label}
                </button>
                {index < breadcrumbs.length - 1 && <ChevronRight className="h-3.5 w-3.5" />}
              </React.Fragment>
            ))}
          </div>

          <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="truncate text-xl font-semibold" style={{ color: '#171717' }}>
                {title}
              </div>
              <div className="mt-1 text-sm" style={{ color: '#737373' }}>
                {description}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {stats.map((item) => (
                  <span
                    key={item.label}
                    className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px]"
                    style={{ borderColor: '#E5E7EB', backgroundColor: '#FCFCFD', color: '#64748B' }}
                  >
                    <span style={{ color: '#94A3B8' }}>{item.label}</span>
                    <span className="font-semibold" style={{ color: '#171717' }}>{item.value}</span>
                  </span>
                ))}
              </div>
              {createAction?.hint && (
                <div className="mt-2 text-[12px]" style={{ color: '#94A3B8' }}>
                  {createAction.hint}
                </div>
              )}
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {parentFolder && (
                <button
                  type="button"
                  onClick={() => onSelectFolder(parentFolder.path)}
                  className="inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-sm font-medium"
                  style={{ borderColor: '#E5E7EB', color: '#525252', backgroundColor: '#FFFFFF' }}
                >
                  <CornerUpLeft className="h-3.5 w-3.5" />
                  返回上级
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-8 pt-4">
        <div className="mx-auto w-full max-w-5xl">
          {childFolders.length > 0 && (
            <div className="mb-5">
              <div className="mb-2 text-[12px] font-semibold" style={{ color: '#737373' }}>
                子目录
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {childFolders.map((folder) => (
                  <button
                    key={folder.id}
                    type="button"
                    onClick={() => onSelectFolder(folder.path)}
                    className="rounded-2xl border bg-white p-3.5 text-left transition-colors hover:bg-[#F8FAFC]"
                    style={{ borderColor: '#E5E7EB' }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <FolderOpen className="h-4 w-4 shrink-0" style={{ color: 'var(--brand-primary-hover)' }} />
                          <span className="truncate text-sm font-semibold" style={{ color: '#171717' }}>
                            {folder.label}
                          </span>
                        </div>
                        <div className="mt-1.5 text-[11px]" style={{ color: '#737373' }}>
                          进入目录浏览
                        </div>
                      </div>
                      <span
                        className="shrink-0 rounded-full px-2 py-1 text-[10px]"
                        style={{ backgroundColor: '#F8FAFC', color: '#64748B' }}
                      >
                        {folder.count}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <div className="mb-2 text-[12px] font-semibold" style={{ color: '#737373' }}>
              文档
            </div>
            {knowledgeList.length > 0 ? (
              knowledgeList.map((knowledge) => (
                <KnowledgeListItem
                  key={knowledge.id}
                  knowledge={knowledge}
                  isSelected={currentKnowledgeId === knowledge.id}
                  listDensity={listDensity}
                  categoryLabel={getCategoryLabel(knowledge.category)}
                  onSelect={onSelectKnowledge}
                  formatDate={formatDate}
                />
              ))
            ) : childFolders.length > 0 ? (
              <div className="rounded-2xl border border-dashed bg-[#FAFAFA] px-6 py-10 text-center text-sm text-neutral-400">
                当前目录暂无直接文档，可以继续进入上面的子目录浏览。
              </div>
            ) : (
              <div className="flex min-h-[240px] items-center justify-center rounded-2xl border border-dashed bg-[#FAFAFA] px-6 text-center text-sm text-neutral-400">
                当前目录下暂无文档。你可以从左侧树继续进入子目录，或从这里开始创建第一篇文档。
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
})
