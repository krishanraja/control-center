import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabase } from '../_supabase.js'
import { guardCronRoute } from '../_auth.js'
import { notifyOps } from '../_alert.js'
import { googleConfigured, createGmailDraft } from '../_google.js'
import { getOperatorTz, ymdIn, shiftYmd } from '../_timezone.js'
import { isoWeekLabel } from '../_weeks.js'
import {
  WEEKS, TARGETS, COLUMNS, STOP_RULE, DAY_90,
  weekEndingFor, loadRows, weekValues, sumValues, gapTo, isMissingTable, fmtYmd,
} from '../_scorecard.js'

// The Monday scorecard (job 2, keep him honest).
//
// Runs Monday 10:30 UTC, after api/room/monday.ts has drafted the week's
// approaches, so the note can list them. It says four things and nothing else:
// last week's row, the gap to each day 90 target, the approaches drafted and
// waiting to be sent, and the piece drafted for his voice pass.
//
// Telegram is the primary. When PARTNER_EMAIL is set the same note is written
// as a Gmail DRAFT to the partner, never sent: this route imports
// createGmailDraft and nothing else from api/_google.ts, and the approval wall
// in docs/plans/one-swing/CHARTER.md says so.
//
//   GET (CRON_SECRET)   POST (manual, through the edge gate)

export const config = { maxDuration: 60 }

interface Drafted { name: string }

async function draftedApproaches(): Promise<{ count: number; names: string[] }> {
  try {
    const { data, error } = await supabase
      .from('room_targets')
      .select('id, contact_id, contacts(full_name)')
      .eq('state', 'drafted')
      .order('drafted_at', { ascending: false })
    if (error) {
      if (isMissingTable(error)) return { count: 0, names: [] }
      // The join is the fragile half. Fall back to a plain count.
      const plain = await supabase.from('room_targets').select('id', { count: 'exact', head: true }).eq('state', 'drafted')
      if (plain.error && !isMissingTable(plain.error)) throw new Error(`room_targets: ${plain.error.message}`)
      return { count: plain.count ?? 0, names: [] }
    }
    const rows = (data || []) as { contacts?: { full_name?: string | null } | { full_name?: string | null }[] | null }[]
    const names: string[] = []
    for (const r of rows) {
      const c = Array.isArray(r.contacts) ? r.contacts[0] : r.contacts
      if (c?.full_name) names.push(c.full_name)
    }
    return { count: rows.length, names }
  } catch (err) {
    if (isMissingTable(err as { code?: string; message?: string })) return { count: 0, names: [] }
    throw err
  }
}

async function draftedPiece(week: string): Promise<{ title: string | null; status: string | null } | null> {
  try {
    const { data, error } = await supabase
      .from('weekly_briefs')
      .select('title, status')
      .eq('week', week)
      .in('status', ['ready', 'in_review'])
      .limit(1)
      .maybeSingle()
    if (error) {
      if (isMissingTable(error)) return null
      // A missing title column is the likely drift; ask again without it.
      const again = await supabase.from('weekly_briefs').select('status').eq('week', week)
        .in('status', ['ready', 'in_review']).limit(1).maybeSingle()
      if (again.error || !again.data) return null
      return { title: null, status: (again.data as { status: string }).status }
    }
    if (!data) return null
    const d = data as { title?: string | null; status?: string | null }
    return { title: d.title ?? null, status: d.status ?? null }
  } catch {
    return null
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (guardCronRoute(req, res)) return

  try {
    const tz = await getOperatorTz()
    const today = ymdIn(new Date(), tz)
    // The Friday just gone: the Friday on or after today, less a week. On a
    // Friday itself this is the previous Friday, which is still last week.
    const lastWeek = shiftYmd(weekEndingFor(today), -7)
    const rows = await loadRows()

    const last = await weekValues(lastWeek, rows.get(lastWeek), tz)
    const frozen = Boolean(rows.get(lastWeek)?.frozen_at)

    const toDate = await Promise.all(
      WEEKS.filter(w => w <= lastWeek).map(w => weekValues(w, rows.get(w), tz)),
    )
    const totals = sumValues(toDate)
    const gap = gapTo(totals)

    const drafted = await draftedApproaches()
    const piece = await draftedPiece(isoWeekLabel())
    const weeksLeft = WEEKS.filter(w => w > lastWeek).length

    const lines: string[] = []
    lines.push(`Monday scorecard, week ending ${fmtYmd(lastWeek)}${frozen ? '' : ' (not frozen, derived live)'}.`)
    lines.push('')
    lines.push('Last week:')
    for (const c of COLUMNS) {
      const v = last[c.key]
      lines.push(`  ${c.label}: ${c.key === 'unasked_hours' ? `${v}h${last.unasked_measured ? ' (estimate from commits)' : ' (not measured yet)'}` : v}`)
    }
    lines.push('')
    lines.push(`Gap to day 90 (${fmtYmd(DAY_90)}), ${weeksLeft} ${weeksLeft === 1 ? 'week' : 'weeks'} left:`)
    for (const c of COLUMNS) {
      const t = TARGETS[c.key]
      lines.push(c.key === 'unasked_hours'
        ? `  ${c.label}: ${totals.unasked_hours}h to date against a target of 0`
        : `  ${c.label}: ${totals[c.key]} of ${t}, ${gap[c.key]} to go`)
    }
    lines.push('')
    if (drafted.count > 0) {
      lines.push(`${drafted.count} drafted ${drafted.count === 1 ? 'approach' : 'approaches'} waiting to send${drafted.names.length ? `: ${drafted.names.join(', ')}` : ''}.`)
    } else {
      lines.push('No drafted approaches waiting. The Room has nothing queued for this week.')
    }
    lines.push(piece
      ? `Drafted piece for your voice pass: ${piece.title || `brief ${isoWeekLabel()}`} (${piece.status}).`
      : 'No drafted piece this week.')
    if (lastWeek < STOP_RULE.on) {
      lines.push('')
      lines.push(`Stop rule reads on ${fmtYmd(STOP_RULE.on)}: ${STOP_RULE.reads}`)
    }
    const body = lines.join('\n')

    const telegram = await notifyOps(body)

    let partnerDraftUrl: string | null = null
    const partner = (process.env.PARTNER_EMAIL || '').trim()
    if (partner && googleConfigured()) {
      const draft = await createGmailDraft({
        to: partner,
        subject: `Monday scorecard, week ending ${fmtYmd(lastWeek)}`,
        body,
      })
      partnerDraftUrl = draft?.url ?? null
    }

    return res.status(200).json({
      ok: true,
      week_ending: lastWeek,
      sent_telegram: telegram.sent,
      partner_draft_url: partnerDraftUrl,
      body,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return res.status(500).json({ ok: false, error: msg })
  }
}
