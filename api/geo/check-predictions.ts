import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../_supabase.js'
import { guardBearerExport } from '../_auth.js'
import { withContentRun } from '../_runs.js'
import { citationsOf, hostLabel } from '../_aeo.js'

// GET /api/geo/check-predictions
//
// Reads the predictions that have come due and writes the verdict.
//
// WHAT A VERDICT IS WORTH
//
// Every page the engine publishes carries a claim made in advance: this page
// targets this question, these hosts hold the answer today, expect to be named
// within four weeks. This route is where that claim is settled. Without it the
// prediction ledger is a wish list.
//
// The verdict is deliberately blunt and has four values, because a fuzzy
// verdict teaches nothing:
//
//   cited       an assistant named us on that question after the page went up
//   not_cited   it was asked and named someone else
//   unprobed    nobody asked it again, so there is no evidence either way
//   page_gone   the page is not there, which is a publishing failure and not
//               a strategy result
//
// unprobed is the one that matters most in practice and the one a naive
// version gets wrong by scoring it as a failure. The weekly run proposes fresh
// questions each week and has no reason to re-ask an old one, so a page can
// easily go unmeasured. That is a hole in the measurement, not a verdict on
// the page, and it is recorded as such. api/aeo/context.ts hands the engine
// the questions with predictions still open so it re-asks them; this route
// only reports what happened.
//
// Nothing here changes strategy on its own. It writes down what happened so
// the weekly digest can read a real track record instead of a hunch about
// which arguments work.
//
// Bearer AEO_ENGINE_SECRET, and a ledger job so the Content tab says when it
// has gone quiet.

export const config = { maxDuration: 60 }

type Row = Record<string, any>

/** How long after publishing a question must have been re-asked for the
 *  verdict to mean anything. Anything sooner is measuring the index rather
 *  than the page. */
const MIN_DAYS_BEFORE_VERDICT = 21

async function handler(req: VercelRequest, res: VercelResponse) {
  if (guardBearerExport(req, res, 'AEO_ENGINE_SECRET', ['GET', 'POST'])) return
  const started = Date.now()
  const now = new Date()

  try {
    const due = await supabase.from('geo_predictions')
      .select('id, content_idea_id, subject_id, target_query, query_id, hosts_before, claim, why_you_can_win, predicted_at, check_after, path, repo')
      .is('checked_at', null)
      .lte('check_after', now.toISOString())
      .order('check_after')
      .limit(50)
    if (due.error) throw new Error(`due read failed: ${due.error.message}`)
    const rows = (due.data || []) as Row[]
    if (!rows.length) {
      return res.status(200).json({ ok: true, due: 0, checked: 0, ms: Date.now() - started })
    }

    // Every probe of these questions since each page went up. One read, then
    // matched in memory: the questions are few and the window is wide.
    const earliest = rows.reduce((min, r) => (r.predicted_at < min ? r.predicted_at : min), rows[0].predicted_at as string)
    const probes = await supabase.from('growth_geo_probes')
      .select('question, query_id, we_cited, competitors_cited, run_at, engine')
      .gte('run_at', earliest)
      .limit(2000)
    if (probes.error) throw new Error(`probe read failed: ${probes.error.message}`)
    const all = (probes.data || []) as Row[]

    const counts: Record<string, number> = { cited: 0, not_cited: 0, unprobed: 0 }
    const results: Array<Row> = []

    for (const p of rows) {
      const since = String(p.predicted_at)
      const mine = all.filter(x =>
        x.run_at > since
        && ((p.query_id && x.query_id === p.query_id) || (!p.query_id && x.question === p.target_query)))

      let outcome: 'cited' | 'not_cited' | 'unprobed'
      let note: string

      if (!mine.length) {
        outcome = 'unprobed'
        note = 'The question has not been asked again since the page went up, so there is no evidence either way. This is a hole in the measurement, not a verdict on the page.'
      } else {
        const daysSince = (now.getTime() - new Date(since).getTime()) / 86_400_000
        const cited = mine.filter(x => x.we_cited)
        if (cited.length) {
          outcome = 'cited'
          note = `Named in ${cited.length} of ${mine.length} answers since the page went up, ${Math.round(daysSince)} days ago.`
        } else if (daysSince < MIN_DAYS_BEFORE_VERDICT) {
          outcome = 'unprobed'
          note = `Asked ${mine.length} times but only ${Math.round(daysSince)} days after publishing, which is too soon to read as a result.`
        } else {
          outcome = 'not_cited'
          note = `Asked ${mine.length} times over ${Math.round(daysSince)} days and never named.`
        }
      }

      const tally = new Map<string, number>()
      for (const x of mine) {
        for (const c of citationsOf(x.competitors_cited)) {
          const h = hostLabel(c)
          if (h) tally.set(h, (tally.get(h) || 0) + 1)
        }
      }
      const hostsAfter = [...tally.entries()].map(([host, times]) => ({ host, times }))
        .sort((a, b) => b.times - a.times).slice(0, 8)

      // An unprobed prediction is not settled, so it is not closed. It is left
      // open with the note refreshed and its due date pushed, and the engine
      // is asked to re-probe the question. Closing it would quietly turn a
      // measurement gap into a recorded failure.
      const settle = outcome === 'unprobed'
        ? {
            note,
            hosts_after: hostsAfter,
            check_after: new Date(now.getTime() + 14 * 86_400_000).toISOString(),
            updated_at: now.toISOString(),
          }
        : {
            checked_at: now.toISOString(),
            outcome,
            hosts_after: hostsAfter,
            note,
            updated_at: now.toISOString(),
          }

      const upd = await supabase.from('geo_predictions').update(settle).eq('id', p.id)
      if (upd.error) throw new Error(`verdict write failed: ${upd.error.message}`)

      counts[outcome] += 1
      results.push({
        id: p.id,
        target_query: p.target_query,
        outcome,
        note,
        settled: outcome !== 'unprobed',
        claim: p.claim,
        hosts_before: p.hosts_before,
        hosts_after: hostsAfter,
      })
    }

    await supabase.from('audit_log').insert({
      event_type: 'geo_predictions_checked',
      actor: 'geo-check',
      target: 'geo_predictions',
      display_message: `Checked ${rows.length} predictions: ${counts.cited} named, ${counts.not_cited} not, ${counts.unprobed} still unmeasured.`,
      details: JSON.stringify({ counts, ids: rows.map(r => r.id) }),
    }).then(r => { if (r.error) console.error('geo check audit write failed', r.error.message) })

    return res.status(200).json({
      ok: true,
      due: rows.length,
      checked: counts.cited + counts.not_cited,
      ...counts,
      results,
      ms: Date.now() - started,
    })
  } catch (e: unknown) {
    const msg = (e as Error)?.message || String(e)
    console.error('geo check failed', msg)
    return res.status(500).json({ ok: false, error: msg.slice(0, 300) })
  }
}

export default withContentRun('geo_check_predictions', handler)
