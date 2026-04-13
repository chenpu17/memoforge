import { chromium, expect } from '@playwright/test'
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import net from 'node:net'

const FRONTEND_ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const REPO_ROOT = dirname(FRONTEND_ROOT)
const TARGET_HTTP_BIN = join(REPO_ROOT, 'target', 'debug', process.platform === 'win32' ? 'memoforge-http.exe' : 'memoforge-http')

function repoWrite(path, content) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content, 'utf8')
}

function gitOutput(cwd, ...args) {
  return spawnSync(resolveCommand('git'), ['-C', cwd, ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).stdout.trim()
}

function runChecked(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? REPO_ROOT,
    env: options.env ?? process.env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  if (result.status !== 0) {
    throw new Error(`Command failed: ${command} ${args.join(' ')}\n${result.stdout}\n${result.stderr}`)
  }
  return result.stdout.trim()
}

function resolveCommand(command) {
  if (process.platform === 'win32' && !command.endsWith('.exe') && !command.endsWith('.cmd')) {
    if (command === 'npm') return 'npm.cmd'
  }
  return command
}

function initGitRepo(kbPath, remotePath) {
  runChecked(resolveCommand('git'), ['init', '--bare', remotePath])
  runChecked(resolveCommand('git'), ['-C', kbPath, 'init'])
  runChecked(resolveCommand('git'), ['-C', kbPath, 'config', 'user.email', 'e2e@example.com'])
  runChecked(resolveCommand('git'), ['-C', kbPath, 'config', 'user.name', 'E2E'])
  runChecked(resolveCommand('git'), ['-C', kbPath, 'add', '.'])
  runChecked(resolveCommand('git'), ['-C', kbPath, 'commit', '-m', 'Initial knowledge base'])
  runChecked(resolveCommand('git'), ['-C', kbPath, 'branch', '-M', 'main'])
  runChecked(resolveCommand('git'), ['-C', kbPath, 'remote', 'add', 'origin', remotePath])
  runChecked(resolveCommand('git'), ['-C', kbPath, 'push', '-u', 'origin', 'main'])
  runChecked(resolveCommand('git'), ['-C', remotePath, 'symbolic-ref', 'HEAD', 'refs/heads/main'])
}

function cloneRemote(remotePath, targetPath) {
  runChecked(resolveCommand('git'), ['clone', remotePath, targetPath])
  runChecked(resolveCommand('git'), ['-C', targetPath, 'config', 'user.email', 'clone@example.com'])
  runChecked(resolveCommand('git'), ['-C', targetPath, 'config', 'user.name', 'Remote Clone'])
}

function seedKnowledgeBase(baseDir) {
  const kb1 = join(baseDir, 'kb1')
  const kb2 = join(baseDir, 'kb2')
  const remote = join(baseDir, 'remote.git')
  const importSrc = join(baseDir, 'import-src')
  mkdirSync(importSrc, { recursive: true })

  const config = `version: "1.0"
metadata:
  name: "Frontend E2E KB"
  created_at: "2026-03-20T00:00:00Z"
categories:
  - id: programming
    name: Programming
    path: programming
  - id: tools
    name: Tools
    path: tools
`
  const memoforgeGitignore = 'serve.pid\nhttp.token\nevents.jsonl\ngit.lock\n*.lock\n'

  for (const kb of [kb1, kb2]) {
    mkdirSync(join(kb, '.memoforge'), { recursive: true })
    mkdirSync(join(kb, 'programming'), { recursive: true })
    mkdirSync(join(kb, 'tools'), { recursive: true })
    repoWrite(join(kb, '.memoforge', 'config.yaml'), config)
    repoWrite(join(kb, '.memoforge', '.gitignore'), memoforgeGitignore)
    repoWrite(join(kb, '.gitignore'), '.DS_Store\n')
  }

  repoWrite(
    join(kb1, 'programming', 'alpha.md'),
    `---
id: alpha
title: Alpha Rust Patterns
tags:
  - Rust
  - async
category: programming
summary: Alpha summary
created_at: 2026-03-20T00:00:00Z
updated_at: 2026-03-20T00:00:00Z
---
# Alpha Rust Patterns

Alpha links to [[programming/beta.md]].
`,
  )
  repoWrite(
    join(kb1, 'programming', 'beta.md'),
    `---
id: beta
title: Beta Async Notes
tags:
  - Rust
  - tokio
category: programming
summary: Beta summary
created_at: 2026-03-20T00:00:00Z
updated_at: 2026-03-20T00:00:00Z
---
# Beta Async Notes

Tokio details live here.
`,
  )
  repoWrite(
    join(kb1, 'tools', 'docker.md'),
    `---
id: docker
title: Docker Deploy Guide
tags:
  - Docker
  - DevOps
category: tools
summary: Docker guide
created_at: 2026-03-20T00:00:00Z
updated_at: 2026-03-20T00:00:00Z
---
# Docker Deploy Guide

docker build and docker run.
`,
  )
  repoWrite(
    join(kb2, 'programming', 'gamma.md'),
    `---
id: gamma
title: Gamma Python Tips
tags:
  - Python
category: programming
summary: Gamma summary
created_at: 2026-03-20T00:00:00Z
updated_at: 2026-03-20T00:00:00Z
---
# Gamma Python Tips

asyncio and tooling.
`,
  )
  repoWrite(join(importSrc, 'imported-note.md'), '# Imported Note\n\nImported through browser E2E.\n')

  initGitRepo(kb1, remote)

  return { kb1, kb2, importSrc, remote }
}

function makeTestEnv(baseDir) {
  const home = join(baseDir, 'home')
  const originalHome = process.env.USERPROFILE || process.env.HOME || baseDir
  mkdirSync(home, { recursive: true })
  const env = {
    ...process.env,
    HOME: home,
    USERPROFILE: home,
    XDG_CONFIG_HOME: join(home, '.config'),
  }
  env.CARGO_HOME = process.env.CARGO_HOME || join(originalHome, '.cargo')
  env.RUSTUP_HOME = process.env.RUSTUP_HOME || join(originalHome, '.rustup')
  env.npm_config_cache = process.env.npm_config_cache || join(originalHome, '.npm')
  return env
}

function findFreePort() {
  return new Promise((resolvePort, reject) => {
    const server = net.createServer()
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        server.close()
        reject(new Error('Failed to acquire free port'))
        return
      }
      const { port } = address
      server.close(() => resolvePort(port))
    })
    server.on('error', reject)
  })
}

