import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../_supabase.js'

/**
 * GET /api/acquisition/overview[?lane=mm_ctrl]
 *
 * The Growth tab's read spine. Rolls up, per acquisition lane (product
 * ventures in venture_registry):
 *   - weekly capture → paid funnel (acquisition_capture_to_paid view)
 *   - touch progress from the acquisition_sends ledger (per frame/touch/status)
 *   - queued-send counts + a small preview (subjects only — bodies stay server-side)
 *   - autonomy ladder state (venture_registry.autonomy_level + recent history)
 *   - paid/MRR position from customers
 *   - churn re-engagement queue (leads the audience invariant flagged churned)
 *
 * acquisition_sends carries rendered email bodies + lead PII, so this data is
 * served ONLY through this service-role route — never the anon client. See
 * docs/MINDMAKER_OS_ARCHITECTURE.md sections 4.3 and 11.5.
 */

interface TouchCell {
  lane: string
  frame_version: string
  touch_number: number
  status: string
  count: number
}

const SENDS_SCAN_CAP = 10_000

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const laneFilter = typeof req.query.lane === 'string' ? req.query.lane : null

    // Lane roster comes from config, not venture kind — full_time is
    // kind='career' and mindmaker is kind='product', so kind can't select.
    const { data: laneCfg } = await supabase
      .from('system_config')
      .select('value')
      .eq('key', 'acquisition_lanes')
      .maybeSingle()
    let laneSlugs: string[] = []
    try { laneSlugs = JSON.parse(laneCfg?.value || '[]') } catch { laneSlugs = [] }
    if (!laneSlugs.length) laneSlugs = ['mm_ctrl', 'fractionl_pulse', 'fractionl_circle', 'plinth', 'full_time']

    const [ventures, funnel, sends, queuedPreview, customers, churnedLeads, frames, contentAttr, newReplies] = await Promise.all([
      supabase
        .from('venture_registry')
        .select('slug, display_name, kind, active, autonomy_level, autonomy_history')
        .in('slug', laneSlugs)
        .order('sort_order', { ascending: true }),
      supabase
        .from('acquisition_capture_to_paid')
        .select('*')
        .order('week', { ascending: false })
        .limit(240),
      supabase
        .from('acquisition_sends')
        .select('lane, frame_version, touch_number, status')
        .limit(SENDS_SCAN_CAP),
      supabase
        .from('acquisition_sends')
        .select('id, lane, touch_number, frame_version, rendered_subject, queued_at, status')
        .eq('status', 'queued')
        .order('queued_at', { ascending: false })
        .limit(8),
      supabase
        .from('customers')
        .select('product, kind, mrr_usd, churned_at')
        .limit(5000),
      supabase
        .from('leads')
        .select('id, full_name, email, primary_venture, churned_at, last_emailed_at')
        .eq('status', 'churned')
        .order('churned_at', { ascending: false, nullsFirst: false })
        .limit(60),
      supabase.from('frame_conversion').select('*'),
      supabase
        .from('content_capture_attribution')
        .select('*')
        .order('captures', { ascending: false })
        .limit(20),
      supabase
        .from('acquisition_replies')
        .select('id, lane, status')
        .eq('status', 'new')
        .limit(500),
    ])
    if (ventures.error) throw ventures.error
    if (funnel.error) throw funnel.error
    if (sends.error) throw sends.error
    if (queuedPreview.error) throw queuedPreview.error
    if (customers.error) throw customers.error
    if (churnedLeads.error) throw churnedLeads.error
    // frames / contentAttr / newReplies degrade gracefully pre-migration.

    // Aggregate the sends ledger into per-(lane, frame, touch, status) cells.
    const touchMap = new Map<string, TouchCell>()
    for (const s of sends.data || []) {
      const key = `${s.lane}|${s.frame_version}|${s.touch_number}|${s.status}`
      const cell = touchMap.get(key)
      if (cell) cell.count += 1
      else touchMap.set(key, {
        lane: s.lane,
        frame_version: s.frame_version,
        touch_number: Number(s.touch_number) || 0,
        status: s.status,
        count: 1,
      })
    }
    const touches = Array.from(touchMap.values())

    const lanes = (ventures.data || [])
      .filter(v => !laneFilter || v.slug === laneFilter)
      .map(v => {
        const laneTouches = touches.filter(t => t.lane === v.slug)
        const laneCustomers = (customers.data || []).filter(c => c.product === v.slug)
        const paid = laneCustomers.filter(c => c.kind === 'paid' && c.churned_at == null)
        const history = Array.isArray(v.autonomy_history) ? v.autonomy_history.slice(-6) : []
        return {
          slug: v.slug,
          name: v.display_name,
          active: Boolean(v.active),
          autonomy_level: v.autonomy_level || 'L1',
          autonomy_history: history,
          funnel_weeks: (funnel.data || []).filter((r: any) => r.lane === v.slug).slice(0, 12),
          touches: laneTouches,
          queued_count: laneTouches.filter(t => t.status === 'queued').reduce((s, t) => s + t.count, 0),
          sent_count: laneTouches.filter(t => t.status === 'sent').reduce((s, t) => s + t.count, 0),
          paid_count: paid.length,
          free_count: laneCustomers.filter(c => c.kind === 'free_signup').length,
          mrr_usd: paid.reduce((s, c) => s + (Number(c.mrr_usd) || 0), 0),
          // "Wired" = any evidence of an acquisition pipeline for this lane:
          // sends in the ledger, funnel rows, or captured customers.
          wired: laneTouches.length > 0
            || (funnel.data || []).some((r: any) => r.lane === v.slug)
            || laneCustomers.length > 0,
          churn_queue: (churnedLeads.data || []).filter(l => l.primary_venture === v.slug),
          frames: (frames.data || []).filter((f: any) => f.lane === v.slug),
          replies_new: (newReplies.data || []).filter((r: any) => r.lane === v.slug).length,
        }
      })

    // Churned leads with no primary_venture still deserve a home: pin them to
    // the first lane list under an explicit key so nothing silently vanishes.
    const unassignedChurn = (churnedLeads.data || []).filter(
      l => !lanes.some(v => v.slug === l.primary_venture),
    )

    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300')
    res.status(200).json({
      ok: true,
      generated_at: new Date().toISOString(),
      lanes,
      queued_preview: (queuedPreview.data || []).filter(q => !laneFilter || q.lane === laneFilter),
      unassigned_churn: unassignedChurn,
      content_attribution: contentAttr.data || [],
      sends_scanned: (sends.data || []).length,
      sends_scan_capped: (sends.data || []).length >= SENDS_SCAN_CAP,
    })
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || 'acquisition overview failed' })
  }
}
