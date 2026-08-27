import type { VercelRequest, VercelResponse } from '@vercel/node'
import { guardCronRoute } from '../_auth.js'
import { supabase } from '../_supabase.js'
import { embedBatch, cosine, vectorLiteral } from '../_embeddings.js'
import { callClaude } from '../_content.js'
import { JUDGE_MODEL } from '../_models.js'

/**
 * On-demand + nightly narrative clustering for the Content tab.
 *
 * The companion script (scripts/clustering/build-narrative-clusters.ts) was never
 * scheduled, so related_idea_ids stayed empty and the "merge similar drafts" UI
 * never had anything to group. This is the compact, hosted version of that job:
 * it backfills missing embeddings, single-link unions cards with cosine ≥ 0.78,
 * and writes related_idea_ids (+ a short meta.cluster_summary) so the client's
 * clusterDrafts() + SynthesisModal light up.
 *
 *   POST            — on-demand (the Content tab fires this on open, throttled)
 *   GET (CRON_SECRET) — nightly cron (vercel.json)
 *
 * MIN_CLUSTER = 2: drafts often pair, and the phone groups pairs. (The script's
 * default of 3 is too strict for this surface.)
 */

const ACTIVE_STATES = ['seeded', 'researching', 'drafting']
const THRESHOLD = 0.78
const MIN_CLUSTER = 2
const WINDOW_DAYS = 21

interface Row { id: string; idea: string | null; thesis: string | null; source_snippet: string | null; embedding: unknown; meta: Record<string, unknown> | null; _vec?: number[] | null }

function parseVec(r: Row): number[] | null {
  if (Array.isArray(r._vec)) return r._vec
  if (typeof r.embedding === 'string') { try { return JSON.parse(r.embedding) } catch { return null } }
  if (Array.isArray(r.embedding)) return r.embedding as number[]
  return null
}

async function summarize(members: Row[]): Promise<string | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null
  const titles = members.slice(0, 12).map((m, i) => `${i + 1}. ${m.idea || ''}`).join('\n')
  try {
    const text = await callClaude({
      model: JUDGE_MODEL,
      maxTokens: 220,
      temperature: 0.3,
      system: 'You write tight, specific narrative descriptions. 2 sentences max. No filler, no labels, no "this cluster".',
      user: `Name the single narrative thread these content cards collectively point at. Be concrete — name the entities/mechanism/argument if obvious.\n\n${titles}\n\nReturn only the 2-sentence description.`,
    })
    return text.trim() || null
  } catch { return null }
}

async function runCluster() {
  const sinceISO = new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString()
  const { data, error } = await supabase
    .from('content_ideas')
    .select('id, idea, thesis, source_snippet, embedding, meta, related_idea_ids, state, buried_at, created_at')
    .in('state', ACTIVE_STATES)
    .is('buried_at', null)
    .gte('created_at', sinceISO)
    .limit(2000)
  if (error) throw new Error(error.message)
  const rows = (data || []) as Row[]
  if (rows.length < MIN_CLUSTER) return { rows: rows.length, clusters: 0, written: 0 }

  // Backfill embeddings for rows that lack one (n8n-inserted drafts often do).
  // embedBatch resolves the OpenAI key itself (deploy env → app_secrets fallback),
  // so we must NOT gate on process.env.OPENAI_API_KEY here — the key lives in the
  // service-role-only app_secrets table, not the Vercel env. If no key resolves,
  // embedBatch returns nulls and we simply skip those rows.
  const needs = rows.filter(r => !r.embedding)
  if (needs.length) {
    const vecs = await embedBatch(needs.map(r => ({ title: r.idea, body: r.thesis || r.source_snippet || '' })))
    for (let i = 0; i < needs.length; i++) {
      const v = vecs[i]
      if (!v) continue
      needs[i]._vec = v
      await supabase.from('content_ideas').update({ embedding: vectorLiteral(v) }).eq('id', needs[i].id)
    }
  }

  // Single-link union-find over cosine ≥ THRESHOLD.
  const parent = new Map<string, string>()
  const find = (x: string): string => { let c = x; while (parent.get(c) && parent.get(c) !== c) c = parent.get(c)!; return c }
  const union = (a: string, b: string) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb) }
  for (const r of rows) parent.set(r.id, r.id)

  const vecs = new Map<string, number[]>()
  for (const r of rows) { const v = parseVec(r); if (v) vecs.set(r.id, v) }
  const ids = [...vecs.keys()]
  for (let i = 0; i < ids.length; i++) {
    const va = vecs.get(ids[i])!
    for (let j = i + 1; j < ids.length; j++) {
      if (cosine(va, vecs.get(ids[j])!) >= THRESHOLD) union(ids[i], ids[j])
    }
  }

  const byRoot = new Map<string, Row[]>()
  for (const r of rows) {
    if (!vecs.has(r.id)) continue
    const root = find(r.id)
    const arr = byRoot.get(root) || []
    arr.push(r)
    byRoot.set(root, arr)
  }
  const clusters = [...byRoot.values()].filter(c => c.length >= MIN_CLUSTER)

  let written = 0
  const seen = new Set<string>()
  for (const members of clusters) {
    const all = members.map(m => m.id)
    const summary = await summarize(members)
    for (const m of members) {
      const related = all.filter(x => x !== m.id)
      const prevMeta = (m.meta && typeof m.meta === 'object') ? m.meta : {}
      const patch: Record<string, unknown> = { related_idea_ids: related }
      if (summary) patch.meta = { ...prevMeta, cluster_summary: summary, clustered_at: new Date().toISOString() }
      await supabase.from('content_ideas').update(patch).eq('id', m.id)
      seen.add(m.id)
      written++
    }
  }
  // Clear stale related_idea_ids on rows that were clustered before but no longer
  // belong to any cluster, so dissolved groups stop showing in the UI.
  const stale = rows.filter(r => !seen.has(r.id) && Array.isArray((r as any).related_idea_ids) && (r as any).related_idea_ids?.length)
  for (const r of stale) await supabase.from('content_ideas').update({ related_idea_ids: [] }).eq('id', r.id)

  return { rows: rows.length, clusters: clusters.length, written }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store')

  if (guardCronRoute(req, res)) return

  try {
    const result = await runCluster()
    return res.json({ ok: true, ...result })
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) })
  }
}
