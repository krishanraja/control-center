import React, { useEffect, useMemo, useState } from 'react'
import { ExternalLink, ThumbsUp, ThumbsDown, Check, ChevronDown, ChevronUp, Radio, X, Ban } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { supabase } from '../lib/supabase'
import { signalStatusStyle } from './shared/tokens'

interface ZaraSignal {
  id: string
  signal_type: string | null
  venture: string | null
  company_name: string | null
  description: string | null
  source_url: string | null
  signal_score: number | null
  routed_to: string | null
  surfaced_at: string | null
  krish_rating: number | null
  status: string | null
  actioned_at: string | null
  closed_at: string | null
  closed_reason: string | null
}

type VentureTab = 'mindmaker' | 'adfixus' | 'personal-brand'

const TABS: { id: VentureTab; label: string }[] = [
  { id: 'mindmaker',      label: 'Mindmaker' },
  { id: 'adfixus',        label: 'AdFixus' },
  { id: 'personal-brand', label: 'Personal Brand' },
]

const RATING_LABEL: Record<number, string> = {
  1:  'Used it',
  0:  'Good signal',
  [-1]: 'Not useful',
}

const RATING_STYLE: Record<number, string> = {
  1:  'bg-emerald-500/10 text-emerald-400 border-emerald-500/25',
  0:  'bg-violet-500/10 text-violet-300 border-violet-500/25',
  [-1]: 'bg-rose-500/10 text-rose-300 border-rose-500/25',
}

function scoreBadgeColor(score: number | null) {
  if (score == null) return 'bg-white/[0.06] text-white/50 border-white/10'
  if (score >= 8) return 'bg-emerald-500/10 text-emerald-300 border-emerald-500/25'
  if (score >= 5) return 'bg-amber-500/10 text-amber-300 border-amber-500/25'
  return 'bg-white/[0.06] text-white/50 border-white/10'
}

