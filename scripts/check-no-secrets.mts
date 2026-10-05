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
import { join, extname, sep } from 'node:path'

const ROOT = process.cwd()

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'coverage', '.vercel', '.next',
  'playwright-report', 'test-results', '.turbo',
  // Gitignored agent space. `.claude/worktrees/` holds whole checkouts of this
  // repo, so scanning it reports every finding once per worktree and, worse,
  // reports an agent's own scratch file as a committed secret. Nothing under
  // `.claude` can reach a commit, which is the only thing this guard is for.
  '.claude', '.scratch', '.steward',
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
    // Added 2026-09-07: GitHub's own push protection rejected the n8n parity
    // commit on these three while this checker passed it. A guard that is
    // weaker than the remote's is a guard that teaches false confidence.
    name: 'github-token',
    re: /gh[pousr]_[A-Za-z0-9]{30,}/g,
    why: 'a GitHub token. Move it to the environment and rotate it.',
  },
  {
    name: 'stripe-key',
    // Three things here, each learned on 2026-10-05.
    // The leading \b is gone: `sk_live_` is preceded by `_` or `-` as often as
    // by a boundary (`STRIPE_KEY=sk_live_...`), and `_` is a word character, so
    // the boundary never matched there. That is also why the backspace
    // corruption above went unnoticed for so long: the rule looked plausible.
    // `sk_org_live_` is named explicitly because the organisation key reads
    // EVERY account in the org, so it is the most valuable Stripe credential
    // there is and must not depend on a prefix match going the right way.
    // Test keys are included because a test key still names the account.
    re: /(?:sk_org_live|sk_live|rk_live|sk_test|rk_test)_[A-Za-z0-9]{20,}/g,
    why: 'a Stripe secret key. Move it to the environment and rotate it.',
  },
  {
    // Added 2026-10-05 while arming Stripe webhook verification. Every other
    // rule is about a key that MAKES requests, so none of them matched a
    // signing secret, which is the thing that stops someone forging an inbound
    // event into the revenue ledger. The gap was live: the n8n Stripe intake
    // reads its secrets from `system_config`, so arming it by pasting a whsec_
    // into a workflow snapshot or a runbook would have passed this guard.
    name: 'stripe-webhook-secret',
    re: /whsec_[A-Za-z0-9]{16,}/g,
    why: 'a Stripe webhook signing secret. Anyone holding it can forge events into the revenue ledger. Keep it in the environment or system_config, and rotate it.',
  },
  {
    name: 'resend-key',
    re: /re_[A-Za-z0-9]{8,}_[A-Za-z0-9]{20,}/g,
    why: 'a Resend API key. Move it to the environment and rotate it.',
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
  {
    // Added 2026-08-29. A live Telegram bot token sat in EIGHT workflow
    // snapshots and every rule above missed it, because a bot token looks
    // like nothing else here: digits, a colon, then base64ish. It reached the
    // repo because the n8n cloud editor writes the token straight into the
    // sendMessage URL, and export keeps it.
    name: 'telegram-bot-token',
    // Deliberately NO \b before the digits. The token appears as
    // `.../bot8761660894:AAGy...`, and `t` and `8` are both word characters,
    // so a leading \b never matches there. The first version of this rule had
    // one and silently caught nothing.
    re: /\d{8,12}:AA[A-Za-z0-9_-]{30,}/g,
    why: 'a Telegram bot token (it appears inside the api.telegram.org/bot<TOKEN>/ URL). Use {{TELEGRAM_BOT_TOKEN}} and inject at sync time — see scripts/n8n/secrets.mjs.',
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
    // Normalised to forward slashes. join() emits a backslash separator on
    // Windows, so the SELF comparison below silently never matched there.
    // Same class of bug as the one fixed in check-content-expiry.
    const rel = abs.slice(ROOT.length + 1).split(sep).join('/')
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
