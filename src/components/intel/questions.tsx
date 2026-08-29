import React, { useState } from 'react'
import { ChevronRight } from '@/lib/icons'
import { Sparkline } from '../shared/Sparkline'
import { LastUpdated } from '../shared/LastUpdated'
import { useHaptics } from '../../hooks/useHaptics'
import { useSpend, usageLine, worstCycle, cycleLine, type SpendServiceRow, type SpendUnit } from '../../hooks/useSpend'
import { useRevenue, formatCommittedMrr } from '../../hooks/useRevenue'
import { useFleetFunnel, appHealth, appDisplayLabel, HEALTH_DOT, HEALTH_LABEL } from '../../hooks/useFleetFunnel'
import { useVentureRegistry } from '../../hooks/useVentureRegistry'
import { useBets, isOverdue, type BetRow } from '../../hooks/useBets'
import { useHomeIntelligence } from '../../hooks/useHomeIntelligence'
import { useMarcusSynthesis } from '../../hooks/useMarcusSynthesis'
import { useProductMetrics } from '../../hooks/useProductMetrics'

/**
 * The five questions — the whole Business Intelligence surface.
 *
 * The tab is an interrogation, not a dashboard (Krish's approved concept,
 * 2026-08-26): five fixed questions in an unchanging order, each answered
 * live in one line, each opening into its full answer. These hooks own the
 * answers; the tab owns the layout (accordion on a phone, rail and pane on
 * desktop). Every answer line is deterministic system truth; Marcus appears
 * only inside answers as a marked serif voice, never mixed with the numbers.
 */

export type QuestionTone = 'ok' | 'warn' | 'bad' | 'quiet'

export interface QuestionState {
  id: string
  question: string
  /** The one-word (or two) state token for sub-second triage. */
  token: { label: string; tone: QuestionTone }
  /** The live one-line answer. Plain sentences; numbers in mono. */
  answer: React.ReactNode
  /** The full answer, opened. */
  detail: React.ReactNode
}

export const TOKEN_TONE: Record<QuestionTone, string> = {
  ok: 'text-emerald-300',
  warn: 'text-amber-300',
  bad: 'text-rose-300',
  quiet: 'text-white/35',
}

const usd = (n: number): string => `$${Math.round(n).toLocaleString('en-US')}`
/** Cents matter under $100 — an actor costing $3.40 must not read as $3. */
const usdExact = (n: number): string =>
  n >= 100 ? `$${Math.round(n).toLocaleString('en-US')}` : `$${n.toFixed(2)}`
const usdCents = (cents: number): string => {
  const n = cents / 100
  return `$${n.toLocaleString('en-US', { maximumFractionDigits: n >= 100 ? 0 : 2 })}`
}
const dollars = (cents: number): string => `$${Math.round((cents || 0) / 100).toLocaleString('en-US')}`

/** A number inside an answer sentence: mono, bright, tabular. */
function N({ children, testId }: { children: React.ReactNode; testId?: string }) {
  return <span data-testid={testId} className="font-mono font-medium tabular-nums text-white">{children}</span>
}

/** One act row inside an opened answer: a kind tag, the thing, its move. */
function ActRow({ tag, tone, children, sub, action }: {
  tag: string
  tone: QuestionTone
  children: React.ReactNode
  sub?: React.ReactNode
  action?: React.ReactNode
}) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.03] px-3.5 py-3">
      <span className={`shrink-0 pt-[3px] font-mono text-micro font-semibold tracking-[0.14em] ${TOKEN_TONE[tone]}`}>{tag}</span>
      <div className="min-w-0 flex-1">
        <p className="text-ui leading-snug text-white/90">{children}</p>
        {sub && <p className="mt-0.5 text-label leading-snug text-white/40">{sub}</p>}
        {action && <div className="mt-2 flex items-center gap-2">{action}</div>}
      </div>
    </div>
  )
}

