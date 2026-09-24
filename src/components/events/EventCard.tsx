import React, { useState } from 'react'
import {
  ExternalLink, Calendar, Users, MapPin, DollarSign, Globe2, Crown, TrendingUp, Check, X,
} from '@/lib/icons'
import { useToast } from '../shared/Toast'
import { cityLabel } from '../../lib/homeCity'
import type { RankedEvent } from '../../hooks/useEvents'

/**
 * One room, and whether it is worth an evening.
 *
 * The card answers three questions in the order Krish asks them, because the old
 * lane answered none of them: WHO is in this room, is it in the city I am in, and
 * what does it cost me to be there. Everything else is secondary.
 *
 * Two axes rather than one, because one number cannot express the asymmetry
 * (architecture doc §3). Peers is who he can learn from; Buyers is who could buy
 * the pilot. A room can be strong on one and empty on the other, and collapsing
 * them would hide exactly the distinction that makes the lane useful.
 *
 * Note what is NOT on this card: a fit percentage. The old visibility card led
 * with "Fit 93", and the highest-fit row in the live lane was a call for papers
 * whose deadline had passed three months earlier. A single confident number is
 * the thing that made a stale lane look authoritative.
 */

interface Props {
  event: RankedEvent
  onOpen?: (id: string) => void
}

/** Home is home. The three flavours of away are ranked, never hidden: an
 *  away-city event is unactionable, not dead, and becomes live the moment a trip
 *  is booked. */
const ACTIONABILITY_TONE: Record<string, string> = {
  'home': 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30',
  'away, named attendee': 'text-violet-200 bg-violet-500/10 border-violet-500/30',
  'away, bookable': 'text-amber-300 bg-amber-500/10 border-amber-500/30',
  'away, needs a trip': 'text-ink-faint bg-white/[0.04] border-white/10',
}

/** Plain English, not the enum. A 12-year-old should follow it. */
const ACTIONABILITY_LABEL: Record<string, string> = {
  'home': 'Where you are',
  'away, named attendee': 'Away, but someone worth it is there',
  'away, bookable': 'Away, far enough out to book',
  'away, needs a trip': 'Away, needs a trip',
}

const COST_LABEL: Record<string, string> = {
  free: 'Free',
  cheap: 'Cheap',
  paid: 'Paid',
  unknown: 'Price unknown',
}

function ScoreBar({ label, value, Icon, tone }: {
  label: string
  value: number | null
  Icon: typeof Users
  tone: 'peers' | 'buyers'
}) {
  const v = typeof value === 'number' ? Math.max(0, Math.min(100, value)) : null
  const fill = tone === 'peers' ? 'bg-emerald-400/70' : 'bg-violet-400/70'
  return (
    <div>
      <p className="text-micro uppercase tracking-[0.14em] text-ink-faint mb-1">
        <Icon size={9} className="inline mr-1" />
        {label}
        {v !== null && <span className="ml-1 tabular-nums text-ink-muted">{v}</span>}
      </p>
      <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
        {/* A never-scored row shows an empty track rather than a zero bar. A zero
            reads as a verdict on the room; an empty track reads as "not judged
            yet", which is what it is. */}
        {v !== null && <div className={`h-full rounded-full ${fill}`} style={{ width: `${v}%` }} />}
      </div>
    </div>
  )
}

