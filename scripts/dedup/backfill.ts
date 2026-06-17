#!/usr/bin/env -S npx tsx
// Cross-surface dedup backfill.
//
// Usage:
//   npx tsx scripts/dedup/backfill.ts --table content_ideas [--dry] [--limit 5000]
//
// What it does:
//   1. Loads all rows from the requested table.
//   2. Computes canonical fingerprints (canonical_url / title_norm /
//      content_hash + embeddings) for every row that's missing them.
//   3. Groups rows by tier:
//        - same canonical identity        → exact-dup group
//        - same title_norm (within 30d)   → near-dup group
//        - same content_hash              → near-dup group
//        - cosine > 0.92 on embedding     → semantic-dup group
//   4. For each group: keeps the OLDEST row as the survivor, soft-drops the
//      rest (state='dropped' / buried_at + buried_reason='dedup_backfill'),
//      merges provenance into the survivor's meta.duplicate_sources.
//   5. Prints a before/after count and 20 sample groups.
//
// Default is --dry: prints what would happen, writes nothing. Re-run without
// --dry to commit.

import { createClient } from '@supabase/supabase-js'
// Use ts-direct imports here — this script is run via tsx, not via the Vercel
// bundler, so the .js suffix isn't required.
import { canonicalUrl, titleNorm, contentHash, emailNorm, linkedinNorm } from '../../api/_text'
import { embedBatch, cosine, vectorLiteral } from '../../api/_embeddings'

const SUPA_URL = process.env.SUPABASE_URL
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPA_URL || !SUPA_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}
const sb = createClient(SUPA_URL, SUPA_KEY)

type TableName = 'content_ideas' | 'leads' | 'contacts' | 'guests' | 'visibility_targets'

interface Args {
  table: TableName
  dry: boolean
  limit: number
}

function parseArgs(): Args {
  const a = process.argv.slice(2)
  let table: TableName = 'content_ideas'
  let dry = true
  let limit = 5000
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--table' && a[i + 1]) { table = a[++i] as TableName }
    else if (a[i] === '--dry') { dry = true }
    else if (a[i] === '--commit') { dry = false }
    else if (a[i] === '--limit' && a[i + 1]) { limit = parseInt(a[++i], 10) || 5000 }
  }
  return { table, dry, limit }
}

const SIM_THRESHOLD = 0.92
const RECENCY_MS = 30 * 86_400_000

async function run() {
  const args = parseArgs()
  console.log(`\n— Dedup backfill: ${args.table} ${args.dry ? '(dry run)' : '(COMMIT)'} —`)
  console.log(`Loading up to ${args.limit} rows…`)

  if (args.table === 'content_ideas') return await runContentIdeas(args)
  if (args.table === 'leads') return await runIdentityTable(args, 'leads')
  if (args.table === 'contacts') return await runIdentityTable(args, 'contacts')
  if (args.table === 'guests') return await runIdentityTable(args, 'guests')
  if (args.table === 'visibility_targets') return await runVisibilityTargets(args)
  console.error(`Unknown table: ${args.table}`)
  process.exit(1)
}

