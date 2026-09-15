#!/usr/bin/env -S npx tsx
// Re-embed every contact whose retrieval text changed.
//
// This is the second half of the mechanism that makes enrichment reach search.
// The trigger (20260915140000) rebuilds intel_doc and sets embed_stale whenever
// a fact lands; this job turns those flags back off.
//
// ── Why a flag and not a nulled vector ──────────────────────────────────────
// Nulling the embedding at enrichment time would drop the person out of
// semantic recall for the whole window between enrichment and this job — making
// search WORSE at the exact moment the data got better. The stale vector still
// finds them on their old text, which is a degradation rather than a
// disappearance, and this job closes the gap.
//
// ── Why it is not part of the enrichment script ─────────────────────────────
// Embedding is a paid external call that can fail halfway. Coupling it to the
// identity write means one OpenAI outage costs the enrichment too. Same split
// as import-circle's --embed pass, for the same reason.
//
// Usage:
//   npx tsx scripts/network/reembed-stale.ts            # dry: how many, and what changed
//   npx tsx scripts/network/reembed-stale.ts --commit
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY. The OpenAI key is read from
// app_secrets by _embeddings.ts when it is not in the environment.

import { createClient } from '@supabase/supabase-js'
import { embedBatch, vectorLiteral } from '../../api/_embeddings'

const SUPA_URL = process.env.SUPABASE_URL
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPA_URL || !SUPA_KEY) { console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY'); process.exit(1) }
const sb = createClient(SUPA_URL, SUPA_KEY)

const COMMIT = process.argv.includes('--commit')
const limitArg = process.argv.indexOf('--limit')
const LIMIT = limitArg >= 0 ? Number(process.argv[limitArg + 1]) : Infinity

async function main() {
  const { count } = await sb.from('contact_intelligence')
    .select('contact_id', { count: 'exact', head: true }).eq('embed_stale', true)
  console.log(`stale embeddings: ${count ?? '?'}`)
  if (!count) { console.log('nothing to do.'); return }

  let done = 0, failed = 0
  for (;;) {
    if (done >= LIMIT) break
    const { data, error } = await sb.from('contact_intelligence')
      .select('contact_id, intel_doc').eq('embed_stale', true)
      .not('intel_doc', 'is', null).limit(128)
    if (error) throw new Error(error.message)
    if (!data?.length) break

    if (!COMMIT) {
      console.log('\nDRY RUN — sample of the text that would be re-indexed:')
      for (const r of (data as any[]).slice(0, 5)) {
        console.log(`  ${String(r.intel_doc).slice(0, 150)}…`)
      }
      console.log(`\n${count} rows would be embedded. Re-run with --commit.`)
      return
    }

    const vecs = await embedBatch((data as any[]).map(r => ({ title: r.intel_doc })))
    for (let i = 0; i < data.length; i++) {
      const v = vecs[i]
      if (!v) { failed++; continue }
      // embed_stale is cleared in the SAME write as the vector. Clearing it
      // separately would let a crash between the two leave a row claiming to be
      // fresh while carrying the old vector — the silent failure this whole
      // migration exists to remove.
      const { error: e } = await sb.from('contact_intelligence')
        .update({ embedding: vectorLiteral(v), embed_stale: false })
        .eq('contact_id', (data[i] as any).contact_id)
      if (e) throw new Error(`write failed: ${e.message}`)
      done++
    }
    console.log(`  embedded ${done}${failed ? `, ${failed} returned no vector` : ''}`)
  }

  if (failed) {
    console.log(`\n${failed} rows could not be embedded and remain flagged. They keep their`)
    console.log('old vector and are still findable; re-run to retry them.')
  }
  console.log(`\ndone: ${done} re-embedded.`)
}

main().catch(e => { console.error(e); process.exit(1) })
