#!/usr/bin/env -S npx tsx
// One-shot rescue of migration-stub visibility_targets rows.
// Selects rows whose why_relevant starts with "Migrated from tasks row",
// uses Brave Search to find the canonical event URL by title, patches
// source_url + event_url + clears the stub text from why_relevant, and
// leaves deep_enriched_at null so the Nova Visibility Deep Enrich retry
// sweep picks the row up on the next hourly tick.
//
// Audit-logs each rescue.

const SUPA_URL = process.env.SUPABASE_URL
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const BRAVE_KEY = process.env.BRAVE_API_KEY

if (!SUPA_URL || !SUPA_KEY || !BRAVE_KEY) {
  console.error('Missing env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, BRAVE_API_KEY')
  process.exit(2)
}

const supaHeaders = {
  apikey: SUPA_KEY,
  Authorization: `Bearer ${SUPA_KEY}`,
  'Content-Type': 'application/json',
}

type Stub = { id: string; title: string; type: string; why_relevant: string | null }

async function findStubs(): Promise<Stub[]> {
  const url = `${SUPA_URL}/rest/v1/visibility_targets?select=id,title,type,why_relevant&why_relevant=ilike.Migrated%20from%20tasks%20row%25`
  const r = await fetch(url, { headers: supaHeaders })
  if (!r.ok) throw new Error(`fetch stubs ${r.status}: ${await r.text()}`)
  return r.json() as Promise<Stub[]>
}

function isEventDomain(url: string): boolean {
  if (!url) return false
  const blocklist = [
    'wtsp.com','prnewswire.com','vendelux.com','sched.com',
    'twitter.com','x.com','youtube.com','facebook.com','linkedin.com',
    'reddit.com','news.ycombinator.com','medium.com'
  ]
  return !blocklist.some(b => url.includes(b))
}

async function searchEventUrl(title: string): Promise<string | null> {
  const q = encodeURIComponent(`${title} 2026 conference`)
  const r = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${q}&count=5`, {
    headers: { 'X-Subscription-Token': BRAVE_KEY }
  })
  if (!r.ok) {
    console.warn(`  Brave error ${r.status}: ${(await r.text()).slice(0,200)}`)
    return null
  }
  const data: any = await r.json()
  const results: Array<{ url: string; title: string }> = data?.web?.results || []
  const winner = results.find(x => isEventDomain(x.url))
  return winner?.url || null
}

async function patchTarget(id: string, body: Record<string, unknown>): Promise<boolean> {
  const r = await fetch(`${SUPA_URL}/rest/v1/visibility_targets?id=eq.${id}`, {
    method: 'PATCH',
    headers: { ...supaHeaders, Prefer: 'return=minimal' },
    body: JSON.stringify(body)
  })
  return r.ok
}

async function auditLog(entry: Record<string, unknown>): Promise<void> {
  await fetch(`${SUPA_URL}/rest/v1/audit_log`, {
    method: 'POST',
    headers: { ...supaHeaders, Prefer: 'return=minimal' },
    body: JSON.stringify(entry)
  })
}

const stubs = await findStubs()
console.log(`Found ${stubs.length} migration-stub visibility_targets`)

for (const s of stubs) {
  console.log(`\n[${s.id.slice(0,8)}] ${s.title}`)
  const eventUrl = await searchEventUrl(s.title)
  if (!eventUrl) {
    console.log(`  ✗ no canonical URL found, skipping`)
    continue
  }
  console.log(`  → ${eventUrl}`)
  const ok = await patchTarget(s.id, {
    source_url: eventUrl,
    event_url: eventUrl,
    why_relevant: null,
    deep_enriched_at: null,
    updated_at: new Date().toISOString(),
  })
  if (!ok) {
    console.log(`  ✗ patch failed`)
    continue
  }
  await auditLog({
    event_type: 'visibility_stub_rescued',
    actor: 'system',
    target: s.title,
    details: { target_id: s.id, source_url: eventUrl, prior_why: s.why_relevant?.slice(0, 200) }
  })
  console.log(`  ✓ rescued`)
}
console.log('\nDone.')

// `export {}` makes this a module. Without it TypeScript treats a file with
// no imports or exports as a global script, so its top-level consts collide
// with every other standalone script in the project (TS2451) and top-level
// await is rejected (TS1375). No runtime effect — tsx already runs it as ESM.
export {}
