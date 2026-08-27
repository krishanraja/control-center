// Register consolidation (backfill follow-up): merge near-duplicate shifts so
// one movement is ONE durable object whose momentum history spans months,
// instead of a fresh row per detection wording.
//
// Deterministic clustering (embedding cosine >= 0.80 OR title Jaccard >= 0.5,
// single-link union-find), then per cluster: the member with the most evidence
// becomes canonical; the others' evidence rows and momentum-history entries
// fold in (deduped by week label, keeping the higher momentum for a collided
// week); first_seen_on takes the earliest; provenance goes 'mixed' when lived
// and reconstructed meet. Merged rows are deleted; totals refreshed.
//
// Usage: npx tsx scripts/consolidate-shifts.ts [--dry]

import { titleJaccard } from '../api/_trendGate.js'
import { SYNTHESIS_MODEL } from '../api/_models.js'

const DRY = process.argv.includes('--dry')
// Above AUTO, wording variants of one movement merge without asking; the
// 0.68..0.84 band is genuinely ambiguous (measured on the live register:
// true month-variants sit at 0.70-0.83 alongside true neighbours), so a
// Sonnet judge rules same-or-different per candidate pair.
const COSINE_AUTO = 0.84
const COSINE_CANDIDATE = 0.68
const JACCARD_FLOOR = 0.55

function parseVec(v: unknown): number[] | null {
  if (Array.isArray(v)) return v as number[]
  if (typeof v === 'string') { try { return JSON.parse(v) } catch { return null } }
  return null
}

