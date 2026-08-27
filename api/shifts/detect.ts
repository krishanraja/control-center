import type { VercelRequest, VercelResponse } from '@vercel/node'
import { guardCronRoute } from '../_auth.js'
import { supabase } from '../_supabase.js'
import { callClaude, robustJson } from '../_content.js'
import { embedBatch, cosine, vectorLiteral } from '../_embeddings.js'
import { isoWeekLabel } from '../_weeks.js'
import {
  buildClassifyPrompt, parseClassification, discardRate, DISCARD_ALARM,
  type ClassifiableArc, type FolderRef,
} from '../_classify.js'
import {
  buildCorpus, buildDetectionPrompt, verifyShift, slugifyShift, titleJaccard,
  computeMomentum, WINDOW_DAYS, MATCH_COSINE, MATCH_TITLE_JACCARD, FADING_AFTER_DAYS,
  laneForShift,
  type CorpusItem, type ProposedShift, type VerifiedShift,
} from '../_trendGate.js'

// Weekly shift detection (Content Engine v2, spec §4).
//
// Builds a 21-day dated corpus from the Feed (pool headlines + newsletters +
// Zara signals), asks Sonnet to ARTICULATE candidate structural shifts, then the
// deterministic gate keeps only patterns that provably recur (>=3 distinct days,
// >=3 distinct sources, >=3 real citations). Verified detections are matched to
// the persistent register: an existing shift accrues evidence and momentum
// history; a genuinely new one lands as `proposed` plus a shift_proposal
// decision for the weekend sitting (R11: no mid-week interrupts).
// Zero verified shifts is a valid outcome.
//
//   GET (CRON_SECRET) — Fri 17:30 UTC   ·   POST — manual/backfill

const MIN_CORPUS_ITEMS = 12
const MIN_CORPUS_DAYS = 6

interface ShiftRow {
  id: string; slug: string; title: string; summary: string; status: string
  provenance: string; lane: string | null; embedding: unknown
  last_evidence_on: string | null
  momentum_history: unknown
}

function parseVec(v: unknown): number[] | null {
  if (Array.isArray(v)) return v as number[]
  if (typeof v === 'string') { try { return JSON.parse(v) } catch { return null } }
  return null
}

async function loadCorpus(): Promise<CorpusItem[]> {
  const sinceISO = new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString()
  const sinceDay = sinceISO.slice(0, 10)
  const { data, error } = await supabase
    .from('content_ideas')
    .select('id, idea, thesis, source_snippet, source_url, source_type, source_captured_at, created_at, meta, state, buried_at, buried_reason')
    .in('source_type', ['pool_headline', 'inspiration_sweep', 'zara_signal', 'signal_inbox'])
    .not('state', 'in', '("dropped","absorbed")')
    // NOTE: buried rows are filtered in JS below, not here. The query already
    // spends its one .or() on the date window, and stacking a second one is
    // ambiguous in PostgREST. The table is small enough that the 1200 cap is
    // nowhere near binding.
    // source_captured_at is refreshed when a story recurs, so a keeper row
    // older than the window stays in the corpus while its story is still live.
    .or(`created_at.gte.${sinceISO},source_captured_at.gte.${sinceISO}`)
    .limit(1200)
  if (error) throw new Error(error.message)
  const out: CorpusItem[] = []
  for (const r of data || []) {
    // Archived-for-staleness rows STAY in the corpus. Krish stops being shown an
    // idea he never actioned, but it was still a real dated citation and the
    // trend gate must keep counting it, otherwise hiding the backlog silently
    // erases the evidence that a story is building. Everything else buried stays
    // out, and the dedupe burials especially: their citations were already
    // folded into their keeper's meta.recurrences and would be double-counted.
    const buried = (r as any).buried_at
    if (buried && !String((r as any).buried_reason || '').startsWith('stale:')) continue
    const pool = (r as any).meta?.pool || {}
    // For sweep rows source_captured_at moves on recurrence; created_at is the
    // honest first-citation day. Other sources keep the original semantics.
    const day = r.source_type === 'inspiration_sweep'
      ? String((r as any).created_at).slice(0, 10)
      : String((r as any).source_captured_at || (r as any).created_at).slice(0, 10)
    const base: CorpusItem = {
      id: r.id,
      day,
      category: pool.category || null,
      headline: (r as any).idea,
      snippet: (r as any).thesis || (r as any).source_snippet || null,
      source: realSource(r),
      url: (r as any).source_url || null,
    }
    out.push(base)
    // The sweep dedupes re-seen stories into meta.recurrences instead of
    // duplicate rows (2026-07-27). Each recurrence is a real dated citation
    // from a real publication, so it re-enters the corpus as its own item —
    // recurrence across days IS the signal the gate measures.
    const recs = Array.isArray((r as any).meta?.recurrences) ? (r as any).meta.recurrences : []
    for (const rec of recs) {
      const day = typeof rec?.day === 'string' ? rec.day.slice(0, 10) : null
      if (!day || day < sinceDay) continue
      out.push({ ...base, day, source: rec.label || base.source })
    }
  }
  return out
}