export function EventCard({ event: e, onOpen }: Props) {
  const { toast } = useToast()
  const [busy, setBusy] = useState<null | 'attend' | 'decline'>(null)

  const daysAway = e.starts_at
    ? Math.ceil((new Date(e.starts_at).getTime() - Date.now()) / (24 * 60 * 60 * 1000))
    : null

  const whenLabel = !e.starts_at ? null
    : daysAway === 0 ? 'Today'
    : daysAway === 1 ? 'Tomorrow'
    : daysAway !== null && daysAway > 0 ? `In ${daysAway} days`
    : null

  const decide = async (ev: React.MouseEvent, next: 'attend' | 'decline') => {
    ev.stopPropagation()
    if (busy) return
    setBusy(next)
    try {
      const r = await fetch(`/api/events/${e.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision: next }),
      })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      toast(
        next === 'attend'
          ? 'Marked as going. Say afterwards whether it was worth it.'
          : 'Passed. The next sweep learns from that.',
        'success',
      )
    } catch (err: unknown) {
      toast(`Could not update: ${(err as Error)?.message || 'try again'}`, 'error')
    } finally {
      setBusy(null)
    }
  }

  const tone = ACTIONABILITY_TONE[e.actionability] || ACTIONABILITY_TONE['away, needs a trip']
  const named = e.named_attendees || []

  return (
    <article
      className={`rounded-xl border border-violet-500/20 bg-violet-500/[0.04] p-3.5 hover:border-violet-500/35 transition-colors ${onOpen ? 'cursor-pointer' : ''}`}
      onClick={onOpen ? () => onOpen(e.id) : undefined}
      data-testid="event-card"
      data-actionability={e.actionability}
    >
      <header className="flex items-start gap-2 min-w-0">
        <div className="flex-1 min-w-0">
          <p className="text-ui font-semibold text-ink leading-snug">{e.title}</p>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className="inline-flex items-center gap-1 text-micro text-ink-faint">
              <MapPin size={10} />
              {cityLabel(e.city)}
            </span>
            {e.host && (
              <span className="inline-flex items-center gap-1 text-micro text-ink-faint">
                <Globe2 size={10} />
                {e.host}
              </span>
            )}
            {e.cost_kind && (
              <span className="inline-flex items-center gap-1 text-micro text-ink-faint">
                <DollarSign size={10} />
                {e.ticket_price_usd != null && e.ticket_price_usd > 0
                  ? `$${e.ticket_price_usd.toLocaleString()}`
                  : COST_LABEL[e.cost_kind] || e.cost_kind}
              </span>
            )}
            {e.can_speak && (
              <span className="text-micro px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-200">
                Could speak
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <span className={`text-micro px-2 py-0.5 rounded-full border ${tone}`}>
            {ACTIONABILITY_LABEL[e.actionability] || e.actionability}
          </span>
          {whenLabel && (
            <span className="text-micro tabular-nums text-ink-faint">
              <Calendar size={9} className="inline mr-1" />
              {whenLabel}
            </span>
          )}
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 mt-3">
        <ScoreBar label="Peers" value={e.draw_score} Icon={Crown} tone="peers" />
        <ScoreBar label="Buyers" value={e.demand_score} Icon={TrendingUp} tone="buyers" />
      </div>

      {e.unscored && (
        <p className="text-micro text-amber-300 mt-2">
          Not judged yet. The nightly pass reads the room and fills these in.
        </p>
      )}

      {e.score_reason && (
        <p className="text-micro text-ink-muted leading-snug mt-2">{e.score_reason}</p>
      )}

      {named.length > 0 && (
        <div className="mt-2.5">
          <p className="text-micro uppercase tracking-[0.14em] text-ink-faint mb-1">
            <Users size={9} className="inline mr-1" />
            Confirmed in the room
          </p>
          <ul className="space-y-0.5">
            {named.map((n, i) => (
              <li key={`${n}-${i}`} className="text-micro text-ink-muted leading-snug">{n}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex items-center gap-2 mt-3 flex-wrap">
        {e.url && (
          <a
            href={e.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={ev => ev.stopPropagation()}
            className="tap-44 inline-flex items-center gap-1 text-micro px-2 py-1 rounded-lg border border-white/10 text-ink-muted hover:text-ink hover:border-white/20 transition-colors"
          >
            <ExternalLink size={10} />
            Open event
          </a>
        )}
        {!e.decision && (
          <>
            <button
              type="button"
              onClick={ev => decide(ev, 'attend')}
              disabled={!!busy}
              className="tap-44 inline-flex items-center gap-1 text-micro px-2 py-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/15 transition-colors disabled:opacity-50"
            >
              <Check size={10} />
              {busy === 'attend' ? 'Saving' : 'Going'}
            </button>
            <button
              type="button"
              onClick={ev => decide(ev, 'decline')}
              disabled={!!busy}
              className="tap-44 inline-flex items-center gap-1 text-micro px-2 py-1 rounded-lg border border-white/10 text-ink-muted hover:text-ink transition-colors disabled:opacity-50"
            >
              <X size={10} />
              {busy === 'decline' ? 'Saving' : 'Pass'}
            </button>
          </>
        )}
        {e.decision && (
          <span className="text-micro text-ink-faint">
            You chose: {e.decision.replace(/_/g, ' ')}
            {e.outcome ? ` · ${e.outcome === 'worth_it' ? 'worth it' : 'not worth it'}` : ''}
          </span>
        )}
      </div>
    </article>
  )
}