function Verb({ onClick, href, children, primary }: {
  onClick?: () => void
  href?: string
  children: React.ReactNode
  primary?: boolean
}) {
  const cls = `inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-label font-semibold transition-colors ${
    primary
      ? 'border-violet-400/50 text-violet-200 hover:bg-violet-500/10'
      : 'border-white/[0.1] text-white/80 hover:bg-white/[0.06]'
  }`
  if (href) {
    return <a href={href} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} className={cls}>{children}</a>
  }
  return <button type="button" onClick={onClick} className={cls}>{children}</button>
}

/** A quiet full-width door row inside an opened answer. */
function DoorRow({ onClick, testId, children }: {
  onClick: () => void
  testId?: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      className="group flex w-full items-center gap-2 rounded-2xl border border-white/[0.08] bg-white/[0.03] px-3.5 py-2.5 text-left transition-colors hover:bg-white/[0.05]"
    >
      <span className="min-w-0 flex-1 truncate text-ui font-medium text-white/85">{children}</span>
      <ChevronRight size={14} className="shrink-0 text-white/30 transition-colors group-hover:text-white/60" aria-hidden />
    </button>
  )
}

const blocking = (s: SpendServiceRow): boolean =>
  s.status != null && ['auth_failed', 'exhausted', 'rate_limited'].includes(s.status)

const why = (s: SpendServiceRow): string =>
  s.status === 'exhausted' ? 'out of credits'
  : s.status === 'auth_failed' ? 'its key was rejected'
  : s.status === 'rate_limited' ? 'rate limited'
  : 'not answering'

/**
 * One metered spender, in the unit its provider actually bills in.
 *
 * Apify prices every run, so an actor reads in dollars. n8n Cloud bills by
 * execution and its API reports no price at all, so a workflow reads in
 * executions — inventing a per-execution rate would put a number in the same
 * column as real money and make the whole ranking untrustworthy. Anthropic is
 * self-metered from the token counts on each response.
 */
function unitAmount(u: SpendUnit): string {
  if (u.usd > 0) return usdExact(u.usd)
  if (u.unit_name === 'executions') return `${u.runs.toLocaleString('en-US')} runs`
  if (u.unit_name === 'tokens') return `${Math.round(u.units / 1000).toLocaleString('en-US')}k tokens`
  return `${u.runs.toLocaleString('en-US')} runs`
}

const PROVIDER_LABEL: Record<string, string> = {
  apify: 'Apify actor',
  n8n: 'n8n workflow',
  anthropic: 'Anthropic',
}

/** The sub-line under a spender: what it is, and what is odd about it. */
function unitNote(u: SpendUnit): string {
  const bits: string[] = [PROVIDER_LABEL[u.provider] || u.provider]
  if (u.provider === 'apify') bits.push(u.category ? u.category.replace(/_/g, ' ') : 'not in the actor registry')
  if (u.provider === 'anthropic' && u.key === 'unattributed') bits.push('caller not stamped')
  if (u.failed > 0) bits.push(`${u.failed} failed`)
  if (u.usd > 0 && u.usd_7d > 0) bits.push(`${usdExact(u.usd_7d)} this week`)
  return bits.join(' · ')
}

/** A spender row: the name, the note, the money. */
function SpenderRow({ unit }: { unit: SpendUnit }) {
  return (
    <div className="flex items-baseline gap-3 py-1.5">
      <span className="min-w-0 flex-1">
        <span className="block truncate text-ui leading-snug text-white/85">{unit.label}</span>
        <span className="block truncate text-label leading-snug text-white/40">{unitNote(unit)}</span>
      </span>
      <span className="shrink-0 font-mono text-ui tabular-nums text-white/90">{unitAmount(unit)}</span>
    </div>
  )
}

// ── 1. What is it costing? ─────────────────────────────────────────────────

