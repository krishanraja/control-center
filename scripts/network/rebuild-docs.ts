#!/usr/bin/env -S npx tsx
// Rebuild the retrieval text after the doc composition changes.
//
// intel_doc is composed by a trigger (ci_rebuild_doc_and_score), so the way to
// rebuild it is to touch a column the trigger watches and let it recompose. The
// composition has changed three times in a day — headline and summary arriving,
// the intent line arriving, then both being length-capped — and each time every
// existing row kept a doc built by the previous version.
//
// It covers EVERY row, not only those with a summary (20260927160000). The
// composition now changes for people nobody enriched too (the judgment and the
// placeholders left the index), and a rebuild that skipped them would leave
// 9,000 docs on the old text. That migration rebuilds all of them itself, as
// postgres; this script is for the next composition change.
//
// ── Why the cap exists, since this job is how it gets applied ──────────────
// Enrichment put the whole LinkedIn "about" blob into the doc: summary averaged
// 893 characters and ran to 2,000, so enriched docs averaged 1,488 against 423
// for unenriched. ts_rank_cd walks lexeme positions, so the lexical recall path
// alone measured 3.49s over the 3,540 rows a normal question matches, and the
// Network tab returned "canceling statement due to statement timeout" on a real
// search. The full text still lives in the summary column for the sheet and the
// judgment model; only what is worth MATCHING goes in the index.
//
// Batched with a cursor rather than one statement: a single UPDATE over the
// whole table runs the trigger 12,000 times inside one transaction and blows
// through the statement timeout, which is the failure this is fixing.
//
// Usage:
//   npx tsx scripts/network/rebuild-docs.ts            # dry: how many and how long
//   npx tsx scripts/network/rebuild-docs.ts --commit
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.

import { createClient } from '@supabase/supabase-js'

const SUPA_URL = process.env.SUPABASE_URL
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPA_URL || !SUPA_KEY) { console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY'); process.exit(1) }
const sb = createClient(SUPA_URL, SUPA_KEY)

const COMMIT = process.argv.includes('--commit')
const BATCH = 200

interface Row { contact_id: string; name_quality: string; intel_doc: string | null }

async function main() {
  let after = ''
  let touched = 0
  let rebuilt = 0
  let before = 0
  let longest = 0

  for (;;) {
    let q = sb
      .from('contact_intelligence')
      .select('contact_id, name_quality, intel_doc')
      .order('contact_id', { ascending: true })
      .limit(BATCH)
    if (after) q = q.gt('contact_id', after)

    const { data, error } = await q
    if (error) throw new Error(error.message)
    const rows = (data || []) as Row[]
    if (!rows.length) break
    after = rows[rows.length - 1].contact_id

    for (const r of rows) {
      const len = (r.intel_doc || '').length
      before += len
      if (len > longest) longest = len
      touched++
      if (!COMMIT) continue
      // Writing name_quality back unchanged is what fires the trigger: it is
      // watched, NOT NULL, and present on every row, which summary is not. The
      // value is identical; the recomposition is the point.
      const { error: uerr } = await sb
        .from('contact_intelligence')
        .update({ name_quality: r.name_quality })
        .eq('contact_id', r.contact_id)
      if (uerr) throw new Error(`${r.contact_id}: ${uerr.message}`)
      rebuilt++
    }
    process.stdout.write(`\r  ${touched} examined, ${rebuilt} rebuilt`)
  }

  console.log(`\n\n${touched} rows examined. Average doc before: ${Math.round(before / Math.max(touched, 1))} chars, longest ${longest}.`)
  if (!COMMIT) { console.log('\nDry run. Re-run with --commit to rebuild.'); return }

  const { count } = await sb
    .from('contact_intelligence')
    .select('contact_id', { count: 'exact', head: true })
    .eq('embed_stale', true)
  console.log(`${rebuilt} rebuilt. ${count ?? '?'} rows now need re-embedding — run scripts/network/reembed-stale.ts --commit.`)
}

main().catch(e => { console.error(e); process.exit(1) })
