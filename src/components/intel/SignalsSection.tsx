import React, { useMemo, useState } from 'react'
import { format } from 'date-fns'
import { ExternalLink, Target, X } from '@/lib/icons'
import { triageReject } from '../../lib/triageActions'
import { Eyebrow } from '../shared/Eyebrow'
import { SegmentedNav } from '../shared/SegmentedNav'
import { Skeleton } from '../shared/Skeleton'
import { Working } from '../shared/Working'
import { useToast } from '../shared/Toast'
import { useWork } from '../../lib/loadingVoice'
import { useHomeIntelligence, type ExternalSignal } from '../../hooks/useHomeIntelligence'
import { useZaraSignals, type ZaraSignal } from '../../hooks/useZaraSignals'
import { useVentureRegistry } from '../../hooks/useVentureRegistry'
import { rankSignals, URGENCY_DOT, urgencyChip } from './SignalSheet'

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000
const ZARA_VISIBLE = 8

/**
 * The whole external feed, condensed for its one home — the Home signals
 * drawer. Marcus's curated digest ranked by urgency, then Zara's raw market
 * feed with a venture filter whose chips come from the loaded data (the old
 * hardcoded 'personal-brand' chip matched zero rows) and an honest dormancy
 * line when Zara has been quiet for a week. Market intelligence does not
 * live on the Business Intelligence tab — different head space.
 */
