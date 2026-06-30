import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from './_supabase.js'
import { callClaude } from './_content.js'
import { JUDGMENT_ECONOMY_LENS, lensFitScore } from './_judgmentLens.js'

// ─────────────────────────────────────────────────────────────────────────────
// discover-guest-scout — the cadenced "judgment economy" podcast-guest scout.
//
// Upgrades guest discovery from manual paste to an automated scout that finds
// operators in the lens direction. It seeds from two places (the content<->guest
// flywheel):
//   1) the lens's curated sharp voices, and
//   2) the distinct authors the content radar already surfaced into
//      lens_seed_candidates (a voice worth quoting is a voice worth booking).
//
// For each candidate person it dedups against the existing guests pipeline,
// scores fit with the deterministic lensFitScore, drafts a why-fit + a couple of
// episode angles + a pitch in Krish's pod voice (best-effort), and writes a
// guests row at status='scouted'. It NEVER confirms a guest and NEVER fires the
// confirmed-guest cascade - it only fills the top of the funnel with candidates.
//
// Secret-gated + cron-friendly + key-optional (no ANTHROPIC key => it still
// scouts, just without the drafted pitch). PLANNED enrichment: expand beyond the
// seeds to NEW similar operators via Apollo/PDL (_enrich.ts already has the
// helpers) + the validated Apify LinkedIn actors, behind the same dedup + gate.
// ─────────────────────────────────────────────────────────────────────────────

const FRESH_DAYS = 45
const MAX_DRAFTS = 8 // cap the LLM drafting per run (cost discipline)

// Krish's pod voice + the guest archetype, so the drafted angles/pitch sound like
// him: meandering not scripted, reflect-back then reframe into a portable idea,
// honest and specific, ends on a door not a summary. No em dashes.
const SCOUT_SYSTEM =
  'You help Krish Raja scout podcast guests for his shows (Signal & Noise, Builder Economy). ' +
  'Krish runs a meandering, unscripted conversation: he opens broad, reflects back, and reframes ' +
  'the guest\'s story into a portable idea (e.g. "CEO of you", "the say-do gap", "judgment in the middle"). ' +
  'He is warm, curious, lightly cynical about AI hype, British-Australian, and ends on a provocation, not a summary. ' +
  'The editorial direction: ' + JUDGMENT_ECONOMY_LENS.thesis + ' ' +
  'The kind of guest worth booking: ' + JUDGMENT_ECONOMY_LENS.guestArchetype + ' ' +
  'No em dashes, no buzzwords, plain specific language.'

interface SeedPerson {
  name: string
  linkedin: string | null
  why: string
  context: string // extra text to score fit against
}

function linkedinUrl(slug: string | null): string | null {
  if (!slug) return null
  return slug.startsWith('http') ? slug : `https://www.linkedin.com/in/${slug}`
}

const norm = (s: string | null | undefined): string => (s || '').toLowerCase().replace(/\s+/g, ' ').trim()

interface AngleDraft {
  why_fit: string
  angles: string[]
  pitch: string
}

async function draftFor(p: SeedPerson): Promise<AngleDraft | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null
  try {
    const raw = await callClaude({
      system: SCOUT_SYSTEM,
      user:
        `Guest candidate: ${p.name}. What we know: ${p.why} ${p.context}`.slice(0, 1200) +
        '\n\nReply ONLY with JSON: {"why_fit":"<one sentence on why they fit the direction>",' +
        '"angles":["<episode angle 1>","<episode angle 2>"],' +
        '"pitch":"<2-3 sentence outreach note in Krish\'s voice, warm and specific>"}',
      model: 'claude-sonnet-4-6',
      maxTokens: 500,
      temperature: 0.6,
    })
    const m = raw.match(/\{[\s\S]*\}/)
    if (!m) return null
    const j = JSON.parse(m[0]) as Partial<AngleDraft>
    const angles = Array.isArray(j.angles) ? j.angles.filter((a) => typeof a === 'string') : []
    if (!j.why_fit && !j.pitch && angles.length === 0) return null
    return { why_fit: j.why_fit || p.why, angles, pitch: j.pitch || '' }
  } catch {
    return null
  }
}

