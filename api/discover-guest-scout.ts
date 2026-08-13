import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from './_supabase.js'
import { callClaude, robustJson, sanitizeVoice } from './_content.js'
import { lensFitScore, JUDGMENT_ECONOMY_LENS } from './_judgmentLens.js'
import {
  fromNetwork, fromRadar, fromWeb, fromLinkedIn, fromEvents,
  normName, normLinkedIn,
  type GuestCandidate, type GuestFormat,
} from './_guestSources.js'

// ─────────────────────────────────────────────────────────────────────────────
// discover-guest-scout — find people worth interviewing, for a named format.
//
// WHAT WENT WRONG BEFORE. The previous version seeded from exactly two places:
// a hardcoded curatedVoices array and the lens_seed_candidates table. Those
// voices were all already in `guests`, so the dedup emptied the candidate list
// on every run, and lens_seed_candidates has never contained a row. The scout
// wrote zero guests, returned ok:true, and nothing anywhere went red. The last
// guest it created was 2026-08-05.
//
// Three things changed.
//
//   1. FIVE sources, not one: the contacts network first (a warm intro beats a
//      cold result), then the content radar, live web search, LinkedIn post
//      search via Apify, and the conference circuit. Each is separately gated
//      and degrades alone.
//
//   2. TWO formats, not one lens. Paid wants whoever is closest to the pricing
//      and unit-economics decision. Built wants whoever actually shipped the
//      thing. Those are different people and the old scout could not tell them
//      apart, because `guests` had nowhere to record which show a person was
//      for.
//
//   3. IT CANNOT BE QUIET. A run where every source came back empty is a
//      FAILURE, not a success: it returns 502, writes a silent_failures row and
//      names the sources that were skipped and why. The whole reason this went
//      unnoticed for eight days is that zero looked like a valid answer.
//
// It still never confirms a guest and never fires the confirmed-guest cascade.
// It fills the top of the funnel at status='scouted', and Krish decides.
// ─────────────────────────────────────────────────────────────────────────────

const FRESH_DAYS = 45
const MAX_DRAFTS_PER_FORMAT = 6      // cap the LLM drafting per run (cost discipline)
const MAX_WRITE_PER_FORMAT = 12
const NETWORK_LIMIT = 25
const LINKEDIN_POSTS = 40
const MAX_EVENTS = 12

type Fmt = Exclude<GuestFormat, 'either'>
const FORMATS: Fmt[] = ['paid', 'built']

interface FormatBrief {
  format: Fmt
  label: string
  mandate: string
  /** The network-search question. */
  question: string
  /** Live web queries. */
  webQueries: string[]
  /** LinkedIn post-search keywords. */
  keywords: string[]
  /** Terms that mark a candidate as on-format, for the deterministic score. */
  terms: string[]
}

// Format-specific vocabulary. Deliberately narrow and concrete: these are the
// words that separate "close to the money" from "shipped the thing", which is
// the whole distinction between Paid and Built.
const PAID_TERMS = [
  'pricing', 'price', 'unit economics', 'margin', 'gross margin', 'cogs', 'monetisation', 'monetization',
  'revenue', 'arr', 'mrr', 'contract', 'procurement', 'budget', 'cac', 'ltv', 'take rate',
  'seat', 'per-seat', 'usage-based', 'consumption', 'cost per', 'token cost', 'inference cost',
  'p&l', 'cfo', 'commercial', 'deal', 'renewal', 'churn', 'packaging', 'business model',
]
const BUILT_TERMS = [
  'built', 'shipped', 'launched', 'founder', 'cto', 'engineer', 'architecture', 'agent',
  'pipeline', 'eval', 'evals', 'production', 'deployed', 'stack', 'rebuilt', 'prototype',
  'workflow', 'orchestration', 'fine-tune', 'rag', 'infrastructure', 'platform', 'tooling',
]

