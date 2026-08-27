import { supabase } from './_supabase.js'
import { notifyKrishEmail } from './_alert.js'
import { cyclesFrom, type RegistryRow, type SpendCycle } from './_spend.js'
import { readUnits, daysAgoKey } from './_meter.js'

// The money lines, and the email that gets sent once when one is crossed.
//
// Krish found out he was past Apify's $29 prepaid because APIFY emailed him.
// The Control Center, which exists to tell him things like that, was reporting
// "ok" at the time. This is the part that makes the OS the one that says it.
//
// Email, not Telegram — his call, explicitly, when offered the Telegram
// framing. Money alerts belong in the inbox the invoices land in.
//
// Two lines are watched:
//   1. A plan's prepaid allowance, crossed. Escalating states each alert once.
//   2. A single unit whose week suddenly costs several times its own normal —
//      the "who used it, and could it have been avoided" question, answered
//      while it is still this week's problem.
//
// Every alert is keyed and recorded in spend_alerts_sent BEFORE it is sent, so
// an hourly cron cannot turn one crossing into twenty-four emails. The key
// carries the cycle (or the week), so the same line can legitimately fire again
// next cycle with no cleanup job.

/** Spend in the last 7 days must clear this before a spike is worth an email. */
const SPIKE_FLOOR_USD = 5
/** ...and be this many times the unit's own prior weekly average. */
const SPIKE_MULTIPLE = 3

export interface MoneyAlertResult {
  cycles_checked: number
  sent: string[]
  already_sent: string[]
  undelivered: string[]
  errors: string[]
}

type ClaimState = 'new' | 'drafted' | 'delivered'

/**
 * Claim an alert key, or report what happened to it last time.
 *
 * Claim-before-send, not send-before-record: a crash between the two costs one
 * missed email, where the other order costs an email every hour until someone
 * notices.
 *
 * 'drafted' is the state the first live run exposed. gmail.send was not on the
 * service account's delegation, so the alert fell back to a Gmail draft — and
 * the claim recorded it as sent. A draft is not a delivered alert, and once the
 * scope was added nothing would ever have retried it: the money line stayed
 * crossed and the inbox stayed empty. A drafted claim is now unfinished work,
 * retried send-only so a still-missing scope cannot pile up drafts.
 */
async function claim(alertKey: string, detail: string): Promise<ClaimState> {
  const { error } = await supabase
    .from('spend_alerts_sent')
    .insert({ alert_key: alertKey, channel: 'pending', detail: detail.slice(0, 400) })
  if (!error) return 'new'
  const { data } = await supabase
    .from('spend_alerts_sent').select('channel').eq('alert_key', alertKey).maybeSingle()
  return (data as { channel: string | null } | null)?.channel === 'draft' ? 'drafted' : 'delivered'
}

/** Record how the alert actually left, so the row never overstates delivery. */
async function recordChannel(alertKey: string, via: 'send' | 'draft', detail: string): Promise<void> {
  const patch: Record<string, unknown> = { channel: via === 'send' ? 'email' : 'draft' }
  // sent_at means "when it actually reached him", so a draft that later sends
  // is stamped with the send, not with the drafting. detail follows for the
  // same reason: a retry regenerates the alert from CURRENT cycle numbers, so
  // the first live retry sent "$1.85 past the $29" against a row still
  // claiming "$0.49" — an audit record of an email nobody sent.
  if (via === 'send') {
    patch.sent_at = new Date().toISOString()
    patch.detail = detail.slice(0, 400)
  }
  await supabase.from('spend_alerts_sent').update(patch).eq('alert_key', alertKey)
}

function cycleAlert(c: SpendCycle): { key: string; subject: string; body: string } | null {
  if (c.state === 'within' || c.state === 'unknown') return null
  const cycle = c.cycle_start || 'current'
  const money = (n: number) => `$${n.toFixed(2)}`
  const included = c.included_usd == null ? 'the included amount' : `$${c.included_usd}`

  const subject =
    c.state === 'charging_early'
      ? `${c.name}: ${money(c.over_usd)} overage — being charged early`
      : c.state === 'near_trigger'
        ? `${c.name}: ${money(c.over_usd)} over, approaching the early-charge mark`
        : `${c.name}: ${money(c.over_usd)} past the ${included} included`

  const body = [
    `${c.name} has used ${c.cycle_usd == null ? 'an unreported amount' : money(c.cycle_usd)} this billing cycle.`,
    `The plan includes ${included}, so ${money(c.over_usd)} is extra.`,
    c.overage_trigger_usd != null
      ? c.state === 'charging_early'
        ? `That is past the $${c.overage_trigger_usd} mark, so it gets charged now rather than on the next invoice.`
        : `It lands on the next invoice unless the extra passes $${c.overage_trigger_usd}, at which point it is charged immediately.`
      : 'It lands on the next invoice.',
    c.cycle_end ? `The cycle resets on ${c.cycle_end}.` : '',
    '',
    'What is spending it is in the Control Center: Business Intelligence → What is it costing? → Every service and every spender.',
    c.top_up_url ? `Vendor billing: ${c.top_up_url}` : '',
  ].filter(Boolean).join('\n')

  return { key: `${c.key}:${c.state}:${cycle}`, subject, body }
}