function startProcess(command, args, { cwd, env }) {
  const output = []
  const useShell = process.platform === 'win32' && command.endsWith('.cmd')
  const child = spawn(command, args, {
    cwd,
    env,
    shell: useShell,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  for (const stream of [child.stdout, child.stderr]) {
    stream?.on('data', (chunk) => {
      const text = chunk.toString()
      output.push(text)
      if (output.length > 200) output.shift()
    })
  }
  return { child, output, command: `${command} ${args.join(' ')}` }
}

async function terminateProcess(processInfo) {
  if (!processInfo) return
  const { child } = processInfo
  if (child.exitCode !== null) return
  if (process.platform === 'win32' && child.pid) {
    spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
      stdio: ['ignore', 'ignore', 'ignore'],
    })
    await new Promise((resolveWait) => {
      const timer = setTimeout(resolveWait, 5_000)
      child.once('exit', () => {
        clearTimeout(timer)
        resolveWait()
      })
    })
    return
  }
  child.kill()
  await new Promise((resolveWait) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      resolveWait()
    }, 10_000)
    child.once('exit', () => {
      clearTimeout(timer)
      resolveWait()
    })
  })
}

async function waitForUrl(url, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1_500) })
      if (response.ok) return
    } catch {}
    await new Promise((resolveWait) => setTimeout(resolveWait, 250))
  }
  throw new Error(`Timed out waiting for ${url}`)
}

function getHttpServerCommand(paths, httpPort, webPort) {
  const envBinary = process.env.MEMOFORGE_HTTP_BIN
  if (envBinary && existsSync(envBinary)) {
    return [envBinary, ['--kb-path', paths.kb1, '--bind', '127.0.0.1', '--port', String(httpPort), '--cors-origin', `http://127.0.0.1:${webPort}`]]
  }
  if (existsSync(TARGET_HTTP_BIN)) {
    return [TARGET_HTTP_BIN, ['--kb-path', paths.kb1, '--bind', '127.0.0.1', '--port', String(httpPort), '--cors-origin', `http://127.0.0.1:${webPort}`]]
  }
  return [
    resolveCommand('cargo'),
    ['run', '-p', 'memoforge-http', '--', '--kb-path', paths.kb1, '--bind', '127.0.0.1', '--port', String(httpPort), '--cors-origin', `http://127.0.0.1:${webPort}`],
  ]
}