export function useCostingQuestion({ onOpenServices }: { onOpenServices: () => void }): QuestionState {
  const { spend } = useSpend()

  const empty = !spend || spend.empty
  const cycle = worstCycle(spend)
  const top = spend?.spenders?.units || []

  // A crossed prepaid line outranks a steady month: overage is money already
  // being spent extra, and it is precisely the state this tab used to report
  // as "ok" while the vendor was emailing to say otherwise.
  const token = empty
    ? { label: spend ? 'NO DATA' : 'READING', tone: 'quiet' as const }
    : cycle?.state === 'charging_early' ? { label: 'CHARGING', tone: 'bad' as const }
    : cycle?.state === 'near_trigger' ? { label: 'OVER PREPAID', tone: 'bad' as const }
    : cycle?.state === 'over_prepaid' ? { label: 'OVER PREPAID', tone: 'warn' as const }
    : spend.ballooning ? { label: 'BALLOONING', tone: 'bad' as const }
    : spend.delta_pct != null && spend.delta_pct >= 10 ? { label: `UP ${spend.delta_pct}%`, tone: 'warn' as const }
    : spend.delta_pct != null && spend.delta_pct > 0 ? { label: `UP ${spend.delta_pct}%`, tone: 'quiet' as const }
    : { label: 'STEADY', tone: 'ok' as const }

  const answer = empty ? (
    <>No receipts read yet. The Gmail backfill and the first sweep fill this in.</>
  ) : cycle ? (
    <><N testId="spend-month-total">{usd(spend.month_usd)}</N> out this month, and {cycle.name} is <N>{usdExact(cycle.over_usd)}</N> past its prepaid.</>
  ) : spend.avg_3mo_usd > 0 ? (
    <>Money out is <N testId="spend-month-total">{usd(spend.month_usd)}</N> this month, against a usual <N>{usd(spend.avg_3mo_usd)}</N>.</>
  ) : (
    <>Money out is <N testId="spend-month-total">{usd(spend.month_usd)}</N> this month.</>
  )

  const detail = empty ? (
    <p className="text-body leading-relaxed text-white/45">
      Nothing to break down yet.
    </p>
  ) : (
    <div className="flex flex-col gap-3">
      <div className="flex items-end gap-3">
        <p className="min-w-0 flex-1 text-body leading-relaxed text-white/60">
          {spend.avg_3mo_usd > 0 && <>A normal month is about <span className="font-mono tabular-nums">{usd(spend.avg_3mo_usd)}</span>. </>}
          {spend.meter && <>On the meter so far: <span className="font-mono tabular-nums">${spend.meter.usd_mtd.toFixed(0)}</span> across <span className="font-mono tabular-nums">{spend.meter.calls_mtd.toLocaleString('en-US')}</span> calls.</>}
        </p>
        {spend.months.length > 1 && (
          <Sparkline
            data={spend.months.map(m => m.total_usd)}
            positive={spend.delta_pct != null ? spend.delta_pct <= 0 : true}
            ariaLabel="6-month spend trend"
          />
        )}
      </div>
      {(spend.cycles || []).filter(c => c.state !== 'unknown').map(c => (
        <ActRow
          key={c.key}
          tag={c.state === 'within' ? 'PLAN' : 'OVER'}
          tone={c.state === 'charging_early' || c.state === 'near_trigger' ? 'bad' : c.state === 'over_prepaid' ? 'warn' : 'quiet'}
          sub={c.cycle_end ? `Cycle ends ${new Date(c.cycle_end).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}.` : undefined}
          action={c.state !== 'within' && c.top_up_url ? <Verb href={c.top_up_url} primary>Open {c.name} billing</Verb> : undefined}
        >
          {cycleLine(c)}
        </ActRow>
      ))}

      {top.length > 0 && (
        <div data-testid="spend-spenders">
          <p className="mb-0.5 font-mono text-micro font-semibold uppercase tracking-[0.14em] text-white/40">
            Where it went · 30 days
          </p>
          {top.slice(0, 3).map(u => <SpenderRow key={`${u.provider}-${u.key}`} unit={u} />)}
        </div>
      )}

      {spend.needs_review > 0 && (
        <p className="text-label text-white/40" data-testid="spend-review-line">
          {spend.needs_review} receipt{spend.needs_review === 1 ? '' : 's'} could not be read. They are flagged in the list, not counted as zero.
        </p>
      )}
      <DoorRow onClick={onOpenServices} testId="spend-panel-open">
        {top.length > 0 ? 'Every service and every spender' : 'Every service, ranked by cost'}
      </DoorRow>
    </div>
  )

  return { id: 'costing', question: 'What is it costing?', token, answer, detail }
}

// ── 2. What is coming in? ──────────────────────────────────────────────────

