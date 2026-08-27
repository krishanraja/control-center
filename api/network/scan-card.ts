import type { VercelRequest, VercelResponse } from '@vercel/node'
import { hasAccess, applyGatedHeaders } from '../_auth.js'
import { supabase } from '../_supabase.js'
import { callClaude } from '../_content.js'
import { emailNorm, linkedinNorm } from '../_text.js'
import { outcomeFrom, errored, blockedMessage, isBlocking, type ProviderOutcome } from '../_quota.js'
import { raiseQuotaAlert, logApiCall } from '../_alert.js'
import { JUDGE_MODEL } from '../_models.js'

// POST /api/network/scan-card   (raw image body; bodyParser off)
//
// Read a person off a screenshot. Typically a LinkedIn profile caught on a
// phone, but a conference badge, an email signature or a speaker bio all work —
// the prompt asks for a person, not for LinkedIn specifically.
//
// This route READS ONLY. Nothing is written to contacts here: the extraction is
// returned with a duplicate check so the operator confirms before a permanent
// row is created. Screenshots misread, and a 10,670-person network is not the
// place to find that out afterwards.
//
// bodyParser must stay off — the body is image bytes. That rules out _auth's
// guard(), which reads req.body, so the gate is applied by hand exactly as
// api/network/voice.ts does.

export const config = {
  api: { bodyParser: false },
  maxDuration: 30,
}

// Anthropic accepts these four. A phone screenshot is png or jpeg.
const ACCEPTED = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp'])
// Anthropic's per-image ceiling is 5MB base64, which is ~3.7MB of bytes.
const MAX_BYTES = 3_500_000

function readRawBody(req: VercelRequest): Promise<Buffer> {
  if (Buffer.isBuffer(req.body)) return Promise.resolve(req.body)
  if (typeof req.body === 'string') return Promise.resolve(Buffer.from(req.body))
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (c: Buffer) => {
      size += c.length
      // Stop reading a body that is already over the limit rather than
      // buffering 20MB to reject it at the end.
      if (size > MAX_BYTES * 2) { reject(new Error('image_too_large')); return }
      chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks as unknown as Uint8Array[])))
    req.on('error', reject)
  })
}

function inferMime(contentType: string | undefined): string {
  const ct = (contentType || '').toLowerCase().split(';')[0].trim()
  if (ACCEPTED.has(ct)) return ct
  if (ct.includes('jpg')) return 'image/jpeg'
  return 'image/png'
}

export interface ScannedPerson {
  full_name: string | null
  headline: string | null
  title: string | null
  company: string | null
  location: string | null
  linkedin_url: string | null
  linkedin_handle: string | null
  email: string | null
  followers: number | null
  mutuals: number | null
  /** What the model was reading: linkedin_profile | business_card | email_signature | other */
  source_kind: string | null
  /** 'high' when the fields were read verbatim; 'low' when inferred or blurry. */
  confidence: 'low' | 'medium' | 'high'
  /** Names the model saw but did not choose, when the image held more than one person. */
  other_people: string[]
  notes: string | null
}

const SYSTEM = `You extract ONE person's identity from a screenshot and return ONLY JSON.

Schema:
{
  "full_name": string|null,
  "headline": string|null,        // the full tagline/headline line, verbatim
  "title": string|null,           // job title only, split out of the headline
  "company": string|null,         // current employer only
  "location": string|null,
  "linkedin_url": string|null,    // ONLY if a URL is literally visible
  "linkedin_handle": string|null, // ONLY if a /in/ handle is literally visible
  "email": string|null,           // ONLY if literally visible
  "followers": number|null,
  "mutuals": number|null,
  "source_kind": "linkedin_profile"|"business_card"|"email_signature"|"other",
  "confidence": "low"|"medium"|"high",
  "other_people": [string],       // any OTHER person named in the image
  "notes": string|null            // anything an operator should know before saving
}

Rules, in order of importance:
1. NEVER invent a URL, handle or email. If it is not legibly in the image, it is null.
   A guessed linkedin.com/in/ slug is worse than no slug: it silently attaches the
   wrong person to a permanent record.
2. Extract the SUBJECT of the page — the profile being viewed — not people in
   "people also viewed", suggestion carousels, or comment threads. Put those
   names in other_people so the operator can see you saw them.
3. Split headline into title + company only when the split is unambiguous.
   Keep the whole line in headline regardless.
4. Set confidence "low" if the image is cropped, blurry, partially obscured, or
   the subject is ambiguous. Say why in notes.
5. If there is no identifiable person, set full_name to null and explain in notes.
6. Return the JSON object only. No prose, no markdown fence.`

