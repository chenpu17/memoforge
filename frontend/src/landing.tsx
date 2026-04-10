import React from 'react'
import ReactDOM from 'react-dom/client'
import { ForgeNerveLogo } from './components/ForgeNerveLogo'
import './landing.css'

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

const LandingPage = () => (
  <main className="landing-page">
    <div className="landing-shell">
      <header className="landing-nav">
        <div className="landing-brand">
          <ForgeNerveLogo size={30} withWordmark wordmarkClassName="landing-brand-text" />
        </div>
        <nav className="landing-nav-links" aria-label="Sections">
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
            <a className="landing-button primary" href="#workflow">Get Started</a>
            <a className="landing-button secondary" href="#proof">View Product Proof</a>
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

            <pre className="landing-code" id="mcp">{`{
  "mcpServers": {
    "memoforge": {
      "type": "sse",
      "url": "http://127.0.0.1:31415/mcp"
    }
  }
}`}</pre>

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
        <div>This page is a production-ready landing entry for branding, launch previews, and future website hosting.</div>
      </footer>
    </div>
  </main>
)

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <LandingPage />
  </React.StrictMode>,
)
