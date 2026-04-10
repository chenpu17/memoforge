import { useEffect, useRef } from 'react'

interface UseAutoSaveOptions {
  enabled: boolean
  intervalSeconds: number
  activeKey: string | null
  dirtyToken: string
  isSaving: boolean
  onSave: () => void | Promise<void>
}

export function useAutoSave({
  enabled,
  intervalSeconds,
  activeKey,
  dirtyToken,
  isSaving,
  onSave,
}: UseAutoSaveOptions) {
  const onSaveRef = useRef(onSave)

  useEffect(() => {
    onSaveRef.current = onSave
  }, [onSave])

  useEffect(() => {
    if (!enabled || intervalSeconds <= 0 || !activeKey || isSaving) return

    const timer = window.setTimeout(() => {
      void onSaveRef.current()
    }, intervalSeconds * 1000)

    return () => window.clearTimeout(timer)
  }, [activeKey, dirtyToken, enabled, intervalSeconds, isSaving])
}
