#!/usr/bin/env -S npx tsx
// Split the retired north_star string into real goal rows.
//
// `system_config.north_star` held one string, last written 2026-04-14:
//
//   "$20K MRR within 60 days, 200+ leaders served by end of 2026,
//    Krish under 2 hours/day on ops, OS becomes licensable asset."
//
// That is four goals at three different altitudes in one field. It could not
// expire, because a string has no target date: "within 60 days" ran out on
// 2026-06-13 and Home kept rendering it as the mission into August.
//
// This proposes the durable clauses as OS-rung rows so they land in the ladder
// awaiting ratification, rather than silently activating goals nobody set. It
// deliberately does NOT invent a target date or a parent for the revenue
// clause; both are Krish's to set, and guessing them would be inventing a
// commitment. It is printed instead.
//
// Requires env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//
// Usage:
//   npx tsx scripts/backfill-north-star-goals.ts            # dry run (default)
//   npx tsx scripts/backfill-north-star-goals.ts --commit

import { createClient } from '@supabase/supabase-js'

const COMMIT = process.argv.includes('--commit')

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.')
  process.exit(1)
}
const supabase = createClient(url, key)

// status 'proposed' is the real vocabulary for "awaiting Krish". These show in
// the ladder and, since the goals_health fix, they accrue staleness like any
// other open item instead of silently reading as fresh forever.
const PROPOSED = [
  {
    id: 'goal:os:leaders-served',
    title: '200+ leaders served by end of 2026',
    note: 'Measurable and dated. Clean as written.',
  },
  {
    id: 'goal:os:ops-load',
    title: 'Krish under 2 hours/day on ops',
    note: 'A standing constraint, not a dated target. Correctly has no end date, which is why a uniform SMART rule would wrongly reject it.',
  },
  {
    id: 'goal:os:licensable',
    title: 'OS becomes a licensable asset',
    note: 'FAILS Measurable as written. There is no threshold that decides whether it happened. Expect the gate to ask for one.',
  },
]

const HELD_BACK = {
  clause: '$20K MRR within 60 days',
  horizon: 'mid_term',
  why: 'The 60 days ran from 2026-04-14 and expired 2026-06-13. Re-entering it needs a fresh target date and a parent OS goal. Both are yours to set, so this script will not guess them.',
}

async function main() {
  const { data: cfg } = await supabase
    .from('system_config').select('value, updated_at').eq('key', 'north_star').maybeSingle()

  console.log('Current north_star (%s):', (cfg as any)?.updated_at ?? 'never written')
  console.log('  ' + ((cfg as any)?.value ?? '(empty)') + '\n')

  const { data: existingOs } = await supabase
    .from('goals').select('id, title, status').eq('horizon', 'os')
  if ((existingOs || []).length > 0) {
    console.log('The OS rung already has rows. Not touching it:')
    for (const g of existingOs as any[]) console.log(`  ${g.status.padEnd(9)} ${g.title}`)
    console.log('\nNothing to do.')
    return
  }

  console.log(COMMIT ? 'Proposing as OS goals:' : 'Would propose as OS goals (dry run):')
  for (const p of PROPOSED) console.log(`  ${p.title}\n      ${p.note}`)

  console.log(`\nHeld back (${HELD_BACK.horizon}): ${HELD_BACK.clause}`)
  console.log(`  ${HELD_BACK.why}`)

  if (!COMMIT) {
    console.log('\nDry run. Re-run with --commit to write the OS rows.')
    return
  }

  const rows = PROPOSED.map((p, i) => ({
    id: p.id,
    title: p.title,
    horizon: 'os',
    status: 'proposed',
    priority: i + 1,
    parent_id: null,
    created_by: 'krish',
    source: 'krish_declared',
    why_now: 'Carried over from the retired north_star string (written 2026-04-14).',
  }))

  const { error } = await supabase.from('goals').insert(rows)
  if (error) { console.error('\nInsert failed: ' + error.message); process.exit(1) }
  console.log(`\nInserted ${rows.length} OS goals as 'proposed'. Ratify or reshape them in the ladder.`)
}

main().catch(e => { console.error(e); process.exit(1) })