// The gate's source-diversity floor needs the actual publication, not the
// ingest channel: an inspiration_sweep row citing thedeepview.com must count
// as thedeepview.com or every newsletter item collapses into one "source".
export function realSource(r: any): string {
  const pool = r.meta?.pool || {}
  if (typeof pool.source === 'string' && pool.source) return pool.source
  if (typeof r.meta?.source_label === 'string' && r.meta.source_label) return r.meta.source_label
  if (typeof r.source_url === 'string' && r.source_url) {
    try { return new URL(r.source_url).hostname.replace(/^www\./, '') } catch { /* fall through */ }
  }
  return r.source_type
}

async function refreshShiftTotals(shiftId: string) {
  const { data } = await supabase
    .from('shift_evidence')
    .select('occurred_on, source')
    .eq('shift_id', shiftId)
    .limit(5000)
  const rows = data || []
  const days = new Set(rows.map(r => r.occurred_on))
  const sources = new Set(rows.map(r => (r.source || 'unknown').toLowerCase()))
  await supabase.from('shifts').update({
    story_count: rows.length,
    day_span_total: days.size,
    source_count_total: sources.size,
  }).eq('id', shiftId)
}

async function applyToRegister(v: VerifiedShift, registry: ShiftRow[], vec: number[] | null, week: string) {
  // Match by embedding first, title-token overlap as fallback.
  let match: ShiftRow | null = null
  let similarity = 0
  for (const s of registry) {
    const sv = parseVec(s.embedding)
    const cos = vec && sv ? cosine(vec, sv) : 0
    const jac = titleJaccard(v.title, s.title)
    const score = Math.max(cos, jac)
    if ((cos >= MATCH_COSINE || jac >= MATCH_TITLE_JACCARD) && score > similarity) {
      match = s; similarity = score
    }
  }

  const todayISO = new Date().toISOString().slice(0, 10)
  const newestEvidence = v.items.map(i => i.day).sort().at(-1) || todayISO
  const historyEntry = {
    week, momentum: v.momentum, day_span: v.daySpan,
    source_count: v.sourceCount, recent_count: v.recentCount,
  }

  let shiftId: string
  let created = false
  if (match) {
    shiftId = match.id
    const history = Array.isArray(match.momentum_history) ? match.momentum_history : []
    const patch: Record<string, unknown> = {
      momentum: v.momentum,
      momentum_history: [...history.filter((h: any) => h?.week !== week), historyEntry],
      last_evidence_on: newestEvidence,
      summary: v.summary,
      implication: v.implication,
    }
    if (match.status === 'fading') patch.status = 'active'
    if (match.provenance === 'reconstructed') patch.provenance = 'mixed'
    // Heal missing lanes: rows from before the lane column existed (or whose
    // category has since gained a mapping) pick one up on re-detection. A lane
    // that is already set is never overwritten, so a hand-classified shift
    // stays where it was put; cross-cutting categories map to null and are
    // left alone.
    if (match.lane == null) {
      const healedLane = laneForShift(v.category)
      if (healedLane) patch.lane = healedLane
    }
    await supabase.from('shifts').update(patch).eq('id', shiftId)
  } else {
    created = true
    const oldest = v.items.map(i => i.day).sort()[0] || todayISO
    const { data, error } = await supabase.from('shifts').insert({
      slug: slugifyShift(v.title),
      title: v.title,
      summary: v.summary,
      implication: v.implication,
      category: v.category,
      lane: laneForShift(v.category),
      status: 'proposed',
      first_seen_on: oldest,
      last_evidence_on: newestEvidence,
      momentum: v.momentum,
      momentum_history: [historyEntry],
      provenance: 'lived',
      ...(vec ? { embedding: vectorLiteral(vec) } : {}),
    }).select('id').single()
    if (error) {
      // Slug collision with a shift the matcher missed: attach to it instead.
      const { data: bySlug } = await supabase.from('shifts').select('id').eq('slug', slugifyShift(v.title)).single()
      if (!bySlug) throw new Error(error.message)
      shiftId = bySlug.id
      created = false
    } else {
      shiftId = data.id
    }
  }

  // Append evidence (unique index dedupes re-detections of the same story).
  const evidence = v.items.map(i => ({
    shift_id: shiftId,
    occurred_on: i.day,
    headline: i.headline,
    source: i.source,
    url: i.url,
    provenance: 'lived',
    week_label: week,
  }))
  await supabase.from('shift_evidence')
    .upsert(evidence, { onConflict: 'shift_id,occurred_on,headline', ignoreDuplicates: true })

  // Beats, alongside the evidence they come from.
  //
  // Evidence is the source: a url, a headline, a provenance. A beat is what
  // changed at this point in the arc, and it is what arc_maturity counts. The
  // two are separate because the scorer must count ORIGINS rather than stories:
  // origin_key is the publisher, so the unique index on
  // (shift_id, occurred_on, origin_key) collapses five outlets carrying one
  // wire into a single beat. That collapse is the independence rule, and it is
  // what `momentum` got wrong by counting volume.
  //
  // Tier comes from the source registry where the publisher is registered, and
  // stays null where it is not. A guessed tier would put a number nobody
  // measured straight into the score.
  const origins = Array.from(new Set(v.items.map(i => i.source).filter(Boolean))) as string[]
  const tierByOrigin = new Map<string, string>()
  if (origins.length) {
    const { data: known } = await supabase.from('content_sources')
      .select('name, tier').in('name', origins)
    for (const k of known || []) tierByOrigin.set(k.name as string, k.tier as string)
  }
  const beats = v.items.map(i => ({
    shift_id: shiftId,
    occurred_on: i.day,
    what_changed: i.headline,
    origin_key: i.source || i.url || i.headline,
    source_tier: tierByOrigin.get(i.source || '') ?? null,
  }))
  await supabase.from('shift_beats')
    .upsert(beats, { onConflict: 'shift_id,occurred_on,origin_key', ignoreDuplicates: true })

  // Link the feed rows so the purge never eats a story that fed a dossier.
  await supabase.from('content_ideas')
    .update({ shift_id: shiftId })
    .in('id', v.items.map(i => i.id))
    .is('shift_id', null)

  await refreshShiftTotals(shiftId)

  if (created) {
    const nearest = registry
      .map(s => ({ slug: s.slug, title: s.title, similarity: Math.round(titleJaccard(v.title, s.title) * 100) }))
      .sort((a, b) => b.similarity - a.similarity)[0] || null
    const { error: decErr } = await supabase.from('content_decisions').upsert({
      week,
      kind: 'shift_proposal',
      ref: shiftId,
      payload: {
        title: v.title, summary: v.summary, implication: v.implication, category: v.category,
        stories: v.items.length, day_span: v.daySpan, sources: v.sourceCount, nearest,
      },
    }, { onConflict: 'week,kind,ref', ignoreDuplicates: true })
    if (decErr) throw new Error(`shift_proposal decision write failed: ${decErr.message}`)
  }
  return { shiftId, created, matchedSimilarity: similarity }
}

