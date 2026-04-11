import React from 'react'
import ReactDOM from 'react-dom/client'
import { ForgeNerveLogo } from './components/ForgeNerveLogo'
import './landing.css'

const releaseUrl = 'https://github.com/chenpu17/memoforge/releases/tag/v0.1.0'
const releaseNotesUrl = 'https://github.com/chenpu17/memoforge/blob/main/RELEASE_NOTES.md'
const readmeUrl = 'https://github.com/chenpu17/memoforge#readme'

type DownloadCard = {
  title: string
  description: string
  assets: { name: string; url: string }[]
}

type McpConfigCard = {
  title: string
  targetFile: string
  snippet: string
}

const proofItems = [
  ['Tauri desktop app', 'Local workspace, welcome flow, dashboard, graph, editor, settings, and Git integration.'],
  ['SSE + stdio MCP', 'Desktop-embedded SSE plus CLI fallback for CI, remote, and bound knowledge-base workflows.'],
  ['Draft workflow', 'Structured, reviewable agent writes with preview, commit, discard, and conflict handling.'],
  ['Knowledge graph + retrieval', 'Graph exploration, search, backlinks, and knowledge navigation designed for context-heavy work.'],
  ['Git-native operations', 'Commit, pull, push, and repository-aware collaboration without inventing a new sync layer.'],
  ['Real desktop E2E coverage', 'Linux CI runs real Tauri desktop end-to-end checks across GUI, Tauri commands, and embedded MCP SSE.'],
]

const problemCards = [
  [
    'Context that agents can actually use',
    'Expose Markdown knowledge, summaries, graph relations, and current editor context through MCP instead of forcing brittle copy-paste workflows.',
  ],
  [
    'Safe writes instead of blind overwrites',
    'Use draft-based updates and desktop review to keep long-form knowledge changes understandable, recoverable, and human-approved.',
  ],
  [
    'Git-native collaboration',
    'Keep your knowledge in your repo, review changes with your existing habits, and let AI work inside your real workflow instead of around it.',
  ],
]

const downloadCards: DownloadCard[] = [
  {
    title: 'Windows',
    description: 'Recommended for most users. Choose the installer, MSI, or portable build directly from the official v0.1.0 release.',
    assets: [
      { name: 'ForgeNerve_0.1.0_x64-setup.exe', url: 'https://github.com/chenpu17/memoforge/releases/download/v0.1.0/ForgeNerve_0.1.0_x64-setup.exe' },
      { name: 'ForgeNerve_0.1.0_x64_en-US.msi', url: 'https://github.com/chenpu17/memoforge/releases/download/v0.1.0/ForgeNerve_0.1.0_x64_en-US.msi' },
      { name: 'ForgeNerve_x64_portable.exe', url: 'https://github.com/chenpu17/memoforge/releases/download/v0.1.0/ForgeNerve_x64_portable.exe' },
    ],
  },
  {
    title: 'macOS',
    description: 'Use the matching DMG for Apple Silicon or Intel. App tarballs are also published for advanced packaging workflows.',
    assets: [
      { name: 'ForgeNerve_0.1.0_aarch64.dmg', url: 'https://github.com/chenpu17/memoforge/releases/download/v0.1.0/ForgeNerve_0.1.0_aarch64.dmg' },
      { name: 'ForgeNerve_0.1.0_x64.dmg', url: 'https://github.com/chenpu17/memoforge/releases/download/v0.1.0/ForgeNerve_0.1.0_x64.dmg' },
    ],
  },
  {
    title: 'Linux + MCP CLI',
    description: 'Desktop bundles ship as AppImage / deb / rpm. MCP users can download the standalone memoforge binaries for all major targets.',
    assets: [
      { name: 'ForgeNerve_0.1.0_amd64.AppImage', url: 'https://github.com/chenpu17/memoforge/releases/download/v0.1.0/ForgeNerve_0.1.0_amd64.AppImage' },
      { name: 'memoforge-linux-x64', url: 'https://github.com/chenpu17/memoforge/releases/download/v0.1.0/memoforge-linux-x64' },
      { name: 'memoforge-darwin-arm64', url: 'https://github.com/chenpu17/memoforge/releases/download/v0.1.0/memoforge-darwin-arm64' },
      { name: 'memoforge-windows-x64.exe', url: 'https://github.com/chenpu17/memoforge/releases/download/v0.1.0/memoforge-windows-x64.exe' },
    ],
  },
]

