#!/usr/bin/env node
/**
 * The same secret patterns as scripts/check-no-secrets.mts, run against the
 * LIVE n8n workflows instead of the repo mirrors.
 *
 * Why this exists. check-no-secrets proves this repository is clean, and it
 * does that well: the mirrors carry {{PLACEHOLDER}} tokens and sync injects the
 * real values. But that is exactly what made the cloud side invisible. On
 * 2026-09-14, while repairing the Anthropic fallbacks, seven live nodes turned
 * out to be carrying real keys as header literals: a live Anthropic API key in
 * Nova's Podchaser filter, and service_role JWTs plus another Anthropic key
 * across five nodes of Acquisition Reply Intake. Every one of them showed as a
 * clean {{PLACEHOLDER}} in git. CI was green and had been for months.
 *
 * A guard that can only see the repo says nothing about what is running. This
 * one reads the runtime.
 *
 * It is NOT a CI step: it needs N8N_API_KEY, and CI has no business holding a
 * key that can read every credential-bearing workflow in the account. Run it
 * the way audit.sh is run, from an operator shell:
 *
 *   N8N_API_KEY=... node scripts/n8n/scan-live-secrets.mjs
 *   N8N_API_KEY=... node scripts/n8n/scan-live-secrets.mjs --json
 *
 * Exit code 1 means at least one live workflow carries a secret literal.
 *
 * What it cannot tell you: whether a key it finds has already been rotated.
 * A finding means the value is sitting in the workflow JSON, readable by
 * anything that can read the workflow. Move it to a credential AND rotate it;
 * moving alone leaves the old value in the version history.
 */

const BASE = process.env.N8N_BASE_URL || 'https://krishraja10101.app.n8n.cloud'
const KEY = process.env.N8N_API_KEY
const AS_JSON = process.argv.includes('--json')

if (!KEY) {
  console.error('N8N_API_KEY is required. This reads live workflows, so run it from an operator shell, not CI.')
  process.exit(2)
}

/** Kept deliberately in step with scripts/check-no-secrets.mts. If a rule is
 *  added there because something slipped through, add it here too: the two
 *  halves of the same question are worth asking with the same vocabulary. */
const RULES = [
  { name: 'jwt', re: /eyJhbGciOi[A-Za-z0-9_.-]{20,}/g, why: 'a JWT (Supabase anon/service_role keys are JWTs)' },
  { name: 'openai-key', re: /\bsk-(?:proj-)?[A-Za-z0-9]{32,}/g, why: 'an OpenAI-style secret key' },
  { name: 'anthropic-key', re: /\bsk-ant-[A-Za-z0-9_-]{20,}/g, why: 'an Anthropic API key' },
  { name: 'github-token', re: /gh[pousr]_[A-Za-z0-9]{30,}/g, why: 'a GitHub token' },
  { name: 'stripe-key', re: /(?:sk|rk)_live_[A-Za-z0-9]{20,}/g, why: 'a LIVE Stripe key' },
  { name: 'resend-key', re: /re_[A-Za-z0-9]{8,}_[A-Za-z0-9]{20,}/g, why: 'a Resend API key' },
  { name: 'google-key', re: /\bAIza[A-Za-z0-9_-]{30,}/g, why: 'a Google API key' },
  { name: 'private-key-block', re: /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/g, why: 'a private key block' },
  { name: 'telegram-bot-token', re: /\d{8,12}:AA[A-Za-z0-9_-]{30,}/g, why: 'a Telegram bot token' },
  // Not in the repo checker, because the repo has no reason to carry an OAuth
  // client secret inline. A live workflow does: Podchaser's token mint puts
  // client_secret straight in the GraphQL body, where no credential can hold it.
  { name: 'inline-client-secret', re: /client_secret[^A-Za-z0-9]{1,6}[A-Za-z0-9_-]{16,}/g, why: 'an OAuth client secret inline in a request body' },
]

async function api(path) {
  const r = await fetch(BASE + '/api/v1' + path, { headers: { 'X-N8N-API-KEY': KEY, Accept: 'application/json' } })
  if (!r.ok) throw new Error(`${path} -> HTTP ${r.status}`)
  return r.json()
}

async function allWorkflows() {
  const out = []
  let cursor = null
  do {
    const page = await api(`/workflows?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`)
    out.push(...(page.data || []))
    cursor = page.nextCursor || null
  } while (cursor)
  return out
}

/** Redacted so the scanner's own output is not a second copy of the leak. */
const mask = v => (v.length <= 12 ? '***' : `${v.slice(0, 6)}…${v.slice(-4)} (${v.length} chars)`)

const findings = []
for (const wf of await allWorkflows()) {
  for (const node of wf.nodes || []) {
    // Credential REFERENCES are the fix, not the problem: they are ids and
    // names, never secret material. Only the node's own parameters are scanned.
    const text = JSON.stringify(node.parameters || {})
    for (const rule of RULES) {
      rule.re.lastIndex = 0
      for (const m of text.matchAll(rule.re)) {
        findings.push({
          workflow: wf.name,
          workflowId: wf.id,
          active: wf.active === true,
          node: node.name,
          rule: rule.name,
          why: rule.why,
          sample: mask(m[0]),
        })
      }
    }
  }
}

if (AS_JSON) {
  console.log(JSON.stringify(findings, null, 2))
} else if (findings.length === 0) {
  console.log('PASS  no live workflow carries a secret literal in its node parameters')
} else {
  console.error(`FAIL: ${findings.length} secret literal(s) in live workflow parameters.\n`)
  const byWorkflow = new Map()
  for (const f of findings) {
    const k = `${f.workflow} (${f.workflowId})${f.active ? '' : ' [inactive]'}`
    if (!byWorkflow.has(k)) byWorkflow.set(k, [])
    byWorkflow.get(k).push(f)
  }
  for (const [wf, list] of byWorkflow) {
    console.error(`  ${wf}`)
    for (const f of list) console.error(`    ${f.node}: ${f.why} — ${f.sample}`)
  }
  console.error('\nMove each onto an n8n credential AND rotate the value: moving alone leaves it in the version history.')
}

process.exit(findings.length ? 1 : 0)
