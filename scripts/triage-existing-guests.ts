#!/usr/bin/env -S npx tsx
// PR 5 — triage existing guests pile.
//   1. For guests with target_type='press_target', insert a matching
//      visibility_targets row with type='press_relationship' (copying name to
//      title, why_fit to why_relevant, source_url derived from linkedin_url
//      or personal_url), then skip-status the guest row.
//   2. For builder_economy guests whose source='migration' (i.e. the
//      Show HN-username pile), skip-status them. The next post-merge step
//      will permanently delete the builder_economy pile per the user's call.

const SUPA_URL = process.env.SUPABASE_URL
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

const supaHeaders = {
  apikey: SUPA_KEY!,
  Authorization: `Bearer ${SUPA_KEY!}`,
  'Content-Type': 'application/json',
}

type Guest = {
  id: string
  name: string
  email: string | null
  linkedin_url: string | null
  personal_url: string | null
  twitter_handle: string | null
  podcast_target: string
  target_type: string
  one_liner: string | null
  why_fit: string | null
  fit_score: number | null
  status: string
  source: string
}

const today = new Date().toISOString().slice(0, 10)

async function fetchJSON<T>(url: string): Promise<T> {
  const r = await fetch(url, { headers: supaHeaders })
  if (!r.ok) throw new Error(`${r.status}: ${await r.text()}`)
  return r.json() as Promise<T>
}

// ---------- Step 1: press_target guests -> visibility_targets ----------
const pressGuests = await fetchJSON<Guest[]>(
  `${SUPA_URL}/rest/v1/guests?select=id,name,email,linkedin_url,personal_url,twitter_handle,podcast_target,target_type,one_liner,why_fit,fit_score,status,source&target_type=eq.press_target&status=not.in.(dropped,published)`
)
console.log(`Press guests to triage: ${pressGuests.length}`)

const visibilityInserts = pressGuests.map(g => ({
  title: g.name,
  type: 'press_relationship',
  source_url: g.linkedin_url || g.personal_url || (g.twitter_handle ? `https://twitter.com/${g.twitter_handle.replace(/^@/, '')}` : null),
  why_relevant: g.why_fit || g.one_liner,
  status: 'queued',
  source: 'nell-triage-' + today,
  quality_score: (g.fit_score && g.fit_score >= 8) ? 'green' : (g.fit_score && g.fit_score >= 6) ? 'amber' : 'red',
  relevance_score: g.fit_score,
  raw_data: { migrated_from_guest_id: g.id, original_podcast_target: g.podcast_target, original_one_liner: g.one_liner }
}))

if (visibilityInserts.length) {
  const r = await fetch(`${SUPA_URL}/rest/v1/visibility_targets`, {
    method: 'POST',
    headers: { ...supaHeaders, Prefer: 'return=minimal' },
    body: JSON.stringify(visibilityInserts)
  })
  if (!r.ok) {
    console.error(`Failed insert: ${r.status} ${await r.text()}`)
    process.exit(1)
  }
  console.log(`  ${visibilityInserts.length} press_target rows inserted into visibility_targets`)
}

// Skip-status the press_target guests
let pressDropped = 0
for (const g of pressGuests) {
  const r = await fetch(`${SUPA_URL}/rest/v1/guests?id=eq.${g.id}`, {
    method: 'PATCH',
    headers: { ...supaHeaders, Prefer: 'return=minimal' },
    body: JSON.stringify({
      status: 'dropped',
      notes: ((g as any).notes ? `${(g as any).notes}\n` : '') +
        `[${today}] Moved to visibility_targets as press_relationship by triage.`
    })
  })
  if (r.ok) pressDropped++
  else console.warn(`  PATCH ${g.id.slice(0,8)} ${g.name} failed: ${r.status} ${(await r.text()).slice(0,160)}`)
}
console.log(`  ${pressDropped} guest rows marked dropped (of ${pressGuests.length})`)

// ---------- Step 2: skip-status the HN-sourced builder_economy pile ----------
const beTrash = await fetchJSON<Guest[]>(
  `${SUPA_URL}/rest/v1/guests?select=id,name,source,podcast_target,status&podcast_target=eq.builder_economy&status=not.in.(dropped,published)`
)
console.log(`\nBuilder economy candidates to skip: ${beTrash.length}`)

let beDropped = 0
for (const g of beTrash) {
  const r = await fetch(`${SUPA_URL}/rest/v1/guests?id=eq.${g.id}`, {
    method: 'PATCH',
    headers: { ...supaHeaders, Prefer: 'return=minimal' },
    body: JSON.stringify({
      status: 'dropped',
      notes: `[${today}] Dropped: HN-sourced, did not meet editorial bar.`
    })
  })
  if (r.ok) beDropped++
  else console.warn(`  PATCH ${g.id.slice(0,8)} ${g.name} failed: ${r.status} ${(await r.text()).slice(0,160)}`)
}
console.log(`  ${beDropped} builder_economy guest rows marked dropped (of ${beTrash.length})`)

// ---------- Audit ----------
await fetch(`${SUPA_URL}/rest/v1/audit_log`, {
  method: 'POST',
  headers: { ...supaHeaders, Prefer: 'return=minimal' },
  body: JSON.stringify({
    event_type: 'guest_triage_run',
    actor: 'system',
    target: 'guests + visibility_targets',
    details: {
      press_guests_moved: pressGuests.length,
      builder_economy_skipped: beTrash.length,
      run_at: new Date().toISOString()
    }
  })
})

console.log('\nDone.')

// `export {}` makes this a module. Without it TypeScript treats a file with
// no imports or exports as a global script, so its top-level consts collide
// with every other standalone script in the project (TS2451) and top-level
// await is rejected (TS1375). No runtime effect — tsx already runs it as ESM.
export {}