function checkSecret(req: VercelRequest): boolean {
  // Vercel Cron injects `Authorization: Bearer ${CRON_SECRET}` on scheduled runs.
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && req.headers['authorization'] === `Bearer ${cronSecret}`) return true
  const expected = process.env.LENS_RADAR_SECRET
  if (!expected) return true
  const got =
    (req.headers['x-lens-secret'] as string | undefined) ||
    (typeof req.query.secret === 'string' ? req.query.secret : undefined)
  return got === expected
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' })
  }
  if (!checkSecret(req)) return res.status(401).json({ ok: false, error: 'unauthorized' })
  const dryRun = req.query.dry === '1'

  try {
    // 1) Seed people: curated voices + the authors the content radar surfaced.
    const seeds: SeedPerson[] = JUDGMENT_ECONOMY_LENS.curatedVoices.map((v) => ({
      name: v.name,
      linkedin: v.linkedin ?? null,
      why: v.why,
      context: '',
    }))

    const sinceISO = new Date(Date.now() - FRESH_DAYS * 86_400_000).toISOString()
    const { data: radar } = await supabase
      .from('lens_seed_candidates')
      .select('author,text,source_url')
      .not('author', 'is', null)
      .gte('occurred_at', sinceISO)
      .limit(200)
    const seenNames = new Set(seeds.map((s) => norm(s.name)))
    for (const r of (radar ?? []) as { author: string | null; text: string | null; source_url: string | null }[]) {
      const name = (r.author || '').trim()
      if (!name || seenNames.has(norm(name))) continue
      seenNames.add(norm(name))
      seeds.push({ name, linkedin: null, why: 'Surfaced by the content radar in the judgment-economy direction.', context: r.text || '' })
    }

    // 2) Dedup against the existing guests pipeline (name or linkedin).
    const { data: existing } = await supabase.from('guests').select('name,linkedin_url').limit(3000)
    const haveNames = new Set<string>()
    const haveLi = new Set<string>()
    for (const g of (existing ?? []) as { name: string | null; linkedin_url: string | null }[]) {
      if (g.name) haveNames.add(norm(g.name))
      if (g.linkedin_url) haveLi.add(norm(g.linkedin_url))
    }
    const fresh = seeds.filter((s) => {
      const li = linkedinUrl(s.linkedin)
      return !haveNames.has(norm(s.name)) && !(li && haveLi.has(norm(li)))
    })

    // 3) Score + draft (drafting capped for cost) + build rows.
    const rows: Record<string, unknown>[] = []
    let drafted = 0
    for (const p of fresh) {
      const fit = lensFitScore(`${p.name} ${p.why} ${p.context}`)
      const draft = drafted < MAX_DRAFTS ? await draftFor(p) : null
      if (draft) drafted++
      rows.push({
        name: p.name,
        linkedin_url: linkedinUrl(p.linkedin),
        podcast_target: 'either',
        one_liner: (draft?.angles[0] || p.why).slice(0, 240),
        why_fit: (draft?.why_fit || p.why).slice(0, 500),
        pitch_draft: draft?.pitch || null,
        fit_score: Math.round(fit * 100),
        attainability_score: 50,
        status: 'scouted',
        source: 'nell_outbound',
        notes: 'Scouted by the judgment-economy lens scout.',
        raw_data: {
          discovered_by: 'lens_scout',
          lens_id: JUDGMENT_ECONOMY_LENS.id,
          why: p.why,
          suggested_angles: draft?.angles ?? [],
          fit_score_0_1: fit,
        },
      })
    }

    if (dryRun) {
      return res.json({ ok: true, dryRun: true, candidates: fresh.length, drafted, sample: rows.slice(0, 6) })
    }

    let written = 0
    if (rows.length > 0) {
      const { data, error } = await supabase.from('guests').insert(rows).select('id')
      if (error) return res.status(500).json({ ok: false, error: error.message })
      written = (data ?? []).length
    }
    return res.json({ ok: true, candidates: fresh.length, drafted, written })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'guest scout failed'
    return res.status(500).json({ ok: false, error: message })
  }
}