function parse(raw: string): ScannedPerson | null {
  const text = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    const j = JSON.parse(text.slice(start, end + 1)) as Record<string, any>
    const s = (v: unknown, max = 300): string | null => {
      const t = typeof v === 'string' ? v.trim() : ''
      return t && t.toLowerCase() !== 'null' ? t.slice(0, max) : null
    }
    const n = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

    // A handle is only trusted when it is literally a /in/ slug. Anything else
    // the model calls a "handle" is a guess.
    const handle = s(j.linkedin_handle, 120)?.replace(/^\/?(in\/)?/, '') || null
    const urlRaw = s(j.linkedin_url, 300)
    const url = urlRaw && /linkedin\.com\/in\//i.test(urlRaw)
      ? urlRaw
      : handle ? `https://www.linkedin.com/in/${handle}` : null

    return {
      full_name: s(j.full_name, 200),
      headline: s(j.headline, 600),
      title: s(j.title, 200),
      company: s(j.company, 200),
      location: s(j.location, 200),
      linkedin_url: url,
      linkedin_handle: handle,
      email: emailNorm(s(j.email, 320)),
      followers: n(j.followers),
      mutuals: n(j.mutuals),
      source_kind: s(j.source_kind, 40),
      confidence: ['low', 'medium', 'high'].includes(String(j.confidence)) ? j.confidence : 'low',
      other_people: (Array.isArray(j.other_people) ? j.other_people : []).map((x: unknown) => String(x).slice(0, 120)).slice(0, 10),
      notes: s(j.notes, 600),
    }
  } catch { return null }
}

/** Existing-contact lookup on the identifiers a screenshot can actually yield.
 *
 *  Deliberately NOT _dedup.checkDuplicate: that helper's semantic tier needs an
 *  embedding and its contract is "is this a duplicate", answered yes/no. Here
 *  the question is "which existing person is this, so the operator can enrich
 *  them in place instead of creating a second row", which wants the row back. */