async function runContentIdeas(args: Args) {
  const { data, error } = await sb
    .from('content_ideas')
    .select('id, idea, source_url, source_snippet, source_type, source_ref, canonical_url, title_norm, content_hash, embedding, state, created_at, meta')
    .order('created_at', { ascending: true })
    .limit(args.limit)
  if (error) { console.error(error.message); process.exit(1) }
  const rows = (data || []) as any[]
  console.log(`Loaded ${rows.length} rows.`)

  // 1. Compute fingerprints for any rows missing them. We always populate the
  // local row object so the grouping logic can read consistent fields, even
  // in dry-run mode.
  let missingFp = 0
  for (const r of rows) {
    if (!r.canonical_url && r.source_url) { r.canonical_url = canonicalUrl(r.source_url); missingFp++ }
    if (!r.title_norm && r.idea) { r.title_norm = titleNorm(r.idea); missingFp++ }
    if (!r.content_hash && (r.source_snippet || r.idea)) {
      r.content_hash = contentHash(r.source_snippet || r.idea)
      missingFp++
    }
  }
  console.log(`Computed ${missingFp} missing fingerprints in-memory.`)

  // 2. Compute embeddings only for rows that already lack one AND where the
  // tier-1/2 grouping didn't already collapse them. To keep this affordable
  // we only embed the rows that are NOT already exact-dup'd.
  const groupsByCanonical = new Map<string, any[]>()
  const groupsByTitle = new Map<string, any[]>()
  const groupsByHash = new Map<string, any[]>()
  for (const r of rows) {
    if (r.canonical_url) {
      const k = r.canonical_url
      const arr = groupsByCanonical.get(k) || []
      arr.push(r); groupsByCanonical.set(k, arr)
    }
    if (r.title_norm && r.title_norm.length >= 8) {
      const k = r.title_norm
      const arr = groupsByTitle.get(k) || []
      arr.push(r); groupsByTitle.set(k, arr)
    }
    if (r.content_hash) {
      const k = r.content_hash
      const arr = groupsByHash.get(k) || []
      arr.push(r); groupsByHash.set(k, arr)
    }
  }

  // Survivor map: roId -> survivor id
  const survivorOf = new Map<string, string>()
  const groups: { reason: string; survivor: any; dups: any[] }[] = []

  const pickSurvivor = (rs: any[]): any => rs.slice().sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))[0]

  for (const arr of groupsByCanonical.values()) {
    if (arr.length < 2) continue
    const survivor = pickSurvivor(arr)
    const dups = arr.filter(r => r !== survivor && !survivorOf.has(r.id))
    if (!dups.length) continue
    for (const d of dups) survivorOf.set(d.id, survivor.id)
    groups.push({ reason: 'canonical_url', survivor, dups })
  }
  for (const arr of groupsByTitle.values()) {
    const undup = arr.filter(r => !survivorOf.has(r.id))
    if (undup.length < 2) continue
    const survivor = pickSurvivor(undup)
    const dups = undup.filter(r => r !== survivor)
    if (!dups.length) continue
    for (const d of dups) survivorOf.set(d.id, survivor.id)
    groups.push({ reason: 'title_norm', survivor, dups })
  }
  for (const arr of groupsByHash.values()) {
    const undup = arr.filter(r => !survivorOf.has(r.id))
    if (undup.length < 2) continue
    const survivor = pickSurvivor(undup)
    const dups = undup.filter(r => r !== survivor)
    if (!dups.length) continue
    for (const d of dups) survivorOf.set(d.id, survivor.id)
    groups.push({ reason: 'content_hash', survivor, dups })
  }

  // 3. Embedding pass for what's left.
  const unembedded = rows.filter(r => !r.embedding && !survivorOf.has(r.id))
  if (unembedded.length > 0 && process.env.OPENAI_API_KEY) {
    console.log(`Embedding ${unembedded.length} rows…`)
    const vecs = await embedBatch(unembedded.map(r => ({ title: r.idea, body: r.source_snippet || '' })))
    for (let i = 0; i < unembedded.length; i++) unembedded[i]._tmp_vec = vecs[i]
  } else if (!process.env.OPENAI_API_KEY) {
    console.log('OPENAI_API_KEY not set — skipping semantic tier.')
  }

  const embeddedRows = rows.filter(r => !survivorOf.has(r.id) && (r._tmp_vec || r.embedding))
  // O(n^2) — fine for n=few-thousand. Pre-parse string embeddings if present.
  const getVec = (r: any): number[] | null => {
    if (Array.isArray(r._tmp_vec)) return r._tmp_vec
    if (typeof r.embedding === 'string') {
      try { return JSON.parse(r.embedding) } catch { return null }
    }
    if (Array.isArray(r.embedding)) return r.embedding
    return null
  }
  const semGroups: any[][] = []
  const inSemGroup = new Set<string>()
  for (let i = 0; i < embeddedRows.length; i++) {
    const a = embeddedRows[i]
    if (inSemGroup.has(a.id)) continue
    const va = getVec(a)
    if (!va) continue
    const cluster: any[] = [a]
    for (let j = i + 1; j < embeddedRows.length; j++) {
      const b = embeddedRows[j]
      if (inSemGroup.has(b.id)) continue
      // Skip cross-time matches outside the recency window.
      const dt = Math.abs(new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      if (dt > RECENCY_MS) continue
      const vb = getVec(b)
      if (!vb) continue
      if (cosine(va, vb) >= SIM_THRESHOLD) cluster.push(b)
    }
    if (cluster.length > 1) {
      for (const r of cluster) inSemGroup.add(r.id)
      semGroups.push(cluster)
    }
  }
  for (const arr of semGroups) {
    const survivor = pickSurvivor(arr)
    const dups = arr.filter(r => r !== survivor && !survivorOf.has(r.id))
    if (!dups.length) continue
    for (const d of dups) survivorOf.set(d.id, survivor.id)
    groups.push({ reason: 'embedding', survivor, dups })
  }

  // 4. Report.
  const totalDups = Array.from(survivorOf.keys()).length
  console.log(`\nFound ${groups.length} duplicate groups covering ${totalDups} duplicate rows.`)
  console.log(`(Survivors will be kept; dups will be ${args.dry ? 'flagged' : 'soft-dropped'}.)\n`)

  const sample = groups.slice(0, 20)
  for (const g of sample) {
    console.log(`[${g.reason}]  SURVIVOR: ${g.survivor.id} — ${String(g.survivor.idea || '').slice(0, 80)}`)
    for (const d of g.dups) {
      console.log(`         dup: ${d.id} — ${String(d.idea || '').slice(0, 80)}  (created ${String(d.created_at).slice(0, 10)})`)
    }
    console.log('')
  }

  if (args.dry) {
    console.log(`Dry run. Re-run with --commit to apply.\n`)
    return
  }

  // 5. Commit.
  console.log(`Committing… (${groups.length} groups)`)
  let updatedFp = 0
  // Backfill fingerprints + embeddings on every row first.
  for (const r of rows) {
    const patch: Record<string, unknown> = {}
    if (r.canonical_url && !r._already_has_canonical) patch.canonical_url = r.canonical_url
    if (r.title_norm) patch.title_norm = r.title_norm
    if (r.content_hash) patch.content_hash = r.content_hash
    const v = r._tmp_vec
    if (Array.isArray(v)) patch.embedding = vectorLiteral(v)
    if (Object.keys(patch).length === 0) continue
    await sb.from('content_ideas').update(patch).eq('id', r.id)
    updatedFp++
  }
  console.log(`Backfilled fingerprints on ${updatedFp} rows.`)

  let droppedRows = 0
  for (const g of groups) {
    // Merge provenance into the survivor.
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

    // Soft-drop the dups.
    for (const d of g.dups) {
      await sb.from('content_ideas')
        .update({
          state: 'dropped',
          buried_at: new Date().toISOString(),
          buried_reason: `dedup_backfill:${g.reason}`,
          related_idea_ids: [g.survivor.id],
        })
        .eq('id', d.id)
      droppedRows++
    }
  }
  console.log(`Soft-dropped ${droppedRows} duplicate rows.`)
  console.log(`Done.`)
}