const mcpConfigCards: McpConfigCard[] = [
  {
    title: 'Claude Code',
    targetFile: '~/.claude/mcp.json',
    snippet: `{
  "mcpServers": {
    "memoforge": {
      "type": "sse",
      "url": "http://127.0.0.1:31415/mcp"
    }
  }
}`,
  },
  {
    title: 'OpenCode',
    targetFile: '~/.config/opencode/opencode.json',
    snippet: `{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "memoforge": {
      "type": "remote",
      "url": "http://127.0.0.1:31415/mcp",
      "enabled": true
    }
  }
}`,
  },
]

const LandingPage = () => (
  <main className="landing-page">
    <div className="landing-shell">
      <header className="landing-nav">
        <div className="landing-brand">
          <ForgeNerveLogo size={30} withWordmark wordmarkClassName="landing-brand-text" />
        </div>
        <nav className="landing-nav-links" aria-label="Sections">
          <a href="#download">Download</a>
          <a href="#why">Why</a>
          <a href="#workflow">Workflow</a>
          <a href="#proof">Proof</a>
          <a href="#mcp">MCP</a>
        </nav>
      </header>

      <section className="landing-hero">
        <div className="landing-hero-copy">
          <div className="landing-eyebrow">Agent Knowledge OS for Developers</div>
          <div className="landing-hero-wordmark">
            <ForgeNerveLogo size={54} />
            <h1>ForgeNerve</h1>
          </div>
          <p className="landing-subtitle">The Git-native memory layer for AI agents.</p>
          <p className="landing-description">
            ForgeNerve is a Git-native workspace where humans and AI agents collaborate on knowledge safely —
            with MCP access, draft-based writing, desktop review, and local-first control.
          </p>
          <div className="landing-cta-row">
            <a className="landing-button primary" href={releaseUrl} target="_blank" rel="noreferrer">Download v0.1.0</a>
            <a className="landing-button secondary" href={releaseNotesUrl} target="_blank" rel="noreferrer">Read Release Notes</a>
            <a className="landing-button secondary" href="#mcp">Connect via MCP</a>
          </div>
          <div className="landing-chip-row" aria-label="Capabilities">
            <span>Local-first</span>
            <span>Git-native</span>
            <span>MCP-ready</span>
            <span>Reviewable agent writes</span>
          </div>
        </div>

        <section className="landing-panel" aria-labelledby="landing-panel-title">
          <div className="landing-panel-header">
            <div id="landing-panel-title" className="landing-panel-title">
              <ForgeNerveLogo size={20} withWordmark wordmarkClassName="landing-panel-title-text" />
            </div>
            <div className="landing-panel-meta">MCP connected</div>
          </div>

          <div className="landing-panel-body">
            <div className="landing-status">
              <span className="landing-status-dot" />
              <span>SSE MCP server running at `http://127.0.0.1:31415/mcp`</span>
            </div>

            <div className="landing-config-grid" id="mcp">
              {mcpConfigCards.map((card) => (
                <article key={card.title} className="landing-config-card">
                  <div className="landing-config-card-header">
                    <strong>{card.title}</strong>
                    <span>{card.targetFile}</span>
                  </div>
                  <pre className="landing-code">{card.snippet}</pre>
                </article>
              ))}
            </div>

            <div className="landing-step-list" id="workflow">
              <article className="landing-step">
                <strong>1. Connect your agent</strong>
                <span>Use Claude Code or OpenCode to attach ForgeNerve via MCP.</span>
              </article>
              <article className="landing-step">
                <strong>2. Let it draft changes</strong>
                <span>Ask the agent to read context, prepare structured draft updates, and avoid unsafe full rewrites.</span>
              </article>
              <article className="landing-step">
                <strong>3. Review and approve</strong>
                <span>Open the desktop app, inspect draft changes, then commit with full visibility and Git history.</span>
              </article>
            </div>
          </div>
        </section>
      </section>

      <section className="landing-section" id="download">
        <h2>Download ForgeNerve v0.1.0</h2>
        <p className="landing-section-lead">
          The first public ForgeNerve release is live. Use the official GitHub release page for the latest desktop bundles,
          portable executables, and standalone MCP binaries.
        </p>
        <div className="landing-grid landing-grid-3">
          {downloadCards.map((card) => (
            <article key={card.title} className="landing-card">
              <h3>{card.title}</h3>
              <p>{card.description}</p>
              <div className="landing-asset-list">
                {card.assets.map((asset) => (
                  <a key={asset.name} className="landing-asset-pill" href={asset.url} target="_blank" rel="noreferrer">
                    {asset.name}
                  </a>
                ))}
              </div>
              <div className="landing-card-actions">
                <a className="landing-button secondary" href={releaseUrl} target="_blank" rel="noreferrer">Open Release Assets</a>
              </div>
            </article>
          ))}
        </div>
        <div className="landing-callout">
          New here? Start with the desktop bundle for your platform. If you are wiring Claude Code or OpenCode into MCP,
          the release also ships standalone `memoforge-*` binaries and the desktop app exposes SSE at `http://127.0.0.1:31415/mcp`.
        </div>
      </section>

      <section className="landing-section" id="why">
        <h2>AI can write code fast. Knowledge is still the hard part.</h2>
        <p className="landing-section-lead">
          Most note tools were built for humans only. They don’t expose the right context to agents,
          they don’t support safe incremental writing, and they rarely provide a clean review path for AI-generated knowledge changes.
        </p>
        <div className="landing-grid landing-grid-3">
          {problemCards.map(([title, description]) => (
            <article key={title} className="landing-card">
              <h3>{title}</h3>
              <p>{description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-section" id="proof">
        <h2>What already exists</h2>
        <p className="landing-section-lead">
          ForgeNerve is not just a concept. The core product stack is already in place and continuously hardened
          through desktop and MCP end-to-end tests.
        </p>
        <div className="landing-grid landing-grid-2">
          {proofItems.map(([title, description]) => (
            <article key={title} className="landing-proof">
              <strong>{title}</strong>
              <span>{description}</span>
            </article>
          ))}
        </div>
        <div className="landing-callout">
          ForgeNerve is building a new category: not another note app, but the knowledge operating system behind AI-native developer workflows.
        </div>
      </section>

      <section className="landing-section">
        <h2>Built for developers, not generic note-taking</h2>
        <div className="landing-grid landing-grid-3">
          <article className="landing-card">
            <h3>Git-native storage</h3>
            <p>Keep knowledge in Markdown and Git, not in a black-box collaboration silo.</p>
          </article>
          <article className="landing-card">
            <h3>MCP-native integration</h3>
            <p>Connect real coding agents through a first-class protocol instead of ad hoc browser hacks.</p>
          </article>
          <article className="landing-card">
            <h3>Human-in-the-loop review</h3>
            <p>Let AI propose changes, then use the desktop app to inspect, approve, and ship with confidence.</p>
          </article>
        </div>
      </section>

      <footer className="landing-footer">
        <div>ForgeNerve — The Agent Knowledge OS for Developers</div>
        <div>
          Download the current release from{' '}
          <a href={releaseUrl} target="_blank" rel="noreferrer">GitHub Releases</a>
          {' '}or read the setup guide in the{' '}
          <a href={readmeUrl} target="_blank" rel="noreferrer">README</a>.
        </div>
      </footer>
    </div>
  </main>
)

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <LandingPage />
  </React.StrictMode>,
)
