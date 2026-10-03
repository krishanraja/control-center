#!/usr/bin/env -S npx tsx
// Backfill the relationship sync: call /api/relationships/sync until every
// connected account has caught up to today.
//
// Each call advances each account through as many weeks of mail and calendar
// as fit in one function run, saving its position, so this just repeats it.
// Three years of history for three accounts is a few dozen calls.
//
// Usage:
//   npx tsx scripts/network/sync-relationships.ts                 # every account
//   npx tsx scripts/network/sync-relationships.ts --account krish@mindmake.co
//
// Env: CC_BASE_URL, ACCESS_CODE.

import { createHash } from 'node:crypto'

const BASE = (process.env.CC_BASE_URL || '').replace(/\/+$/, '')
const CODE = process.env.ACCESS_CODE || ''
if (!BASE || !CODE) { console.error('Missing CC_BASE_URL / ACCESS_CODE'); process.exit(1) }
const cookie = `cc_access=${createHash('sha256').update(CODE).digest('hex')}`
const acctArg = process.argv.indexOf('--account')
const account = acctArg >= 0 ? process.argv[acctArg + 1] : ''

async function main() {
  for (let round = 1; round <= 200; round++) {
    const r = await fetch(`${BASE}/api/relationships/sync${account ? `?account=${encodeURIComponent(account)}` : ''}`, {
      method: 'POST', headers: { Cookie: cookie },
    })
    const j: any = await r.json().catch(() => ({ ok: false, error: `HTTP ${r.status}` }))
    if (!j.ok) { console.error(`round ${round}: ${j.error || r.status}`); process.exit(1) }
    for (const x of j.results || []) {
      const m = x.mail ? `mail ${x.mail.to.slice(0, 10)} (+${x.mail.messages} msgs, ${x.mail.people} people)` : 'mail -'
      const c = x.calendar ? `calendar ${x.calendar.to.slice(0, 10)} (+${x.calendar.events} events)` : 'calendar -'
      console.log(`round ${round}  ${x.account.padEnd(24)} ${m}  ${c}${x.error ? `  ! ${x.error}` : ''}`)
    }
    console.log(`  contacts updated: ${j.contacts_updated ?? '?'}`)
    if (j.caughtUp) { console.log('\nAll accounts caught up.'); return }
    // An account that could not even start (no token) will not recover by
    // repeating the call, so stop once everything else has caught up.
    const results: any[] = j.results || []
    const still = (s?: { from: string; to: string }) => !s || s.from === s.to
    const stuck = results.filter(x => x.error && !x.caughtUp && still(x.mail) && still(x.calendar))
    if (stuck.length && results.every(x => x.caughtUp || stuck.includes(x))) {
      console.error(`\nCaught up except: ${stuck.map(x => `${x.account} (${x.error})`).join('; ')}`)
      process.exit(1)
    }
  }
}

main().catch(e => { console.error(e); process.exit(1) })
