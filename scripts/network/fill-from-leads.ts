#!/usr/bin/env -S npx tsx
// Fill gaps in existing contacts from an old lead file, through the gate.
//
// The Apollo/Instantly exports carry a real asset — LinkedIn URLs for people
// already in the network who have none — sitting next to a real hazard. In the
// consolidated Master sheet, 1,381 of the linkedin_url values do not belong to
// the person on the row, and 370 provably belong to a DIFFERENT named row in
// the same file. Importing that column as-is would attach hundreds of strangers'
// profiles to real contacts, which is worse than the missing URL it fixes.
//
// So nothing here trusts the file. Every row goes through gateContact with
// source 'lead_file', which is the lowest trust level above 'inferred':
//   - a linkedin_url whose slug cannot be shown to contain the person's own
//     name is REFUSED, not stored with a caveat
//   - existing values always win; this only ever fills an empty column
//   - a pattern-guessed email never reaches contacts.email
//
// Matching is by email only. Name matching across a 4,105-row lead file and an
// 11,755-row network produces collisions on common names, and a wrong match
// here writes a stranger's profile onto someone Krish knows.
//
// Usage:
//   npx tsx scripts/network/fill-from-leads.ts --file <json>            # dry
//   npx tsx scripts/network/fill-from-leads.ts --file <json> --commit
//
// The file is a JSON array of { full_name, email, linkedin_url?, company?,
// title? } — the shape the gate probe writes.
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { gateContact } from '../../api/_ingestGate'

const SUPA_URL = process.env.SUPABASE_URL
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPA_URL || !SUPA_KEY) { console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY'); process.exit(1) }
const sb = createClient(SUPA_URL, SUPA_KEY)

const COMMIT = process.argv.includes('--commit')
const fileArg = process.argv.indexOf('--file')
const FILE = fileArg >= 0 ? process.argv[fileArg + 1] : ''
if (!FILE) { console.error('Missing --file <json>'); process.exit(1) }

interface Lead { full_name?: string; email?: string; linkedin_url?: string; company?: string; title?: string }
interface Row { id: string; full_name: string | null; email: string | null; email_normalized: string | null; linkedin_url: string | null; company: string | null; title: string | null }

const CHUNK = 200

async function main() {
  const leads = JSON.parse(readFileSync(FILE, 'utf8')) as Lead[]

  // One URL per email. A lead file that gives the same person two different
  // profiles is telling us it does not know which is theirs, and the gate
  // cannot adjudicate that — so neither do we.
  const byEmail = new Map<string, Lead[]>()
  for (const l of leads) {
    const e = (l.email || '').trim().toLowerCase()
    if (!e) continue
    byEmail.set(e, [...(byEmail.get(e) || []), l])
  }
  const ambiguous = [...byEmail.entries()].filter(([, v]) =>
    new Set(v.map(x => (x.linkedin_url || '').replace(/\/+$/, '').toLowerCase()).filter(Boolean)).size > 1)
  for (const [e] of ambiguous) byEmail.delete(e)

  const emails = [...byEmail.keys()]
  console.log(`${leads.length} leads, ${emails.length} usable emails, ${ambiguous.length} dropped as ambiguous`)

  const stats = { matched: 0, filled: 0, unchanged: 0, refused: 0 }
  const refusals: string[] = []
  const sample: string[] = []

  for (let i = 0; i < emails.length; i += CHUNK) {
    const slice = emails.slice(i, i + CHUNK)
    const { data, error } = await sb
      .from('contacts')
      .select('id, full_name, email, email_normalized, linkedin_url, company, title')
      .in('email_normalized', slice)
    if (error) throw new Error(error.message)

    for (const row of (data || []) as Row[]) {
      const key = row.email_normalized || ''
      const lead = (byEmail.get(key) || [])[0]
      if (!lead) continue
      stats.matched++

      const { patch, rejected } = gateContact(row, lead, 'lead_file')
      if (rejected.length) { stats.refused++; if (refusals.length < 5) refusals.push(`${row.full_name}: ${rejected[0]}`) }

      // Only the LinkedIn gap. Company and title from a lead file are years old
      // and would overwrite nothing useful while ageing the record's provenance;
      // the URL is the thing that cannot be re-derived for free.
      const url = patch.linkedin_url as string | undefined
      if (!url) { stats.unchanged++; continue }

      stats.filled++
      if (sample.length < 10) sample.push(`${row.full_name} -> ${url}`)
      if (COMMIT) {
        const { error: uerr } = await sb.from('contacts')
          .update({ linkedin_url: url, linkedin_url_norm: patch.linkedin_url_norm })
          .eq('id', row.id)
        if (uerr) throw new Error(`${row.id}: ${uerr.message}`)
      }
    }
  }

  console.log(`\nmatched ${stats.matched}  fillable ${stats.filled}  already had one ${stats.unchanged}  refused by the gate ${stats.refused}`)
  if (refusals.length) console.log('\nrefusals (first 5):\n  ' + refusals.join('\n  '))
  if (sample.length) console.log('\nfills (first 10):\n  ' + sample.join('\n  '))
  console.log(COMMIT ? '\nWritten.' : '\nDry run. Re-run with --commit to write.')
}

main().catch(e => { console.error(e); process.exit(1) })
