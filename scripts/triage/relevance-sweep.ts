#!/usr/bin/env -S npx tsx
// Triage relevance sweep — CLI thin wrapper around the shared orchestrator at
// api/_relevance-surfaces.ts. Same flags, same behavior; one source of truth
// shared with POST /api/triage/relevance-sweep.
//
// Usage:
//   npx tsx scripts/triage/relevance-sweep.ts --table content_ideas [--dry] [--commit]
//                                              [--target 30] [--limit 5000]
//                                              [--relevance] [--no-relevance]
//                                              [--min-confidence 0.7]
//
// Default is --dry. Re-run with --commit to apply. Dedup is handled separately
// by scripts/dedup/backfill.ts; run that first so the sweep doesn't waste
// classifier calls on duplicates.

import { createClient } from '@supabase/supabase-js'
import { runRelevanceSweep, type TableName, SURFACES } from '../../api/_relevance-surfaces'

const SUPA_URL = process.env.SUPABASE_URL
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || ''
if (!SUPA_URL || !SUPA_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}
const sb = createClient(SUPA_URL, SUPA_KEY)

interface Args {
  table: TableName
  dry: boolean
  target: number
  limit: number
  relevance: boolean | null
  minConfidence: number
}

function parseArgs(): Args {
  const a = process.argv.slice(2)
  let table: TableName = 'content_ideas'
  let dry = true
  let target = 30
  let limit = 5000
  let relevance: boolean | null = null
  let minConfidence = 0.7
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--table' && a[i + 1]) table = a[++i] as TableName
    else if (a[i] === '--dry') dry = true
    else if (a[i] === '--commit') dry = false
    else if (a[i] === '--target' && a[i + 1]) target = parseInt(a[++i], 10) || 30
    else if (a[i] === '--limit' && a[i + 1]) limit = parseInt(a[++i], 10) || 5000
    else if (a[i] === '--relevance') relevance = true
    else if (a[i] === '--no-relevance') relevance = false
    else if (a[i] === '--min-confidence' && a[i + 1]) minConfidence = parseFloat(a[++i]) || 0.7
  }
  return { table, dry, target, limit, relevance, minConfidence }
}

async function run() {
  const args = parseArgs()
  if (!SURFACES[args.table]) { console.error(`Unknown table: ${args.table}`); process.exit(1) }
  console.log(`\n— Relevance sweep: ${args.table} ${args.dry ? '(dry run)' : '(COMMIT)'} · target ${args.target} —`)
  if (args.relevance ?? SURFACES[args.table].relevanceDefault) {
    if (!ANTHROPIC_KEY) console.log('ANTHROPIC_API_KEY not set — skipping relevance pass.')
  }

  const r = await runRelevanceSweep(sb, args, ANTHROPIC_KEY)

  console.log(`Loaded ${r.loaded} active triage rows.`)
  if (r.protected) console.log(`(${r.protected} are in-progress / Krish-authored / customers — protected, never auto-dropped.)`)
  if (r.relevance.ran) {
    console.log(`\nRelevance: ${r.relevance.off_vertical} off-vertical, ${r.relevance.too_technical} too-technical.`)
    const verts = Object.entries(r.relevance.by_vertical).sort((a, b) => b[1] - a[1])
    if (verts.length) console.log(`  by vertical: ${verts.map(([k, v]) => `${k}=${v}`).join(', ')}`)
  }
  console.log(`Trim: ${r.trim} lowest-scoring cards.`)
  console.log(`Total to drop: ${r.total_dropped}.  Deck after sweep: ${r.remaining} (target ${r.target}).`)
  if (r.remaining > r.target && r.protected > 0) {
    console.log(`Note: still above target because ${r.protected} protected rows can't be auto-dropped.`)
  }
  console.log('')
  for (const s of r.sample) {
    console.log(`  drop [${s.reason_code}] ${s.title}  — ${s.rationale}`)
  }
  if (r.total_dropped > r.sample.length) console.log(`  …and ${r.total_dropped - r.sample.length} more.`)

  if (args.dry) { console.log(`\nDry run. Re-run with --commit to apply.\n`); return }
  if (!r.total_dropped) { console.log(`\nNothing to drop. Done.\n`); return }
  console.log(`\nDropped ${r.total_dropped} rows and wrote ${r.feedback_inserted} feedback votes. Vera will cluster these on its next run. Done.\n`)
}

run().catch(e => { console.error(e); process.exit(1) })
