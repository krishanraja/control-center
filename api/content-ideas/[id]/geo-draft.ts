import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../../_supabase.js'
import { callClaude, loadConfig, loadVoiceBlock, preamble, robustJson, sanitizeVoice } from '../../_content.js'
import { SYNTHESIS_MODEL } from '../../_models.js'
import {
  buildGeoRepair, buildGeoSystem, buildGeoUser, checkGeoDraft,
  type GeoContext, type GeoDraft, type GeoFailure,
} from '../../_geoPrompt.js'
import { citationsOf, hostLabel } from '../../_aeo.js'

// POST /api/content-ideas/:id/geo-draft
//
// Writes the piece an answer engine can quote, for an idea that came from the
// weekly research run.
//
// THE GAP THIS FILLS
//
// The research machine finds a buyer question this business is absent from,
// works out whether it is winnable, and writes the reason onto the idea as
// meta.aeo.why_you_can_win. editorial-route carries that block forward onto
// the publication child with a comment saying it is there "so the piece can be
// checked against the question it was written to win". Then nothing reads it.
// Not a prompt, not a rubric, not a screen. The question the piece exists to
// answer was carried the whole way and never used, so the piece got written as
// though the research had never happened.
//
// This route is the other end of that wire.
//
// WHAT IT DOES DIFFERENTLY FROM research-topic AND synthesize
//
// Those two write a good piece about a topic. This one writes a page that has
// to change a specific measured outcome: growth_geo_probes says an assistant
// was asked this question and named these other sites. So the prompt is built
// against those named sites rather than against the topic, and the gates in
// _geoPrompt check the things that decide whether a model can quote the page
// at all: is there a direct answer near the top, does it name the business
// rather than saying "we", is there a claim nobody else is making, is there
// anything on the page that only this business could have written.
//
// A draft that fails a soft check gets exactly one repair pass, the _cardLint
// posture, with the failures handed back verbatim and the checker still the
// authority. A draft that fails a hard check is not repaired and not saved:
// it is reported. The most common hard failure is honest and worth reading,
// that the recommendation carries no reason the business can win the question,
// which means the question should be re-researched rather than written up.
//
// Nothing here publishes. The draft lands on the idea as a body, at state
// review, exactly where a draft written by hand would land.

export const config = { maxDuration: 300 }

const PROBE_WINDOW_DAYS = 30
type Row = Record<string, any>

interface AeoMeta {
  subject_id?: string
  subject_slug?: string
  product_slug?: string | null
  target_query?: string
  query_id?: string
  angle?: string
  evidence?: string[]
  demand?: number
  why_you_can_win?: string | null
}

/** Where a piece for this subject will live. The research machine already
 *  knows the subject's domains; the first is the canonical host. */