/** Monday-anchored week key, so a spike alerts at most once per unit per week. */
function weekKey(): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7))
  return d.toISOString().slice(0, 10)
}

export async function checkMoneyLines(source: string): Promise<MoneyAlertResult> {
  const out: MoneyAlertResult = { cycles_checked: 0, sent: [], already_sent: [], undelivered: [], errors: [] }

  const pending: Array<{ key: string; subject: string; body: string }> = []

  // ── 1. Prepaid allowances ────────────────────────────────────────────────
  try {
    const { data } = await supabase
      .from('service_registry')
      .select('key, display_name, category, criticality, check_kind, env_key_name, top_up_url, dashboard_url, low_threshold, limit_note, included_usd, overage_trigger_usd, cycle_usd, cycle_start, cycle_end, last_status, balance, balance_unit, last_checked_at')
      .eq('active', true)
      .not('included_usd', 'is', null)
    const cycles = cyclesFrom((data || []) as RegistryRow[])
    out.cycles_checked = cycles.length
    for (const c of cycles) {
      const a = cycleAlert(c)
      if (a) pending.push(a)
    }
  } catch (e) {
    out.errors.push(`cycles: ${String((e as Error)?.message || e).slice(0, 140)}`)
  }

  // ── 2. A unit whose week is several times its own normal ─────────────────
  try {
    const { units, error } = await readUnits({ sinceDay: daysAgoKey(29), recentSinceDay: daysAgoKey(6) })
    if (error) out.errors.push(`meter: ${error}`)
    const week = weekKey()
    for (const u of units) {
      if (u.usd_recent < SPIKE_FLOOR_USD) continue
      const priorWeekly = ((u.usd - u.usd_recent) / 23) * 7
      // No prior history is not a spike; it is a new thing, and a first week is
      // not evidence of anything yet.
      if (priorWeekly <= 0.5) continue
      if (u.usd_recent < priorWeekly * SPIKE_MULTIPLE) continue
      pending.push({
        key: `spike:${u.provider}:${u.unit_key}:${week}`,
        subject: `${u.label} cost $${u.usd_recent.toFixed(2)} this week (usually about $${priorWeekly.toFixed(2)})`,
        body: [
          `${u.label} (${u.provider}) has spent $${u.usd_recent.toFixed(2)} in the last 7 days.`,
          `Its usual week over the previous three is about $${priorWeekly.toFixed(2)}.`,
          `Runs in the window: ${u.runs.toLocaleString('en-US')}${u.failed > 0 ? `, of which ${u.failed} failed` : ''}.`,
          u.buckets.length ? `Started from: ${u.buckets.map(b => `${b.bucket} (${b.runs})`).join(', ')}.` : '',
          '',
          'Business Intelligence → What is it costing? shows it ranked against everything else.',
        ].filter(Boolean).join('\n'),
      })
    }
  } catch (e) {
    out.errors.push(`spike: ${String((e as Error)?.message || e).slice(0, 140)}`)
  }

  // ── Claim, then send ─────────────────────────────────────────────────────
  for (const a of pending) {
    const state = await claim(a.key, a.subject)
    if (state === 'delivered') { out.already_sent.push(a.key); continue }

    const r = await notifyKrishEmail(a.subject, a.body, { sendOnly: state === 'drafted' })
    if (r.sent && r.via) {
      await recordChannel(a.key, r.via, a.subject)
      out.sent.push(`${a.key}${r.via === 'draft' ? ' (draft)' : ''}`)
      continue
    }

    if (state === 'drafted') {
      // The draft is still sitting there and the scope is still missing.
      // Say so; do not create a second copy of the same alert.
      out.undelivered.push(`${a.key} (draft pending)`)
      out.errors.push(`${a.key}: ${r.error || 'still undelivered'}`)
      continue
    }

    out.undelivered.push(a.key)
    out.errors.push(`${a.key}: ${r.error || 'not delivered'}`)
    // Undo a fresh claim entirely so a fixed mailer is not permanently
    // silenced by the record of an alert that never arrived at all.
    await supabase.from('spend_alerts_sent').delete().eq('alert_key', a.key)
  }

  if (out.sent.length) {
    await supabase.from('audit_log').insert({
      event_type: 'money_line_crossed',
      actor: source,
      target: 'spend',
      display_message: `Emailed ${out.sent.length} money alert${out.sent.length === 1 ? '' : 's'}`,
      details: JSON.stringify({ sent: out.sent, undelivered: out.undelivered }),
    }).then(() => undefined, () => undefined)
  }

  return out
}