export function useIncomeQuestion(): QuestionState {
  const { revenue } = useRevenue()

  const empty = !revenue || revenue.empty
  const token = !revenue
    ? { label: 'READING', tone: 'quiet' as const }
    : empty || revenue.active_subscriptions === 0
      ? { label: 'NOTHING YET', tone: 'quiet' as const }
      // Copy-level judgment, not a computed threshold: while committed MRR is
      // this early-stage the honest word is EARLY. Revisit when it grows.
      : { label: 'EARLY', tone: 'quiet' as const }

  const answer = empty ? (
    <>No Stripe read yet.</>
  ) : (
    <><N>{usdCents(revenue.committed_mrr_usd_cents)}</N> a month committed, from <N>{revenue.active_subscriptions}</N> subscriber{revenue.active_subscriptions === 1 ? '' : 's'}.</>
  )

  const detail = empty ? (
    <p className="text-body leading-relaxed text-white/45">
      This fills in from Stripe once there is revenue to report.
    </p>
  ) : (
    <div className="flex flex-col gap-3">
      <p className="text-body leading-relaxed text-white/60">
        Committed in full: <span className="font-mono tabular-nums text-white/85">{formatCommittedMrr(revenue)}</span> a month.
      </p>
      <div className="flex flex-col gap-1">
        {[
          ['Collected in the last 30 days, net', revenue.collected_30d_net_cents],
          ['Last 90 days, net', revenue.collected_90d_net_cents],
          ['All time, net', revenue.collected_all_time_net_cents],
          ['All time, gross', revenue.collected_all_time_gross_cents],
        ].map(([label, cents]) => (
          <div key={label as string} className="flex items-baseline gap-3">
            <span className="min-w-0 flex-1 truncate text-body text-white/60">{label}</span>
            <span className="shrink-0 font-mono text-body tabular-nums text-white/85">{usdCents(cents as number)}</span>
          </div>
        ))}
      </div>
      {revenue.one_time_share_pct != null && (
        <p className="text-label leading-relaxed text-white/40">
          {Math.round(revenue.one_time_share_pct)}% of everything collected came from one-off payments, which is why
          committed and collected are shown apart and never added together.
        </p>
      )}
    </div>
  )

  return { id: 'income', question: 'What is coming in?', token, answer, detail }
}

// ── 3. What is broken? ─────────────────────────────────────────────────────

