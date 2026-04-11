export const MCP_ENDPOINT = 'http://127.0.0.1:31415/mcp'
export const RELEASE_URL = 'https://github.com/chenpu17/memoforge/releases/tag/v0.1.0'
export const RELEASE_NOTES_URL = 'https://github.com/chenpu17/memoforge/blob/main/RELEASE_NOTES.md'
export const README_URL = 'https://github.com/chenpu17/memoforge#readme'

export type ReleaseAssetLink = {
  label: string
  url: string
}

export type DownloadGroup = {
  title: string
  description: string
  assets: ReleaseAssetLink[]
}

export type QuickDownloadLink = {
  label: string
  hint: string
  url: string
}

export const DOWNLOAD_GROUPS: DownloadGroup[] = [
  {
    title: 'Windows',
    description: '安装版、MSI 和便携版都在正式版 release 中。',
    assets: [
      { label: 'Setup .exe', url: 'https://github.com/chenpu17/memoforge/releases/download/v0.1.0/ForgeNerve_0.1.0_x64-setup.exe' },
      { label: 'MSI', url: 'https://github.com/chenpu17/memoforge/releases/download/v0.1.0/ForgeNerve_0.1.0_x64_en-US.msi' },
      { label: 'Portable', url: 'https://github.com/chenpu17/memoforge/releases/download/v0.1.0/ForgeNerve_x64_portable.exe' },
    ],
  },
  {
    title: 'macOS / Linux',
    description: '桌面端提供 macOS DMG 与 Linux AppImage。',
    assets: [
      { label: 'macOS arm64', url: 'https://github.com/chenpu17/memoforge/releases/download/v0.1.0/ForgeNerve_0.1.0_aarch64.dmg' },
      { label: 'macOS x64', url: 'https://github.com/chenpu17/memoforge/releases/download/v0.1.0/ForgeNerve_0.1.0_x64.dmg' },
      { label: 'Linux AppImage', url: 'https://github.com/chenpu17/memoforge/releases/download/v0.1.0/ForgeNerve_0.1.0_amd64.AppImage' },
    ],
  },
  {
    title: 'Standalone MCP',
    description: '只接 MCP 时，可直接下载 memoforge CLI 二进制。',
    assets: [
      { label: 'memoforge-windows-x64.exe', url: 'https://github.com/chenpu17/memoforge/releases/download/v0.1.0/memoforge-windows-x64.exe' },
      { label: 'memoforge-linux-x64', url: 'https://github.com/chenpu17/memoforge/releases/download/v0.1.0/memoforge-linux-x64' },
      { label: 'memoforge-darwin-arm64', url: 'https://github.com/chenpu17/memoforge/releases/download/v0.1.0/memoforge-darwin-arm64' },
    ],
  },
]

export const HERO_QUICK_DOWNLOADS: QuickDownloadLink[] = [
  {
    label: 'Windows',
    hint: 'Setup .exe',
    url: 'https://github.com/chenpu17/memoforge/releases/download/v0.1.0/ForgeNerve_0.1.0_x64-setup.exe',
  },
  {
    label: 'macOS',
    hint: 'Apple Silicon DMG',
    url: 'https://github.com/chenpu17/memoforge/releases/download/v0.1.0/ForgeNerve_0.1.0_aarch64.dmg',
  },
  {
    label: 'Linux',
    hint: 'AppImage',
    url: 'https://github.com/chenpu17/memoforge/releases/download/v0.1.0/ForgeNerve_0.1.0_amd64.AppImage',
  },
  {
    label: 'MCP CLI',
    hint: 'memoforge-windows-x64.exe',
    url: 'https://github.com/chenpu17/memoforge/releases/download/v0.1.0/memoforge-windows-x64.exe',
  },
]
