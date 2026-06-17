// Shared dedup-backfill orchestrator. Two callers:
//   - api/dedup/backfill.ts             (HTTP endpoint, dry/commit toggle)
//   - scripts/dedup/backfill.ts         (CLI thin wrapper)
//
// Same tiered logic as the at-ingest check in api/_dedup.ts (canonical
// identity -> title_norm -> content_hash -> embedding > 0.92), but operating
// on the whole table at once: groups duplicates, keeps the oldest, merges
// provenance into the survivor's meta.duplicate_sources, soft-drops the rest.
//
// IMPORTANT: this is for mechanical duplicates only — it writes directly to
// the table state (and buried_at), bypassing feedback_queue, because dedup
// is not a learning signal. The relevance sweep is where -1 votes get
// written; this is a different surface.

import type { SupabaseClient } from '@supabase/supabase-js'
import { canonicalUrl, titleNorm, contentHash, emailNorm, linkedinNorm } from './_text.js'
import { embedBatch, cosine, vectorLiteral } from './_embeddings.js'

export type DedupTable = 'content_ideas' | 'leads' | 'contacts' | 'guests' | 'visibility_targets'

const SIM_THRESHOLD = 0.92
const RECENCY_MS = 30 * 86_400_000

export interface BackfillArgs {
  table: DedupTable
  dry: boolean
  limit: number
}

export interface BackfillSample {
  reason: string
  survivor_id: string
  survivor_title: string
  dup_ids: string[]
  dup_titles: string[]
}

export interface BackfillReport {
  table: DedupTable
  loaded: number
  groups: number
  total_duplicates: number
  by_reason: Record<string, number>
  sample: BackfillSample[]
  committed: boolean
  embedded: number
  fingerprints_backfilled: number
  soft_dropped: number
}

interface Group { reason: string; survivor: any; dups: any[] }
const pickSurvivor = (rs: any[]): any => rs.slice().sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))[0]
const groupByKey = (rows: any[], key: string): Map<string, any[]> => {
  const m = new Map<string, any[]>()
  for (const r of rows) {
    const v = r[key]
    if (!v) continue
    const arr = m.get(v) || []
    arr.push(r); m.set(v, arr)
  }
  return m
}

export async function runDedupBackfill(sb: SupabaseClient, args: BackfillArgs): Promise<BackfillReport> {
  if (args.table === 'content_ideas') return runContentIdeas(sb, args)
  if (args.table === 'leads' || args.table === 'contacts' || args.table === 'guests') return runIdentityTable(sb, args, args.table)
  if (args.table === 'visibility_targets') return runVisibilityTargets(sb, args)
  throw new Error(`Unknown table: ${args.table}`)
}

