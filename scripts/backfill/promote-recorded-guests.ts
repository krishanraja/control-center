#!/usr/bin/env -S npx tsx
// One-off backfill: promote every already-recorded/published guest into the
// Network (contacts), venture mapped from their podcast. Idempotent — reuses the
// same dedup path as the live hook, so re-running is safe.
//
// Usage:
//   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… npx tsx scripts/backfill/promote-recorded-guests.ts [--dry]

import { createClient } from '@supabase/supabase-js'

const SUPA_URL = process.env.SUPABASE_URL
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPA_URL || !SUPA_KEY) { console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY'); process.exit(1) }
const sb = createClient(SUPA_URL, SUPA_KEY)

const DRY = process.argv.includes('--dry')

async function main() {
  const { data, error } = await sb
    .from('guests')
    .select('id, name, status, podcast_target')
    .in('status', ['recorded', 'published'])
  if (error) { console.error(error.message); process.exit(1) }
  const guests = data || []
  console.log(`Found ${guests.length} recorded/published guests.${DRY ? ' (dry)' : ''}`)

  // Import the shared helper lazily so it picks up the same env-configured client.
  const { promoteGuestToContact } = await import('../../api/_guest-to-contact.js')

  let created = 0, matched = 0, failed = 0
  for (const g of guests) {
    if (DRY) { console.log(`  would promote ${g.id.slice(0, 8)}  ${g.name}`); continue }
    const r = await promoteGuestToContact(g.id)
    if (!r.ok) { failed++; console.warn(`  FAILED ${g.id.slice(0, 8)} ${g.name}: ${r.error}`); continue }
    if (r.created) created++; else matched++
    console.log(`  ${r.created ? 'created' : 'matched'} contact for ${g.name}`)
  }
  console.log(`\nDone. created=${created} matched=${matched} failed=${failed}`)
}

main()
