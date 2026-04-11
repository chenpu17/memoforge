import React, { useEffect, useState } from 'react'
import { tauriService, getErrorMessage } from '../services/tauri'
import { TemplatePicker } from './TemplatePicker'
import { FolderOpen, GitBranchPlus, Plus, ArrowLeft, Download, ExternalLink } from 'lucide-react'
import { ForgeNerveLogo } from './ForgeNerveLogo'
import { openExternalLink } from '../lib/externalLinks'
import { HERO_QUICK_DOWNLOADS, README_URL, RELEASE_NOTES_URL, RELEASE_URL } from '../lib/releaseLinks'

type Step = 'main' | 'create' | 'import' | 'clone'

interface WelcomeFlowProps {
  onKbReady: (kbPath: string) => void
  readonly?: boolean
}

function deriveClonePath(basePath: string, repoUrl: string): string {
  const trimmedBase = basePath.trim().replace(/[\\/]+$/, '')
  const repoSegment = repoUrl
    .trim()
    .split('/')
    .filter(Boolean)
    .pop()
    ?.replace(/\.git$/i, '')
    ?.trim()

  if (!trimmedBase) return repoSegment || ''
  if (!repoSegment) return trimmedBase

  return /[\\/]$/.test(basePath) ? `${trimmedBase}${repoSegment}` : `${trimmedBase}/${repoSegment}`
}