async function runIdentityTable(args: Args, table: 'leads' | 'contacts' | 'guests') {
  // Lightweight identity dedup for the three people-shaped tables. We only
  // collapse on canonical email / LinkedIn URL since person identity matters
  // more than near-duplicates, and the embedding tier on people is more
  // dangerous (same name, different person). This is the conservative path —
  // strict identity exact-match only.
  const emailColumn = table === 'contacts' ? 'email_normalized' : 'email_norm'
  const cols = ['id', 'created_at']
  if (table === 'contacts') {
    cols.push('email', 'email_normalized', 'linkedin_url', 'linkedin_url_norm', 'full_name')
  } else if (table === 'leads') {
    cols.push('email', 'email_norm', 'linkedin_url', 'linkedin_url_norm', 'full_name')
  } else {
    cols.push('email', 'email_norm', 'linkedin_url', 'linkedin_url_norm', 'personal_url', 'personal_url_norm', 'name')
  }
  const { data, error } = await sb.from(table).select(cols.join(',')).order('created_at', { ascending: true }).limit(args.limit)
  if (error) { console.error(error.message); process.exit(1) }
  const rows = (data || []) as any[]
  console.log(`Loaded ${rows.length} rows from ${table}.`)

  // Normalize in-memory.
  for (const r of rows) {
    r[emailColumn] = r[emailColumn] || emailNorm(r.email)
    r.linkedin_url_norm = r.linkedin_url_norm || linkedinNorm(r.linkedin_url)
    if (table === 'guests') r.personal_url_norm = r.personal_url_norm || canonicalUrl(r.personal_url)
  }

  const groupBy = (key: string): Map<string, any[]> => {
    const m = new Map<string, any[]>()
    for (const r of rows) {
      const v = r[key]
      if (!v) continue
      const arr = m.get(v) || []
      arr.push(r); m.set(v, arr)
    }
    return m
  }

  const groups: { reason: string; survivor: any; dups: any[] }[] = []
  const claimed = new Set<string>()
  const collect = (key: string, reason: string) => {
    for (const arr of groupBy(key).values()) {
      const undup = arr.filter(r => !claimed.has(r.id))
      if (undup.length < 2) continue
      const survivor = undup.slice().sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))[0]
      const dups = undup.filter(r => r !== survivor)
      for (const d of dups) claimed.add(d.id)
      groups.push({ reason, survivor, dups })
    }
  }
  collect(emailColumn, 'email')
  collect('linkedin_url_norm', 'linkedin')
  if (table === 'guests') collect('personal_url_norm', 'personal_url')

  console.log(`Found ${groups.length} duplicate groups covering ${claimed.size} duplicate rows in ${table}.`)
  for (const g of groups.slice(0, 20)) {
    const nameField = table === 'guests' ? 'name' : 'full_name'
    console.log(`[${g.reason}]  SURVIVOR: ${g.survivor.id} — ${g.survivor[nameField] || g.survivor.email}`)
    for (const d of g.dups) console.log(`         dup: ${d.id} — ${d[nameField] || d.email}`)
  }
  if (args.dry) { console.log('\nDry run. Re-run with --commit to apply.\n'); return }

  // Backfill normalized columns on every row.
  let updated = 0
  for (const r of rows) {
    const patch: Record<string, unknown> = {}
    if (r[emailColumn]) patch[emailColumn] = r[emailColumn]
    if (r.linkedin_url_norm) patch.linkedin_url_norm = r.linkedin_url_norm
    if (table === 'guests' && r.personal_url_norm) patch.personal_url_norm = r.personal_url_norm
    if (Object.keys(patch).length === 0) continue
    await sb.from(table).update(patch).eq('id', r.id)
    updated++
  }
  console.log(`Backfilled ${updated} normalized rows in ${table}.`)

  let buried = 0
  for (const g of groups) {
    for (const d of g.dups) {
      await sb.from(table).update({
        buried_at: new Date().toISOString(),
        buried_reason: `dedup_backfill:${g.reason}`,
      }).eq('id', d.id)
      buried++
    }
  }
  console.log(`Buried ${buried} duplicate rows in ${table}. Done.`)
}