function findMarkdownFileContaining(root, marker) {
  const stack = [root]
  while (stack.length > 0) {
    const current = stack.pop()
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const fullPath = join(current, entry.name)
      if (entry.isDirectory()) {
        stack.push(fullPath)
        continue
      }
      if (!entry.name.endsWith('.md')) continue
      if (readFileSync(fullPath, 'utf8').includes(marker)) return fullPath
    }
  }
  return null
}

async function waitForFileContent(root, marker, extraText, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const file = findMarkdownFileContaining(root, marker)
    if (file && readFileSync(file, 'utf8').includes(extraText)) return file
    await new Promise((resolveWait) => setTimeout(resolveWait, 250))
  }
  return null
}

async function waitForCondition(check, timeoutMs = 10_000, intervalMs = 250) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await check()) return true
    await new Promise((resolveWait) => setTimeout(resolveWait, intervalMs))
  }
  return false
}

async function openRightPanelGit(page) {
  const shell = page.locator('.right-panel-shell').first()
  const railGitButton = page.locator('.right-panel-rail button[data-label="Git"]').first()
  const gitTab = page.locator('.right-panel-tab').filter({ hasText: /^Git$/ }).first()

  await expect(shell).toBeVisible()
  await expect(railGitButton).toBeVisible()

  for (let attempt = 0; attempt < 3; attempt += 1) {
    await railGitButton.click({ force: true })
    await page.waitForTimeout(300)

    if (await gitTab.count() > 0) {
      await gitTab.click()
      await page.waitForTimeout(300)
    }

    const commitInput = page.locator('.side-panel-body input[type="text"]').first()
    if (await commitInput.isVisible().catch(() => false)) {
      return commitInput
    }
  }

  const shellHtml = await shell.innerHTML().catch(() => '<unavailable>')
  const bodyHtml = await page.locator('body').innerHTML().catch(() => '<unavailable>')
  throw new Error([
    'Failed to open Git panel',
    `shell=${shellHtml}`,
    `body=${bodyHtml.slice(0, 4000)}`,
  ].join('\n'))
}

