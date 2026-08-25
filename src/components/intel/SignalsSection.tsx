import React, { useMemo, useState } from 'react'
import { format } from 'date-fns'
import { ExternalLink, Target } from '@/lib/icons'
import { FeedCard, FeedRow } from '../mobile/primitives'
import { SegmentedNav } from '../shared/SegmentedNav'
import { Skeleton } from '../shared/Skeleton'
import { Working } from '../shared/Working'
import { useToast } from '../shared/Toast'
import { useWork } from '../../lib/loadingVoice'
import { useHomeIntelligence, type ExternalSignal } from '../../hooks/useHomeIntelligence'
import { useZaraSignals, type ZaraSignal } from '../../hooks/useZaraSignals'
import { useVentureRegistry } from '../../hooks/useVentureRegistry'
import { rankSignals } from './NextSignalHero'
import { URGENCY_DOT, urgencyChip } from './SignalSheet'

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000
const ZARA_VISIBLE = 8

/**
 * The one signal feed, both shells. Marcus's curated digest first (ranked by
 * urgency, minus the top one the hero already carries), then Zara's raw
 * market feed with a venture filter whose chips come from the loaded data —
 * the old hardcoded 'personal-brand' chip matched zero rows. When Zara has
 * been quiet for a week the section says so instead of pretending the feed
 * is live.
 */
export function SignalsSection({ onOpen }: {
  onOpen: (signal: ExternalSignal) => void
}) {
  const { intel, loading: intelLoading } = useHomeIntelligence()
  const { signals: zara, loading: zaraLoading, markActioned } = useZaraSignals()
  const { ventures } = useVentureRegistry()
  const reading = useWork('intel.signals')
  const [venture, setVenture] = useState<string>('all')

  // The hero features the top-ranked signal; the list carries the rest.
  const rest = useMemo(() => rankSignals(intel.external_signals).slice(1), [intel.external_signals])

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

  const filtered = venture === 'all'
    ? zara
    : zara.filter(s => (s.venture || '').toLowerCase() === venture)

  // Honest dormancy: the newest row's age, not a spinner over a dead feed.
  const newestAt = zara[0]?.surfaced_at ? new Date(zara[0].surfaced_at) : null
  const dormant = newestAt != null && Date.now() - newestAt.getTime() > SEVEN_DAYS_MS

  return (
    <>
      {rest.length > 0 && (
        <FeedCard title={`More signals · ${rest.length}`}>
          {rest.map((s, i) => {
            const chip = urgencyChip(s.urgency, s.days_until)
            return (
              <FeedRow
                key={s.event_id || `${i}-${s.signal.slice(0, 24)}`}
                dotColor={s.urgency ? URGENCY_DOT[s.urgency] : 'bg-amber-400'}
                title={s.signal}
                detail={s.relevance}
                trailing={chip ? (
                  <span className="text-label font-semibold tabular-nums text-white/70">{chip}</span>
                ) : null}
                onClick={() => onOpen(s)}
              />
            )
          })}
        </FeedCard>
      )}

      <FeedCard title="Market signals">
        {ventureIds.length > 1 && (
          <div className="px-5 py-3">
            <SegmentedNav
              segments={segments}
              value={venture}
              onChange={setVenture}
              label="Filter market signals by venture"
              variant="pill"
              testIdPrefix="bi-zara-venture"
            />
          </div>
        )}

        {dormant && newestAt && (
          <p className="px-5 py-2.5 text-label text-white/40" data-testid="bi-zara-dormant">
            No new market signals since {format(newestAt, 'd MMM')}. Zara sweeps Mon/Wed/Fri.
          </p>
        )}

        {zaraLoading && zara.length === 0 ? (
          <div className="px-5 py-4 flex flex-col gap-3" aria-busy="true" role="status" aria-label={reading.label}>
            <Skeleton h={14} w="85%" />
            <Skeleton h={14} w="70%" />
            <Skeleton h={14} w="78%" />
          </div>
        ) : filtered.length === 0 ? (
          !zaraLoading && (
            <p className="px-5 py-6 text-ui text-white/40">
              {zara.length === 0
                ? 'No market signals yet — Zara will surface them on her next sweep.'
                : 'Nothing from this venture yet.'}
            </p>
          )
        ) : (
          <>
            {filtered.slice(0, ZARA_VISIBLE).map(s => (
              <ZaraRow key={s.id} signal={s} onActioned={markActioned} />
            ))}
            {filtered.length > ZARA_VISIBLE && (
              <p className="px-5 py-2.5 text-micro text-white/30">
                +{filtered.length - ZARA_VISIBLE} more tracked
              </p>
            )}
          </>
        )}
      </FeedCard>
    </>
  )
}

function scoreTone(score: number | null): string {
  if (score == null || score <= 0) return 'text-white/25'
  if (score >= 8) return 'text-emerald-400'
  if (score >= 5) return 'text-amber-400'
  return 'text-white/40'
}

function ZaraRow({ signal: s, onActioned }: {
  signal: ZaraSignal
  onActioned: (id: string) => void
}) {
  const detailBits = [
    s.company_name,
    s.signal_type,
    s.status === 'actioned' ? 'actioned' : null,
  ].filter(Boolean).join(' · ')

  return (
    <FeedRow
      title={s.description || s.summary || s.signal_type || 'Signal'}
      detail={detailBits || undefined}
      trailing={
        <span className="flex items-center gap-3">
          {s.signal_score != null && s.signal_score > 0 && (
            <span className={`font-mono text-label font-bold tabular-nums ${scoreTone(s.signal_score)}`}>
              {s.signal_score}
            </span>
          )}
          {s.source_url && s.source_url !== 'https://example.com/test-podcast' && (
            <a
              href={s.source_url}
              target="_blank"
              rel="noreferrer"
              aria-label="Open source"
              className="text-white/30 transition-colors hover:text-white/70"
            >
              <ExternalLink size={12} aria-hidden />
            </a>
          )}
          {s.status !== 'actioned' && <PromoteButton signal={s} onActioned={onActioned} />}
        </span>
      }
    />
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