export function ZaraIntelligence() {
  const [signals, setSignals] = useState<ZaraSignal[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<VentureTab>('mindmaker')
  const [showRated, setShowRated] = useState<Record<VentureTab, boolean>>({
    'mindmaker': false,
    'adfixus': false,
    'personal-brand': false,
  })

  useEffect(() => {
    const load = async () => {
      try {
        const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()
        const { data, error } = await supabase
          .from('zara_signals')
          .select('id, signal_type, venture, company_name, description, source_url, signal_score, routed_to, surfaced_at, krish_rating, status, actioned_at, closed_at, closed_reason')
          .gt('surfaced_at', since)
          .order('signal_score', { ascending: false })
        if (error) throw error
        setSignals((data as ZaraSignal[]) || [])
      } catch (e) {
        console.error('ZaraIntelligence load error:', e)
      }
      setLoading(false)
    }
    load()
    const iv = setInterval(load, 60_000)
    return () => clearInterval(iv)
  }, [])

  const rateSignal = async (id: string, rating: number) => {
    // Optimistic update
    setSignals(prev => prev.map(s => s.id === id ? { ...s, krish_rating: rating } : s))
    const { error } = await supabase
      .from('zara_signals')
      .update({ krish_rating: rating })
      .eq('id', id)
    if (error) {
      console.error('ZaraIntelligence rate error:', error)
      // Revert on error
      setSignals(prev => prev.map(s => s.id === id ? { ...s, krish_rating: null } : s))
    }
  }

  const actionSignal = async (id: string, action: 'actioned' | 'expired') => {
    const now = new Date().toISOString()
    const updates: Record<string, string> = { status: action }
    if (action === 'actioned') updates.actioned_at = now
    if (action === 'expired') { updates.closed_at = now; updates.closed_reason = 'manually closed' }

    const prev = signals.find(s => s.id === id)
    setSignals(ss => ss.map(s => s.id === id ? { ...s, ...updates } : s))
    const { error } = await supabase.from('zara_signals').update(updates).eq('id', id)
    if (error) {
      console.error('ZaraIntelligence action error:', error)
      if (prev) setSignals(ss => ss.map(s => s.id === id ? prev : s))
    }
  }

  const byVenture = useMemo(() => {
    return signals.filter(s => (s.venture || '').toLowerCase() === tab)
  }, [signals, tab])

  const unrated = useMemo(
    () => byVenture
      .filter(s => s.krish_rating == null)
      .sort((a, b) => (b.signal_score ?? 0) - (a.signal_score ?? 0)),
    [byVenture],
  )
  const rated = useMemo(
    () => byVenture
      .filter(s => s.krish_rating != null)
      .sort((a, b) => (b.signal_score ?? 0) - (a.signal_score ?? 0)),
    [byVenture],
  )

  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
      <div className="flex items-center gap-2 mb-4">
        <Radio size={13} className="text-cyan-400" />
        <h2 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/55">Signals · Zara</h2>
        <span className="text-[10px] text-white/25">· last 14 days</span>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-4 border-b border-white/[0.06]">
        {TABS.map(t => {
          const count = signals.filter(s => (s.venture || '').toLowerCase() === t.id && s.krish_rating == null).length
          const active = t.id === tab
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-3 py-2 text-[12px] font-medium transition-colors border-b-2 -mb-px ${
                active
                  ? 'text-white border-cyan-400'
                  : 'text-white/45 border-transparent hover:text-white/70'
              }`}
            >
              {t.label}
              {count > 0 && (
                <span className={`ml-1.5 text-[10px] font-mono tabular-nums ${active ? 'text-cyan-300' : 'text-white/35'}`}>
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {loading ? (
        <p className="text-[12px] text-white/30 py-6 text-center">Loading…</p>
      ) : byVenture.length === 0 ? (
        <p className="text-[12px] text-white/30 py-6 text-center">No signals in the last 14 days.</p>
      ) : (
        <>
          {unrated.length === 0 ? (
            <p className="text-[12px] text-white/35 py-4">All caught up — no unrated signals.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {unrated.map(s => (
                <SignalCard key={s.id} signal={s} onRate={rateSignal} onAction={actionSignal} />
              ))}
            </div>
          )}

          {rated.length > 0 && (
            <div className="mt-5 pt-4 border-t border-white/[0.06]">
              <button
                onClick={() => setShowRated(r => ({ ...r, [tab]: !r[tab] }))}
                className="flex items-center gap-1.5 text-[11px] text-white/40 hover:text-white/70 transition-colors"
              >
                {showRated[tab] ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                {showRated[tab] ? 'Hide' : 'Show'} {rated.length} rated
              </button>
              {showRated[tab] && (
                <div className="flex flex-col gap-3 mt-3 opacity-60">
                  {rated.map(s => (
                    <SignalCard key={s.id} signal={s} onRate={rateSignal} onAction={actionSignal} />
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function SignalCard({ signal, onRate, onAction }: { signal: ZaraSignal; onRate: (id: string, rating: number) => void; onAction: (id: string, action: 'actioned' | 'expired') => void }) {
  const rated = signal.krish_rating != null
  const [rejecting, setRejecting] = useState(false)

  const reject = async () => {
    const reason = window.prompt('Rejection reason?')
    if (!reason || !reason.trim()) return
    setRejecting(true)
    try {
      await fetch('/api/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          original_agent: 'zara',
          original_item_id: signal.id,
          rejection_reason: reason.trim(),
        }),
      })
      onAction(signal.id, 'expired')
    } finally {
      setRejecting(false)
    }
  }
  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.015] p-3.5">
      {/* Badges row */}
      <div className="flex items-center gap-2 flex-wrap mb-2">
        {signal.venture && (
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 font-medium uppercase tracking-wide">
            {signal.venture}
          </span>
        )}
        {signal.signal_type && (
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/[0.05] text-white/60 border border-white/10 font-medium uppercase tracking-wide">
            {signal.signal_type}
          </span>
        )}
        {signal.signal_score != null && (
          <span className={`text-[9px] px-1.5 py-0.5 rounded border font-mono tabular-nums ${scoreBadgeColor(signal.signal_score)}`}>
            {signal.signal_score}/10
          </span>
        )}
        {rated && (
          <span className={`text-[9px] px-1.5 py-0.5 rounded border font-medium ${RATING_STYLE[signal.krish_rating!]}`}>
            {RATING_LABEL[signal.krish_rating!]}
          </span>
        )}
        {(() => {
          const ss = signalStatusStyle(signal.status)
          return (
            <span className={`text-[9px] px-1.5 py-0.5 rounded border font-medium ${ss.bg} ${ss.text} ${ss.border}`}>
              {ss.label}
            </span>
          )
        })()}
      </div>

      {signal.company_name && (
        <p className="text-[13px] font-bold text-white leading-snug">{signal.company_name}</p>
      )}
      {signal.description && (
        <p className="text-[12px] text-white/70 leading-relaxed mt-1">{signal.description}</p>
      )}

      <div className="flex items-center gap-3 mt-2.5 flex-wrap">
        {signal.source_url && (
          <a
            href={signal.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[10px] text-violet-400 hover:text-violet-300"
          >
            <ExternalLink size={9} /> Source
          </a>
        )}
        {signal.routed_to && (
          <span className="text-[10px] text-white/35">
            Routed to: <span className="text-white/55">{signal.routed_to}</span>
          </span>
        )}
        {signal.surfaced_at && (
          <span className="text-[10px] text-white/25">
            {formatDistanceToNow(new Date(signal.surfaced_at), { addSuffix: true })}
          </span>
        )}
      </div>

      {!rated && (
        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-white/[0.05]">
          <button
            onClick={() => onRate(signal.id, 1)}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-emerald-300 bg-emerald-500/10 border border-emerald-500/25 hover:bg-emerald-500/20 transition-colors"
          >
            <Check className="w-3 h-3" /> Used it
          </button>
          <button
            onClick={() => onRate(signal.id, 0)}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-violet-300 bg-violet-500/10 border border-violet-500/25 hover:bg-violet-500/20 transition-colors"
          >
            <ThumbsUp className="w-3 h-3" /> Good signal
          </button>
          <button
            onClick={() => onRate(signal.id, -1)}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-rose-300 bg-rose-500/10 border border-rose-500/25 hover:bg-rose-500/20 transition-colors"
          >
            <ThumbsDown className="w-3 h-3" /> Not useful
          </button>
        </div>
      )}

      {signal.status !== 'expired' && (
        <div className="flex items-center gap-2 mt-2">
          {(signal.status === 'received' || signal.status === 'routed' || !signal.status) && (
            <button
              onClick={() => onAction(signal.id, 'actioned')}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-blue-300 bg-blue-500/10 border border-blue-500/25 hover:bg-blue-500/20 transition-colors"
            >
              <Check className="w-3 h-3" /> Mark Actioned
            </button>
          )}
          <button
            onClick={() => onAction(signal.id, 'expired')}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-white/40 bg-white/[0.04] border border-white/10 hover:bg-white/[0.08] transition-colors"
          >
            <X className="w-3 h-3" /> Close
          </button>
          {/* TODO: wire guests reject button once Nell UI panel exists */}
          <button
            onClick={reject}
            disabled={rejecting}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-rose-300 bg-rose-500/10 border border-rose-500/25 hover:bg-rose-500/20 transition-colors disabled:opacity-50"
          >
            <Ban className="w-3 h-3" /> {rejecting ? 'Rejecting...' : 'Reject'}
          </button>
        </div>
      )}
    </div>
  )
}