async function runNormalFlow(paths, webPort) {
  const noteTitle = `Frontend E2E ${Date.now()}`
  const deleteTitle = `Delete E2E ${Date.now()}`
  const commitMessage = `frontend http e2e commit ${Date.now()}`
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  const dialogs = []
  const acceptedDialogs = []
  const failedRequests = []
  const consoleMessages = []
  let acceptNextDialog = false

  page.on('dialog', async (dialog) => {
    const message = dialog.message()
    if (acceptNextDialog) {
      acceptNextDialog = false
      acceptedDialogs.push(message)
      await dialog.accept()
      return
    }
    dialogs.push(message)
    await dialog.dismiss()
  })
  page.on('console', (message) => {
    consoleMessages.push(`[${message.type()}] ${message.text()}`)
    if (consoleMessages.length > 100) consoleMessages.shift()
  })
  page.on('requestfailed', (request) => {
    const failure = request.failure()?.errorText ?? 'unknown'
    if (failure === 'net::ERR_ABORTED') {
      return
    }
    failedRequests.push({
      url: request.url(),
      method: request.method(),
      failure,
    })
  })

  const webUrl = `http://127.0.0.1:${webPort}`
  await page.goto(webUrl, { waitUntil: 'networkidle' })
  await expect(page.locator('.knowledge-tree-shell')).toBeVisible()
  await expect(page.locator('.directory-browser-shell')).toBeVisible()

  const treeNav = page.locator('.knowledge-tree-shell')
  const browserShell = page.locator('.directory-browser-shell')
  const titlebar = page.locator('.titlebar-no-drag')
  const treeButton = (text) => treeNav.locator('button').filter({ hasText: text }).first()
  const browserCard = (text) => browserShell.locator('button').filter({ hasText: text }).first()
  const currentModal = () => page.locator('div.fixed.inset-0.z-50').last()

  const mark = (step) => console.log(`OK ${step}`)

  await titlebar.locator('button').filter({ has: page.locator('svg.lucide-search') }).first().click()
  await expect(currentModal()).toBeVisible()
  await expect(currentModal().locator('input').first()).toBeVisible()
  await page.keyboard.press('Escape')
  mark('ui-search-open')

  await treeButton('tools').click()
  await expect(browserShell.getByText('Docker Deploy Guide')).toBeVisible()
  mark('ui-category-filter')

  await treeButton('programming').click()
  await browserCard('Alpha Rust Patterns').click()
  await page.locator('.right-panel-rail button').filter({ has: page.locator('svg.lucide-link2') }).first().click()
  await expect(page.getByText('Beta Async Notes').first()).toBeVisible()
  mark('ui-backlinks')

  await titlebar.locator('button').filter({ has: page.locator('svg.lucide-search') }).first().click()
  await currentModal().locator('input').first().fill('tag:Rust')
  await expect(currentModal().getByText('Alpha Rust Patterns').first()).toBeVisible()
  await expect(currentModal().getByText('Beta Async Notes').first()).toBeVisible()
  await page.keyboard.press('Escape')
  mark('ui-tag-search')

  await treeNav.locator('button').filter({ has: page.locator('svg.lucide-more-horizontal') }).first().click()
  await page.locator('div.absolute button').first().click()
  await page.locator('.react-flow__node').filter({ hasText: 'Alpha Rust Patterns' }).first().waitFor()
  await page.locator('.react-flow__node').filter({ hasText: 'Alpha Rust Patterns' }).first().click()
  await expect(page.getByText('Alpha Rust Patterns').first()).toBeVisible()
  await expect(page.locator('.react-flow__node')).toHaveCount(0)
  mark('ui-graph')

  await page.locator('button').filter({ has: page.locator('svg.lucide-plus') }).first().click()
  await expect(currentModal()).toBeVisible()
  await currentModal().locator('input').first().fill(deleteTitle)
  await currentModal().locator('button').last().click()
  await currentModal().locator('input').first().fill('programming')
  await currentModal().locator('button').last().click()
  await expect(page.getByText(deleteTitle).first()).toBeVisible()
  await page.locator('[data-floating-menu="true"] > button').click()
  await page.locator('[data-floating-menu="true"] button').nth(1).click()
  await currentModal().locator('button').last().click()
  await expect(browserShell.getByText(deleteTitle)).toHaveCount(0)
  mark('ui-delete-knowledge')

  await page.locator('button').filter({ has: page.locator('svg.lucide-plus') }).first().click()
  await currentModal().locator('input').first().fill(noteTitle)
  await currentModal().locator('button').last().click()
  await currentModal().locator('input').first().fill('programming')
  await currentModal().locator('input').nth(1).fill('Testing')
  await currentModal().locator('input').nth(1).press('Enter')
  await currentModal().locator('button').last().click()
  await expect(page.getByText(noteTitle).first()).toBeVisible()
  mark('ui-create-knowledge')

  await page.getByRole('button', { name: 'Markdown' }).click()
  await page.locator('.cm-content').first().click()
  await page.keyboard.press('Control+A')
  await page.keyboard.insertText(`# ${noteTitle}\n\ncontent updated for browser e2e`)
  await page.locator('button').filter({ has: page.locator('svg.lucide-save') }).first().click()
  const savedFile = await waitForFileContent(paths.kb1, noteTitle, 'content updated for browser e2e')
  if (!savedFile) {
    throw new Error('Expected edited note to be saved to disk')
  }
  mark('ui-save-edit')

  await page.locator('button').filter({ has: page.locator('svg.lucide-folder-input') }).first().click()
  await expect(currentModal()).toBeVisible()
  await currentModal().locator('input').first().fill(paths.importSrc)
  await currentModal().locator('div.flex.gap-2 button').first().click()
  await expect(currentModal().getByText('Imported Note').first()).toBeVisible({ timeout: 10_000 })
  await currentModal().locator('div.flex.justify-end.gap-2.px-6.py-4.border-t button').last().click()
  const importSucceeded = await waitForCondition(
    async () => findMarkdownFileContaining(paths.kb1, 'Imported through browser E2E.') !== null,
    15_000,
  )
  if (!importSucceeded) {
    throw new Error('Expected import flow to create a markdown file in the knowledge base')
  }
  await currentModal().locator('div.flex.justify-end.gap-2.px-6.py-4.border-t button').last().click()
  await expect(currentModal()).toHaveCount(0)
  const importedFile = await waitForFileContent(paths.kb1, 'Imported Note', 'Imported through browser E2E.')
  if (!importedFile) {
    throw new Error('Expected imported markdown file to be written into the knowledge base')
  }
  const importedContent = readFileSync(importedFile, 'utf8')
  if (!importedContent.startsWith('---\n')) {
    throw new Error(`Expected imported markdown file to include generated frontmatter: ${importedFile}`)
  }
  const sourceContent = readFileSync(join(paths.importSrc, 'imported-note.md'), 'utf8')
  if (sourceContent.startsWith('---\n')) {
    throw new Error('Source markdown should not be rewritten during import')
  }
  await page.reload({ waitUntil: 'networkidle' })
  const importedTreeResult = treeNav.locator('button').filter({ hasText: 'Imported Note' }).first()
  await treeNav.locator('input').first().fill('Imported Note')
  await expect(importedTreeResult).toBeVisible({ timeout: 10_000 })
  await importedTreeResult.click()
  mark('ui-import-modal')

  const commitInput = await openRightPanelGit(page)
  await expect(commitInput).toBeVisible()
  await commitInput.fill(commitMessage)
  await page.locator('.side-panel-body .side-panel-section .flex.gap-1\\.5 button').first().click()
  const committed = await waitForCondition(
    async () => gitOutput(paths.kb1, 'log', '-1', '--pretty=%s') === commitMessage,
    15_000,
  )
  if (!committed) {
    const panelText = await page.locator('.side-panel-body').first().innerText().catch(() => '<unavailable>')
    const gitStatusText = gitOutput(paths.kb1, 'status', '--short')
    throw new Error([
      'Git commit message did not match expected value',
      `panel=${panelText}`,
      `git_status=${gitStatusText}`,
      `console=${consoleMessages.join(' | ')}`,
    ].join('\n'))
  }
  await page.locator('.side-panel-body button').filter({ has: page.locator('svg.lucide-upload') }).first().click()
  const pushed = await waitForCondition(
    async () => gitOutput(paths.remote, 'log', '--all', '-1', '--pretty=%s').includes(commitMessage),
    15_000,
  )
  if (!pushed) {
    throw new Error('Remote repository did not receive pushed commit')
  }
  mark('ui-git-commit-push')

  const remoteWriter = join(dirname(paths.remote), 'remote-writer')
  cloneRemote(paths.remote, remoteWriter)
  repoWrite(
    join(remoteWriter, 'tools', 'remote-added.md'),
    `---
id: remote-added
title: Remote Added
tags:
  - remote
category: tools
summary: Added from remote clone
created_at: 2026-03-20T00:00:00Z
updated_at: 2026-03-20T00:00:00Z
---
# Remote Added

This note arrived through browser git pull.
`,
  )
  runChecked(resolveCommand('git'), ['-C', remoteWriter, 'add', '.'])
  runChecked(resolveCommand('git'), ['-C', remoteWriter, 'commit', '-m', 'Remote clone adds note'])
  runChecked(resolveCommand('git'), ['-C', remoteWriter, 'push', 'origin', 'main'])

  await page.locator('.side-panel-body button').filter({ has: page.locator('svg.lucide-arrow-down') }).first().click()
  const pulledFile = await waitForFileContent(paths.kb1, 'Remote Added', 'browser git pull', 15_000)
  if (!pulledFile) {
    throw new Error('Expected git pull to write the remote note into the local knowledge base')
  }
  await treeNav.locator('input').first().fill('Remote Added')
  await expect(treeNav.locator('button').filter({ hasText: 'Remote Added' }).first()).toBeVisible({ timeout: 10_000 })
  await treeNav.locator('input').first().fill('')
  await treeButton('tools').click()
  await expect(browserShell.getByText('Remote Added')).toBeVisible({ timeout: 10_000 })
  mark('ui-git-pull')

  await treeNav.locator('button').filter({ has: page.locator('svg.lucide-settings') }).first().click()
  await expect(page.getByText('0.3.0-beta.1')).toBeVisible()
  await currentModal().locator('button').last().click()
  mark('ui-settings')

  await titlebar.locator('button').filter({ has: page.locator('svg.lucide-database') }).first().click()
  const kbSwitcherModal = currentModal()
  await expect(kbSwitcherModal).toBeVisible()
  await kbSwitcherModal.locator('input').first().fill(paths.kb2)
  await kbSwitcherModal.locator('div.border-t.pt-4 button').nth(1).click()
  await expect(kbSwitcherModal).toHaveCount(0, { timeout: 10_000 })
  await page.reload({ waitUntil: 'networkidle' })
  await treeButton('programming').click()
  await expect(browserShell.getByText('Gamma Python Tips')).toBeVisible({ timeout: 10_000 })
  mark('ui-kb-switch')

  await titlebar.locator('button').filter({ has: page.locator('svg.lucide-database') }).first().click()
  const unregisterModal = currentModal()
  await expect(unregisterModal).toBeVisible()
  const secondaryKbRow = unregisterModal.locator('div.group').filter({ hasText: paths.kb1 }).first()
  await expect(secondaryKbRow).toBeVisible({ timeout: 10_000 })
  await secondaryKbRow.hover()
  acceptNextDialog = true
  await secondaryKbRow.locator('button').last().click({ force: true })
  await expect(unregisterModal.locator('div.group').filter({ hasText: paths.kb1 })).toHaveCount(0, { timeout: 10_000 })
  if (acceptNextDialog || acceptedDialogs.length === 0) {
    throw new Error('Expected unregister KB flow to trigger and accept a confirmation dialog')
  }
  await unregisterModal.locator('button').filter({ has: page.locator('svg.lucide-x') }).first().click()
  await expect(unregisterModal).toHaveCount(0, { timeout: 10_000 })
  mark('ui-kb-unregister')

  if (dialogs.length > 0) {
    throw new Error(`Unexpected dialogs: ${dialogs.join(' | ')}`)
  }
  if (failedRequests.length > 0) {
    throw new Error(`Unexpected failed requests: ${JSON.stringify(failedRequests, null, 2)}`)
  }

  await browser.close()
}

