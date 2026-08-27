#!/usr/bin/env -S npx tsx
// Nightly narrative clustering for the Content tab.
//
// Goal: take the open backlog of content_ideas (seeded/researching/drafting)
// and discover the natural narrative threads — clusters of cards that are all
// about the same underlying story. Writes the clusters back as
// related_idea_ids on each member, so the SwipeCockpit can show "+N related"
// badges and the synthesis endpoint can be fired with one click.
//
// Usage (run from N8N Schedule Trigger or `npx tsx scripts/clustering/build-narrative-clusters.ts`):
//   --dry              : print clusters, don't write
//   --threshold 0.78   : cosine similarity threshold (default 0.78)
//   --min-cluster 3    : minimum members for a cluster to be written (default 3)
//   --window-days 14   : look back this many days (default 14)
//
// We deliberately use a LOOSER threshold (0.78) than the dedup tier (0.92).
// At 0.78 the cards are "about the same topic" rather than "the same story",
// which is what we want for narrative grouping. A long-form investigation weaves
// 10-15 thematically related cards into one argument.

import { createClient } from '@supabase/supabase-js'
import { embedBatch, cosine, vectorLiteral } from '../../api/_embeddings'
import { JUDGE_MODEL } from '../../api/_models'

const SUPA_URL = process.env.SUPABASE_URL
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPA_URL || !SUPA_KEY) { console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY'); process.exit(1) }
const sb = createClient(SUPA_URL, SUPA_KEY)

interface Args {
  dry: boolean
  threshold: number
  minCluster: number
  windowDays: number
}

function parseArgs(): Args {
  const a = process.argv.slice(2)
  let dry = false
  let threshold = 0.78
  let minCluster = 3
  let windowDays = 14
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--dry') dry = true
    else if (a[i] === '--threshold' && a[i + 1]) threshold = parseFloat(a[++i])
    else if (a[i] === '--min-cluster' && a[i + 1]) minCluster = parseInt(a[++i], 10)
    else if (a[i] === '--window-days' && a[i + 1]) windowDays = parseInt(a[++i], 10)
  }
  return { dry, threshold, minCluster, windowDays }
}

const ACTIVE_STATES = ['seeded', 'researching', 'drafting']

