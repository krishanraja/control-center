import type { VercelRequest, VercelResponse } from '@vercel/node'
import { guardBearerExport } from '../_auth.js'
import { supabase } from '../_supabase.js'
import { LANE_SLUG, mondayOf } from '../_growth.js'
import { CONTACT_COLUMNS } from '../_room.js'

// GET /api/aeo/context?subject=<uuid>|all
//
// Everything the AEO engine (krishanraja/AEO-Engine) needs to research one
// week, read from the rows Control Center already holds. Rows only, no model
// call, no writes. The engine holds no venture list of its own: this is where
// the subjects, their domains and their competitors come from, so adding a
// company on the Growth tab is the whole onboarding.
//
// Per subject: the registry row; for a venture its geo touchpoints (the
// buyer questions on the map), the striking-distance keywords keyed through
// LANE_SLUG (the one map between the two venture key spaces), and every probe
// from the last 28 days; for a prospect the linked Room target and the face
// ICP; and the prior week's digest and queries so the engine can carry a
// query_id forward and compute a trend.
//
// Bearer AEO_ENGINE_SECRET, fail-closed and rate-limited (guardBearerExport).

export const config = { maxDuration: 30 }

const PROBE_WINDOW_DAYS = 28
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** The face buyer, from docs/icp.json lane room_face (v3, 2026-09-07). Kept
 *  here as text because the machine only needs the who and the who-not. */
const ROOM_FACE = {
  who: 'A senior leader (CEO, founder, MD, CCO, CRO, GM or equivalent) at a PE or VC backed media, adtech, publishing or data business Krish already knows, quietly behind on what is coming and unable to say so inside their organisation',
  who_not: 'Anyone whose employer sells AI tools; anyone with no warm path to Krish',
}

/** Where Krish himself is cited: a hit on any of these counts as being in
 *  the answer for a venture or a prospect read. */
const KRISH = {
  name: 'Krish Raja',
  domains: ['mindmake.co', 'krishraja.com', 'mindmakerlive.substack.com', 'linkedin.com/in/krishraja'],
}