async function runContentIdeas(sb: SupabaseClient, args: BackfillArgs): Promise<BackfillReport> {
  const { data, error } = await sb
    .from('content_ideas')
    .select('id, idea, source_url, source_snippet, source_type, source_ref, canonical_url, title_norm, content_hash, embedding, state, created_at, meta')
    .order('created_at', { ascending: true })
    .limit(args.limit)
  if (error) throw new Error(error.message)
  const rows = (data || []) as any[]

  let fingerprintsBackfilled = 0
  for (const r of rows) {
    if (!r.canonical_url && r.source_url) { r.canonical_url = canonicalUrl(r.source_url); fingerprintsBackfilled++ }
    if (!r.title_norm && r.idea) { r.title_norm = titleNorm(r.idea); fingerprintsBackfilled++ }
    if (!r.content_hash && (r.source_snippet || r.idea)) { r.content_hash = contentHash(r.source_snippet || r.idea); fingerprintsBackfilled++ }
  }

  const survivorOf = new Map<string, string>()
  const groups: Group[] = []
  const collect = (key: string, reason: string) => {
    for (const arr of groupByKey(rows, key).values()) {
      const undup = arr.filter(r => !survivorOf.has(r.id))
      if (undup.length < 2) continue
      const survivor = pickSurvivor(undup)
      const dups = undup.filter(r => r !== survivor)
      if (!dups.length) continue
      for (const d of dups) survivorOf.set(d.id, survivor.id)
      groups.push({ reason, survivor, dups })
    }
  }
  collect('canonical_url', 'canonical_url')
  for (const r of rows) if (r.title_norm && r.title_norm.length < 8) r.title_norm = null
  collect('title_norm', 'title_norm')
  collect('content_hash', 'content_hash')

  // Embedding pass for what's left
  let embedded = 0
  // embedBatch resolves the OpenAI key itself (deploy env → app_secrets fallback),
  // so don't gate on process.env.OPENAI_API_KEY — the key lives in app_secrets.
  const unembedded = rows.filter(r => !r.embedding && !survivorOf.has(r.id))
  if (unembedded.length > 0) {
    const vecs = await embedBatch(unembedded.map(r => ({ title: r.idea, body: r.source_snippet || '' })))
    for (let i = 0; i < unembedded.length; i++) { unembedded[i]._tmp_vec = vecs[i]; if (vecs[i]) embedded++ }
  }
  const embeddedRows = rows.filter(r => !survivorOf.has(r.id) && (r._tmp_vec || r.embedding))
  const getVec = (r: any): number[] | null => {
    if (Array.isArray(r._tmp_vec)) return r._tmp_vec
    if (typeof r.embedding === 'string') { try { return JSON.parse(r.embedding) } catch { return null } }
    if (Array.isArray(r.embedding)) return r.embedding
    return null
  }
  const inSemGroup = new Set<string>()
  for (let i = 0; i < embeddedRows.length; i++) {
    const a = embeddedRows[i]
    if (inSemGroup.has(a.id)) continue
    const va = getVec(a); if (!va) continue
    const cluster: any[] = [a]
    for (let j = i + 1; j < embeddedRows.length; j++) {
      const b = embeddedRows[j]
      if (inSemGroup.has(b.id)) continue
      const dt = Math.abs(new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      if (dt > RECENCY_MS) continue
      const vb = getVec(b); if (!vb) continue
      if (cosine(va, vb) >= SIM_THRESHOLD) cluster.push(b)
    }
    if (cluster.length > 1) {
      for (const r of cluster) inSemGroup.add(r.id)
      const survivor = pickSurvivor(cluster)
      const dups = cluster.filter(r => r !== survivor && !survivorOf.has(r.id))
      if (dups.length) {
        for (const d of dups) survivorOf.set(d.id, survivor.id)
        groups.push({ reason: 'embedding', survivor, dups })
      }
    }
  }

  const byReason: Record<string, number> = {}
  for (const g of groups) byReason[g.reason] = (byReason[g.reason] || 0) + g.dups.length
  const sample: BackfillSample[] = groups.slice(0, 25).map(g => ({
    reason: g.reason,
    survivor_id: g.survivor.id,
    survivor_title: String(g.survivor.idea || '').slice(0, 100),
    dup_ids: g.dups.map(d => d.id),
    dup_titles: g.dups.map(d => String(d.idea || '').slice(0, 100)),
  }))

  const report: BackfillReport = {
    table: 'content_ideas', loaded: rows.length, groups: groups.length,
    total_duplicates: survivorOf.size, by_reason: byReason, sample,
    committed: false, embedded, fingerprints_backfilled: fingerprintsBackfilled, soft_dropped: 0,
  }
  if (args.dry) return report

  // Commit: backfill fingerprints/embeddings on every row, merge provenance, soft-drop dups
  let fpUpdated = 0
  for (const r of rows) {
    const patch: Record<string, unknown> = {}
    if (r.canonical_url) patch.canonical_url = r.canonical_url
    if (r.title_norm) patch.title_norm = r.title_norm
    if (r.content_hash) patch.content_hash = r.content_hash
    const v = r._tmp_vec
    if (Array.isArray(v)) patch.embedding = vectorLiteral(v)
    if (Object.keys(patch).length === 0) continue
    await sb.from('content_ideas').update(patch).eq('id', r.id); fpUpdated++
  }
  report.fingerprints_backfilled = fpUpdated

  let dropped = 0
  for (const g of groups) {
    const prevMeta = (g.survivor.meta && typeof g.survivor.meta === 'object') ? g.survivor.meta : {}
    const sources = Array.isArray(prevMeta.duplicate_sources) ? prevMeta.duplicate_sources.slice() : []
    for (const d of g.dups) {
      sources.push({
        source_type: d.source_type || null,
        source_ref: d.source_ref || null,
        source_url: d.source_url || null,
        merged_from_id: d.id,
        merged_at: new Date().toISOString(),
        reason: g.reason,
      })
    }
    const capped = sources.slice(-25)
    await sb.from('content_ideas')
      .update({ meta: { ...prevMeta, duplicate_sources: capped }, updated_at: new Date().toISOString() })
      .eq('id', g.survivor.id)
    for (const d of g.dups) {
      await sb.from('content_ideas').update({
        state: 'dropped', buried_at: new Date().toISOString(),
        buried_reason: `dedup_backfill:${g.reason}`, related_idea_ids: [g.survivor.id],
      }).eq('id', d.id)
      dropped++
    }
  }
  report.committed = true
  report.soft_dropped = dropped
  return report
}

async function runIdentityTable(sb: SupabaseClient, args: BackfillArgs, table: 'leads' | 'contacts' | 'guests'): Promise<BackfillReport> {
  const emailColumn = table === 'contacts' ? 'email_normalized' : 'email_norm'
  const cols: string[] = ['id', 'created_at']
  if (table === 'contacts') cols.push('email', 'email_normalized', 'linkedin_url', 'linkedin_url_norm', 'full_name')
  else if (table === 'leads') cols.push('email', 'email_norm', 'linkedin_url', 'linkedin_url_norm', 'full_name')
  else cols.push('email', 'email_norm', 'linkedin_url', 'linkedin_url_norm', 'personal_url', 'personal_url_norm', 'name')
  const { data, error } = await sb.from(table).select(cols.join(',')).order('created_at', { ascending: true }).limit(args.limit)
  if (error) throw new Error(error.message)
  const rows = (data || []) as any[]

  let fingerprintsBackfilled = 0
  for (const r of rows) {
    if (!r[emailColumn] && r.email) { r[emailColumn] = emailNorm(r.email); fingerprintsBackfilled++ }
    if (!r.linkedin_url_norm && r.linkedin_url) { r.linkedin_url_norm = linkedinNorm(r.linkedin_url); fingerprintsBackfilled++ }
    if (table === 'guests' && !r.personal_url_norm && r.personal_url) { r.personal_url_norm = canonicalUrl(r.personal_url); fingerprintsBackfilled++ }
  }

  const groups: Group[] = []
  const claimed = new Set<string>()
  const collect = (key: string, reason: string) => {
    for (const arr of groupByKey(rows, key).values()) {
      const undup = arr.filter(r => !claimed.has(r.id))
      if (undup.length < 2) continue
      const survivor = pickSurvivor(undup)
      const dups = undup.filter(r => r !== survivor)
      for (const d of dups) claimed.add(d.id)
      groups.push({ reason, survivor, dups })
    }
  }
  collect(emailColumn, 'email')
  collect('linkedin_url_norm', 'linkedin')
  if (table === 'guests') collect('personal_url_norm', 'personal_url')

  const byReason: Record<string, number> = {}
  for (const g of groups) byReason[g.reason] = (byReason[g.reason] || 0) + g.dups.length
  const nameField = table === 'guests' ? 'name' : 'full_name'
  const sample: BackfillSample[] = groups.slice(0, 25).map(g => ({
    reason: g.reason,
    survivor_id: g.survivor.id,
    survivor_title: String(g.survivor[nameField] || g.survivor.email || '').slice(0, 100),
    dup_ids: g.dups.map(d => d.id),
    dup_titles: g.dups.map(d => String(d[nameField] || d.email || '').slice(0, 100)),
  }))

  const report: BackfillReport = {
    table, loaded: rows.length, groups: groups.length,
    total_duplicates: claimed.size, by_reason: byReason, sample,
    committed: false, embedded: 0, fingerprints_backfilled: fingerprintsBackfilled, soft_dropped: 0,
  }
  if (args.dry) return report

  let fpUpdated = 0
  for (const r of rows) {
    const patch: Record<string, unknown> = {}
    if (r[emailColumn]) patch[emailColumn] = r[emailColumn]
    if (r.linkedin_url_norm) patch.linkedin_url_norm = r.linkedin_url_norm
    if (table === 'guests' && r.personal_url_norm) patch.personal_url_norm = r.personal_url_norm
    if (Object.keys(patch).length === 0) continue
    await sb.from(table).update(patch).eq('id', r.id); fpUpdated++
  }
  report.fingerprints_backfilled = fpUpdated

  let buried = 0
  for (const g of groups) for (const d of g.dups) {
    await sb.from(table).update({ buried_at: new Date().toISOString(), buried_reason: `dedup_backfill:${g.reason}` }).eq('id', d.id)
    buried++
  }
  report.committed = true
  report.soft_dropped = buried
  return report
}

async function runVisibilityTargets(sb: SupabaseClient, args: BackfillArgs): Promise<BackfillReport> {
  const { data, error } = await sb
    .from('visibility_targets')
    .select('id, title, event_url, event_url_norm, title_norm, created_at, deadline_at, source')
    .order('created_at', { ascending: true })
    .limit(args.limit)
  if (error) throw new Error(error.message)
  const rows = (data || []) as any[]
  let fingerprintsBackfilled = 0
  for (const r of rows) {
    if (!r.event_url_norm && r.event_url) { r.event_url_norm = canonicalUrl(r.event_url); fingerprintsBackfilled++ }
    if (!r.title_norm && r.title) { r.title_norm = titleNorm(r.title); fingerprintsBackfilled++ }
  }
  const groups: Group[] = []
  const claimed = new Set<string>()
  for (const arr of groupByKey(rows, 'event_url_norm').values()) {
    if (arr.length < 2) continue
    const survivor = pickSurvivor(arr)
    const dups = arr.filter(r => r !== survivor && !claimed.has(r.id))
    if (!dups.length) continue
    for (const d of dups) claimed.add(d.id)
    groups.push({ reason: 'event_url', survivor, dups })
  }
  for (const arr of groupByKey(rows, 'title_norm').values()) {
    const undup = arr.filter(r => !claimed.has(r.id))
    if (undup.length < 2) continue
    undup.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
    for (let i = 0; i < undup.length; i++) {
      if (claimed.has(undup[i].id)) continue
      const a = undup[i]
      const bucket = [a]
      for (let j = i + 1; j < undup.length; j++) {
        const b = undup[j]
        if (claimed.has(b.id)) continue
        const da = a.deadline_at ? new Date(a.deadline_at).getTime() : null
        const db = b.deadline_at ? new Date(b.deadline_at).getTime() : null
        if (da == null || db == null || Math.abs(da - db) > 60 * 86_400_000) continue
        bucket.push(b)
      }
      if (bucket.length > 1) {
        const survivor = bucket[0]
        const dups = bucket.slice(1)
        for (const d of dups) claimed.add(d.id)
        groups.push({ reason: 'title+deadline', survivor, dups })
      }
    }
  }
  const byReason: Record<string, number> = {}
  for (const g of groups) byReason[g.reason] = (byReason[g.reason] || 0) + g.dups.length
  const sample: BackfillSample[] = groups.slice(0, 25).map(g => ({
    reason: g.reason,
    survivor_id: g.survivor.id,
    survivor_title: String(g.survivor.title || '').slice(0, 100),
    dup_ids: g.dups.map(d => d.id),
    dup_titles: g.dups.map(d => String(d.title || '').slice(0, 100)),
  }))
  const report: BackfillReport = {
    table: 'visibility_targets', loaded: rows.length, groups: groups.length,
    total_duplicates: claimed.size, by_reason: byReason, sample,
    committed: false, embedded: 0, fingerprints_backfilled: fingerprintsBackfilled, soft_dropped: 0,
  }
  if (args.dry) return report
  let fpUpdated = 0
  for (const r of rows) {
    const patch: Record<string, unknown> = {}
    if (r.event_url_norm) patch.event_url_norm = r.event_url_norm
    if (r.title_norm) patch.title_norm = r.title_norm
    if (Object.keys(patch).length === 0) continue
    await sb.from('visibility_targets').update(patch).eq('id', r.id); fpUpdated++
  }
  report.fingerprints_backfilled = fpUpdated
  let buried = 0
  for (const g of groups) for (const d of g.dups) {
    await sb.from('visibility_targets').update({
      buried_at: new Date().toISOString(), buried_reason: `dedup_backfill:${g.reason}`,
    }).eq('id', d.id)
    buried++
  }
  report.committed = true
  report.soft_dropped = buried
  return report
}