async function loadBriefs(): Promise<FormatBrief[]> {
  const { data } = await supabase
    .from('venture_formats')
    .select('slug,label,mandate,active')
    .eq('venture_slug', 'mindmaker_live')
    .eq('active', true)

  const byslug = new Map<string, { label: string; mandate: string }>()
  for (const r of (data ?? []) as { slug: string; label: string; mandate: string }[]) {
    byslug.set(r.slug, { label: r.label, mandate: r.mandate })
  }

  // Recent shifts give the scout something CURRENT to hunt against, so it finds
  // people who are in the middle of the thing rather than people who were
  // relevant when the term list was written.
  const { data: shifts } = await supabase
    .from('shifts')
    .select('title,summary,lane,status')
    .in('status', ['active', 'building', 'watching'])
    .order('momentum', { ascending: false })
    .limit(6)
  const shiftTitles = ((shifts ?? []) as { title: string | null }[])
    .map(s => s.title).filter((t): t is string => Boolean(t))

  return FORMATS.map((format): FormatBrief => {
    const meta = byslug.get(format)
    const mandate = meta?.mandate || (format === 'paid'
      ? 'Follow the money: second-order effects on pricing, unit economics, positioning and who captures value.'
      : 'Builder conversations. How operators actually build and run AI-native businesses.')

    if (format === 'paid') {
      return {
        format, label: meta?.label || 'Paid', mandate,
        question:
          'Senior operators, founders and commercial leaders who personally own pricing, unit economics, ' +
          'margin or monetisation decisions for an AI product or an AI-affected business. People who can ' +
          'say what something costs, what it is priced at and why.',
        webQueries: [
          'executives who changed their pricing model because of AI costs, named with company and date',
          'founders publicly discussing AI unit economics, gross margin or inference cost in their business',
          ...shiftTitles.slice(0, 2).map(t => `who is capturing the money in this shift: ${t}. Name the operators, not the analysts.`),
        ],
        keywords: ['AI pricing', 'unit economics AI', 'AI margin', 'inference cost', 'AI monetisation'],
        terms: PAID_TERMS,
      }
    }
    return {
      format, label: meta?.label || 'Built', mandate,
      question:
        'Founders, CTOs and operators who have personally built and shipped an AI-native product, agent ' +
        'fleet or internal system into production, and can describe how it actually works and what broke.',
      webQueries: [
        'founders who shipped an AI agent system into production and wrote about what broke',
        'operators rebuilding their company around AI with specific architecture details, named',
        ...shiftTitles.slice(0, 2).map(t => `who actually built the thing behind this shift: ${t}. Name the builders.`),
      ],
      keywords: ['built with AI agents', 'shipped AI production', 'AI agent architecture', 'AI evals production'],
      terms: BUILT_TERMS,
    }
  })
}

/** Deterministic on-format score, 0..1. Blends the editorial lens (is this the
 *  right DIRECTION) with format vocabulary (is this the right SHOW). */
function formatFit(text: string, brief: FormatBrief): number {
  const t = (text || '').toLowerCase()
  let hits = 0
  for (const term of brief.terms) if (t.includes(term)) hits += 1
  const formatScore = Math.min(1, hits / 4)
  const lens = lensFitScore(text)
  return 0.6 * formatScore + 0.4 * lens
}

interface Draft { why_fit: string; angles: string[]; pitch: string; format?: string; one_liner?: string }

function scoutSystem(brief: FormatBrief): string {
  return (
    `You help Krish Raja scout guests for Mindmaker Live's ${brief.label} format. ` +
    `THE MANDATE FOR THIS FORMAT: ${brief.mandate} ` +
    'Krish runs a meandering, unscripted conversation: he opens broad, reflects back, and reframes the ' +
    "guest's story into a portable idea. He is warm, curious, lightly cynical about AI hype, " +
    'British-Australian, and ends on a provocation, not a summary. ' +
    `The wider editorial direction: ${JUDGMENT_ECONOMY_LENS.thesis} ` +
    (brief.format === 'paid'
      ? 'For Paid specifically: the guest must be close enough to the money to say what something costs, what it is priced at, and what changed. A commentator who has opinions about pricing is not a Paid guest. '
      : 'For Built specifically: the guest must have personally built or shipped the thing. Someone who commissioned it or writes about builders is not a Built guest. ') +
    'Be honest when the evidence is thin: say so in why_fit rather than inventing a reason. ' +
    'No em dashes, no buzzwords, plain specific language.'
  )
}