type Row = Record<string, any>

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (guardBearerExport(req, res, 'AEO_ENGINE_SECRET', ['GET'])) return

  const want = typeof req.query.subject === 'string' ? req.query.subject : 'all'
  if (want !== 'all' && !UUID.test(want)) return res.status(400).json({ ok: false, error: 'subject must be a uuid or all' })

  try {
    let q = supabase.from('growth_aeo_subjects').select('*').eq('active', true).order('kind').order('name')
    if (want !== 'all') q = q.eq('id', want)
    const subjectsRead = await q
    if (subjectsRead.error) throw new Error(subjectsRead.error.message)
    const subjects = (subjectsRead.data || []) as Row[]
    if (!subjects.length) return res.status(404).json({ ok: false, error: want === 'all' ? 'no active subjects' : 'subject not found or inactive' })

    const ids = subjects.map(s => String(s.id))
    const productSlugs = subjects.map(s => s.product_slug).filter((v): v is string => typeof v === 'string')
    const laneSlugs = productSlugs.map(p => LANE_SLUG[p]).filter((v): v is string => typeof v === 'string')
    const roomIds = subjects.map(s => s.room_target_id).filter((v): v is string => typeof v === 'string')
    const since = new Date(Date.now() - PROBE_WINDOW_DAYS * 86_400_000).toISOString()
    const weekStart = mondayOf(new Date())

    const [touchpoints, striking, probes, digests, rooms] = await Promise.all([
      productSlugs.length
        ? supabase.from('growth_touchpoints')
          .select('id, product_slug, icp_trigger, watering_hole, coverage_status, cost_efficiency_score')
          .in('product_slug', productSlugs).eq('channel', 'geo').neq('coverage_status', 'retired')
        : Promise.resolve({ data: [], error: null }),
      laneSlugs.length
        ? supabase.from('maya_striking_distance')
          .select('product, query, current_position, previous_position, search_volume, priority, last_checked_at')
          .in('product', laneSlugs)
          .order('priority', { ascending: false, nullsFirst: false })
          .limit(50 * laneSlugs.length)
        : Promise.resolve({ data: [], error: null }),
      supabase.from('growth_geo_probes')
        .select('id, product_slug, subject_id, subject_kind, question, engine, we_cited, competitors_cited, run_at, run_id, query_id')
        .gte('run_at', since)
        .or(`subject_id.in.(${ids.join(',')})${productSlugs.length ? `,and(subject_id.is.null,subject_kind.eq.venture,product_slug.in.(${productSlugs.join(',')}))` : ''}`)
        .order('run_at', { ascending: false })
        .limit(500 * ids.length),
      supabase.from('growth_aeo_digests')
        .select('id, subject_id, week_start, watch_list, recommendations, competitor_gap, strongest_signal')
        .in('subject_id', ids)
        .lt('week_start', weekStart)
        .order('week_start', { ascending: false })
        .limit(ids.length * 2),
      roomIds.length
        ? supabase.from('room_targets')
          .select(`id, why_face, trigger_signal, trigger_source_url, state, contact:contacts(${CONTACT_COLUMNS})`)
          .in('id', roomIds)
        : Promise.resolve({ data: [], error: null }),
    ])
    for (const r of [touchpoints, striking, probes, digests, rooms]) if (r.error) throw new Error(r.error.message)

    // The prior week's queries, one read for every subject's latest digest week.
    const priorBySubject = new Map<string, Row>()
    for (const d of (digests.data || []) as Row[]) if (!priorBySubject.has(String(d.subject_id))) priorBySubject.set(String(d.subject_id), d)
    const priorKeys = [...priorBySubject.values()]
    let priorQueries: Row[] = []
    if (priorKeys.length) {
      const pq = await supabase.from('growth_aeo_queries')
        .select('subject_id, week_start, query_id, query, demand_score, status, trend')
        .in('subject_id', priorKeys.map(d => String(d.subject_id)))
        .in('week_start', [...new Set(priorKeys.map(d => String(d.week_start)))])
        .limit(60 * priorKeys.length)
      if (pq.error) throw new Error(pq.error.message)
      priorQueries = (pq.data || []) as Row[]
    }

    const out = subjects.map(s => {
      const id = String(s.id)
      const product = typeof s.product_slug === 'string' ? s.product_slug : null
      const lane = product ? LANE_SLUG[product] ?? null : null
      const prior = priorBySubject.get(id) || null
      const room = s.room_target_id ? ((rooms.data || []) as Row[]).find(r => r.id === s.room_target_id) || null : null
      const contact = room?.contact && typeof room.contact === 'object' ? room.contact as Row : null
      return {
        id,
        kind: s.kind,
        slug: s.slug,
        name: s.name,
        domains: s.domains || [],
        competitor_domains: s.competitor_domains || [],
        icp_line: s.icp_line ?? null,
        seed_topics: s.seed_topics || [],
        never_say: s.never_say || [],
        product_slug: product,
        lane_slug: lane,
        room_target: room ? {
          id: room.id,
          // The company and the title, never the person's name or email:
          // the engine's output is read with the anon key.
          company: contact?.company ?? null,
          title: contact?.title ?? null,
          why_face: room.why_face ?? null,
          trigger_signal: room.trigger_signal ?? null,
          trigger_source_url: room.trigger_source_url ?? null,
          state: room.state ?? null,
        } : null,
        touchpoints: product ? ((touchpoints.data || []) as Row[]).filter(t => t.product_slug === product).map(t => ({
          id: t.id, icp_trigger: t.icp_trigger, watering_hole: t.watering_hole ?? null,
          coverage_status: t.coverage_status, cost_efficiency_score: t.cost_efficiency_score ?? null,
        })) : [],
        striking_distance: lane ? ((striking.data || []) as Row[]).filter(r => r.product === lane).map(r => ({
          query: r.query, current_position: r.current_position ?? null, previous_position: r.previous_position ?? null,
          search_volume: r.search_volume ?? null, priority: r.priority ?? null, last_checked_at: r.last_checked_at ?? null,
        })) : [],
        probes_4w: ((probes.data || []) as Row[])
          .filter(p => p.subject_id === id || (p.subject_id == null && p.subject_kind === 'venture' && product && p.product_slug === product))
          .map(p => ({
            id: p.id, question: p.question, engine: p.engine, we_cited: !!p.we_cited,
            competitors_cited: Array.isArray(p.competitors_cited) ? p.competitors_cited : [],
            run_at: p.run_at, run_id: p.run_id ?? null, query_id: p.query_id ?? null,
          })),
        prior: prior ? {
          week_start: prior.week_start,
          strongest_signal: prior.strongest_signal ?? null,
          watch_list: Array.isArray(prior.watch_list) ? prior.watch_list : [],
          recommendations: Array.isArray(prior.recommendations) ? prior.recommendations : [],
          competitor_gap: prior.competitor_gap ?? null,
          queries: priorQueries.filter(q => q.subject_id === id && q.week_start === prior.week_start).map(q => ({
            query_id: q.query_id, query: q.query, demand_score: q.demand_score, status: q.status, trend: q.trend ?? null,
          })),
        } : null,
      }
    })

    return res.status(200).json({
      ok: true,
      week_start: weekStart,
      generated_at: new Date().toISOString(),
      krish: KRISH,
      icp: { room_face: ROOM_FACE },
      subjects: out,
    })
  } catch (e: unknown) {
    return res.status(500).json({ ok: false, error: (e as Error)?.message?.slice(0, 200) || 'context_failed' })
  }
}
