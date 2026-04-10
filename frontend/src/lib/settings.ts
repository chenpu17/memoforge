export type EditorModeSetting = 'read' | 'markdown' | 'rich'
export type ImportStrategy = 'auto-category' | 'none'

const SETTINGS_PREFIX = 'memoforge.settings.'

export const SETTINGS_CHANGED_EVENT = 'memoforge:settings-changed'

type SettingsChangedDetail = {
  key: string
  value: unknown
}

export function loadSetting<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback

  try {
    const stored = window.localStorage.getItem(`${SETTINGS_PREFIX}${key}`)
    if (stored === null) return fallback
    return JSON.parse(stored) as T
  } catch {
    return fallback
  }
}

export function saveSetting(key: string, value: unknown): void {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(`${SETTINGS_PREFIX}${key}`, JSON.stringify(value))
  } catch {
    return
  }

  window.dispatchEvent(
    new CustomEvent<SettingsChangedDetail>(SETTINGS_CHANGED_EVENT, {
      detail: { key, value },
    }),
  )
}

export function getDefaultEditorMode(): EditorModeSetting {
  return loadSetting<EditorModeSetting>('defaultEditorMode', 'read')
}

export function getAutoSaveInterval(): number {
  return loadSetting<number>('autoSaveInterval', 0)
}

export function getImportStrategy(): ImportStrategy {
  return loadSetting<ImportStrategy>('importStrategy', 'auto-category')
}

export function getShowLineNumbersSetting(): boolean {
  return loadSetting<boolean>('showLineNumbers', false)
}