async function run() {
  const args = parseArgs()
  const sinceISO = new Date(Date.now() - args.windowDays * 86_400_000).toISOString()
  console.log(`\n— Narrative clustering: window=${args.windowDays}d threshold=${args.threshold} minCluster=${args.minCluster} ${args.dry ? '(dry)' : ''} —`)

  const { data, error } = await sb
    .from('content_ideas')
    .select('id, idea, thesis, source_snippet, embedding, related_idea_ids, state, created_at, meta')
    .in('state', ACTIVE_STATES)
    .is('buried_at', null)
    .gte('created_at', sinceISO)
    .limit(2000)
  if (error) { console.error(error.message); process.exit(1) }
  const rows = (data || []) as any[]
  console.log(`Loaded ${rows.length} active cards (last ${args.windowDays} days).`)

  if (!rows.length) return

  // 1. Ensure every row has an embedding. The dedup tier at ingest already
  // backfills this for new rows; this pass catches old rows from before the
  // dedup migration shipped.
  const needsEmbed = rows.filter(r => !r.embedding)
  if (needsEmbed.length) {
    if (!process.env.OPENAI_API_KEY) {
      console.error('OPENAI_API_KEY is required for clustering — aborting.')
      process.exit(1)
    }
    console.log(`Computing embeddings for ${needsEmbed.length} rows…`)
    const vecs = await embedBatch(needsEmbed.map(r => ({ title: r.idea, body: r.thesis || r.source_snippet || '' })))
    for (let i = 0; i < needsEmbed.length; i++) {
      const r = needsEmbed[i]
      const v = vecs[i]
      if (!v) continue
      r._tmp_vec = v
      if (!args.dry) {
        await sb.from('content_ideas').update({ embedding: vectorLiteral(v) }).eq('id', r.id)
      }
    }
  }

  const getVec = (r: any): number[] | null => {
    if (Array.isArray(r._tmp_vec)) return r._tmp_vec
    if (typeof r.embedding === 'string') { try { return JSON.parse(r.embedding) } catch { return null } }
    if (Array.isArray(r.embedding)) return r.embedding
    return null
  }

  // 2. Simple agglomerative single-link clustering over the cards. For
  // N=200-500 this is fine; if it ever grows past that we'd switch to HDBSCAN
  // or a vector-index-based search.
  type Cluster = { ids: Set<string>; members: any[] }
  const parent = new Map<string, string>()
  const find = (x: string): string => {
    let cur = x
    while (parent.get(cur) && parent.get(cur) !== cur) cur = parent.get(cur)!
    return cur
  }
  const union = (a: string, b: string) => {
    const ra = find(a), rb = find(b)
    if (ra !== rb) parent.set(ra, rb)
  }
  for (const r of rows) parent.set(r.id, r.id)

  const vecs: Map<string, number[]> = new Map()
  for (const r of rows) {
    const v = getVec(r)
    if (v) vecs.set(r.id, v)
  }
  console.log(`Have embeddings for ${vecs.size}/${rows.length} rows. Clustering…`)

  const ids = Array.from(vecs.keys())
  for (let i = 0; i < ids.length; i++) {
    const a = ids[i], va = vecs.get(a)!
    for (let j = i + 1; j < ids.length; j++) {
      const b = ids[j], vb = vecs.get(b)!
      if (cosine(va, vb) >= args.threshold) union(a, b)
    }
  }

  const clusters = new Map<string, Cluster>()
  for (const r of rows) {
    if (!vecs.has(r.id)) continue
    const root = find(r.id)
    let c = clusters.get(root)
    if (!c) { c = { ids: new Set(), members: [] }; clusters.set(root, c) }
    c.ids.add(r.id); c.members.push(r)
  }
  const sizedClusters = Array.from(clusters.values()).filter(c => c.ids.size >= args.minCluster)
  console.log(`Found ${sizedClusters.length} clusters with ≥${args.minCluster} members.\n`)

  for (const [i, c] of sizedClusters.entries()) {
    console.log(`Cluster ${i + 1} — ${c.ids.size} cards:`)
    for (const m of c.members.slice(0, 8)) {
      console.log(`   - ${m.id.slice(0, 8)}  ${String(m.idea || '').slice(0, 80)}`)
    }
    if (c.members.length > 8) console.log(`   - …and ${c.members.length - 8} more`)
    console.log('')
  }

  if (args.dry) {
    console.log('Dry run. Re-run without --dry to write related_idea_ids.\n')
    return
  }

  // 3. Write related_idea_ids on every member of every sized cluster. Also
  // ask Claude Haiku for a cluster summary, written to meta.cluster_summary.
  console.log(`Writing related_idea_ids on ${sizedClusters.reduce((n, c) => n + c.ids.size, 0)} cards…`)
  for (const c of sizedClusters) {
    const all = Array.from(c.ids)
    let clusterSummary: string | null = null
    try { clusterSummary = await summarizeCluster(c.members) } catch { /* non-fatal */ }
    for (const m of c.members) {
      const related = all.filter(x => x !== m.id)
      const prevMeta = (m.meta && typeof m.meta === 'object') ? m.meta : {}
      const patch: Record<string, unknown> = { related_idea_ids: related }
      if (clusterSummary) {
        patch.meta = { ...prevMeta, cluster_summary: clusterSummary, clustered_at: new Date().toISOString() }
      }
      await sb.from('content_ideas').update(patch).eq('id', m.id)
    }
  }
  console.log(`Done.`)
}

async function summarizeCluster(members: any[]): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null
  const titles = members.slice(0, 12).map((m, i) => `${i + 1}. ${m.idea || ''}`).join('\n')
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: JUDGE_MODEL,
      max_tokens: 220,
      temperature: 0.3,
      system: 'You write tight, specific narrative descriptions. 2 sentences max. No filler, no labels, no "this cluster".',
      messages: [{ role: 'user', content: `Name the single narrative thread these content cards collectively point at. Be concrete, not generic — name the entities/mechanism/argument if obvious.\n\n${titles}\n\nReturn only the 2-sentence description.` }],
    }),
  })
  if (!r.ok) return null
  const j: any = await r.json().catch(() => null)
  const txt = j?.content?.[0]?.text
  return typeof txt === 'string' ? txt.trim().slice(0, 500) : null
}

run().catch(e => { console.error(e); process.exit(1) })