async function runReadonlyFlow(webPort) {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  await page.goto(`http://127.0.0.1:${webPort}`, { waitUntil: 'networkidle' })
  await expect(page.locator('.knowledge-tree-shell')).toBeVisible()

  const treeNav = page.locator('.knowledge-tree-shell')
  const browserShell = page.locator('.directory-browser-shell')
  const treeButton = (text) => treeNav.locator('button').filter({ hasText: text }).first()
  const mark = (step) => console.log(`OK ${step}`)

  await expect(page.locator('button').filter({ has: page.locator('svg.lucide-plus') })).toHaveCount(0)
  await expect(page.locator('button').filter({ has: page.locator('svg.lucide-folder-input') })).toHaveCount(0)
  await expect(page.locator('.right-panel-rail button[data-label="Git"]')).toBeDisabled()

  await treeButton('programming').click()
  await browserShell.locator('button').filter({ hasText: 'Alpha Rust Patterns' }).first().click()
  await expect(page.getByText('Alpha Rust Patterns').first()).toBeVisible()
  await expect(page.getByRole('button', { name: 'Markdown' })).toHaveCount(0)
  mark('ui-readonly')

  await browser.close()
}

async function main() {
  const tempDir = mkdtempSync(join(tmpdir(), 'memoforge-http-ui-e2e-'))
  const paths = seedKnowledgeBase(tempDir)
  const env = makeTestEnv(tempDir)
  const httpPort = await findFreePort()
  const webPort = await findFreePort()

  let httpProcess
  let webProcess

  try {
    const [httpCommand, httpArgs] = getHttpServerCommand(paths, httpPort, webPort)
    httpProcess = startProcess(httpCommand, httpArgs, { cwd: REPO_ROOT, env })
    await waitForUrl(`http://127.0.0.1:${httpPort}/api/status`)

    webProcess = startProcess(resolveCommand('npm'), ['run', 'dev', '--', '--host', '127.0.0.1', '--port', String(webPort)], {
      cwd: FRONTEND_ROOT,
      env: {
        ...env,
        VITE_MEMOFORGE_API_BASE: `http://127.0.0.1:${httpPort}`,
      },
    })
    await waitForUrl(`http://127.0.0.1:${webPort}`)

    await runNormalFlow(paths, webPort)

    await terminateProcess(httpProcess)
    httpProcess = startProcess(httpCommand, [...httpArgs, '--readonly'], { cwd: REPO_ROOT, env })
    await waitForUrl(`http://127.0.0.1:${httpPort}/api/status`)
    await runReadonlyFlow(webPort)

    console.log(JSON.stringify({ status: 'ok', paths }, null, 2))
  } catch (error) {
    if (httpProcess) {
      console.error('[http]', httpProcess.command)
      console.error(httpProcess.output.join(''))
    }
    if (webProcess) {
      console.error('[web]', webProcess.command)
      console.error(webProcess.output.join(''))
    }
    throw error
  } finally {
    await terminateProcess(webProcess)
    await terminateProcess(httpProcess)
    rmSync(tempDir, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
