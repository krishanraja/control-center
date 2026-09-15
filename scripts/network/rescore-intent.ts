#!/usr/bin/env -S npx tsx
// Re-judge stored posts across the network, without scraping anyone again.
//
// Pages through /api/network/rescore-intent, which owns the Anthropic key. This
// exists because the classifier changed three times in a day while the scrapers
// hit hard limits mid-backfill, and the difference between those two facts
// mattering and not mattering is whether the posts were kept.
//
// Usage:
//   npx tsx scripts/network/rescore-intent.ts            # dry: what would change
//   npx tsx scripts/network/rescore-intent.ts --commit
//
// Env: CC_BASE_URL, ACCESS_CODE.

import { createHash } from 'node:crypto'

const BASE = (process.env.CC_BASE_URL || '').replace(/\/+$/, '')
const ACCESS_CODE = process.env.ACCESS_CODE || ''
if (!BASE) { console.error('CC_BASE_URL is required'); process.exit(1) }

const args = process.argv.slice(2)
const COMMIT = args.includes('--commit')
const batchArg = args.indexOf('--batch')
const BATCH = batchArg >= 0 ? Math.min(Number(args[batchArg + 1]) || 20, 40) : 20

interface Change { contact_id: string; from: string | null; to: string | null; score: number; quote: string }
interface Result {
  ok: boolean; examined: number; changed: number; unchanged: number; unjudged: number
  changes: Change[]; next_after_id: string | null; error?: string
}

async function main() {
  let after: string | null = null
  let examined = 0, changed = 0, unjudged = 0
  const moves = new Map<string, number>()

  for (;;) {
    const r = await fetch(`${BASE}/api/network/rescore-intent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: ACCESS_CODE ? `cc_access=${createHash('sha256').update(ACCESS_CODE).digest('hex')}` : '',
      },
      body: JSON.stringify({ limit: BATCH, dry: !COMMIT, after_id: after }),
    })
    const j = (await r.json()) as Result
    if (!j.ok) { console.error(j.error || `HTTP ${r.status}`); process.exit(1) }

    examined += j.examined
    changed += j.changed
    unjudged += j.unjudged
    for (const c of j.changes) {
      moves.set(`${c.from ?? 'none'} -> ${c.to ?? 'none'}`, (moves.get(`${c.from ?? 'none'} -> ${c.to ?? 'none'}`) || 0) + 1)
      console.log(`  ${(c.from ?? 'none').padEnd(11)} -> ${(c.to ?? 'none').padEnd(11)} ${String(c.score).padStart(3)}  "${c.quote}"`)
    }

    if (!j.next_after_id) break
    after = j.next_after_id
  }

  console.log(`\nexamined ${examined}  changed ${changed}  could not judge ${unjudged}`)
  for (const [move, n] of [...moves.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${move.padEnd(26)} ${n}`)
  }
  console.log(COMMIT ? '\nWritten.' : '\nDry run. Re-run with --commit to write.')
}

main().catch(e => { console.error(e); process.exit(1) })
