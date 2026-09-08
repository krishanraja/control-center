import type { VercelRequest, VercelResponse } from '@vercel/node'
import { guardBearerExport } from '../_auth.js'
import { supabase } from '../_supabase.js'
import { checkDuplicate } from '../_dedup.js'
import { withContentRun } from '../_runs.js'
import {
  MAX_IDEAS_PER_SUBJECT, OPEN_GOVERNOR, aeoSignalRow, aeoSourceRef, probeRows, queryRows, validatePacket,
  type AeoPacket,
} from '../_aeo.js'

// POST /api/aeo/ingest: one AeoPacket, one subject, one week.
//
// The engine (krishanraja/AEO-Engine, GitHub Actions, Sunday 04:00 UTC) does
// the research; this route is where it lands and the only writer of the
// growth_aeo_* tables. In order:
//
//   1. The packet is validated against the contract (api/_aeo.ts) and its
//      subject must be an active row in growth_aeo_subjects.
//   2. Idempotency. The same run_id for the same subject-week is a repeat of
//      a workflow attempt that already landed: 200, deduped, nothing written.
//      A different run_id replaces the week: that run's probes and the week's
//      queries are removed and rewritten, the digest is upserted. Three
//      workflow attempts can each POST and the week ends up written once.
//   3. Probes land in growth_geo_probes (the one probe table), queries in
//      growth_aeo_queries, the digest in growth_aeo_digests.
//   4. Recommendations become content_ideas rows (source_type aeo_signal),
//      governed like build signals: while OPEN_GOVERNOR rows sit undecided
//      no more are added (the digest still lands), at most
//      MAX_IDEAS_PER_SUBJECT per subject-week, a re-run refreshes by
//      source_ref, and the tiered checkDuplicate runs before an insert. The
//      resulting content_idea_id is written onto the recommendation so the
//      Growth tab can open the idea.
//   5. The Run-now ledger (aeo_commands) is closed: the named command is
//      done, or any stale queued row for this subject is superseded.
//
// Every run lands in content_engine_runs as job aeo_ingest (withContentRun),
// registered as an external job in src/lib/contentEngineSchedule.ts, so the
// Content tab says when the machine has gone quiet. Bearer AEO_ENGINE_SECRET.

export const config = { maxDuration: 120 }

type Row = Record<string, any>

function decided(r: Row): boolean {
  const meta = r.meta && typeof r.meta === 'object' ? r.meta as Row : {}
  const radar = meta.editorial_radar && typeof meta.editorial_radar === 'object' ? meta.editorial_radar as Row : {}
  const decisions = radar.decisions && typeof radar.decisions === 'object' ? radar.decisions as Row : {}
  return Object.keys(decisions).length > 0 || (r.state !== 'seeded' && r.state !== 'researching')
}

