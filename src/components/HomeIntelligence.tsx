import React, { useState, useEffect } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'

interface Metric {
  id: string
  label: string
  value: string
  target: string
  progress_pct: number
  interpretation: string
  status: string
}

interface ExternalSignal {
  signal: string
  category?: string
  source: string
  relevance: string
  recommended_action: string | null
  window?: string
}

interface HomeIntelligenceData {
  generated_at: string
  strategic_assessment: {
    headline: string
    body: string
    recommended_focus: string
  }
  metrics: Metric[]
  external_signals: ExternalSignal[]
  data_freshness: {
    vera_last_run: string
    sequences_last_updated: string
    zara_last_signal: string
  }
}

const statusBar: Record<string, string> = {
  blocked:     'bg-red-400',
  at_risk:     'bg-amber-400',
  on_track:    'bg-violet-400',
  in_progress: 'bg-blue-400',
  ahead:       'bg-emerald-400',
}

const statusDot: Record<string, string> = {
  blocked:     'text-red-400',
  at_risk:     'text-amber-400',
  on_track:    'text-white/30',
  in_progress: 'text-blue-400',
  ahead:       'text-emerald-400',
}

function timeAgo(iso: string) {
  const h = Math.floor((Date.now() - new Date(iso).getTime()) / 3_600_000)
  if (h < 1) return 'just now'
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function truncate(text: string, words: number) {
  const parts = text.split(/\s+/)
  if (parts.length <= words) return { text, truncated: false }
  return { text: parts.slice(0, words).join(' ') + '…', truncated: true }
}

export function HomeIntelligence() {
  const [data, setData] = useState<HomeIntelligenceData | null>(null)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    const load = () =>
      fetch('/data/home-intelligence.json', { cache: 'no-cache' })
        .then(r => r.json())
        .then(d => { setData(d); setLoading(false) })
        .catch(() => setLoading(false))
    load()
    const iv = setInterval(load, 5 * 60_000)
    return () => clearInterval(iv)
  }, [])

  if (loading) return <div className="py-16 text-center text-[13px] text-white/30">Loading…</div>
  if (!data) return <div className="py-16 text-center text-[13px] text-white/30">No intelligence yet</div>

  const { strategic_assessment: sa, metrics, external_signals, generated_at } = data
  const bodyResult = truncate(sa.body.replace(/\n\n/g, ' '), 55)

  return (
    <div className="space-y-5">

      {/* ── 1. Metrics Strip ── */}
      <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0">
        <div className="flex gap-3 min-w-max md:min-w-0 md:grid md:grid-cols-5">
          {metrics.map(m => {
            const dot = statusDot[m.status] ?? 'text-white/20'
            const bar = statusBar[m.status] ?? 'bg-white/20'
            return (
              <div key={m.id} className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3 w-36 md:w-auto flex-shrink-0">
                <p className={`text-[9px] font-bold uppercase tracking-widest mb-1.5 ${dot}`}>{m.label}</p>
                <div className="flex items-baseline gap-1 mb-1.5">
                  <span className="text-[17px] font-bold text-white leading-none">{m.value}</span>
                  <span className="text-[11px] text-white/30">/ {m.target}</span>
                </div>
                <div className="h-0.5 bg-white/[0.07] rounded-full overflow-hidden">
                  <div className={`h-full ${bar} rounded-full`} style={{ width: `${Math.min(m.progress_pct, 100)}%` }} />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── 2. Intelligence ── */}
      <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5">
        <p className="text-[10px] font-bold text-white/25 uppercase tracking-widest mb-3">
          Intelligence · Marcus · {timeAgo(generated_at)}
        </p>

        <p className="text-[15px] font-semibold text-white leading-snug mb-3">
          {sa.headline}
        </p>

        <p className="text-[13px] text-white/50 leading-relaxed">
          {expanded ? sa.body.replace(/\n\n/g, ' ') : bodyResult.text}
        </p>

        {bodyResult.truncated && (
          <button
            onClick={() => setExpanded(e => !e)}
            className="flex items-center gap-1 mt-2 text-[12px] text-white/25 hover:text-white/50 transition-colors"
          >
            {expanded ? <><ChevronUp className="w-3 h-3" />Less</> : <><ChevronDown className="w-3 h-3" />Read more</>}
          </button>
        )}

        <div className="mt-4 pt-4 border-t border-white/[0.05]">
          <p className="text-[10px] font-bold text-amber-400/60 uppercase tracking-widest mb-1.5">Focus this week</p>
          <p className="text-[13px] text-amber-200/70 leading-relaxed">{sa.recommended_focus}</p>
        </div>
      </div>

      {/* ── 3. Signals ── */}
      {external_signals.length > 0 && (
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5">
          <p className="text-[10px] font-bold text-white/25 uppercase tracking-widest mb-3">Signals · Zara</p>
          <div className="space-y-4">
            {external_signals.map((sig, i) => (
              <div key={i} className="flex gap-3">
                <div className="w-1 h-1 rounded-full bg-white/20 flex-shrink-0 mt-[6px]" />
                <div>
                  <div className="flex items-center gap-2 flex-wrap mb-0.5">
                    <p className="text-[13px] text-white/65 leading-snug">{sig.signal}</p>
                    {sig.window && sig.window !== 'ongoing' && (
                      <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400/70 bg-amber-400/10 px-1.5 py-0.5 rounded">{sig.window}</span>
                    )}
                  </div>
                  {sig.recommended_action && (
                    <p className="text-[12px] text-amber-300/55 mt-1 italic">{sig.recommended_action}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  )
}