export const WelcomeFlow: React.FC<WelcomeFlowProps> = ({ onKbReady, readonly = false }) => {
  const [step, setStep] = useState<Step>('main')
  const [kbPath, setKbPath] = useState('')
  const [cloneParentPath, setCloneParentPath] = useState('')
  const [clonePathDerived, setClonePathDerived] = useState(false)
  const [repoUrl, setRepoUrl] = useState('')
  const [kbName, setKbName] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const resetForm = () => {
    setKbPath('')
    setCloneParentPath('')
    setClonePathDerived(false)
    setRepoUrl('')
    setKbName('')
    setError(null)
  }

  const goBack = () => {
    resetForm()
    setStep('main')
  }

  const handleSelectFolder = async () => {
    try {
      const selectedPath = await tauriService.selectFolder()
      if (selectedPath) {
        setKbPath(selectedPath)
        setError(null)
      }
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }

  const handleSelectCloneParent = async () => {
    try {
      const selectedPath = await tauriService.selectFolder()
      if (!selectedPath) return

      setCloneParentPath(selectedPath)
      setClonePathDerived(true)
      setKbPath(deriveClonePath(selectedPath, repoUrl))
      setError(null)
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }

  useEffect(() => {
    if (step !== 'clone' || !clonePathDerived || !cloneParentPath) return
    setKbPath(deriveClonePath(cloneParentPath, repoUrl))
  }, [cloneParentPath, clonePathDerived, repoUrl, step])

  // Import: open existing directory as KB
  const handleImport = async () => {
    if (!kbPath.trim()) return
    setIsLoading(true)
    setError(null)
    try {
      await tauriService.initKb(kbPath, 'open')
      onKbReady(kbPath)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setIsLoading(false)
    }
  }

  // Create: from template
  const handleTemplateSelect = async (templateId: string) => {
    if (!kbPath.trim()) return
    setIsLoading(true)
    setError(null)
    try {
      const createdPath = await tauriService.createKbFromTemplate(templateId, kbPath, kbName || undefined)
      onKbReady(createdPath)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setIsLoading(false)
    }
  }

  // Clone: clone a git repo
  const handleClone = async () => {
    if (!repoUrl.trim() || !kbPath.trim()) return
    setIsLoading(true)
    setError(null)
    try {
      const clonedPath = await tauriService.cloneKb(repoUrl, kbPath)
      onKbReady(clonedPath)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setIsLoading(false)
    }
  }

  const renderError = () => {
    if (!error) return null
    return (
      <div
        className="mt-4 rounded-md border px-3 py-2 text-sm"
        style={{ borderColor: '#FECACA', backgroundColor: '#FEF2F2', color: '#991B1B' }}
      >
        {error}
      </div>
    )
  }

  const renderReadonlyHint = () => {
    if (!readonly) return null
    return (
      <div
        className="mt-4 rounded-md border px-3 py-2 text-sm"
        style={{ borderColor: '#FDE68A', backgroundColor: '#FFFBEB', color: '#92400E' }}
      >
        当前为只读模式：你仍可打开已有知识库，但不能新建或克隆。
      </div>
    )
  }

  // Main entry screen
  if (step === 'main') {
    return (
      <div className="app-container flex items-center justify-center" style={{ backgroundColor: '#FAFAFA' }}>
        <div className="w-[520px] p-8">
          <div className="text-center mb-8">
            <div
              className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl"
              style={{ backgroundColor: 'var(--brand-primary-soft)' }}
            >
              <ForgeNerveLogo size={42} />
            </div>
            <h1 className="text-xl font-semibold" style={{ color: '#0A0A0A' }}>欢迎使用 ForgeNerve</h1>
            <p className="mt-2 text-sm" style={{ color: '#737373' }}>面向 AI Agent 的开发者知识操作系统</p>
            <p className="mt-1 text-xs" style={{ color: '#525252' }}>在一个 Git 原生工作台中管理知识、连接 Agent，并安全审阅 AI 生成的变更。</p>
            <div className="mt-3 flex items-center justify-center gap-2 text-[11px]">
              <span className="rounded-full border px-2 py-1" style={{ borderColor: '#E5E7EB', color: '#525252', backgroundColor: '#FFFFFF' }}>Local-first</span>
              <span className="rounded-full border px-2 py-1" style={{ borderColor: '#E5E7EB', color: '#525252', backgroundColor: '#FFFFFF' }}>Git-native</span>
              <span className="rounded-full border px-2 py-1" style={{ borderColor: '#E5E7EB', color: '#525252', backgroundColor: '#FFFFFF' }}>MCP-ready</span>
            </div>
          </div>

          <div className="space-y-3">
            <button
              onClick={() => { resetForm(); setStep('create') }}
              disabled={readonly}
              className="w-full flex items-center gap-4 rounded-xl border p-4 text-left transition-colors hover:border-indigo-300 hover:bg-indigo-50/50 disabled:cursor-not-allowed disabled:opacity-50"
              style={{ borderColor: '#E5E5E5' }}
            >
              <div
                className="flex h-10 w-10 items-center justify-center rounded-lg flex-shrink-0"
                style={{ backgroundColor: 'var(--brand-primary-soft)' }}
              >
                <Plus className="h-5 w-5" style={{ color: 'var(--brand-primary)' }} />
              </div>
              <div>
                <div className="text-sm font-medium" style={{ color: '#0A0A0A' }}>新建知识库</div>
                <div className="text-xs" style={{ color: '#737373' }}>从模板或空白工作区开始，快速搭建你的知识系统</div>
              </div>
            </button>

            <button
              onClick={() => { resetForm(); setStep('import') }}
              className="w-full flex items-center gap-4 rounded-xl border p-4 text-left transition-colors hover:border-indigo-300 hover:bg-indigo-50/50"
              style={{ borderColor: '#E5E5E5' }}
            >
              <div
                className="flex h-10 w-10 items-center justify-center rounded-lg flex-shrink-0"
                style={{ backgroundColor: '#FEF3C7' }}
              >
                <FolderOpen className="h-5 w-5" style={{ color: '#B45309' }} />
              </div>
              <div>
                <div className="text-sm font-medium" style={{ color: '#0A0A0A' }}>导入已有目录</div>
                <div className="text-xs" style={{ color: '#737373' }}>打开现有 Markdown 文件夹，把已有笔记迁移到 ForgeNerve</div>
              </div>
            </button>

            <button
              onClick={() => { resetForm(); setStep('clone') }}
              disabled={readonly}
              className="w-full flex items-center gap-4 rounded-xl border p-4 text-left transition-colors hover:border-indigo-300 hover:bg-indigo-50/50 disabled:cursor-not-allowed disabled:opacity-50"
              style={{ borderColor: '#E5E5E5' }}
            >
              <div
                className="flex h-10 w-10 items-center justify-center rounded-lg flex-shrink-0"
                style={{ backgroundColor: '#ECFDF5' }}
              >
                <GitBranchPlus className="h-5 w-5" style={{ color: '#047857' }} />
              </div>
              <div>
                <div className="text-sm font-medium" style={{ color: '#0A0A0A' }}>Clone Git 仓库</div>
                <div className="text-xs" style={{ color: '#737373' }}>从远程仓库拉取知识库，与团队共享同一套知识资产</div>
              </div>
            </button>
          </div>
          <div className="mt-5 text-center text-xs" style={{ color: '#737373' }}>
            完成启动后，可在设置页一键复制 MCP 配置，连接 Claude Code 或 OpenCode。
          </div>
          <div className="mt-5 rounded-xl border p-4" style={{ borderColor: '#E5E7EB', backgroundColor: '#FFFFFF' }}>
            <div className="text-sm font-medium" style={{ color: '#0A0A0A' }}>下载与发布入口</div>
            <div className="mt-1 text-xs" style={{ color: '#737373' }}>
              首次启动前后，你都可以直接查看正式版资产、Release Notes 和 MCP 配置说明。
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void openExternalLink(RELEASE_URL)}
                className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs"
                style={{ backgroundColor: 'var(--brand-primary)', color: '#FFFFFF' }}
              >
                <Download className="h-3.5 w-3.5" />
                下载 v0.1.0
              </button>
              <button
                type="button"
                onClick={() => void openExternalLink(RELEASE_NOTES_URL)}
                className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs"
                style={{ backgroundColor: '#F5F5F5', color: '#0A0A0A' }}
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Release Notes
              </button>
              <button
                type="button"
                onClick={() => void openExternalLink(README_URL)}
                className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs"
                style={{ backgroundColor: '#F5F5F5', color: '#0A0A0A' }}
              >
                <ExternalLink className="h-3.5 w-3.5" />
                安装与配置说明
              </button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {HERO_QUICK_DOWNLOADS.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => void openExternalLink(item.url)}
                  className="rounded-full border px-2.5 py-1 text-[11px]"
                  style={{ borderColor: '#E5E7EB', color: '#525252', backgroundColor: '#FAFAFA' }}
                >
                  {item.label} · {item.hint}
                </button>
              ))}
            </div>
          </div>
          {renderReadonlyHint()}
        </div>
      </div>
    )
  }

  // Create with template flow
  if (step === 'create') {
    return (
      <div className="app-container flex items-center justify-center" style={{ backgroundColor: '#FAFAFA' }}>
        <div className="w-[520px] p-8">
          <button
            onClick={goBack}
            className="mb-4 flex items-center gap-1 text-xs hover:underline"
            style={{ color: '#737373' }}
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            返回
          </button>

          <h2 className="text-lg font-semibold mb-4" style={{ color: '#0A0A0A' }}>新建知识库</h2>

          <div className="space-y-4 mb-4">
            <div>
              <label className="text-xs font-medium mb-1.5 block" style={{ color: '#737373' }}>知识库名称</label>
              <input
                value={kbName}
                onChange={(e) => setKbName(e.target.value)}
                placeholder="可选，用于显示知识库名称"
                className="w-full px-3 py-2 text-sm border rounded-md outline-none focus:border-indigo-500"
                style={{ borderColor: '#E5E5E5' }}
              />
            </div>
            <div>
              <label className="text-xs font-medium mb-1.5 block" style={{ color: '#737373' }}>存储路径 *</label>
              <div className="flex gap-2">
                <input
                  value={kbPath}
                  onChange={(e) => setKbPath(e.target.value)}
                  placeholder="选择或输入知识库存储路径"
                  className="flex-1 px-3 py-2 text-sm border rounded-md outline-none focus:border-indigo-500"
                  style={{ borderColor: '#E5E5E5' }}
                />
                <button
                  onClick={handleSelectFolder}
                  className="px-3 py-2 border rounded-md hover:bg-gray-50"
                  style={{ borderColor: '#E5E5E5' }}
                  title="选择目录"
                >
                  <FolderOpen className="h-4 w-4" style={{ color: '#737373' }} />
                </button>
              </div>
            </div>
          </div>

          {kbPath.trim() ? (
            <TemplatePicker
              onSelect={handleTemplateSelect}
              onCancel={goBack}
            />
          ) : (
            <p className="text-xs text-center py-6" style={{ color: '#A3A3A3' }}>
              请先选择存储路径，然后选择模板
            </p>
          )}

          {renderError()}
        </div>
      </div>
    )
  }

  // Import existing directory
  if (step === 'import') {
    return (
      <div className="app-container flex items-center justify-center" style={{ backgroundColor: '#FAFAFA' }}>
        <div className="w-[480px] p-8">
          <button
            onClick={goBack}
            className="mb-4 flex items-center gap-1 text-xs hover:underline"
            style={{ color: '#737373' }}
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            返回
          </button>

          <h2 className="text-lg font-semibold mb-1" style={{ color: '#0A0A0A' }}>导入已有目录</h2>
          <p className="text-sm mb-6" style={{ color: '#737373' }}>选择一个已有的 Markdown 文件夹作为知识库</p>

          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium mb-1.5 block" style={{ color: '#737373' }}>目录路径 *</label>
              <div className="flex gap-2">
                <input
                  value={kbPath}
                  onChange={(e) => setKbPath(e.target.value)}
                  placeholder="输入或选择已有目录路径"
                  className="flex-1 px-3 py-2 text-sm border rounded-md outline-none focus:border-indigo-500"
                  style={{ borderColor: '#E5E5E5' }}
                />
                <button
                  onClick={handleSelectFolder}
                  className="px-3 py-2 border rounded-md hover:bg-gray-50"
                  style={{ borderColor: '#E5E5E5' }}
                  title="选择目录"
                >
                  <FolderOpen className="h-4 w-4" style={{ color: '#737373' }} />
                </button>
              </div>
              <p className="mt-2 text-xs" style={{ color: '#A3A3A3' }}>
                选择非空目录时会自动识别其中的 Markdown 文件。
              </p>
            </div>
          </div>

          {renderError()}

          <div className="flex justify-end gap-2 mt-6">
            <button
              onClick={goBack}
              className="px-4 py-2 text-sm rounded-lg border"
              style={{ borderColor: '#E5E5E5', color: '#525252' }}
            >
              取消
            </button>
            <button
              onClick={handleImport}
              disabled={isLoading || !kbPath.trim()}
              className="px-5 py-2 text-sm rounded-lg text-white font-medium disabled:opacity-50"
              style={{ backgroundColor: 'var(--brand-primary)' }}
            >
              {isLoading ? '导入中...' : '导入'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Clone git repo
  return (
    <div className="app-container flex items-center justify-center" style={{ backgroundColor: '#FAFAFA' }}>
      <div className="w-[480px] p-8">
        <button
          onClick={goBack}
          className="mb-4 flex items-center gap-1 text-xs hover:underline"
          style={{ color: '#737373' }}
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          返回
        </button>

        <h2 className="text-lg font-semibold mb-1" style={{ color: '#0A0A0A' }}>Clone Git 仓库</h2>
        <p className="text-sm mb-6" style={{ color: '#737373' }}>从远程 Git 仓库克隆到本地作为知识库</p>

        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium mb-1.5 block" style={{ color: '#737373' }}>仓库地址 *</label>
            <input
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              placeholder="https://github.com/user/repo.git"
              className="w-full px-3 py-2 text-sm border rounded-md outline-none focus:border-indigo-500"
              style={{ borderColor: '#E5E5E5' }}
            />
          </div>
          <div>
            <label className="text-xs font-medium mb-1.5 block" style={{ color: '#737373' }}>本地路径 *</label>
            <div className="flex gap-2">
              <input
                value={kbPath}
                onChange={(e) => {
                  setKbPath(e.target.value)
                  setClonePathDerived(false)
                }}
                placeholder="选择本地存储路径"
                className="flex-1 px-3 py-2 text-sm border rounded-md outline-none focus:border-indigo-500"
                style={{ borderColor: '#E5E5E5' }}
              />
              <button
                onClick={handleSelectCloneParent}
                className="px-3 py-2 border rounded-md hover:bg-gray-50"
                style={{ borderColor: '#E5E5E5' }}
                title="选择父目录"
              >
                <FolderOpen className="h-4 w-4" style={{ color: '#737373' }} />
              </button>
            </div>
            <p className="mt-2 text-xs" style={{ color: '#A3A3A3' }}>
              目录选择器会先选择父目录，再自动追加仓库名作为目标目录。
            </p>
          </div>
        </div>

        {renderError()}

        <div className="flex justify-end gap-2 mt-6">
          <button
            onClick={goBack}
            className="px-4 py-2 text-sm rounded-lg border"
            style={{ borderColor: '#E5E5E5', color: '#525252' }}
          >
            取消
          </button>
          <button
            onClick={handleClone}
            disabled={isLoading || !repoUrl.trim() || !kbPath.trim()}
            className="px-5 py-2 text-sm rounded-lg text-white font-medium disabled:opacity-50"
            style={{ backgroundColor: 'var(--brand-primary)' }}
          >
            {isLoading ? '克隆中...' : '开始克隆'}
          </button>
        </div>
      </div>
    </div>
  )
}