function siteOf(subject: Row | null): string {
  const domains = Array.isArray(subject?.domains) ? subject!.domains as string[] : []
  return domains[0] || 'the site'
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (preamble(req, res)) return
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' })

  const id = typeof req.query.id === 'string' ? req.query.id : ''
  if (!id) return res.status(400).json({ ok: false, error: 'missing_id' })
  const started = Date.now()

  try {
    const read = await supabase.from('content_ideas')
      .select('id, idea, thesis, state, lane, lane_slot, body, meta')
      .eq('id', id).maybeSingle()
    if (read.error) throw new Error(read.error.message)
    const idea = read.data as Row | null
    if (!idea) return res.status(404).json({ ok: false, error: 'unknown_idea' })

    const meta = (idea.meta && typeof idea.meta === 'object' ? idea.meta : {}) as Row
    const aeo = (meta.aeo && typeof meta.aeo === 'object' ? meta.aeo : null) as AeoMeta | null
    if (!aeo || !aeo.target_query) {
      return res.status(409).json({
        ok: false, error: 'not_an_aeo_idea',
        detail: 'This idea did not come from the research run, so there is no question for the page to win and no measurement to move.',
      })
    }
    // Overwriting a draft someone is working on is not this route's business.
    if (typeof idea.body === 'string' && idea.body.trim().length > 200 && req.body?.overwrite !== true) {
      return res.status(409).json({ ok: false, error: 'body_exists', detail: 'This idea already carries a draft. Pass overwrite true to replace it.' })
    }

    const [voice, cfg, subjectRead] = await Promise.all([
      loadVoiceBlock().catch(() => ''),
      loadConfig(['mindmake_canon']).catch(() => ({} as Record<string, unknown>)),
      aeo.subject_id
        ? supabase.from('growth_aeo_subjects').select('id, name, slug, domains, never_say, product_slug').eq('id', aeo.subject_id).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ])
    if (subjectRead.error) throw new Error(subjectRead.error.message)
    const subject = subjectRead.data as Row | null

    // Who the assistants name on this exact question today. This is the thing
    // the page is written against, and it is measured rather than guessed.
    const since = new Date(Date.now() - PROBE_WINDOW_DAYS * 86_400_000).toISOString()
    let probeQ = supabase.from('growth_geo_probes')
      .select('question, competitors_cited, we_cited, query_id')
      .gte('run_at', since)
      .limit(200)
    probeQ = aeo.query_id ? probeQ.eq('query_id', aeo.query_id) : probeQ.eq('question', aeo.target_query)
    const probes = await probeQ
    if (probes.error) throw new Error(probes.error.message)

    const tally = new Map<string, number>()
    for (const p of (probes.data || []) as Row[]) {
      for (const c of citationsOf(p.competitors_cited)) {
        const host = hostLabel(c)
        if (host) tally.set(host, (tally.get(host) || 0) + 1)
      }
    }
    const cited_hosts = [...tally.entries()]
      .map(([host, times]) => ({ host, times }))
      .sort((a, b) => b.times - a.times)
      .slice(0, 8)

    const ctx: GeoContext = {
      voice,
      canon: typeof cfg.mindmake_canon === 'string' ? cfg.mindmake_canon : '',
      entity: String(subject?.name || 'Mindmake'),
      site: siteOf(subject),
      cited_hosts,
      never_say: Array.isArray(subject?.never_say) ? subject!.never_say as string[] : [],
      aeo: {
        target_query: String(aeo.target_query),
        angle: String(aeo.angle || idea.thesis || ''),
        evidence: Array.isArray(aeo.evidence) ? aeo.evidence.map(String) : [],
        why_you_can_win: typeof aeo.why_you_can_win === 'string' && aeo.why_you_can_win.trim() ? aeo.why_you_can_win : null,
        demand: Number(aeo.demand) || 0,
      },
    }

    // A recommendation with no argument is refused before a single token is
    // spent, because there is nothing for the page to say.
    const preflight = checkGeoDraft({}, ctx).filter(f => f.code === 'no_winnability_reason')
    if (preflight.length) {
      return res.status(409).json({ ok: false, error: 'no_winnability_reason', detail: preflight[0].why })
    }

    const system = buildGeoSystem(ctx)
    let raw = await callClaude({
      system, user: buildGeoUser(ctx), model: SYNTHESIS_MODEL, maxTokens: 8000, timeoutMs: 120_000,
    })
    let draft = robustJson(raw) as Partial<GeoDraft> | null
    let failures: GeoFailure[] = checkGeoDraft(draft, ctx)
    let repaired = false

    const hard = failures.filter(f => f.hard)
    if (!hard.length && failures.length) {
      repaired = true
      raw = await callClaude({
        system,
        user: `${buildGeoUser(ctx)}\n\nYour previous attempt:\n${JSON.stringify(draft)}\n\n${buildGeoRepair(failures)}`,
        model: SYNTHESIS_MODEL, maxTokens: 8000, timeoutMs: 120_000,
      })
      const second = robustJson(raw) as Partial<GeoDraft> | null
      const secondFailures = checkGeoDraft(second, ctx)
      // Keep the better of the two rather than the later of the two.
      if (secondFailures.length < failures.length) { draft = second; failures = secondFailures }
    }

    if (failures.length) {
      // Reported, never published weaker. The failures are written onto the
      // idea so the next run can see what this one could not fix.
      await supabase.from('content_ideas').update({
        meta: { ...meta, geo_draft: { attempted_at: new Date().toISOString(), repaired, failures, model: SYNTHESIS_MODEL } },
        updated_at: new Date().toISOString(),
      }).eq('id', id)
      return res.status(422).json({
        ok: false, error: 'draft_failed_checks', repaired,
        failures, ms: Date.now() - started,
      })
    }

    const good = draft as GeoDraft
    const bodyMd = sanitizeVoice(good.body)
    const update: Row = {
      idea: sanitizeVoice(good.title).slice(0, 200),
      body: bodyMd,
      state: idea.state === 'published' || idea.state === 'dropped' ? idea.state : 'review',
      meta: {
        ...meta,
        geo: {
          slug: good.slug,
          answer: sanitizeVoice(good.answer),
          claim: sanitizeVoice(good.claim),
          first_party: good.first_party.map(s => sanitizeVoice(s)),
          meta_description: sanitizeVoice(good.meta_description),
          faq: good.faq.map(f => ({ q: sanitizeVoice(f.q), a: sanitizeVoice(f.a) })),
          target_query: ctx.aeo.target_query,
          cited_hosts,
          entity: ctx.entity,
          site: ctx.site,
          written_at: new Date().toISOString(),
          model: SYNTHESIS_MODEL,
          repaired,
        },
        geo_draft: { attempted_at: new Date().toISOString(), repaired, failures: [], model: SYNTHESIS_MODEL },
      },
      updated_at: new Date().toISOString(),
    }
    const wrote = await supabase.from('content_ideas').update(update).eq('id', id).select('id, state').single()
    if (wrote.error) throw new Error(wrote.error.message)

    await supabase.from('audit_log').insert({
      event_type: 'geo_draft',
      actor: 'cleo',
      target: 'content_ideas',
      display_message: `Wrote an answer-engine page for "${ctx.aeo.target_query}"${repaired ? ', after one repair pass' : ''}.`,
      details: JSON.stringify({ id, slug: good.slug, target_query: ctx.aeo.target_query, cited_hosts, repaired }),
    }).then(r => { if (r.error) console.error('geo_draft audit write failed', r.error.message) })

    return res.status(200).json({
      ok: true,
      id,
      state: (wrote.data as Row).state,
      slug: good.slug,
      claim: good.claim,
      words: bodyMd.trim().split(/\s+/).filter(Boolean).length,
      cited_hosts,
      repaired,
      ms: Date.now() - started,
    })
  } catch (e: unknown) {
    const msg = (e as Error)?.message || String(e)
    console.error('geo-draft failed', msg)
    return res.status(500).json({ ok: false, error: msg.slice(0, 300) })
  }
}