async function draftFor(p: GuestCandidate, brief: FormatBrief): Promise<Draft | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null
  try {
    const evidence = p.evidence.map(e => `- ${e.kind}: ${e.label}`).join('\n')
    const raw = await callClaude({
      system: scoutSystem(brief),
      user:
        `GUEST CANDIDATE: ${p.name}\n` +
        `${p.title ? `Role: ${p.title}\n` : ''}${p.company ? `Company: ${p.company}\n` : ''}` +
        `${p.inNetwork ? "ALREADY IN KRISH'S NETWORK, so a warm approach is possible.\n" : 'Outside the network, so this is a cold approach.\n'}` +
        `What we know: ${p.context}\n` +
        `EVIDENCE:\n${evidence}\n\n` +
        'Reply ONLY with JSON: {"one_liner":"<the single sharpest episode angle, under 20 words>",' +
        '"why_fit":"<one sentence on why they fit THIS format, citing the evidence above>",' +
        '"angles":["<episode angle 1>","<episode angle 2>"],' +
        `"pitch":"<2-3 sentence outreach note in Krish's voice, warm and specific>",` +
        `"format":"${brief.format}|either|reject"}\n` +
        'Set format to "reject" if they clearly do not belong on this format. Be willing to reject.',
      model: 'claude-sonnet-4-6',
      maxTokens: 650,
      temperature: 0.6,
      timeoutMs: 30_000,
    })
    const j = robustJson(raw) as Partial<Draft> | null
    if (!j) return null
    const angles = Array.isArray(j.angles) ? j.angles.filter((a): a is string => typeof a === 'string') : []
    if (!j.why_fit && !j.pitch && angles.length === 0) return null
    return {
      why_fit: j.why_fit || '',
      angles,
      pitch: j.pitch || '',
      format: typeof j.format === 'string' ? j.format : brief.format,
      one_liner: j.one_liner,
    }
  } catch {
    return null
  }
}

function checkSecret(req: VercelRequest): boolean {
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && req.headers['authorization'] === `Bearer ${cronSecret}`) return true
  const expected = process.env.LENS_RADAR_SECRET
  if (!expected) return true
  const got =
    (req.headers['x-lens-secret'] as string | undefined) ||
    (typeof req.query.secret === 'string' ? req.query.secret : undefined)
  return got === expected
}

