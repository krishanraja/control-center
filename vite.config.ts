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
  resolve: {
    alias: {
      '@': '/src',
    },
  },
})