export function SignalsSection({ onOpen }: {
  onOpen: (signal: ExternalSignal) => void
}) {
  const { intel, loading: intelLoading } = useHomeIntelligence()
  const { signals: zara, loading: zaraLoading, markActioned, markDeclined } = useZaraSignals()
  const { ventures } = useVentureRegistry()
  const reading = useWork('intel.signals')
  const [venture, setVenture] = useState<string>('all')

  const ranked = useMemo(() => rankSignals(intel.external_signals), [intel.external_signals])

  // Venture chips from the data, labeled by the registry where it knows them.
  const ventureIds = useMemo(() => {
    const seen: string[] = []
    for (const s of zara) {
      const v = (s.venture || '').trim().toLowerCase()
      if (v && !seen.includes(v)) seen.push(v)
    }
    return seen
  }, [zara])

  const ventureLabel = (id: string): string => {
    const match = ventures.find(v => v.slug.toLowerCase() === id)
    return match?.display_name || id.charAt(0).toUpperCase() + id.slice(1)
  }

  const segments = [
    { id: 'all', label: 'All' },
    ...ventureIds.map(id => ({ id, label: ventureLabel(id) })),
  ]

  // Declined signals leave the feed. The durable write is server-side; the
  // optimistic markDeclined flips status so the row vanishes on the tap.
  const live = zara.filter(s => s.status !== 'declined')
  const filtered = venture === 'all'
    ? live
    : live.filter(s => (s.venture || '').toLowerCase() === venture)

  // Honest dormancy: the newest row's age, not a spinner over a dead feed.
  const newestAt = zara[0]?.surfaced_at ? new Date(zara[0].surfaced_at) : null
  const dormant = newestAt != null && Date.now() - newestAt.getTime() > SEVEN_DAYS_MS

  return (
    <>
      <div className="flex flex-col gap-1">
        <div className="px-2 pb-1">
          <Eyebrow>{ranked.length > 0 ? `Signals · ${ranked.length}` : 'Signals'}</Eyebrow>
        </div>

        {intelLoading && ranked.length === 0 && (
          <div className="flex flex-col gap-2.5 px-2 py-1" aria-busy="true" role="status" aria-label={reading.label}>
            <Skeleton h={14} w="85%" />
            <Skeleton h={14} w="70%" />
          </div>
        )}

        {!intelLoading && ranked.length === 0 && (
          <p className="px-2 py-3 text-body leading-relaxed text-white/45">
            Nothing curated right now — Marcus runs Monday, Wednesday and Friday.
          </p>
        )}

        {ranked.map((s, i) => {
          const chip = urgencyChip(s.urgency, s.days_until)
          return (
            <button
              key={s.event_id || `${i}-${s.signal.slice(0, 24)}`}
              type="button"
              onClick={() => onOpen(s)}
              className="flex w-full items-start gap-2.5 rounded-xl px-2 py-2.5 text-left transition-colors hover:bg-white/[0.04] active:bg-white/[0.06]"
            >
              <span
                aria-hidden
                className={`mt-[6px] h-1.5 w-1.5 shrink-0 rounded-full ${s.urgency ? URGENCY_DOT[s.urgency] : 'bg-amber-400'}`}
              />
              <span className="min-w-0 flex-1">
                <span className="block text-ui leading-snug text-white/90 line-clamp-2">{s.signal}</span>
                {s.relevance && (
                  <span className="mt-0.5 block text-label leading-snug text-white/45 line-clamp-2">{s.relevance}</span>
                )}
              </span>
              {chip && (
                <span className="shrink-0 pt-0.5 text-micro font-semibold tabular-nums text-white/50">{chip}</span>
              )}
            </button>
          )
        })}
      </div>

      <div className="flex flex-col gap-1">
        <div className="px-2 pb-1"><Eyebrow>Zara's feed</Eyebrow></div>

        {ventureIds.length > 1 && (
          <div className="px-2 pb-1">
            <SegmentedNav
              segments={segments}
              value={venture}
              onChange={setVenture}
              label="Filter market signals by venture"
              variant="pill"
              testIdPrefix="zara-venture"
            />
          </div>
        )}

        {dormant && newestAt && (
          <p className="px-2 pb-1 text-label text-white/40" data-testid="zara-dormant">
            No new market signals since {format(newestAt, 'd MMM')}. Zara sweeps Mon/Wed/Fri.
          </p>
        )}

        {zaraLoading && zara.length === 0 ? (
          <div className="flex flex-col gap-2.5 px-2 py-1" aria-busy="true" role="status" aria-label={reading.label}>
            <Skeleton h={14} w="85%" />
            <Skeleton h={14} w="70%" />
            <Skeleton h={14} w="78%" />
          </div>
        ) : filtered.length === 0 ? (
          !zaraLoading && (
            <p className="px-2 py-3 text-body leading-relaxed text-white/45">
              {zara.length === 0
                ? 'No market signals yet — Zara will surface them on her next sweep.'
                : 'Nothing from this venture yet.'}
            </p>
          )
        ) : (
          <>
            {filtered.slice(0, ZARA_VISIBLE).map(s => (
              <ZaraRow key={s.id} signal={s} onActioned={markActioned} onDeclined={markDeclined} />
            ))}
            {filtered.length > ZARA_VISIBLE && (
              <p className="px-2 py-1.5 text-micro text-white/30">
                +{filtered.length - ZARA_VISIBLE} more tracked
              </p>
            )}
          </>
        )}
      </div>
    </>
  )
}

function scoreTone(score: number | null): string {
  if (score == null || score <= 0) return 'text-white/25'
  if (score >= 8) return 'text-emerald-400'
  if (score >= 5) return 'text-amber-400'
  return 'text-white/40'
}