export function useBrokenQuestion(): QuestionState {
  const { spend, refresh } = useSpend()
  const h = useHaptics()
  const [checking, setChecking] = useState(false)

  const conns = spend?.connections
  const brokenSvcs = (spend?.services || []).filter(blocking)
  // Mirrors the server's rollup: a service on a prepaid plan is never listed
  // here as "running low". Negative headroom is overage, and the costing
  // answer says so in money; repeating it here as a credit shortage would be
  // the same fact told twice, once wrongly.
  const lowSvcs = (spend?.services || []).filter(s => !blocking(s) && s.balance_low && s.included_usd == null)
  const checked = conns ? conns.ok + conns.low + conns.broken : 0

  const token = !spend
    ? { label: 'READING', tone: 'quiet' as const }
    : checked === 0
      ? { label: 'UNCHECKED', tone: 'quiet' as const }
      : conns!.broken > 0
        ? { label: `${conns!.broken} BROKEN`, tone: (conns!.critical_broken > 0 ? 'bad' : 'bad') as QuestionTone }
        : conns!.low > 0
          ? { label: `${conns!.low} LOW`, tone: 'warn' as const }
          : { label: 'ALL OK', tone: 'ok' as const }

  const first = brokenSvcs[0]
  const answer = !spend || checked === 0 ? (
    <>No connections checked yet. The sweep runs every morning, or on demand below.</>
  ) : first ? (
    <>{first.name} is {why(first)}.{' '}
      {conns!.broken > 1
        ? <><N>{conns!.broken - 1}</N> more {conns!.broken - 1 === 1 ? 'is' : 'are'} down. <N>{conns!.ok}</N> APIs are healthy.</>
        : <>The other <N>{conns!.ok}</N> APIs are healthy.</>}
    </>
  ) : conns!.low > 0 ? (
    <>{lowSvcs[0]?.name || 'A service'} is running low. The other <N>{conns!.ok}</N> APIs are healthy.</>
  ) : (
    <>Nothing. All <N>{conns!.ok}</N> APIs are healthy.</>
  )

  const checkNow = async () => {
    if (checking) return
    h.select()
    setChecking(true)
    try {
      await fetch('/api/health/connections-sweep', { method: 'POST' })
      await refresh()
    } catch { /* keep the last good read */ }
    setChecking(false)
  }

  const detail = (
    <div className="flex flex-col gap-3">
      {[...brokenSvcs, ...lowSvcs].map(s => (
        <ActRow
          key={s.key}
          tag={blocking(s) ? 'DOWN' : 'LOW'}
          tone={blocking(s) ? 'bad' : 'warn'}
          sub={usageLine(s)}
          action={(s.top_up_url || s.dashboard_url) ? (
            <Verb primary href={s.top_up_url || s.dashboard_url || undefined}>
              {s.status === 'exhausted' || s.balance_low ? 'Top up' : 'Open'}
            </Verb>
          ) : undefined}
        >
          {s.name} is {blocking(s) ? why(s) : `low: ${s.balance?.toLocaleString('en-US')} ${s.balance_unit || ''} left`}
        </ActRow>
      ))}
      {brokenSvcs.length === 0 && lowSvcs.length === 0 && checked > 0 && (
        <p className="text-body leading-relaxed text-white/45">
          Every checked connection answered. Nothing needs a hand.
        </p>
      )}
      <div className="flex items-center gap-3">
        <button
          type="button"
          data-testid="spend-check-now"
          onClick={checkNow}
          disabled={checking}
          className="rounded-full border border-white/[0.1] px-3.5 py-1.5 text-label font-semibold text-white/80 transition-colors hover:bg-white/[0.06] disabled:opacity-50"
        >
          {checking ? 'Checking…' : 'Check now'}
        </button>
        {conns && conns.unchecked > 0 && (
          <span className="text-label text-white/35">{conns.unchecked} unchecked</span>
        )}
        <span className="ml-auto"><LastUpdated date={spend?.as_of ? new Date(spend.as_of) : null} refreshing={checking} /></span>
      </div>
    </div>
  )

  return { id: 'broken', question: 'What is broken?', token, answer, detail }
}

// ── 4. Is anything converting? ─────────────────────────────────────────────

