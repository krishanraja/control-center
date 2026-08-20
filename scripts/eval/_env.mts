// Load .env.production.local / .env.local into process.env, same as
// scripts/run-endpoint.mts. Kept as its own module so an eval run and a
// one-shot endpoint run read credentials the same way.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

export function loadEnv(): void {
  for (const file of ['.env.production.local', '.env.local']) {
    try {
      const raw = readFileSync(resolve(process.cwd(), file), 'utf8')
      for (const line of raw.split('\n')) {
        const m = /^([A-Z0-9_]+)="?(.*?)"?$/.exec(line.trim())
        if (!m) continue
        if (m[2] === '[SENSITIVE]') continue
        if (process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/\\n/g, '\n')
      }
    } catch { /* file may not exist */ }
  }
}

/** Names of env vars a run needs, so it fails with a list rather than a stack. */
export function requireEnv(names: string[]): void {
  const missing = names.filter(n => !process.env[n])
  if (missing.length) {
    throw new Error(`missing env: ${missing.join(', ')}. Run \`vercel env pull\` or export them.`)
  }
}
