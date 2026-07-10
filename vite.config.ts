import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'node:child_process'

function buildSha(): string {
  if (process.env.VERCEL_GIT_COMMIT_SHA) return process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 12)
  if (process.env.VITE_BUILD_SHA) return process.env.VITE_BUILD_SHA
  try {
    return execSync('git rev-parse --short=12 HEAD').toString().trim()
  } catch {
    return 'unknown'
  }
}

const sha = buildSha()
const ts = new Date().toISOString()

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'inject-build-sha',
      transformIndexHtml(html: string) {
        return html.replace(
          /<head>/,
          `<head>
    <meta name=\"build-sha\" content=\"${sha}\" />
    <meta name=\"build-time\" content=\"${ts}\" />`
        )
      },
    },
  ],
  define: {
    __BUILD_SHA__: JSON.stringify(sha),
    __BUILD_TIME__: JSON.stringify(ts),
  },
  build: {
    rollupOptions: {
      output: {
        // Split the heavy, rarely-changing vendors into their own long-cache
        // chunks so app edits never re-download React/Supabase/icons, and so the
        // initial payload is a set of parallel, cacheable files rather than one
        // monolith. App routes are additionally code-split via React.lazy.
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return
          // TipTap ships as @tiptap/react + prosemirror-* and would otherwise be
          // captured by the '/react/' rule below, interleaving editor code into
          // the core React chunk (broken init order, prod-only white screen).
          if (id.includes('@tiptap') || id.includes('tiptap-markdown') || id.includes('prosemirror')) return 'tiptap'
          if (id.includes('react-dom') || id.includes('scheduler')) return 'react-dom'
          if (id.includes('/react/') || id.includes('react/jsx-runtime')) return 'react'
          if (id.includes('@supabase')) return 'supabase'
          if (id.includes('lucide-react')) return 'icons'
          if (id.includes('@radix-ui')) return 'radix'
          if (id.includes('date-fns')) return 'date-fns'
          if (id.includes('cmdk')) return 'cmdk'
          return 'vendor'
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': '/src',
    },
  },
})
