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
  platform?: string
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

// ── Signal config ────────────────────────────────────────────────────────

const CATEGORY_CONFIG: Record<string, {
  label: string
  dot: string
  badge: string
  badgeBg: string
  border: string
}> = {
  buyer_confusion: {
    label: '💰 Buyer Signal',
    dot: 'bg-emerald-400',
    badge: 'text-emerald-300',
    badgeBg: 'bg-emerald-400/10 border-emerald-400/20',
    border: 'border-emerald-400/20',
  },
  content_window: {
    label: '✍️ Content Window',
    dot: 'bg-violet-400',
    badge: 'text-violet-300',
    badgeBg: 'bg-violet-400/10 border-violet-400/20',
    border: 'border-violet-400/20',
  },
  visibility_window: {
    label: '🎤 Visibility',
    dot: 'bg-amber-400',
    badge: 'text-amber-300',
    badgeBg: 'bg-amber-400/10 border-amber-400/20',
    border: 'border-amber-400/20',
  },
  adfixus: {
    label: '📡 AdFixus',
    dot: 'bg-blue-400',
    badge: 'text-blue-300',
    badgeBg: 'bg-blue-400/10 border-blue-400/20',
    border: 'border-blue-400/20',
  },
}

const PLATFORM_ICONS: Record<string, string> = {
  twitter: '𝕏',
  reddit: 'Reddit',
  hackernews: 'HN',
  funding: '💸',
  news: 'News',
  meetup: 'Meetup',
  linkedin: 'LI',
  layer1: '📸',
  web: 'Web',
}

const WINDOW_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  '48h':          { label: '48h window', color: 'text-red-300',    bg: 'bg-red-400/10 border-red-400/25' },
  '7 days':       { label: '7 day window', color: 'text-amber-300', bg: 'bg-amber-400/10 border-amber-400/25' },
  'closing soon': { label: 'Closing soon', color: 'text-orange-300', bg: 'bg-orange-400/10 border-orange-400/25' },
}

function SignalsPanel({ signals }: { signals: ExternalSignal[] }) {
  const [expanded, setExpanded] = React.useState<number | null>(null)

  // Group by category
  const order = ['buyer_confusion', 'content_window', 'visibility_window', 'adfixus']
  const grouped = order.reduce<Record<string, ExternalSignal[]>>((acc, cat) => {
    const items = signals.filter(s => (s.category || 'buyer_confusion') === cat)
    if (items.length) acc[cat] = items
    return acc
  }, {})

  return (
    <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-5 pt-4 pb-3 border-b border-white/[0.05]">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-bold text-white/25 uppercase tracking-widest">
            Market Signals · Zara
          </p>
          <span className="text-[10px] text-white/20">{signals.length} signals</span>
        </div>
      </div>

      {/* Grouped signals */}
      <div className="divide-y divide-white/[0.04]">
        {Object.entries(grouped).map(([cat, items]) => {
          const cfg = CATEGORY_CONFIG[cat] ?? CATEGORY_CONFIG.buyer_confusion
          return (
            <div key={cat} className="px-5 py-4">
              {/* Category header */}
              <div className="flex items-center gap-2 mb-3">
                <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
                <span className={`text-[10px] font-bold uppercase tracking-widest ${cfg.badge}`}>
                  {cfg.label}
                </span>
                <span className="text-[10px] text-white/15 ml-auto">{items.length}</span>
              </div>

              {/* Signal cards */}
              <div className="space-y-2.5">
                {items.map((sig, i) => {
                  const globalIdx = signals.indexOf(sig)
                  const isOpen = expanded === globalIdx
                  const winCfg = sig.window ? WINDOW_CONFIG[sig.window] : null
                  const platform = sig.platform || ''
                  const platformIcon = PLATFORM_ICONS[platform] || ''

                  return (
                    <button
                      key={i}
                      onClick={() => setExpanded(isOpen ? null : globalIdx)}
                      className={`w-full text-left rounded-lg border p-3 transition-all duration-150
                        ${isOpen
                          ? `${cfg.border} bg-white/[0.04]`
                          : 'border-white/[0.05] bg-white/[0.02] hover:bg-white/[0.04]'
                        }`}
                    >
                      {/* Signal row */}
                      <div className="flex items-start gap-2.5">
                        {/* Platform chip */}
                        {platformIcon && (
                          <span className="text-[9px] font-bold text-white/25 mt-0.5 min-w-[22px]">
                            {platformIcon}
                          </span>
                        )}

                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] text-white/70 leading-snug">
                            {sig.signal}
                          </p>

                          {/* Tags row */}
                          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                            {winCfg && (
                              <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${winCfg.color} ${winCfg.bg}`}>
                                {winCfg.label}
                              </span>
                            )}
                            {sig.source && (
                              <span className="text-[9px] text-white/20 uppercase tracking-wide">
                                {sig.source}
                              </span>
                            )}
                          </div>

                          {/* Expanded detail */}
                          {isOpen && (
                            <div className="mt-2.5 space-y-2 border-t border-white/[0.05] pt-2.5">
                              {sig.relevance && (
                                <p className="text-[12px] text-white/45 leading-relaxed">
                                  {sig.relevance}
                                </p>
                              )}
                              {sig.recommended_action && (
                                <div className={`flex items-start gap-1.5 rounded px-2 py-1.5 ${cfg.badgeBg} border`}>
                                  <span className="text-[10px] font-bold uppercase tracking-wider text-white/30 mt-0.5">→</span>
                                  <p className={`text-[11px] font-medium leading-snug ${cfg.badge}`}>
                                    {sig.recommended_action}
                                  </p>
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Expand indicator */}
                        <span className="text-[10px] text-white/15 flex-shrink-0 mt-0.5">
                          {isOpen ? '▲' : '▼'}
                        </span>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
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
        <SignalsPanel signals={external_signals} />
      )}

    </div>
  )
}