async function recordSilentFailure(detail: string): Promise<void> {
  try {
    await supabase.from('silent_failures').insert({
      workflow_id: 'api/discover-guest-scout',
      workflow_name: 'Guest scout',
      tier: 2,
      failure_type: 'empty_output',
      detail: detail.slice(0, 2000),
    })
  } catch { /* the alarm failing must not fail the run's own reporting */ }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' })
  }
  if (!checkSecret(req)) return res.status(401).json({ ok: false, error: 'unauthorized' })

  const dryRun = req.query.dry === '1'
  // ?sources=network,web lets a run be narrowed when testing or when one
  // upstream is known bad, without a deploy.
  const only = typeof req.query.sources === 'string'
    ? new Set(req.query.sources.split(',').map(s => s.trim()).filter(Boolean))
    : null
  const wants = (s: string) => !only || only.has(s)
  const onlyFormat = typeof req.query.format === 'string' ? req.query.format : null

  const started = Date.now()
  const notes: string[] = []

  try {
    const allBriefs = await loadBriefs()
    const briefs = onlyFormat ? allBriefs.filter(b => b.format === onlyFormat) : allBriefs
    if (!briefs.length) return res.status(400).json({ ok: false, error: `unknown format (${onlyFormat})` })

    // Dedup corpus, fetched once: existing guests, plus contacts so the scout
    // can tell "already in the network" from "new person".
    const { data: existing } = await supabase.from('guests').select('name,linkedin_url').limit(5000)
    const haveNames = new Set<string>()
    const haveLi = new Set<string>()
    for (const g of (existing ?? []) as { name: string | null; linkedin_url: string | null }[]) {
      if (g.name) haveNames.add(normName(g.name))
      if (g.linkedin_url) haveLi.add(normLinkedIn(g.linkedin_url))
    }

    const { data: contactRows } = await supabase
      .from('contacts').select('id,full_name,linkedin_url_norm,company,title').limit(20000)
    const contactByName = new Map<string, { id: string; company: string | null; title: string | null }>()
    const contactByLi = new Map<string, { id: string; company: string | null; title: string | null }>()
    for (const c of (contactRows ?? []) as { id: string; full_name: string | null; linkedin_url_norm: string | null; company: string | null; title: string | null }[]) {
      const v = { id: c.id, company: c.company, title: c.title }
      if (c.full_name) contactByName.set(normName(c.full_name), v)
      if (c.linkedin_url_norm) contactByLi.set(normLinkedIn(c.linkedin_url_norm), v)
    }

    const perFormat: Record<string, unknown>[] = []
    const rowsToWrite: Record<string, unknown>[] = []
    let sourcesThatProduced = 0
    let sourcesRun = 0

    for (const brief of briefs) {
      const found: GuestCandidate[] = []

      // Sources run in parallel: they hit five different upstreams and the
      // slowest (Apify, up to 90s) otherwise sets the wall clock for all five.
      const [net, radar, web, li, events] = await Promise.all([
        wants('network') ? fromNetwork(brief.question, brief.format, NETWORK_LIMIT) : Promise.resolve({ candidates: [] as GuestCandidate[], note: 'network: not requested' }),
        wants('radar') ? fromRadar(brief.format, FRESH_DAYS) : Promise.resolve({ candidates: [] as GuestCandidate[], note: 'radar: not requested' }),
        wants('web') ? fromWeb(brief.question, brief.format, brief.webQueries) : Promise.resolve({ candidates: [] as GuestCandidate[], note: 'web: not requested' }),
        wants('linkedin') ? fromLinkedIn(brief.keywords, LINKEDIN_POSTS) : Promise.resolve({ candidates: [] as GuestCandidate[], note: 'linkedin: not requested' }),
        wants('events') ? fromEvents(MAX_EVENTS) : Promise.resolve({ candidates: [] as GuestCandidate[], note: 'events: not requested', backfilled: 0 }),
      ])

      for (const r of [net, radar, web, li, events]) {
        notes.push(`[${brief.format}] ${r.note}`)
        if (!r.note.includes('not requested')) sourcesRun++
        if (r.candidates.length) sourcesThatProduced++
        found.push(...r.candidates)
      }

      // Collapse duplicates ACROSS sources, keeping the richest record. A person
      // found by both the network and LinkedIn is one candidate with two pieces
      // of evidence, not two rows.
      const merged = new Map<string, GuestCandidate>()
      for (const c of found) {
        const key = normLinkedIn(c.linkedin) || normName(c.name)
        if (!key) continue
        const prev = merged.get(key)
        if (!prev) { merged.set(key, { ...c, evidence: [...c.evidence] }); continue }
        prev.evidence.push(...c.evidence)
        prev.sourceScore = Math.max(prev.sourceScore, c.sourceScore)
        prev.inNetwork = prev.inNetwork || c.inNetwork
        prev.contactId = prev.contactId || c.contactId
        prev.linkedin = prev.linkedin || c.linkedin
        prev.company = prev.company || c.company
        prev.title = prev.title || c.title
        if (c.context && c.context.length > prev.context.length) prev.context = c.context
      }

      // Resolve network membership for candidates found cold, then drop anyone
      // already in the guests pipeline.
      const fresh: GuestCandidate[] = []
      for (const c of merged.values()) {
        const liKey = normLinkedIn(c.linkedin)
        const nameKey = normName(c.name)
        if (haveNames.has(nameKey) || (liKey && haveLi.has(liKey))) continue

        if (!c.contactId) {
          const hit = (liKey && contactByLi.get(liKey)) || contactByName.get(nameKey)
          if (hit) {
            c.contactId = hit.id
            c.inNetwork = true
            c.company = c.company || hit.company
            c.title = c.title || hit.title
            c.evidence.push({ kind: 'network', label: 'Already in the contacts network', url: null })
          }
        }
        fresh.push(c)
      }

      // Score, rank, cap.
      const scored = fresh
        .map(c => {
          const fit = formatFit(`${c.name} ${c.title || ''} ${c.company || ''} ${c.context}`, brief)
          // In-network people get a real, bounded advantage: they are reachable,
          // which is half of whether an episode ever happens.
          const reach = c.inNetwork ? 0.12 : 0
          return { c, score: Math.min(1, 0.55 * fit + 0.33 * c.sourceScore + reach) }
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, MAX_WRITE_PER_FORMAT)

      let drafted = 0
      const kept: Record<string, unknown>[] = []
      for (const { c, score } of scored) {
        const draft = drafted < MAX_DRAFTS_PER_FORMAT ? await draftFor(c, brief) : null
        if (draft) drafted++
        // The model is allowed to veto. A scout that never rejects is a scout
        // that fills the queue with people Krish will not book.
        if (draft?.format === 'reject') continue

        const resolvedFormat: GuestFormat = draft?.format === 'either' ? 'either' : brief.format
        kept.push({
          name: c.name,
          linkedin_url: c.linkedin,
          email: c.email,
          format: resolvedFormat,
          // podcast_target is the retired show axis. Everything now publishes
          // under Mindmaker Live, so 'either' is the only honest value and
          // `format` carries the real distinction.
          podcast_target: 'either',
          target_type: 'podcast_guest',
          one_liner: sanitizeVoice(String(draft?.one_liner || draft?.angles?.[0] || c.context.slice(0, 200))).slice(0, 240),
          why_fit: sanitizeVoice(String(draft?.why_fit || c.evidence[0]?.label || '')).slice(0, 500),
          pitch_draft: draft?.pitch ? sanitizeVoice(draft.pitch).slice(0, 1200) : null,
          fit_score: Math.round(score * 100),
          attainability_score: c.inNetwork ? 75 : 40,
          status: 'scouted',
          source: 'nell_outbound',
          discovery_source: c.discoverySource,
          in_network: c.inNetwork,
          contact_id: c.contactId,
          evidence: c.evidence.slice(0, 8).map(e => ({ ...e, at: new Date().toISOString() })),
          last_scouted_at: new Date().toISOString(),
          notes: `Scouted for ${brief.label} by the ${c.discoverySource} source.`,
          raw_data: {
            discovered_by: 'guest_scout_v2',
            format: brief.format,
            discovery_source: c.discoverySource,
            suggested_angles: draft?.angles ?? [],
            score,
            company: c.company,
            title: c.title,
          },
        })

        // Claim the name immediately so the second format cannot write a
        // duplicate of someone the first format just took.
        haveNames.add(normName(c.name))
        if (c.linkedin) haveLi.add(normLinkedIn(c.linkedin))
      }

      rowsToWrite.push(...kept)
      perFormat.push({
        format: brief.format,
        raw: found.length,
        merged: merged.size,
        fresh: fresh.length,
        kept: kept.length,
        drafted,
        inNetwork: kept.filter(k => k.in_network).length,
      })
    }

    const summary = {
      ok: true,
      dryRun,
      ms: Date.now() - started,
      perFormat,
      written: 0,
      sourcesRun,
      sourcesThatProduced,
      notes,
    }

    // The load-bearing change: nothing found is a failure, loudly.
    if (rowsToWrite.length === 0) {
      const detail = `Guest scout produced 0 candidates across ${sourcesRun} source runs. ${notes.join(' | ')}`
      if (!dryRun) await recordSilentFailure(detail)
      return res.status(502).json({
        ...summary,
        ok: false,
        error: 'no_candidates',
        hint: 'Every source returned empty. Check the per-source notes: a SKIPPED note means a missing key, a FAILED note means an upstream error.',
      })
    }

    if (dryRun) {
      return res.json({ ...summary, sample: rowsToWrite.slice(0, 8) })
    }

    const { data: ins, error } = await supabase.from('guests').insert(rowsToWrite).select('id')
    if (error) return res.status(500).json({ ...summary, ok: false, error: error.message })

    return res.json({ ...summary, written: (ins ?? []).length })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'guest scout failed'
    await recordSilentFailure(`Guest scout threw: ${message}. ${notes.join(' | ')}`)
    return res.status(500).json({ ok: false, error: message, notes })
  }
}

// Five upstreams, two formats, and a drafting pass. Well past the platform
// default, and a scout killed at 10s is the silent-zero failure all over again.
export const config = { maxDuration: 300 }
