function isTauri() {
  if (typeof window === 'undefined') return false
  return '__TAURI__' in window || '__TAURI_INTERNALS__' in window
}

export async function openExternalLink(href: string) {
  if (isTauri()) {
    try {
      const { open } = await import('@tauri-apps/plugin-shell')
      await open(href)
      return
    } catch (error) {
      console.error('Failed to open external link:', error)
    }
  }

  window.open(href, '_blank', 'noopener,noreferrer')
}
