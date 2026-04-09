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
  source: string
  relevance: string
  recommended_action: string | null
}

interface HomeIntelligence {
  schema_version: string
  generated_at: string
  generated_by: string
  next_run: string
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
    tasks_last_updated: string
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
  blocked:     'bg-red-400',
  at_risk:     'bg-amber-400',
  on_track:    'bg-white/20',
  in_progress: 'bg-blue-400',
  ahead:       'bg-emerald-400',
}

function timeAgo(isoString: string) {
  const diff = Date.now() - new Date(isoString).getTime()
  const h = Math.floor(diff / 3_600_000)
  if (h < 1) return 'just now'
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

// Truncate to N words
function truncate(text: string, words: number) {
  const parts = text.split(/\s+/)
  if (parts.length <= words) return { text, truncated: false }
  return { text: parts.slice(0, words).join(' ') + '…', truncated: true }
}

export function HomeIntelligence() {
  const [data, setData] = useState<HomeIntelligence | null>(null)
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

  if (loading) return (
    <div className="py-16 text-center text-[13px] text-white/30">Loading…</div>
  )
  if (!data) return (
    <div className="py-16 text-center text-[13px] text-white/30">No intelligence yet</div>
  )

  const { strategic_assessment: sa, metrics, external_signals, generated_at } = data
  const bodyResult = truncate(sa.body.replace(/\n\n/g, ' '), 55)

  return (
    <div className="space-y-5 max-w-2xl mx-auto md:max-w-none">

      {/* ── Assessment ── */}
      <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5">

        {/* Label */}
        <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest mb-3">
          Marcus · {timeAgo(generated_at)}
        </p>

        {/* Headline */}
        <p className="text-[15px] font-semibold text-white leading-snug mb-3">
          {sa.headline}
        </p>

        {/* Body — truncated by default */}
        <p className="text-[13px] text-white/55 leading-relaxed">
          {expanded ? sa.body.replace(/\n\n/g, ' ') : bodyResult.text}
        </p>

        {bodyResult.truncated && (
          <button
            onClick={() => setExpanded(e => !e)}
            className="flex items-center gap-1 mt-2 text-[12px] text-white/30 hover:text-white/60 transition-colors"
          >
            {expanded ? <><ChevronUp className="w-3 h-3" /> Less</> : <><ChevronDown className="w-3 h-3" /> Read more</>}
          </button>
        )}

        {/* Focus */}
        <div className="mt-4 pt-4 border-t border-white/[0.06]">
          <p className="text-[10px] font-bold text-amber-400/70 uppercase tracking-widest mb-1.5">Focus this week</p>
          <p className="text-[13px] text-amber-200/80 leading-relaxed">{sa.recommended_focus}</p>
        </div>
      </div>

      {/* ── Metrics ── */}
      <div className="grid grid-cols-2 gap-3">
        {metrics.map(m => {
          const bar = statusBar[m.status] ?? 'bg-white/20'
          const dot = statusDot[m.status] ?? 'bg-white/20'
          const interp = truncate(m.interpretation, 22)

          return (
            <div key={m.id} className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4">
              <div className="flex items-center gap-1.5 mb-2">
                <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dot}`} />
                <p className="text-[10px] font-semibold text-white/40 uppercase tracking-wide truncate">{m.label}</p>
              </div>

              <div className="flex items-baseline gap-1.5 mb-2">
                <span className="text-[18px] font-bold text-white">{m.value}</span>
                <span className="text-[12px] text-white/30">/ {m.target}</span>
              </div>

              <div className="h-0.5 bg-white/[0.07] rounded-full overflow-hidden mb-3">
                <div
                  className={`h-full ${bar} rounded-full`}
                  style={{ width: `${Math.min(m.progress_pct, 100)}%` }}
                />
              </div>

              <p className="text-[11px] text-white/40 leading-relaxed italic">{interp.text}</p>
            </div>
          )
        })}
      </div>

      {/* ── Signals ── */}
      {external_signals.length > 0 && (
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5">
          <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest mb-3">External Signals · Zara</p>
          <div className="space-y-3">
            {external_signals.map((sig, i) => (
              <div key={i} className="flex gap-3">
                <div className="w-1 h-1 rounded-full bg-white/20 flex-shrink-0 mt-2" />
                <div>
                  <p className="text-[13px] text-white/70 leading-snug">{sig.signal}</p>
                  {sig.recommended_action && (
                    <p className="text-[12px] text-amber-300/60 mt-0.5 italic">{sig.recommended_action}</p>
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
