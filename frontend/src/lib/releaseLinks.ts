export const MCP_ENDPOINT = 'http://127.0.0.1:31415/mcp'
export const RELEASE_VERSION = '0.3.0-beta.2'
export const RELEASE_TAG = `v${RELEASE_VERSION}`
const releaseAssetUrl = (assetName: string) => `https://github.com/chenpu17/memoforge/releases/download/${RELEASE_TAG}/${assetName}`
export const RELEASE_URL = `https://github.com/chenpu17/memoforge/releases/tag/${RELEASE_TAG}`
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
    description: '当前预发布版提供安装版和便携版；MSI 仅保留在稳定版发布线。',
    assets: [
      { label: 'Setup .exe', url: releaseAssetUrl(`ForgeNerve_${RELEASE_VERSION}_x64-setup.exe`) },
      { label: 'Portable', url: releaseAssetUrl('ForgeNerve_x64_portable.exe') },
    ],
  },
  {
    title: 'macOS / Linux',
    description: '桌面端提供 macOS DMG 与 Linux AppImage。',
    assets: [
      { label: 'macOS arm64', url: releaseAssetUrl(`ForgeNerve_${RELEASE_VERSION}_aarch64.dmg`) },
      { label: 'macOS x64', url: releaseAssetUrl(`ForgeNerve_${RELEASE_VERSION}_x64.dmg`) },
      { label: 'Linux AppImage', url: releaseAssetUrl(`ForgeNerve_${RELEASE_VERSION}_amd64.AppImage`) },
    ],
  },
  {
    title: 'Standalone MCP',
    description: '只接 MCP 时，可直接下载 memoforge CLI 二进制。',
    assets: [
      { label: 'memoforge-windows-x64.exe', url: releaseAssetUrl('memoforge-windows-x64.exe') },
      { label: 'memoforge-linux-x64', url: releaseAssetUrl('memoforge-linux-x64') },
      { label: 'memoforge-darwin-arm64', url: releaseAssetUrl('memoforge-darwin-arm64') },
    ],
  },
]

export const HERO_QUICK_DOWNLOADS: QuickDownloadLink[] = [
  {
    label: 'Windows',
    hint: 'Setup .exe',
    url: releaseAssetUrl(`ForgeNerve_${RELEASE_VERSION}_x64-setup.exe`),
  },
  {
    label: 'macOS',
    hint: 'Apple Silicon DMG',
    url: releaseAssetUrl(`ForgeNerve_${RELEASE_VERSION}_aarch64.dmg`),
  },
  {
    label: 'Linux',
    hint: 'AppImage',
    url: releaseAssetUrl(`ForgeNerve_${RELEASE_VERSION}_amd64.AppImage`),
  },
  {
    label: 'MCP CLI',
    hint: 'memoforge-windows-x64.exe',
    url: releaseAssetUrl('memoforge-windows-x64.exe'),
  },
]
