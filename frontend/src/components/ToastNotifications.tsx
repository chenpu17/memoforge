import React, { useEffect, useState, useCallback } from 'react'
import { tauriService, Event } from '../services/tauri'
import { X, FileText, Edit, Trash2, GitCommit, RefreshCw } from 'lucide-react'

interface Toast {
  id: string
  event: Event
  visible: boolean
}

interface ToastNotificationsProps {
  onKnowledgeChange?: (events: Event[]) => void
}

const shouldRefreshForEvent = (event: Event) => (
  event.source !== 'gui' &&
  (
    event.action === 'create' ||
    event.action === 'delete' ||
    event.action === 'update' ||
    event.action === 'update_metadata' ||
    event.action === 'move'
  )
)

const getActionIcon = (action: Event['action']) => {
  switch (action) {
    case 'create':
      return <FileText className="h-4 w-4" style={{ color: '#22C55E' }} />
    case 'update':
    case 'update_metadata':
      return <Edit className="h-4 w-4" style={{ color: '#6366F1' }} />
    case 'delete':
      return <Trash2 className="h-4 w-4" style={{ color: '#EF4444' }} />
    case 'git_commit':
      return <GitCommit className="h-4 w-4" style={{ color: '#F59E0B' }} />
    case 'git_pull':
    case 'git_push':
      return <RefreshCw className="h-4 w-4" style={{ color: '#3B82F6' }} />
    default:
      return <FileText className="h-4 w-4" style={{ color: '#737373' }} />
  }
}

const getSourceLabel = (source: Event['source']) => {
  switch (source) {
    case 'mcp:claude-code':
      return 'Claude Code'
    case 'mcp:codex':
      return 'Codex'
    case 'mcp':
    case 'mcp:other':
      return 'AI Agent'
    case 'cli':
      return 'CLI'
    case 'gui':
      return 'GUI'
    default:
      return 'System'
  }
}

export const ToastNotifications: React.FC<ToastNotificationsProps> = ({ onKnowledgeChange }) => {
  const [toasts, setToasts] = useState<Toast[]>([])
  const [lastEventTime, setLastEventTime] = useState<string | null>(null)

  const checkForNewEvents = useCallback(async () => {
    try {
      const events = await tauriService.readEvents(10)
      if (events.length === 0) return

      // Find new events since last check
      const newEvents = lastEventTime
        ? events.filter(e => e.time > lastEventTime)
        : []

      // Update last event time
      if (events.length > 0) {
        setLastEventTime(events[events.length - 1].time)
      }

      // Check if we need to refresh knowledge list (create/delete from non-GUI source)
      const shouldRefresh = newEvents.some(shouldRefreshForEvent)
      if (shouldRefresh && onKnowledgeChange) {
        onKnowledgeChange(newEvents)
      }

      // Add new toasts (only for non-GUI events to avoid duplicate notifications)
      const nonGuiEvents = newEvents.filter(e => e.source !== 'gui')
      for (const event of nonGuiEvents.slice(0, 3)) { // Limit to 3 at a time
        const toast: Toast = {
          id: `${event.time}-${event.action}-${event.path || 'global'}`,
          event,
          visible: true,
        }
        setToasts(prev => [...prev, toast])

        // Auto-hide after 5 seconds
        setTimeout(() => {
          setToasts(prev => prev.map(t =>
            t.id === toast.id ? { ...t, visible: false } : t
          ))
          // Remove from list after animation
          setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== toast.id))
          }, 300)
        }, 5000)
      }
    } catch (error) {
      console.error('Failed to check events:', error)
    }
  }, [lastEventTime, onKnowledgeChange])

  useEffect(() => {
    // Check for new events every 2 seconds
    const interval = setInterval(checkForNewEvents, 2000)
    return () => clearInterval(interval)
  }, [checkForNewEvents])

  const dismissToast = (id: string) => {
    setToasts(prev => prev.map(t =>
      t.id === id ? { ...t, visible: false } : t
    ))
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, 300)
  }

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.filter(t => t.visible).map(toast => (
        <div
          key={toast.id}
          className="flex items-start gap-3 px-4 py-3 bg-white rounded-lg shadow-lg border max-w-sm animate-slide-in"
          style={{ borderColor: '#E5E5E5' }}
        >
          <div className="flex-shrink-0 mt-0.5">
            {getActionIcon(toast.event.action)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <span
                className="text-xs font-medium px-1.5 py-0.5 rounded"
                style={{ backgroundColor: '#F3F4F6', color: '#6B7280' }}
              >
                {getSourceLabel(toast.event.source)}
              </span>
            </div>
            <p className="text-sm" style={{ color: '#374151' }}>
              {toast.event.detail}
            </p>
          </div>
          <button
            onClick={() => dismissToast(toast.id)}
            className="flex-shrink-0 p-1 rounded hover:bg-gray-100"
          >
            <X className="h-3.5 w-3.5" style={{ color: '#9CA3AF' }} />
          </button>
        </div>
      ))}
      <style>{`
        @keyframes slide-in {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
        .animate-slide-in {
          animation: slide-in 0.3s ease-out;
        }
      `}</style>
    </div>
  )
}
