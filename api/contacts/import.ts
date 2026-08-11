import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../_supabase.js'
import { emailNorm, linkedinNorm } from '../_text.js'
import { parseDelimited } from '../_csv.js'

// POST /api/contacts/import — Relationship Engine CSV import with provenance.
//
// body: {
//   source_document_name, raw_text? | drive_url?,
//   origin_venture, origin_campaign, consent_tier
// }
//
// v1: parse raw_text as CSV (dependency-free), tolerant of common header
// variants. Dedupe each row against existing contacts by normalized email OR
// linkedin_url; insert only new ones with full provenance and triage_status
// 'pending' so the Stage-1 scorer picks them up.
//
// Returns { ok: true, inserted, duplicates, total }.

const TIERS = new Set(['cold_scraped', 'cold_engaged', 'permissioned', 'warm', 'customer'])

interface ParsedRow {
  full_name?: string
  email?: string
  linkedin_url?: string
  company?: string
  title?: string
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Cache-Control', 'no-store')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' })

  const body = (req.body || {}) as {
    source_document_name?: string
    raw_text?: string
    drive_url?: string
    origin_venture?: string
    origin_campaign?: string
    consent_tier?: string
  }

  if (!body.origin_venture) {
    return res.status(400).json({ ok: false, error: 'origin_venture is required' })
  }
  if (!body.origin_campaign) {
    return res.status(400).json({ ok: false, error: 'origin_campaign is required' })
  }
  const consentTier = body.consent_tier || 'permissioned'
  if (!TIERS.has(consentTier)) {
    return res.status(400).json({ ok: false, error: `invalid consent_tier: ${consentTier}` })
  }

  // Drive import is stubbed for v1 — keep the field, reject for now.
  if (body.drive_url && !body.raw_text) {
    return res.status(400).json({ ok: false, error: 'drive import not yet wired' })
  }

  if (!body.raw_text || !body.raw_text.trim()) {
    return res.status(400).json({ ok: false, error: 'raw_text is required' })
  }

  const parsed = parseCsv(body.raw_text)
  const total = parsed.length
  if (total === 0) {
    return res.json({ ok: true, inserted: 0, duplicates: 0, total: 0 })
  }

  // Collect candidate keys for a single dedupe lookup. Normalize through the
  // shared helpers so the comparison matches the canonical columns the DB
  // unique indexes guard.
  const emails = new Set<string>()
  const linkedins = new Set<string>()
  for (const r of parsed) {
    const en = emailNorm(r.email)
    const ln = linkedinNorm(r.linkedin_url)
    if (en) emails.add(en)
    if (ln) linkedins.add(ln)
  }

  const existingEmails = new Set<string>()
  const existingLinkedins = new Set<string>()
  try {
    if (emails.size > 0) {
      const { data } = await supabase
        .from('contacts')
        .select('email_normalized')
        .in('email_normalized', Array.from(emails))
      for (const row of data || []) {
        if (row.email_normalized) existingEmails.add(row.email_normalized)
      }
    }
    if (linkedins.size > 0) {
      const { data } = await supabase
        .from('contacts')
        .select('linkedin_url_norm')
        .in('linkedin_url_norm', Array.from(linkedins))
      for (const row of data || []) {
        if (row.linkedin_url_norm) existingLinkedins.add(row.linkedin_url_norm)
      }
    }
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: `dedupe lookup failed: ${String(e?.message || e)}` })
  }

  const now = new Date().toISOString()
  const seenEmails = new Set<string>()
  const seenLinkedins = new Set<string>()
  const toInsert: Record<string, unknown>[] = []
  let duplicates = 0

  for (const r of parsed) {
    const en = emailNorm(r.email)
    const ln = linkedinNorm(r.linkedin_url)
    const dupExisting =
      (en && existingEmails.has(en)) ||
      (ln && existingLinkedins.has(ln))
    const dupInBatch =
      (en && seenEmails.has(en)) ||
      (ln && seenLinkedins.has(ln))
    if (dupExisting || dupInBatch) {
      duplicates++
      continue
    }
    if (en) seenEmails.add(en)
    if (ln) seenLinkedins.add(ln)

    toInsert.push({
      full_name: r.full_name || null,
      email: r.email || null,
      // NOT email_normalized: it is GENERATED ALWAYS AS lower(btrim(email)),
      // so naming it in an INSERT makes Postgres reject the whole statement
      // (428C9). Every import through this route has been failing on it. The
      // column still populates itself from `email` above.
      linkedin_url: r.linkedin_url || null,
      linkedin_url_norm: ln,
      company: r.company || null,
      title: r.title || null,
      origin_channel: 'import',
      origin_venture: body.origin_venture,
      origin_campaign: body.origin_campaign,
      sources: [{ type: 'import', document: body.source_document_name || null }],
      consent_tier: consentTier,
      triage_status: 'pending',
      acquired_at: now,
    })
  }

  let inserted = 0
  if (toInsert.length > 0) {
    const { data, error } = await supabase
      .from('contacts')
      .insert(toInsert)
      .select('id')
    if (error) {
      return res.status(500).json({ ok: false, error: error.message })
    }
    inserted = data?.length ?? 0
  }

  return res.json({ ok: true, inserted, duplicates, total })
}