async function handler(req: VercelRequest, res: VercelResponse) {
  if (guardBearerExport(req, res, 'AEO_ENGINE_SECRET', ['POST'])) return
  const started = Date.now()

  const v = validatePacket(req.body)
  if (v.ok === false) return res.status(400).json({ ok: false, error: 'invalid_packet', errors: v.errors })
  const packet: AeoPacket = v.packet

  try {
    const subjectRead = await supabase.from('growth_aeo_subjects').select('id, kind, slug, name, product_slug, active').eq('id', packet.subject.id).maybeSingle()
    if (subjectRead.error) throw new Error(`subject read failed: ${subjectRead.error.message}`)
    const subject = subjectRead.data as Row | null
    if (!subject) return res.status(404).json({ ok: false, error: 'unknown_subject' })
    if (!subject.active) return res.status(409).json({ ok: false, error: 'subject_inactive' })
    if (subject.kind !== packet.subject.kind || subject.slug !== packet.subject.slug || (subject.product_slug ?? null) !== packet.subject.product_slug) {
      return res.status(409).json({ ok: false, error: 'subject_mismatch', subject: { kind: subject.kind, slug: subject.slug, product_slug: subject.product_slug ?? null } })
    }

    // 2. Idempotency.
    const existingRead = await supabase.from('growth_aeo_digests')
      .select('id, run_id, recommendations')
      .eq('subject_id', packet.subject.id).eq('week_start', packet.week_start).maybeSingle()
    if (existingRead.error) throw new Error(`digest read failed: ${existingRead.error.message}`)
    const existing = existingRead.data as Row | null
    if (existing && existing.run_id === packet.run_id) {
      return res.status(200).json({ ok: true, deduped: true, replaced: false, week_start: packet.week_start, subject: packet.subject.slug, probes: 0, queries: 0, recommendations: 0, ms: Date.now() - started })
    }
    let replaced = false
    if (existing) {
      replaced = true
      const delProbes = await supabase.from('growth_geo_probes').delete().eq('run_id', existing.run_id)
      if (delProbes.error) throw new Error(`probe replace failed: ${delProbes.error.message}`)
      const delQueries = await supabase.from('growth_aeo_queries').delete().eq('subject_id', packet.subject.id).eq('week_start', packet.week_start)
      if (delQueries.error) throw new Error(`query replace failed: ${delQueries.error.message}`)
    }
    // A dismissal survives a replace when the same query is recommended again.
    const priorDismissed = new Map<string, string>()
    for (const r of (Array.isArray(existing?.recommendations) ? existing!.recommendations : []) as Row[]) {
      if (typeof r.query_id === 'string' && typeof r.dismissed_at === 'string') priorDismissed.set(r.query_id, r.dismissed_at)
    }

    // 3. Probes and queries.
    const probes = probeRows(packet)
    if (probes.length) {
      const ins = await supabase.from('growth_geo_probes').insert(probes)
      if (ins.error) throw new Error(`probe insert failed: ${ins.error.message}`)
    }
    const queries = queryRows(packet)
    if (queries.length) {
      const ins = await supabase.from('growth_aeo_queries').insert(queries)
      if (ins.error) throw new Error(`query insert failed: ${ins.error.message}`)
    }

    // 4. Recommendations into the content spine.
    const counts: Record<string, number> = { ideas_inserted: 0, ideas_refreshed: 0, ideas_duplicate: 0, ideas_capped: 0, ideas_governed: 0 }
    const openRead = await supabase.from('content_ideas')
      .select('id,state,meta')
      .eq('source_type', 'aeo_signal')
      .is('parent_idea_id', null)
      .is('buried_at', null)
      .in('state', ['seeded', 'researching'])
      .limit(100)
    if (openRead.error) throw new Error(`aeo_signal open read failed: ${openRead.error.message}`)
    const open = ((openRead.data || []) as Row[]).filter(r => !decided(r)).length
    const governed = open >= OPEN_GOVERNOR

    const recs = [...packet.recommendations].sort((a, b) => a.n - b.n)
    const enriched: Row[] = []
    let admitted = 0
    for (const rec of recs) {
      const out: Row = { ...rec, content_idea_id: null, dismissed_at: priorDismissed.get(rec.query_id) ?? null }
      if (governed) { counts.ideas_governed += 1; enriched.push(out); continue }
      if (admitted >= MAX_IDEAS_PER_SUBJECT) { counts.ideas_capped += 1; enriched.push(out); continue }
      const row = aeoSignalRow(packet, rec, String(subject.name))
      const ref = aeoSourceRef(packet.subject.kind, packet.subject.slug, packet.week_start, rec.n)
      const prior = await supabase.from('content_ideas').select('id,meta').eq('source_type', 'aeo_signal').eq('source_ref', ref).is('parent_idea_id', null).limit(1).maybeSingle()
      if (prior.error) throw new Error(`aeo_signal lookup failed: ${prior.error.message}`)
      if (prior.data) {
        const p = prior.data as { id: string; meta: Row | null }
        const upd = await supabase.from('content_ideas').update({
          idea: row.idea, thesis: row.thesis, source_snippet: row.source_snippet, touchpoint_id: row.touchpoint_id,
          meta: { ...(p.meta || {}), ...row.meta }, updated_at: new Date().toISOString(),
        }).eq('id', p.id).select('id')
        if (upd.error) throw new Error(`aeo_signal refresh failed: ${upd.error.message}`)
        counts.ideas_refreshed += 1; admitted += 1; out.content_idea_id = p.id; enriched.push(out); continue
      }
      const dup = await checkDuplicate('content_ideas', { url: null, title: row.idea, text: row.thesis })
      if (dup.is_duplicate && dup.match_id) { counts.ideas_duplicate += 1; out.content_idea_id = dup.match_id; enriched.push(out); continue }
      const ins = await supabase.from('content_ideas').insert({
        ...row,
        canonical_url: dup.keys.canonical_url,
        title_norm: dup.keys.title_norm,
        content_hash: dup.keys.content_hash,
      }).select('id').single()
      if (ins.error) {
        if (ins.error.code === '23505') { counts.ideas_duplicate += 1; enriched.push(out); continue }
        throw new Error(`aeo_signal insert failed: ${ins.error.message}`)
      }
      counts.ideas_inserted += 1; admitted += 1; out.content_idea_id = (ins.data as { id: string }).id; enriched.push(out)
    }

    // The digest, with the idea ids on it.
    const digest = {
      run_id: packet.run_id,
      subject_id: packet.subject.id,
      week_start: packet.week_start,
      themes: packet.themes,
      themes_status: packet.themes_status,
      strongest_signal: packet.strongest_signal,
      recommendations: enriched,
      watch_list: packet.watch_list,
      competitor_gap: packet.competitor_gap,
      playbook: packet.playbook,
      approach_hook: packet.approach_hook,
      stats: { ...packet.stats, calls: packet.calls, engines_used: packet.engines, generated_at: packet.generated_at },
      updated_at: new Date().toISOString(),
    }
    const up = await supabase.from('growth_aeo_digests').upsert(digest, { onConflict: 'subject_id,week_start' }).select('id').single()
    if (up.error) throw new Error(`digest upsert failed: ${up.error.message}`)

    // 5. The Run-now ledger.
    const finishedAt = new Date().toISOString()
    const result = `${packet.subject.slug}: ${packet.queries.length} queries, ${probes.length} probes, ${packet.recommendations.length} recommendations, $${packet.stats.cost_usd.toFixed(2)}`
    if (packet.command_id != null) {
      await supabase.from('aeo_commands').update({ state: 'done', finished_at: finishedAt, run_id: packet.run_id, result: result.slice(0, 600) })
        .eq('id', packet.command_id).in('state', ['queued', 'running'])
    } else {
      await supabase.from('aeo_commands').update({ state: 'superseded', finished_at: finishedAt, run_id: packet.run_id, result: 'landed by the scheduled run' })
        .in('state', ['queued', 'running']).lt('requested_at', packet.generated_at)
        .or(`subject_id.eq.${packet.subject.id},subject_id.is.null`)
    }

    await supabase.from('audit_log').insert({
      event_type: 'aeo_ingest',
      actor: 'aeo-engine',
      target: 'growth_aeo_digests',
      display_message: `AEO research landed for ${subject.name}, week of ${packet.week_start}: ${result}.`,
      details: JSON.stringify({ subject: packet.subject, week_start: packet.week_start, run_id: packet.run_id, replaced, stats: packet.stats, counts, governed, open }),
    }).then(r => { if (r.error) console.error('aeo_ingest audit write failed', r.error.message) })

    return res.status(200).json({
      ok: true,
      deduped: false,
      replaced,
      week_start: packet.week_start,
      subject: packet.subject.slug,
      digest_id: (up.data as { id: string }).id,
      probes: probes.length,
      queries: queries.length,
      recommendations: packet.recommendations.length,
      cost_usd: packet.stats.cost_usd,
      ...counts,
      governed,
      open_before: open,
      content: governed ? { skipped: 'backlog_governor', open } : null,
      ms: Date.now() - started,
    })
  } catch (e: unknown) {
    const msg = (e as Error)?.message || String(e)
    console.error('aeo ingest failed', msg)
    return res.status(500).json({ ok: false, error: msg.slice(0, 300) })
  }
}

export default withContentRun('aeo_ingest', handler)
