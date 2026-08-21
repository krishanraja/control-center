import { supabase } from './_supabase.js'
import { blockedMessage, type ProviderOutcome } from './_quota.js'

// Operator alerting.
//
// notifyTelegram lived privately inside api/growth/council-run.ts, which meant
// the only thing in the whole API surface that could reach Krish was the weekly
// growth council. Everything else that ran out of credits failed quietly. This
// is that function, lifted, plus the one caller that matters: a paid API the
// account can no longer serve.
//
// Three destinations, deliberately, because they fail differently:
//   1. Telegram   — reaches a phone. Best-effort; never throws.
//   2. api_usage_state — the row the hourly VPS alerter (api-usage-alerter.py)
//      already reads. Writing last_status here means a credit wall found by a
//      Vercel route shows up in the same place as one found by the poller.
//   3. audit_log  — durable record, so "when did PDL run dry" is answerable.
//
// None of them is allowed to fail the request that raised the alert.

export async function notifyOps(text: string): Promise<{ sent: boolean; error?: string }> {
  const token = process.env.TELEGRAM_APPROVALS_BOT_TOKEN
  const chatId = process.env.TELEGRAM_APPROVALS_CHAT_ID
  if (!token || !chatId) {
    return { sent: false, error: 'TELEGRAM_APPROVALS_BOT_TOKEN / TELEGRAM_APPROVALS_CHAT_ID not configured' }
  }
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
    })
    if (!r.ok) return { sent: false, error: `telegram_${r.status}: ${(await r.text().catch(() => '')).slice(0, 160)}` }
    return { sent: true }
  } catch (err: unknown) {
    return { sent: false, error: String((err as Error)?.message || err) }
  }
}

/** Append to the shared usage ledger. The RPC exists live with this exact
 *  signature (verified against the project); it is intentionally fire-and-forget
 *  because a metering failure must never break an enrichment. */
export async function logApiCall(opts: {
  api: string
  endpoint: string
  units?: number
  estCostUsd?: number
  source?: string
  meta?: Record<string, unknown>
}): Promise<void> {
  try {
    await supabase.rpc('log_api_call', {
      p_api_name: opts.api,
      p_endpoint: opts.endpoint,
      p_units: opts.units ?? 1,
      p_est_cost_usd: opts.estCostUsd ?? 0,
      p_source: opts.source ?? 'control-center',
      p_meta: opts.meta ?? {},
    })
  } catch { /* metering is never load-bearing */ }
}

/** Mark a provider as unable to serve calls, where the hourly alerter looks. */
async function markUsageState(o: ProviderOutcome): Promise<void> {
  try {
    await supabase
      .from('api_usage_state')
      .update({
        last_status: o.status === 'exhausted' ? 'exhausted' : o.status === 'auth_failed' ? 'auth_failed' : 'rate_limited',
        last_error: `${o.httpStatus ? `HTTP ${o.httpStatus} ` : ''}${o.detail || ''}`.trim().slice(0, 500) || null,
        updated_at: new Date().toISOString(),
      })
      .eq('api_name', o.api)
  } catch { /* best effort */ }
}

/** Raise the "not enough API credits" alert.
 *
 *  Called when an enrichment run had to stop rather than write a partial record.
 *  Returns whether the phone actually got it, so the caller can say so in the
 *  API response — an alert that silently failed to send is the same problem one
 *  layer up. */
export async function raiseQuotaAlert(opts: {
  blocked: ProviderOutcome[]
  /** What was being enriched, for the message. */
  subject: string
  /** Where the run was triggered from. */
  source: string
}): Promise<{ notified: boolean; error?: string }> {
  if (!opts.blocked.length) return { notified: false }

  const detail = blockedMessage(opts.blocked)
  const text = [
    '⚠️ Enrichment STOPPED — API credits',
    '',
    `Subject: ${opts.subject}`,
    `Source:  ${opts.source}`,
    '',
    detail,
    '',
    'The record was saved but NOT marked enriched, so it will not be mistaken for a complete one. Top up or rotate the key, then re-run enrichment.',
  ].join('\n')

  const [tg] = await Promise.all([
    notifyOps(text),
    Promise.all(opts.blocked.map(markUsageState)),
    supabase.from('audit_log').insert({
      event_type: 'api_quota_blocked',
      actor: opts.source,
      target: opts.subject,
      display_message: `Enrichment stopped — ${opts.blocked.map(b => `${b.api} ${b.status}`).join(', ')}`,
      // `details` is a text column, not jsonb (audit_log.changes is the jsonb
      // one). Passing an object here inserts the string "[object Object]".
      details: JSON.stringify({ blocked: opts.blocked }),
    }).then(() => undefined, () => undefined),
  ])

  return { notified: tg.sent, error: tg.error }
}