function ZaraRow({ signal: s, onActioned, onDeclined }: {
  signal: ZaraSignal
  onActioned: (id: string) => void
  onDeclined: (id: string) => void
}) {
  const detailBits = [
    s.company_name,
    s.signal_type,
    s.status === 'actioned' ? 'actioned' : null,
  ].filter(Boolean).join(' · ')

  return (
    <div className="flex items-start gap-2.5 rounded-xl px-2 py-2.5">
      {s.signal_score != null && s.signal_score > 0 ? (
        <span className={`mt-[1px] w-4 shrink-0 text-center font-mono text-label font-bold tabular-nums ${scoreTone(s.signal_score)}`}>
          {s.signal_score}
        </span>
      ) : (
        <span aria-hidden className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-white/20" />
      )}
      <span className="min-w-0 flex-1">
        <span className="block text-ui leading-snug text-white/90 line-clamp-2">
          {s.description || s.summary || s.signal_type || 'Signal'}
        </span>
        <span className="mt-0.5 flex items-center gap-2.5">
          {detailBits && (
            <span className="min-w-0 truncate text-label text-white/40">{detailBits}</span>
          )}
          {s.source_url && s.source_url !== 'https://example.com/test-podcast' && (
            <a
              href={s.source_url}
              target="_blank"
              rel="noreferrer"
              aria-label="Open source"
              className="shrink-0 text-white/30 transition-colors hover:text-white/70"
            >
              <ExternalLink size={11} aria-hidden />
            </a>
          )}
          {s.status !== 'actioned' && (
            <span className="ml-auto flex shrink-0 items-center gap-3">
              <DeclineButton signal={s} onDeclined={onDeclined} />
              <PromoteButton signal={s} onActioned={onActioned} />
            </span>
          )}
        </span>
      </span>
    </div>
  )
}

/**
 * Promote a market signal to a bet. The POST carries `source_signal_id` so
 * the server can mark the signal actioned with real credentials — the old
 * anon `zara_signals` UPDATE was a silent no-op under RLS and is gone.
 */
function PromoteButton({ signal, onActioned }: {
  signal: ZaraSignal
  onActioned: (id: string) => void
}) {
  const { toast } = useToast()
  const promoting = useWork('signals.promote')
  const [busy, setBusy] = useState(false)

  const promote = async () => {
    if (busy) return
    setBusy(true)
    try {
      const hypothesis = (s => s.slice(0, 240))(signal.summary || signal.description || `Act on ${signal.signal_type || 'signal'}`)
      const r = await fetch('/api/bets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hypothesis,
          success_criterion: 'Define the measurable outcome within the time-box.',
          kind: 'other',
          time_box_days: 14,
          agent_owner: 'krish',
          source_signal_id: signal.id,
        }),
      })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      onActioned(signal.id)
      toast('Promoted to a bet — it now shows on the Bets tile.', 'success')
    } catch (e: any) {
      toast(`Could not promote: ${e?.message || 'try again'}`, 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      onClick={promote}
      disabled={busy}
      title={busy ? promoting.label : 'Create a bet from this signal'}
      aria-label={busy ? promoting.label : 'Promote to a bet'}
      className="inline-flex items-center gap-1 text-label font-medium text-violet-300/80 transition-colors hover:text-violet-200 disabled:opacity-40"
    >
      {busy ? <Working size={11} /> : <Target size={11} aria-hidden />}
      Promote
    </button>
  )
}

/**
 * Decline a market signal. The counterpart to Promote: it moves the signal to
 * its terminal 'declined' state and writes a feedback_queue vote -1, the same
 * learning path every swipe deck uses (Vera's correction loop), so a declined
 * pattern surfaces less next sweep. The status write must go server-side —
 * zara_signals is anon-SELECT-only under RLS — which triageReject already does.
 */
function DeclineButton({ signal, onDeclined }: {
  signal: ZaraSignal
  onDeclined: (id: string) => void
}) {
  const { toast } = useToast()
  const [busy, setBusy] = useState(false)

  const decline = async () => {
    if (busy) return
    setBusy(true)
    // Optimistic: the row leaves the feed at once. A failed write only means it
    // returns on the next sweep, so a lost decline is self-correcting, never a
    // stuck row.
    onDeclined(signal.id)
    const ok = await triageReject('zara_signals', signal.id, 'zara', 'not_relevant')
    if (!ok) toast('Could not save that decline — it may come back on the next sweep.', 'error')
    setBusy(false)
  }

  return (
    <button
      type="button"
      onClick={decline}
      disabled={busy}
      title="Decline this signal"
      aria-label="Decline this signal"
      className="inline-flex items-center gap-1 text-label font-medium text-white/40 transition-colors hover:text-white/70 disabled:opacity-40"
    >
      {busy ? <Working size={11} /> : <X size={11} aria-hidden />}
      Decline
    </button>
  )
}