export function useConvertingQuestion(): QuestionState {
  const { funnel, error, loading } = useFleetFunnel()
  const { ventures } = useVentureRegistry()
  // Usage sits next to conversion deliberately. The funnel says who landed and
  // who bought; this says who came back. A product with landings and no
  // returning users is a different problem from one with no landings, and
  // PostHog has been answering that nightly into a table nothing read.
  const usage = useProductMetrics()

  const rows = funnel?.byApp || []
  const landed7 = rows.reduce((s, a) => s + a.landed_7d, 0)
  const bought7 = rows.reduce((s, a) => s + a.purchased_7d, 0)

  const token = !funnel
    ? { label: loading ? 'READING' : 'NO DATA', tone: 'quiet' as const }
    : bought7 > 0 ? { label: 'MOVING', tone: 'ok' as const }
    : landed7 > 0 ? { label: 'QUIET', tone: 'quiet' as const }
    : { label: 'SILENT', tone: 'quiet' as const }

  const answer = !funnel ? (
    <>{loading ? 'Reading the warehouse.' : error || 'No attribution read yet.'}</>
  ) : rows.length === 0 ? (
    <>No builder apps are wired to the warehouse yet.</>
  ) : landed7 > 0 ? (
    <><N>{landed7.toLocaleString('en-US')}</N> landed across the fleet this week, <N>{bought7}</N> bought.</>
  ) : (
    <>Nothing landed across the fleet this week.</>
  )

  const detail = !funnel || rows.length === 0 ? (
    <p className="text-body leading-relaxed text-white/45">
      The fleet funnel fills in once the builder apps emit events.
    </p>
  ) : (
    <div className="flex flex-col gap-3">
      {rows.map(r => {
        const health = appHealth(r)
        return (
          <div key={r.app}>
            <div className="flex items-baseline gap-2.5">
              <span aria-hidden className={`relative top-[-1px] h-1.5 w-1.5 shrink-0 self-center rounded-full ${HEALTH_DOT[health]}`} title={HEALTH_LABEL[health]} />
              <span className="text-ui font-semibold text-white">{appDisplayLabel(r.app, ventures)}</span>
              <span className="text-label text-white/50"><span className="font-mono tabular-nums text-white/80">{r.landed_7d}</span> landed this week, <span className="font-mono tabular-nums text-white/80">{r.purchased_7d}</span> bought</span>
              <span className="ml-auto shrink-0 font-mono text-ui font-semibold tabular-nums text-emerald-300">{dollars(r.gross_cents)}</span>
            </div>
            <p className="mt-0.5 pl-[16px] text-label leading-snug text-white/40">
              All time: {r.landed.toLocaleString('en-US')} landed, {r.signed_up.toLocaleString('en-US')} signed, {r.activated.toLocaleString('en-US')} active, {r.purchased} bought.
              {' '}Events: {r.events_24h}/24h · {r.events_7d}/7d.
            </p>
          </div>
        )
      })}
      {funnel.campaigns.length > 0 && (
        <div className="border-t border-white/[0.06] pt-2.5">
          <p className="mb-1.5 font-mono text-micro font-semibold uppercase tracking-[0.14em] text-white/35">Top campaigns</p>
          <div className="flex flex-col gap-1">
            {funnel.campaigns.slice(0, 6).map((c, i) => (
              <div key={i} className="flex items-center gap-2 text-label">
                <span className="shrink-0 uppercase tracking-wide text-white/30">{appDisplayLabel(c.app, ventures)}</span>
                <span className="min-w-0 truncate text-white/70">{c.utm_campaign || c.utm_source || '—'}</span>
                <span className="ml-auto shrink-0 tabular-nums text-white/50">
                  <span className="text-emerald-300">{c.purchased}</span>
                  <span className="text-white/25"> / {c.landed}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
      {usage.latest.length > 0 && (
        <div className="border-t border-white/[0.06] pt-2.5">
          <p className="mb-1.5 font-mono text-micro font-semibold uppercase tracking-[0.14em] text-white/35">
            Product usage · last 7 days
          </p>
          <div className="flex flex-col gap-1">
            {usage.latest.map(u => (
              <div key={u.product} className="flex items-center gap-2 text-label">
                <span className="min-w-0 truncate text-white/70">{appDisplayLabel(u.product, ventures)}</span>
                <span className="ml-auto shrink-0 tabular-nums text-white/50">
                  <span className="text-white/80">{u.active_users ?? 0}</span> active
                  <span className="text-white/25"> · {u.pageviews ?? 0} views</span>
                </span>
                <Sparkline
                  data={usage.series[u.product] || []}
                  positive={(usage.series[u.product] || []).slice(-1)[0] >= (usage.series[u.product] || [0])[0]}
                  w={56}
                  h={16}
                  ariaLabel={`${u.product} active users trend`}
                />
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="flex justify-end">
        <LastUpdated date={funnel.generated_at ? new Date(funnel.generated_at) : null} />
      </div>
    </div>
  )

  return { id: 'converting', question: 'Is anything converting?', token, answer, detail }
}

// ── 5. What should I decide? ───────────────────────────────────────────────

const MS_PER_DAY = 86_400_000

const daysOver = (b: BetRow): number =>
  Math.floor((Date.now() - new Date(b.started_at).getTime()) / MS_PER_DAY) - b.time_box_days

const daysUntil = (iso: string): number =>
  Math.max(0, Math.round((Date.parse(iso) - Date.now()) / 86_400_000))

export function useDecideQuestion({ onOpenBets }: { onOpenBets: () => void }): QuestionState {
  const { spend } = useSpend()
  const { live, overdueLive, hitRates } = useBets()
  const { intel } = useHomeIntelligence()
  const { synthesis } = useMarcusSynthesis()

  const brokenSvcs = (spend?.services || []).filter(blocking)
  const lowSvcs = (spend?.services || []).filter(s => !blocking(s) && s.balance_low)
  const renewals = spend?.renewals_due || []
  const needsCount = overdueLive.length + brokenSvcs.length + lowSvcs.length + renewals.length

  const token = overdueLive.length > 0
    ? { label: `${overdueLive.length} OVERDUE`, tone: 'warn' as const }
    : needsCount > 0
      ? { label: `${needsCount} WAITING`, tone: 'quiet' as const }
      : { label: 'CLEAR', tone: 'ok' as const }

  const topBet = overdueLive[0]
  const answer = topBet ? (
    overdueLive.length === 1
      ? <>"{clipBet(topBet)}" is <N>{daysOver(topBet)}</N> day{daysOver(topBet) === 1 ? '' : 's'} past its time box.</>
      : <><N>{overdueLive.length}</N> bets are past their time boxes.</>
  ) : brokenSvcs[0] ? (
    <>No bet is overdue, but {brokenSvcs[0].name} needs a top up.</>
  ) : renewals[0] ? (
    <>Nothing is overdue. {renewals[0].name} renews in <N>{daysUntil(renewals[0].on)}</N> days.</>
  ) : (
    <>Nothing. The queue is clear.</>
  )

  const marcusLine = [intel.summary?.recommended_focus, synthesis?.org_focus]
    .filter(Boolean).join(' ')
  const overall = hitRates.find(r => r.kind === 'all')

  const detail = (
    <div className="flex flex-col gap-3">
      {marcusLine && (
        <div>
          <p className="font-serif text-lede italic leading-relaxed text-violet-200/90">{marcusLine}</p>
          <p className="mt-1 font-mono text-micro font-semibold tracking-[0.14em] text-white/35">
            MARCUS{intel.generated_at ? ` · ${stampDay(intel.generated_at)}` : ''}
          </p>
        </div>
      )}

      {overdueLive.map(b => (
        <ActRow
          key={b.id}
          tag="DECIDE"
          tone="warn"
          sub={`${daysOver(b)} day${daysOver(b) === 1 ? '' : 's'} past its ${b.time_box_days}-day box`}
          action={<Verb primary onClick={onOpenBets}>Decide</Verb>}
        >
          {b.hypothesis}
        </ActRow>
      ))}

      {[...brokenSvcs, ...lowSvcs].map(s => (
        <ActRow
          key={s.key}
          tag="TOP UP"
          tone={blocking(s) ? 'bad' : 'warn'}
          sub={usageLine(s)}
          action={(s.top_up_url || s.dashboard_url) ? (
            <Verb primary href={s.top_up_url || s.dashboard_url || undefined}>Open billing</Verb>
          ) : undefined}
        >
          {s.name} is {blocking(s) ? why(s) : 'running low'}
        </ActRow>
      ))}

      {renewals.map(r => (
        <ActRow key={r.key} tag="RENEWS" tone="quiet" sub={r.amount ? `${r.currency || 'USD'} ${r.amount}, annual` : undefined}>
          {r.name} renews in {daysUntil(r.on)} day{daysUntil(r.on) === 1 ? '' : 's'}
        </ActRow>
      ))}

      {needsCount === 0 && (
        <p className="text-body leading-relaxed text-white/45">
          Nothing needs a decision right now.
        </p>
      )}

      <button
        type="button"
        onClick={onOpenBets}
        className="self-start text-label text-white/40 transition-colors hover:text-white/70"
      >
        <span className="font-mono tabular-nums">{live.length}</span> live bet{live.length === 1 ? '' : 's'}
        {overall && overall.total > 0 && <> · <span className="font-mono tabular-nums">{overall.pct.toFixed(0)}%</span> hit rate over 90 days</>}
        {' '}→
      </button>
    </div>
  )

  return { id: 'decide', question: 'What should I decide?', token, answer, detail }
}

function clipBet(b: BetRow): string {
  const s = b.hypothesis
  return s.length > 44 ? `${s.slice(0, 44)}…` : s
}

/** "MON 24 AUG" from an ISO date. */
export function stampDay(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).toUpperCase().replace(',', '')
}
