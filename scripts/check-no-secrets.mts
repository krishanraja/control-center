/**
 * No credentials in the repository.
 *
 * Ten workflow mirrors carried the live Supabase service-role key in
 * plaintext. That key bypasses RLS on every table, including
 * contact_intelligence, whose column comment says its private assessments of
 * named people must never reach anything but the service role. It had been
 * committed for months.
 *
 * This guard exists because scrubbing is a one-time fix and pasting is a
 * recurring habit: the workflow editor exports credentials inline, so the next
 * export re-adds them unless something fails the build. scripts/n8n/secrets.mjs
 * is the supported path — placeholders in the file, real values injected at
 * sync time.
 *
 * Note on history: git retains what was committed, so a scrub plus this guard
 * stops the bleeding but does not un-publish the key. Rotation is the only
 * thing that does.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, extname } from 'node:path'

const ROOT = process.cwd()

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'coverage', '.vercel', '.next',
  'playwright-report', 'test-results', '.turbo',
])

/** Files whose whole job is to describe these patterns. */
const SELF = new Set([
  'scripts/check-no-secrets.mts',
  'scripts/n8n/secrets.mjs',
])

interface Rule {
  name: string
  /** Global so every hit in a file is reported, not just the first. */
  re: RegExp
  why: string
}

const RULES: Rule[] = [
  {
    name: 'jwt',
    // A JWT header is base64 of {"alg":..., which always begins eyJhbGciOi.
    // Anything matching this in a repo file is a token somebody pasted.
    re: /eyJhbGciOi[A-Za-z0-9_.-]{20,}/g,
    why: 'a JWT (Supabase anon/service_role keys are JWTs). Use a {{PLACEHOLDER}} and inject at sync time — see scripts/n8n/secrets.mjs.',
  },
  {
    name: 'openai-key',
    re: /\bsk-(?:proj-)?[A-Za-z0-9]{32,}/g,
    why: 'an OpenAI-style secret key. Move it to the environment.',
  },
  {
    name: 'anthropic-key',
    re: /\bsk-ant-[A-Za-z0-9_-]{20,}/g,
    why: 'an Anthropic API key. Move it to the environment.',
  },
  {
    name: 'google-key',
    re: /\bAIza[A-Za-z0-9_-]{30,}/g,
    why: 'a Google API key. Move it to the environment.',
  },
  {
    name: 'private-key-block',
    re: /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/g,
    why: 'a private key block. Move it to the environment.',
  },
]

// Binary and lockfile noise: nothing here is hand-edited, and a lockfile hash
// can trip a loose pattern.
const SKIP_EXT = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.pdf', '.woff', '.woff2',
  '.ttf', '.otf', '.mp4', '.mov', '.zip', '.gz',
])
const SKIP_FILES = new Set(['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock'])

const findings: string[] = []

function scan(dir: string): void {
  for (const entry of readdirSync(dir)) {
    const abs = join(dir, entry)
    const rel = abs.slice(ROOT.length + 1)
    let st
    try { st = statSync(abs) } catch { continue }

    if (st.isDirectory()) {
      if (SKIP_DIRS.has(entry)) continue
      scan(abs)
      continue
    }
    if (SKIP_FILES.has(entry) || SKIP_EXT.has(extname(entry))) continue
    if (SELF.has(rel)) continue
    // Local env files are gitignored; scanning them only produces noise a
    // developer cannot action from CI.
    if (entry.startsWith('.env')) continue
    if (st.size > 4_000_000) continue

    let text: string
    try { text = readFileSync(abs, 'utf8') } catch { continue }

    for (const rule of RULES) {
      rule.re.lastIndex = 0
      let m: RegExpExecArray | null
      while ((m = rule.re.exec(text)) !== null) {
        const line = text.slice(0, m.index).split('\n').length
        // The match itself is NEVER printed. A guard that echoes the secret
        // into CI logs has moved it somewhere new rather than removed it.
        findings.push(`${rel}:${line} — ${rule.why}`)
      }
    }
  }
}

scan(ROOT)

if (findings.length) {
  console.error(`FAIL: ${findings.length} credential-shaped string(s) committed.\n`)
  for (const f of findings) console.error(`  ${f}`)
  console.error('\nThe value is deliberately not printed. Remove it from the file, then')
  console.error('rotate it: git history keeps whatever was committed.')
  process.exit(1)
}

console.log('PASS  no credential-shaped strings committed')