export async function runDetect() {
  const week = isoWeekLabel()
  const corpusAll = await loadCorpus()
  const corpus = buildCorpus(corpusAll)
  const distinctDays = new Set(corpus.map(c => c.day)).size
  if (corpus.length < MIN_CORPUS_ITEMS || distinctDays < MIN_CORPUS_DAYS) {
    return { week, corpus: corpus.length, distinctDays, skipped: 'corpus too thin (honest skip, no forced shifts)' }
  }

  // The model cites evidence by id; raw UUIDs get garbled, so the prompt uses
  // short aliases (s1..sN) mapped back to real rows after verification.
  const aliasToReal = new Map<string, string>()
  const aliased = corpus.map((c, i) => {
    const alias = `s${i + 1}`
    aliasToReal.set(alias, c.id)
    return { ...c, id: alias }
  })
  const { system, user } = buildDetectionPrompt(aliased)
  const raw = await callClaude({ agent: 'shifts-detect', model: 'claude-sonnet-4-6', maxTokens: 2000, temperature: 0.2, system, user })
  const parsed = robustJson(raw)
  const proposals: ProposedShift[] = Array.isArray(parsed?.shifts) ? parsed.shifts : []

  const byId = new Map(aliased.map(c => [c.id, c]))
  const verified = proposals
    .map(p => verifyShift(p, byId))
    .filter((x): x is VerifiedShift => Boolean(x))
    .map(v => ({ ...v, items: v.items.map(i => ({ ...i, id: aliasToReal.get(i.id) || i.id })) }))

  const { data: registryData, error: regErr } = await supabase
    .from('shifts')
    .select('id, slug, title, summary, status, provenance, lane, embedding, last_evidence_on, momentum_history')
    // Merged arcs are kept rather than deleted so a merge is reversible
    // (api/shifts/[id].ts). Excluded here or a folded arc reappears.
    .is('superseded_by', null)
    .neq('status', 'retired')
  if (regErr) throw new Error(regErr.message)
  const registry = (registryData || []) as ShiftRow[]

  const vecs = verified.length
    ? await embedBatch(verified.map(v => ({ title: v.title, body: v.summary })))
    : []

  const results = []
  for (let i = 0; i < verified.length; i++) {
    results.push(await applyToRegister(verified[i], registry, vecs[i] || null, week))
  }

  // ── classify: give every unclassified arc a lens, and a folder if one fits ──
  //
  // Runs on every detection, not only on new arcs, because an arc created
  // before this step existed has lens null and would otherwise stay invisible
  // to the scorer forever. Old arcs are cheap to include and the pass is
  // idempotent: a row that already has a lens is never re-read.
  const classify = await classifyUnclassified()

  // Fading pass: active shifts starved of evidence queue a weekend ruling.
  const fadeFloor = new Date(Date.now() - FADING_AFTER_DAYS * 86_400_000).toISOString().slice(0, 10)
  const nowActive = registry.filter(s => s.status === 'active' && s.last_evidence_on && s.last_evidence_on < fadeFloor)
  for (const s of nowActive) {
    await supabase.from('shifts').update({ status: 'fading' }).eq('id', s.id)
    await supabase.from('content_decisions').upsert({
      week, kind: 'shift_fading', ref: s.id,
      payload: { title: s.title, last_evidence_on: s.last_evidence_on },
    }, { onConflict: 'week,kind,ref', ignoreDuplicates: true })
  }

  return {
    week, corpus: corpus.length, distinctDays,
    proposed: proposals.length, verified: verified.length,
    created: results.filter(r => r.created).length,
    accrued: results.filter(r => !r.created).length,
    faded: nowActive.length,
    classified: classify,
  }
}

