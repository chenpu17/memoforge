import React from 'react'
import { useAppStore } from '../stores/appStore'
import { ChevronRight, FileText } from 'lucide-react'
import { cn } from '../lib/utils'

export const Sidebar: React.FC = () => {
  const { knowledgeList, categories, currentKnowledge, setCurrentKnowledge } = useAppStore()
  const [selectedCategory, setSelectedCategory] = React.useState<string | null>(null)

  const filteredKnowledge = selectedCategory
    ? knowledgeList.filter(k => k.category === selectedCategory)
    : knowledgeList

  return (
    <div className="flex flex-col h-full bg-background border-r">
      <div className="p-4 border-b">
        <h2 className="font-semibold">知识库</h2>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="p-2">
          <div
            className={cn(
              "px-3 py-2 rounded-lg cursor-pointer hover:bg-accent",
              !selectedCategory && "bg-accent"
            )}
            onClick={() => setSelectedCategory(null)}
          >
            全部知识 ({knowledgeList.length})
          </div>

          {categories.map(cat => (
            <div
              key={cat}
              className={cn(
                "px-3 py-2 rounded-lg cursor-pointer hover:bg-accent flex items-center gap-2",
                selectedCategory === cat && "bg-accent"
              )}
              onClick={() => setSelectedCategory(cat)}
            >
              <ChevronRight className="h-4 w-4" />
              {cat}
            </div>
          ))}
        </div>

        <div className="mt-4 border-t pt-2">
          {filteredKnowledge.map(k => (
            <div
              key={k.id}
              className={cn(
                "px-4 py-2 cursor-pointer hover:bg-accent flex items-center gap-2",
                currentKnowledge?.id === k.id && "bg-accent"
              )}
              onClick={() => setCurrentKnowledge(k)}
            >
              <FileText className="h-4 w-4" />
              <span className="truncate">{k.title}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
