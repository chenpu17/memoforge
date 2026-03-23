import { useState, useEffect } from 'react'
import { Sidebar } from './components/Sidebar'
import { Editor } from './components/Editor'
import { MetadataPanel } from './components/MetadataPanel'
import { SearchPanel } from './components/SearchPanel'
import { GitPanel } from './components/GitPanel'
import { Button } from './components/ui/Button'
import { useAppStore } from './stores/appStore'
import { tauriService } from './services/tauri'
import { Search, Plus, Save } from 'lucide-react'

function App() {
  const [showSearch, setShowSearch] = useState(false)
  const { currentKnowledge, setCurrentKnowledge, setKnowledgeList, setCategories } = useAppStore()

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const [knowledge, categories] = await Promise.all([
        tauriService.listKnowledge(),
        tauriService.getCategories(),
      ])
      setKnowledgeList(knowledge)
      setCategories(categories)
    } catch (error) {
      console.error('Failed to load data:', error)
    }
  }

  const handleSave = async () => {
    if (!currentKnowledge) return

    try {
      if (currentKnowledge.id) {
        await tauriService.updateKnowledge(currentKnowledge.id, currentKnowledge)
      } else {
        await tauriService.createKnowledge(currentKnowledge)
      }
      await loadData()
    } catch (error) {
      console.error('Save failed:', error)
    }
  }

  const handleNew = () => {
    setCurrentKnowledge({
      id: '',
      title: '新知识',
      content: '',
      category: '',
      tags: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
  }

  return (
    <div className="h-screen flex flex-col bg-background">
      <div className="h-10 bg-muted border-b flex items-center justify-between px-4">
        <span className="text-sm font-medium">MemoForge</span>
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={() => setShowSearch(true)}>
            <Search className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="ghost" onClick={handleNew}>
            <Plus className="h-4 w-4" />
          </Button>
          <Button size="sm" onClick={handleSave}>
            <Save className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className="w-60">
          <Sidebar />
        </div>

        <div className="flex-1 flex flex-col">
          {currentKnowledge ? (
            <Editor
              value={currentKnowledge.content}
              onChange={(content) => setCurrentKnowledge({ ...currentKnowledge, content })}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              选择或创建知识开始编辑
            </div>
          )}
          <GitPanel />
        </div>

        <div className="w-80 border-l">
          <MetadataPanel />
        </div>
      </div>

      {showSearch && <SearchPanel onClose={() => setShowSearch(false)} />}
    </div>
  )
}

export default App