async function main() {
  const { supabase } = await import('../api/_supabase.js')
  const { cosine } = await import('../api/_embeddings.js')

  const { data, error } = await supabase.from('shifts').select('*').neq('status', 'retired')
  if (error) throw new Error(error.message)
  const shifts = data || []
  console.log(`register: ${shifts.length} shifts`)

  // Union-find over similarity.
  const parent = new Map<string, string>()
  const find = (x: string): string => { let c = x; while (parent.get(c) && parent.get(c) !== c) c = parent.get(c)!; return c }
  const union = (a: string, b: string) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb) }
  for (const s of shifts) parent.set(s.id, s.id)

  const candidates: Array<{ a: typeof shifts[0]; b: typeof shifts[0]; cos: number }> = []
  for (let i = 0; i < shifts.length; i++) {
    const vi = parseVec(shifts[i].embedding)
    for (let j = i + 1; j < shifts.length; j++) {
      const vj = parseVec(shifts[j].embedding)
      const cos = vi && vj ? cosine(vi, vj) : 0
      const jac = titleJaccard(shifts[i].title, shifts[j].title)
      if (cos >= COSINE_AUTO || jac >= JACCARD_FLOOR) union(shifts[i].id, shifts[j].id)
      else if (cos >= COSINE_CANDIDATE) candidates.push({ a: shifts[i], b: shifts[j], cos })
    }
  }

  // Sonnet adjudicates the ambiguous band, pair by pair, in one batched call.
  if (candidates.length) {
    const { callClaude, robustJson } = await import('../api/_content.js')
    console.log(`adjudicating ${candidates.length} candidate pairs...`)
    const pairs = candidates.map((c, i) => ({
      id: i,
      one: { title: c.a.title, summary: c.a.summary },
      two: { title: c.b.title, summary: c.b.summary },
    }))
    const raw = await callClaude({
      model: SYNTHESIS_MODEL,
      maxTokens: 2500,
      temperature: 0,
      system: [
        'You maintain a register of STRUCTURAL SHIFTS in the AI-for-business world. Each shift is one durable movement tracked over months.',
        'For each pair below, decide if the two entries describe the SAME underlying movement (one would track them as a single trajectory) or genuinely DIFFERENT movements.',
        'Same movement worded differently across months = same. A broader theme vs a specific distinct mechanism = different.',
        'Reply ONLY with JSON: {"verdicts":[{"id":0,"same":true}...]} covering every pair.',
      ].join('\n'),
      user: JSON.stringify({ pairs }),
    })
    const verdicts = robustJson(raw)?.verdicts
    if (!Array.isArray(verdicts)) throw new Error('judge returned an unusable shape')
    let sameCount = 0
    for (const v of verdicts) {
      const c = candidates[Number(v?.id)]
      if (c && v.same === true) { union(c.a.id, c.b.id); sameCount++ }
    }
    console.log(`judge: ${sameCount}/${candidates.length} pairs merged`)
  }

  const clusters = new Map<string, typeof shifts>()
  for (const s of shifts) {
    const root = find(s.id)
    clusters.set(root, [...(clusters.get(root) || []), s])
  }

  let merged = 0
  for (const members of clusters.values()) {
    if (members.length < 2) continue
    members.sort((a, b) => (b.story_count || 0) - (a.story_count || 0))
    const canon = members[0]
    const rest = members.slice(1)
    console.log(`\nCLUSTER -> "${canon.title}"`)
    for (const r of rest) console.log(`   merges  "${r.title}" (${r.story_count} stories, ${r.provenance})`)
    if (DRY) continue

    // Merge histories: one entry per week label, higher momentum wins.
    const history = new Map<string, any>()
    for (const m of members) {
      for (const h of (Array.isArray(m.momentum_history) ? m.momentum_history : [])) {
        const prev = history.get(h.week)
        if (!prev || h.momentum > prev.momentum) history.set(h.week, h)
      }
    }
    const mergedHistory = [...history.values()].sort((a, b) => String(a.week).localeCompare(String(b.week)))

    const provSet = new Set(members.map(m => m.provenance))
    const provenance = provSet.size > 1 ? 'mixed' : canon.provenance
    const firstSeen = members.map(m => m.first_seen_on).sort()[0]
    const lastEvidence = members.map(m => m.last_evidence_on).filter(Boolean).sort().at(-1) || canon.last_evidence_on
    // A cluster containing any lived 'proposed' member keeps needing Krish's
    // ruling ONLY if the canonical itself is proposed; a reconstructed-active
    // canonical absorbs proposed duplicates as already-tracked history.
    const status = canon.status === 'proposed' && members.some(m => m.status === 'active') ? 'active' : canon.status

    for (const r of rest) {
      const { data: ev } = await supabase.from('shift_evidence').select('*').eq('shift_id', r.id).limit(5000)
      for (const e of ev || []) {
        const { id: _drop, ...row } = e
        await supabase.from('shift_evidence').upsert(
          { ...row, shift_id: canon.id },
          { onConflict: 'shift_id,occurred_on,headline', ignoreDuplicates: true },
        )
      }
      await supabase.from('shift_evidence').delete().eq('shift_id', r.id)
      await supabase.from('content_ideas').update({ shift_id: canon.id }).eq('shift_id', r.id)
      // Re-point any pending decision at the canonical (dedupe index may reject
      // a duplicate; that means the canonical already has one, so drop this one).
      const { error: decErr } = await supabase.from('content_decisions')
        .update({ ref: canon.id }).eq('ref', r.id).eq('status', 'pending')
      if (decErr) await supabase.from('content_decisions').delete().eq('ref', r.id).eq('status', 'pending')
      await supabase.from('shifts').delete().eq('id', r.id)
      merged++
    }

    const latest = mergedHistory.at(-1)
    await supabase.from('shifts').update({
      momentum_history: mergedHistory,
      momentum: latest ? latest.momentum : canon.momentum,
      first_seen_on: firstSeen,
      last_evidence_on: lastEvidence,
      provenance,
      status,
    }).eq('id', canon.id)

    const { data: allEv } = await supabase.from('shift_evidence').select('occurred_on, source').eq('shift_id', canon.id).limit(5000)
    const rows = allEv || []
    await supabase.from('shifts').update({
      story_count: rows.length,
      day_span_total: new Set(rows.map(x => x.occurred_on)).size,
      source_count_total: new Set(rows.map(x => (x.source || 'unknown').toLowerCase())).size,
    }).eq('id', canon.id)
  }

  const { count } = await supabase.from('shifts').select('id', { count: 'exact', head: true })
  console.log(`\n${DRY ? 'DRY RUN: would merge' : 'merged'} ${merged} rows; register now ${count} shifts`)
}

main().then(() => process.exit(0)).catch(e => { console.error('CONSOLIDATE FAILED:', e?.message || e); process.exit(1) })
