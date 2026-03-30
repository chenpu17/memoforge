import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
  },
  envPrefix: ['VITE_', 'TAURI_'],
  build: {
    target: ['es2021', 'chrome100', 'safari13'],
    minify: !process.env.TAURI_DEBUG ? 'esbuild' : false,
    sourcemap: !!process.env.TAURI_DEBUG,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) {
            return
          }

          if (id.includes('reactflow')) {
            return 'vendor-reactflow'
          }

          if (
            id.includes('@tiptap/react') ||
            id.includes('@floating-ui') ||
            id.includes('@tiptap/extension-bubble-menu') ||
            id.includes('@tiptap/extension-') ||
            id.includes('@tiptap/starter-kit') ||
            id.includes('@tiptap/markdown')
          ) {
            return 'vendor-tiptap-ui'
          }

          if (id.includes('@tiptap/pm')) {
            return 'vendor-tiptap-pm'
          }

          if (id.includes('@tiptap/core')) {
            return 'vendor-tiptap-core'
          }

          if (id.includes('@codemirror/lang-')) {
            return 'vendor-codemirror-lang'
          }

          if (
            id.includes('@codemirror/autocomplete') ||
            id.includes('@codemirror/commands') ||
            id.includes('@codemirror/language') ||
            id.includes('@codemirror/search')
          ) {
            return 'vendor-codemirror-tools'
          }

          if (
            id.includes('@codemirror/view') ||
            id.includes('@codemirror/state') ||
            id.includes('@codemirror')
          ) {
            return 'vendor-codemirror-core'
          }

          if (
            id.includes('react-markdown') ||
            id.includes('remark-') ||
            id.includes('rehype-') ||
            id.includes('micromark') ||
            id.includes('mdast') ||
            id.includes('unist') ||
            id.includes('hast')
          ) {
            return 'vendor-markdown'
          }

          if (id.includes('react-syntax-highlighter') || id.includes('refractor') || id.includes('prismjs')) {
            return 'vendor-syntax'
          }

          if (id.includes('lucide-react')) {
            return 'vendor-icons'
          }
        },
      },
    },
  },
})
