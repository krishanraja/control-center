import React from 'react'
import { ExternalLink } from '@/lib/icons'
import { SlideOver } from '../shared/SlideOver'
import { Eyebrow } from '../shared/Eyebrow'
import { Sparkline } from '../shared/Sparkline'
import { statusStyle } from '../shared/tokens'
import { usageLine, type SpendSummary, type SpendServiceRow } from '../../hooks/useSpend'

const usd = (n: number): string => `$${n.toLocaleString('en-US', { maximumFractionDigits: n >= 100 ? 0 : 2 })}`

/** Map a sweep status onto the house status vocabulary for the row dot. */
function dotFor(s: SpendServiceRow): string {
  if (s.status && ['auth_failed', 'exhausted', 'rate_limited'].includes(s.status)) return statusStyle('blocked').dot
  if (s.balance_low) return statusStyle('needs_you').dot
  if (s.status === 'ok') return statusStyle('active').dot
  return 'bg-white/20'
}

function statusLine(s: SpendServiceRow): string | null {
  if (s.status === 'auth_failed') return 'key rejected'
  if (s.status === 'exhausted') return 'out of credits'
  if (s.status === 'rate_limited') return 'rate limited'
  if (s.status === 'error') return 'check failed'
  if (s.status === 'skipped_no_key') return 'no key stored'
  if (s.balance != null) return `${s.balance.toLocaleString('en-US')} ${s.balance_unit || ''} left`.trim()
  if (s.status === 'ok') return 'connected'
  return null
}

/**
 * The full ranked list behind the spend panel: every registered service,
 * biggest money first, each row carrying its state, its next renewal, and
 * the link that fixes it. Unmatched vendors get their own honest section —
 * money that left without a matching service is still money out.
 */
export function SpendDetailSheet({ open, onClose, spend }: {
  open: boolean
  onClose: () => void
  spend: SpendSummary
}) {
  const paying = spend.services.filter(s => s.month_usd !== 0 || s.avg_usd !== 0)
  const quiet = spend.services.filter(s => s.month_usd === 0 && s.avg_usd === 0 && s.status != null)
  const unwired = spend.services.length - paying.length - quiet.length

  return (
    <SlideOver open={open} onClose={onClose} ariaLabel="Spend detail" label="Spend">
      <div className="flex flex-col gap-5" data-testid="spend-detail">
        <div className="flex items-end gap-3">
          <div className="min-w-0 flex-1">
            <span className="font-mono tabular-nums text-heading font-semibold text-white">{usd(spend.month_usd)}</span>
            <span className="ml-2 text-label text-white/45">out this month</span>
            {spend.avg_3mo_usd > 0 && (
              <p className="mt-0.5 text-label text-white/40">
                A normal month is about {usd(spend.avg_3mo_usd)}.
                {spend.meter ? <> On the meter so far: ${spend.meter.usd_mtd.toFixed(0)}.</> : null}
              </p>
            )}
          </div>
          {spend.months.length > 1 && (
            <Sparkline
              data={spend.months.map(m => m.total_usd)}
              positive={spend.delta_pct != null ? spend.delta_pct <= 0 : true}
              ariaLabel="6-month spend trend"
            />
          )}
        </div>

        {paying.length > 0 && (
          <div className="flex flex-col gap-1">
            <div className="px-1 pb-1"><Eyebrow>Paying for</Eyebrow></div>
            {paying.map(s => <ServiceRow key={s.key} s={s} />)}
          </div>
        )}

        {spend.unmatched.length > 0 && (
          <div className="flex flex-col gap-1">
            <div className="px-1 pb-1"><Eyebrow>Not matched to a service</Eyebrow></div>
            {spend.unmatched.map(u => (
              <div key={u.vendor} className="flex items-center gap-2.5 rounded-xl px-2 py-2">
                <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-white/25" />
                <span className="min-w-0 flex-1 truncate text-ui text-white/80">{u.vendor}</span>
                <span className="shrink-0 font-mono tabular-nums text-ui text-white/70">{usd(u.month_usd)}</span>
              </div>
            ))}
          </div>
        )}

        {quiet.length > 0 && (
          <div className="flex flex-col gap-1">
            <div className="px-1 pb-1"><Eyebrow>Connected, no spend recorded</Eyebrow></div>
            {quiet.map(s => <ServiceRow key={s.key} s={s} />)}
          </div>
        )}

        {(unwired > 0 || spend.needs_review > 0) && (
          <p className="text-label leading-relaxed text-white/35">
            {unwired > 0 ? `${unwired} more service${unwired === 1 ? '' : 's'} tracked for invoices only (no API check). ` : ''}
            {spend.needs_review > 0 ? `${spend.needs_review} receipt${spend.needs_review === 1 ? '' : 's'} need a manual look.` : ''}
          </p>
        )}
      </div>
    </SlideOver>
  )
}

function ServiceRow({ s }: { s: SpendServiceRow }) {
  const line = statusLine(s)
  const renewDays = s.next_renewal_on ? Math.round((Date.parse(s.next_renewal_on) - Date.now()) / 86_400_000) : null
  const url = s.top_up_url || s.dashboard_url
  const flagged = s.balance_low || (s.status != null && ['auth_failed', 'exhausted', 'rate_limited'].includes(s.status))
  return (
    <div className="flex flex-wrap items-center gap-2.5 rounded-xl px-2 py-2 transition-colors hover:bg-white/[0.03]">
      <span aria-hidden className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotFor(s)}`} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-ui text-white/85">
          {s.name}
          {s.plan_label && <span className="ml-1.5 text-label text-white/35">{s.plan_label}</span>}
        </span>
        <span className="block truncate text-label text-white/40">
          {[
            line,
            s.cadence === 'annual' && renewDays != null && renewDays >= 0 && renewDays <= 60
              ? `renews in ${renewDays}d`
              : null,
          ].filter(Boolean).join(' · ') || (s.cadence !== 'unknown' ? s.cadence.replace('_', '-') : '')}
        </span>
      </span>
      <span className="shrink-0 text-right">
        <span className="block font-mono tabular-nums text-ui text-white/85">
          {s.month_usd !== 0 ? usd(s.month_usd) : s.avg_usd !== 0 ? usd(s.avg_usd) : ''}
        </span>
        {s.month_usd === 0 && s.avg_usd !== 0 && <span className="block text-micro text-white/30">usual</span>}
      </span>
      {url && (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          aria-label={`Open ${s.name}`}
          className="shrink-0 rounded p-1 text-white/30 transition-colors hover:text-white/70"
        >
          <ExternalLink size={13} aria-hidden />
        </a>
      )}
      {flagged && (
        <p className="w-full pl-[16px] text-label leading-snug text-white/40">{usageLine(s)}</p>
      )}
    </div>
  )
}