/** Assigns lens and theme_id to every live arc that has neither.
 *
 *  Returns counts rather than throwing on a thin result: a detection run that
 *  found real shifts must not be rolled back because the classifier had a bad
 *  minute. A discard rate above DISCARD_ALARM is reported rather than acted on,
 *  because the fix is the source registry and that is a decision, not a job. */
export async function classifyUnclassified(limit = 60) {
  const { data: folderRows } = await supabase
    .from('content_themes')
    .select('id, slug, question, channel')
    .eq('state', 'open')
  const folders = (folderRows || []) as FolderRef[]
  if (!folders.length) return { skipped: 'no open folders' }

  const { data: arcRows } = await supabase
    .from('shifts')
    .select('id, title, summary, implication')
    .is('superseded_by', null)
    .is('lens', null)
    .neq('status', 'retired')
    .limit(limit)
  const arcs = (arcRows || []) as Array<{ id: string; title: string; summary: string | null; implication: string | null }>
  if (!arcs.length) return { pending: 0 }

  // Recent beats give the classifier what actually happened, not just the arc's
  // oldest framing of itself.
  const { data: beatRows } = await supabase
    .from('shift_beats')
    .select('shift_id, what_changed, occurred_on')
    .in('shift_id', arcs.map(a => a.id))
    .order('occurred_on', { ascending: false })
    .limit(400)
  const beatsBy = new Map<string, string[]>()
  for (const b of beatRows || []) {
    const list = beatsBy.get(b.shift_id) || []
    if (list.length < 6) list.push(b.what_changed)
    beatsBy.set(b.shift_id, list)
  }

  const payload: ClassifiableArc[] = arcs.map(a => ({
    id: a.id, title: a.title, summary: a.summary, implication: a.implication,
    beats: beatsBy.get(a.id) || [],
  }))
  const { system, user } = buildClassifyPrompt(payload, folders)
  const raw = await callClaude({ agent: 'shifts-classify', model: 'claude-sonnet-4-6', maxTokens: 4000, temperature: 0, system, user })
  const results = parseClassification(robustJson(raw), new Set(folders.map(f => f.slug)))
  if (!results.length) return { pending: arcs.length, wrote: 0, note: 'classifier returned nothing usable' }

  const bySlug = new Map(folders.map(f => [f.slug, f.id]))
  const known = new Set(arcs.map(a => a.id))
  let wrote = 0
  for (const c of results) {
    if (!known.has(c.id)) continue
    // A discarded arc is written as lens null WITH its reason, so "why did this
    // never surface" is answerable. Silent discards are how the previous engine
    // produced 54 proposals and zero explanations.
    const { error } = await supabase.from('shifts').update({
      lens: c.lens,
      theme_id: c.lens && c.theme_slug ? bySlug.get(c.theme_slug) ?? null : null,
      classified_at: new Date().toISOString(),
      classify_reason: c.reason,
      plausible_new_theme: c.plausible_new_theme,
    }).eq('id', c.id)
    if (!error) wrote++
  }

  const rate = discardRate(results)
  return {
    seen: results.length,
    wrote,
    kept: results.filter(r => r.lens).length,
    discarded: results.filter(r => !r.lens).length,
    themed: results.filter(r => r.theme_slug).length,
    discard_rate: Number(rate.toFixed(2)),
    ...(rate > DISCARD_ALARM
      ? { alarm: `discard rate ${Math.round(rate * 100)}% is above ${Math.round(DISCARD_ALARM * 100)}%: the corpus is wrong, not the ontology. Change the sources, not the lenses.` }
      : {}),
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store')
  if (guardCronRoute(req, res)) return
  try {
    const result = await runDetect()
    return res.json({ ok: true, ...result })
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) })
  }
}

export const config = { maxDuration: 300 }
