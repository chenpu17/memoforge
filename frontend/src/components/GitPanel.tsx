import React, { useState, useEffect } from 'react'
import { Button } from './ui/Button'
import { tauriService } from '../services/tauri'
import { GitBranch, Upload } from 'lucide-react'

export const GitPanel: React.FC = () => {
  const [status, setStatus] = useState('')
  const [commitMessage, setCommitMessage] = useState('')

  const loadStatus = async () => {
    try {
      const result = await tauriService.gitStatus()
      setStatus(result)
    } catch (error) {
      console.error('Failed to load git status:', error)
    }
  }

  const handleCommit = async () => {
    if (!commitMessage.trim()) return

    try {
      await tauriService.gitCommit(commitMessage)
      setCommitMessage('')
      await loadStatus()
    } catch (error) {
      console.error('Commit failed:', error)
    }
  }

  const handlePush = async () => {
    try {
      await tauriService.gitPush()
      await loadStatus()
    } catch (error) {
      console.error('Push failed:', error)
    }
  }

  useEffect(() => {
    loadStatus()
  }, [])

  return (
    <div className="p-4 border-t space-y-4">
      <div className="flex items-center gap-2">
        <GitBranch className="h-4 w-4" />
        <span className="font-semibold">Git 状态</span>
      </div>

      <pre className="text-xs bg-muted p-2 rounded overflow-auto max-h-32">
        {status || '无变更'}
      </pre>

      <input
        type="text"
        value={commitMessage}
        onChange={(e) => setCommitMessage(e.target.value)}
        placeholder="提交信息"
        className="w-full px-3 py-2 border rounded-lg text-sm"
      />

      <div className="flex gap-2">
        <Button onClick={handleCommit} size="sm" className="flex-1">
          提交
        </Button>
        <Button onClick={handlePush} size="sm" variant="secondary">
          <Upload className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