// ─── Dependency-free CSV parsing ──────────────────────────────────────────────

// Header variants → canonical field. Lower-cased, punctuation-insensitive.
const HEADER_MAP: Record<string, keyof ParsedRow> = {
  name: 'full_name',
  fullname: 'full_name',
  full_name: 'full_name',
  contactname: 'full_name',
  email: 'email',
  emailaddress: 'email',
  email_address: 'email',
  workemail: 'email',
  linkedin: 'linkedin_url',
  linkedinurl: 'linkedin_url',
  linkedin_url: 'linkedin_url',
  linkedinprofile: 'linkedin_url',
  profileurl: 'linkedin_url',
  company: 'company',
  companyname: 'company',
  organization: 'company',
  organisation: 'company',
  account: 'company',
  title: 'title',
  jobtitle: 'title',
  job_title: 'title',
  role: 'title',
  position: 'title',
}

function normHeader(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function normEmail(v?: string): string | undefined {
  if (!v) return undefined
  const e = v.trim().toLowerCase()
  return e.includes('@') ? e : undefined
}

function parseCsv(text: string): ParsedRow[] {
  const rows = parseDelimited(text)
  if (rows.length < 1) return []

  const header = rows[0].map(normHeader)
  // Build column index → field. If no recognized headers at all, treat first
  // row as data with positional fallback (name,email).
  const colField: (keyof ParsedRow | null)[] = header.map(h => {
    // exact, then collapsed-variant match
    if (HEADER_MAP[h]) return HEADER_MAP[h]
    const collapsed = h.replace(/address|url|name$/g, '')
    return HEADER_MAP[collapsed] || null
  })
  const recognized = colField.some(f => f != null)

  const out: ParsedRow[] = []
  const dataRows = recognized ? rows.slice(1) : rows

  // first/last name reconstruction when split columns exist
  const firstIdx = header.findIndex(h => h === 'firstname' || h === 'first')
  const lastIdx = header.findIndex(h => h === 'lastname' || h === 'last')

  for (const cells of dataRows) {
    if (cells.length === 0 || cells.every(c => !c.trim())) continue
    const r: ParsedRow = {}
    if (recognized) {
      for (let i = 0; i < cells.length; i++) {
        const field = colField[i]
        const val = (cells[i] || '').trim()
        if (!field || !val) continue
        if (field === 'email') r.email = normEmail(val)
        else if (field === 'linkedin_url') r.linkedin_url = val
        else r[field] = val
      }
      if (!r.full_name && firstIdx >= 0) {
        const fn = (cells[firstIdx] || '').trim()
        const ln = lastIdx >= 0 ? (cells[lastIdx] || '').trim() : ''
        const joined = [fn, ln].filter(Boolean).join(' ')
        if (joined) r.full_name = joined
      }
    } else {
      // positional fallback: name, email
      r.full_name = (cells[0] || '').trim() || undefined
      r.email = normEmail(cells[1])
    }
    // keep rows with at least one identifying field
    if (r.email || r.linkedin_url || r.full_name) out.push(r)
  }
  return out
}

// Minimal RFC-4180-ish parser: handles quoted fields, escaped quotes, and
// both comma and tab delimiters. No external deps.