async function findExisting(p: ScannedPerson): Promise<{ id: string; full_name: string | null; company: string | null; title: string | null; consent_tier: string; enrichment_status: string | null; matched_on: string } | null> {
  const ln = linkedinNorm(p.linkedin_url)
  const en = p.email ? emailNorm(p.email) : null

  const probes: { col: string; val: string; label: string }[] = []
  if (ln) probes.push({ col: 'linkedin_url_norm', val: ln, label: 'linkedin' })
  if (en) probes.push({ col: 'email_normalized', val: en, label: 'email' })

  for (const probe of probes) {
    const { data } = await supabase
      .from('contacts')
      .select('id, full_name, company, title, consent_tier, enrichment_status')
      .eq(probe.col, probe.val)
      .limit(1)
    if (data?.length) return { ...(data[0] as any), matched_on: probe.label }
  }

  // No hard identifier in the image, which is the common case for a LinkedIn
  // screenshot: fall back to an exact name match, narrowed by company when the
  // screenshot gave one. Reported as a WEAK match so the UI asks rather than
  // assumes — "Ryan Slipakoff" is not a unique key.
  if (p.full_name) {
    let q = supabase
      .from('contacts')
      .select('id, full_name, company, title, consent_tier, enrichment_status')
      .ilike('full_name', p.full_name)
      .limit(2)
    if (p.company) q = q.ilike('company', `%${p.company}%`)
    const { data } = await q
    if (data?.length === 1) return { ...(data[0] as any), matched_on: p.company ? 'name_and_company' : 'name_only' }
  }
  return null
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  applyGatedHeaders(res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' })
  if (!hasAccess(req)) return res.status(401).json({ ok: false, error: 'unauthorized' })

  if (!process.env.ANTHROPIC_API_KEY) {
    // Not a credit problem — a configuration one. Named as such so it is not
    // mistaken for the alert below.
    return res.status(503).json({ ok: false, error: 'anthropic_not_configured', alert: 'ANTHROPIC_API_KEY is not set, so screenshots cannot be read at all.' })
  }

  let body: Buffer
  try {
    body = await readRawBody(req)
  } catch (e: unknown) {
    const tooLarge = String((e as Error)?.message) === 'image_too_large'
    return res.status(tooLarge ? 413 : 400).json({
      ok: false,
      error: tooLarge ? 'image_too_large' : 'unreadable_body',
      detail: tooLarge ? `Screenshot is over ${Math.round(MAX_BYTES / 1e6)}MB. Crop it to the profile header and retry.` : undefined,
    })
  }
  if (!body.length) return res.status(400).json({ ok: false, error: 'empty_body' })
  if (body.length > MAX_BYTES) {
    return res.status(413).json({ ok: false, error: 'image_too_large', detail: `Screenshot is ${(body.length / 1e6).toFixed(1)}MB; the limit is ${Math.round(MAX_BYTES / 1e6)}MB.` })
  }

  const mime = inferMime(req.headers['content-type'])
  let outcome: ProviderOutcome
  let raw = ''
  try {
    raw = await callClaude({
      agent: 'network-scan-card',
      system: SYSTEM,
      user: 'Extract the person from this screenshot.',
      images: [{ mime, data: body.toString('base64') }],
      // Haiku reads a profile header accurately and returns in ~2s. The task is
      // transcription with strict rules, not judgment; the judgment pass later
      // uses a bigger model on the enriched evidence.
      model: JUDGE_MODEL,
      maxTokens: 900,
      temperature: 0,
      timeoutMs: 22000,
    })
    outcome = { api: 'anthropic', status: 'ok' }
    await logApiCall({ api: 'anthropic', endpoint: 'v1/messages(vision)', units: 1, source: 'network-scan-card' })
  } catch (e: unknown) {
    const err = e as Error & { status?: number; body?: string }
    outcome = err.status
      ? outcomeFrom('anthropic', err.status, err.body || err.message)
      : errored('anthropic', String(err?.message || e))

    // The one place a screenshot read can hit a credit wall. Alert rather than
    // return a bare 502 — a silent failure here is the start of the exact
    // "half enriched and nobody said so" path this design exists to prevent.
    if (isBlocking(outcome)) {
      const alert = await raiseQuotaAlert({ blocked: [outcome], subject: 'screenshot scan', source: 'network-scan-card' })
      return res.status(402).json({
        ok: false,
        error: 'api_credits',
        blocked: [outcome],
        alert: blockedMessage([outcome]),
        alert_sent: alert.notified,
        alert_error: alert.error,
      })
    }
    return res.status(502).json({ ok: false, error: 'scan_failed', detail: outcome.detail })
  }

  const person = parse(raw)
  if (!person) return res.status(502).json({ ok: false, error: 'unparseable_extraction' })
  if (!person.full_name) {
    return res.status(200).json({ ok: true, person, existing: null, usable: false, reason: person.notes || 'No identifiable person in the image.' })
  }

  let existing = null
  try {
    existing = await findExisting(person)
  } catch { /* a failed lookup must not lose the extraction */ }

  return res.status(200).json({ ok: true, person, existing, usable: true })
}
