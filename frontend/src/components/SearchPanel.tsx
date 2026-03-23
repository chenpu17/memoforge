import React, { useState } from 'react'
import { Input } from './ui/Input'
import { Button } from './ui/Button'
import { useAppStore } from '../stores/appStore'
import { tauriService } from '../services/tauri'
import { Search, X } from 'lucide-react'

export const SearchPanel: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [query, setQuery] = useState('')
  const [selectedTags, _setSelectedTags] = useState<string[]>([])
  const { searchResults, setSearchResults, setIsSearching } = useAppStore()

  const handleSearch = async () => {
    if (!query.trim()) return

    setIsSearching(true)
    try {
      const results = await tauriService.searchKnowledge(query, selectedTags)
      setSearchResults(results)
    } catch (error) {
      console.error('Search failed:', error)
    } finally {
      setIsSearching(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-background z-50 flex flex-col">
      <div className="h-16 border-b px-6 flex items-center gap-4">
        <Search className="h-5 w-5 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          placeholder="搜索知识..."
          className="flex-1"
          autoFocus
        />
        <Button onClick={handleSearch}>搜索</Button>
        <Button variant="ghost" onClick={onClose}>
          <X className="h-5 w-5" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {searchResults.length === 0 ? (
          <div className="text-center text-muted-foreground mt-20">
            输入关键词开始搜索
          </div>
        ) : (
          <div className="space-y-4">
            {searchResults.map(({ knowledge }) => (
              <div key={knowledge.id} className="p-4 border rounded-lg hover:bg-accent cursor-pointer">
                <h3 className="font-semibold mb-2">{knowledge.title}</h3>
                <p className="text-sm text-muted-foreground mb-2">{knowledge.summary}</p>
                <div className="flex gap-2">
                  {knowledge.tags.map(tag => (
                    <span key={tag} className="px-2 py-1 bg-secondary rounded text-xs">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