async function runVisibilityTargets(args: Args) {
  const { data, error } = await sb
    .from('visibility_targets')
    .select('id, title, event_url, event_url_norm, title_norm, created_at, deadline_at, source')
    .order('created_at', { ascending: true })
    .limit(args.limit)
  if (error) { console.error(error.message); process.exit(1) }
  const rows = (data || []) as any[]
  for (const r of rows) {
    r.event_url_norm = r.event_url_norm || canonicalUrl(r.event_url)
    r.title_norm = r.title_norm || titleNorm(r.title || '')
  }
  const groups: { reason: string; survivor: any; dups: any[] }[] = []
  const claimed = new Set<string>()
  const groupBy = (key: string) => {
    const m = new Map<string, any[]>()
    for (const r of rows) {
      const v = r[key]
      if (!v) continue
      const arr = m.get(v) || []
      arr.push(r); m.set(v, arr)
    }
    return m
  }
  for (const arr of groupBy('event_url_norm').values()) {
    if (arr.length < 2) continue
    const survivor = arr.slice().sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))[0]
    const dups = arr.filter(r => r !== survivor && !claimed.has(r.id))
    if (!dups.length) continue
    for (const d of dups) claimed.add(d.id)
    groups.push({ reason: 'event_url', survivor, dups })
  }
  // Same title + deadline within 60 days
  for (const arr of groupBy('title_norm').values()) {
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
  console.log(`Found ${groups.length} duplicate groups covering ${claimed.size} duplicate rows in visibility_targets.`)
  for (const g of groups.slice(0, 20)) {
    console.log(`[${g.reason}]  SURVIVOR: ${g.survivor.id} — ${g.survivor.title}`)
    for (const d of g.dups) console.log(`         dup: ${d.id} — ${d.title}`)
  }
  if (args.dry) { console.log('\nDry run. Re-run with --commit to apply.\n'); return }
  for (const r of rows) {
    const patch: Record<string, unknown> = {}
    if (r.event_url_norm) patch.event_url_norm = r.event_url_norm
    if (r.title_norm) patch.title_norm = r.title_norm
    if (Object.keys(patch).length === 0) continue
    await sb.from('visibility_targets').update(patch).eq('id', r.id)
  }
  let buried = 0
  for (const g of groups) for (const d of g.dups) {
    await sb.from('visibility_targets').update({
      buried_at: new Date().toISOString(),
      buried_reason: `dedup_backfill:${g.reason}`,
    }).eq('id', d.id)
    buried++
  }
  console.log(`Buried ${buried} duplicate rows. Done.`)
}

run().catch(e => { console.error(e); process.exit(1) })
