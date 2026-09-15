#!/usr/bin/env -S npx tsx
// Drive /api/network/repair-names in batches until the backlog is clear.
//
// 1,882 contacts are a first name with no surname — unreadable in the Network
// tab and unmatchable by every enrichment vendor, because a person API needs a
// surname. 1,422 of them have an email address, and the surname is sitting in
// the From header of their own mail.
//
// This costs nothing but Gmail API quota. It runs BEFORE any paid enrichment
// because it decides who is even eligible for it: a vendor cannot resolve
// "Bill", and can resolve "Bill Kerr".
//
// Usage:
//   npx tsx scripts/network/repair-names.ts                  # dry, 50
//   npx tsx scripts/network/repair-names.ts --limit 200      # dry, 200
//   npx tsx scripts/network/repair-names.ts --limit 200 --commit
//   npx tsx scripts/network/repair-names.ts --all --commit   # page to exhaustion
//
// Env: CC_BASE_URL, ACCESS_CODE.

import { createHash } from 'node:crypto'

const BASE = (process.env.CC_BASE_URL || '').replace(/\/+$/, '')
const ACCESS_CODE = process.env.ACCESS_CODE || ''
if (!BASE) { console.error('CC_BASE_URL is required'); process.exit(1) }

const args = process.argv.slice(2)
const COMMIT = args.includes('--commit')
const ALL = args.includes('--all')
const limitArg = args.indexOf('--limit')
const LIMIT = Math.min(limitArg >= 0 ? Number(args[limitArg + 1]) : 50, 200)

function cookie(): string {
  return ACCESS_CODE ? `cc_access=${createHash('sha256').update(ACCESS_CODE).digest('hex')}` : ''
}

async function batch(afterId: string | null) {
  const r = await fetch(`${BASE}/api/network/repair-names`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie() },
    body: JSON.stringify({ limit: LIMIT, dry: !COMMIT, after_id: afterId }),
  })
  const j: any = await r.json().catch(() => null)
  if (!r.ok || !j?.ok) throw new Error(`HTTP ${r.status}: ${j?.error || 'unknown'}`)
  return j
}

async function main() {
  console.log(COMMIT ? 'COMMIT — names will be written.' : 'DRY RUN — nothing written.\n')
  let examined = 0, repaired = 0
  const skipped: Record<string, number> = {}

  let cursor: string | null = null
  for (let round = 1; ; round++) {
    const j = await batch(cursor)
    cursor = j.next_after_id ?? null
    examined += j.examined
    repaired += j.repaired
    for (const [k, v] of Object.entries(j.skipped || {})) skipped[k] = (skipped[k] || 0) + (v as number)

    console.log(`round ${round}: examined ${j.examined}, repaired ${j.repaired}`)
    for (const s of (j.sample || []).slice(0, 8)) console.log(`   ${s.from}  →  ${s.to}`)

    // Stop only when the BACKLOG is exhausted, never when a batch merely
    // repaired nothing. Those are different facts: a run of people with no mail
    // on file returns zero and the next page is still full of candidates.
    if (!ALL || !cursor) break
  }

  console.log(`\nexamined ${examined}, repaired ${repaired}`)
  console.log('not repaired:', skipped)
  console.log(`\n"no_messages" means no mail from that address — a vendor cannot fix those either.`)
  console.log(`"no_display_name" means the mail exists but the sender never set a name.`)
  if (!COMMIT) console.log('\nRe-run with --commit once the names above look right.')
}

main().catch(e => { console.error(e); process.exit(1) })
