import React, { useState, useEffect } from 'react'
import { TrendingUp, TrendingDown, Minus, AlertCircle, ExternalLink } from 'lucide-react'

interface Metric {
  id: string
  label: string
  value: string
  target: string
  progress_pct: number
  interpretation: string
  status: 'blocked' | 'on_track' | 'at_risk' | 'ahead'
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

const statusConfig = {
  blocked:   { icon: AlertCircle, color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/20' },
  at_risk:   { icon: TrendingDown, color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20' },
  on_track:  { icon: Minus, color: 'text-white/40', bg: 'bg-white/[0.03]', border: 'border-white/[0.07]' },
  ahead:     { icon: TrendingUp, color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
}

function MetricCard({ metric }: { metric: Metric }) {
  const cfg = statusConfig[metric.status]
  const Icon = cfg.icon

  return (
    <div className={`rounded-xl border ${cfg.border} ${cfg.bg} p-4`}>
      <div className="flex items-start justify-between mb-2">
        <p className="text-[11px] font-semibold text-white/50 uppercase tracking-wide">{metric.label}</p>
        <Icon className={`w-4 h-4 ${cfg.color} flex-shrink-0`} />
      </div>

      <div className="flex items-baseline gap-2 mb-1">
        <span className="text-[20px] font-bold text-white">{metric.value}</span>
        <span className="text-[13px] text-white/40">/ {metric.target}</span>
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-white/[0.07] rounded-full overflow-hidden mb-3">
        <div
          className={`h-full ${metric.status === 'ahead' ? 'bg-emerald-400' : metric.status === 'on_track' ? 'bg-violet-400' : metric.status === 'at_risk' ? 'bg-amber-400' : 'bg-red-400'} rounded-full transition-all duration-500`}
          style={{ width: `${Math.min(metric.progress_pct, 100)}%` }}
        />
      </div>

      {/* Marcus's interpretation */}
      <p className="text-[12px] text-white/60 italic leading-relaxed">
        <span className="font-semibold text-violet-400 not-italic">Marcus:</span> {metric.interpretation}
      </p>
    </div>
  )
}

export function HomeIntelligence() {
  const [data, setData] = useState<HomeIntelligence | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchData = () => {
      fetch('/data/home-intelligence.json', { cache: 'no-cache' })
        .then(r => r.json())
        .then(d => {
          setData(d)
          setLoading(false)
        })
        .catch(() => setLoading(false))
    }

    fetchData()
    // Refresh every 5 minutes in case Marcus runs mid-session
    const interval = setInterval(fetchData, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-white/40 text-sm">Loading intelligence...</div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-white/40 text-sm">No intelligence data available</div>
      </div>
    )
  }

  const { strategic_assessment, metrics, external_signals, data_freshness, generated_at, next_run } = data

  const generatedDate = new Date(generated_at)
  const nextRunDate = new Date(next_run)

  const formatTimestamp = (d: Date) => {
    return d.toLocaleString('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'UTC',
      timeZoneName: 'short'
    })
  }

  const timeAgo = (isoString: string) => {
    const diff = Date.now() - new Date(isoString).getTime()
    const hours = Math.floor(diff / (1000 * 60 * 60))
    if (hours < 1) return 'just now'
    if (hours === 1) return '1h ago'
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    return days === 1 ? '1d ago' : `${days}d ago`
  }

  return (
    <div className="space-y-6">
      {/* Strategic Assessment */}
      <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-6">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-1 h-8 bg-violet-500 rounded-full flex-shrink-0" />
          <div className="flex-1">
            <p className="text-[11px] font-bold text-violet-400/70 uppercase tracking-wider mb-1">Strategic Assessment</p>
            <h2 className="text-[18px] font-bold text-violet-400 leading-snug">{strategic_assessment.headline}</h2>
          </div>
        </div>

        <div className="prose prose-invert max-w-none">
          {strategic_assessment.body.split('\n\n').map((para, i) => (
            <p key={i} className="text-[14px] text-white/80 leading-relaxed mb-4 last:mb-0">
              {para}
            </p>
          ))}
        </div>

        <div className="mt-6 pt-6 border-t border-white/[0.07]">
          <p className="text-[11px] font-bold text-amber-400/80 uppercase tracking-wider mb-2">Recommended Focus This Week</p>
          <p className="text-[14px] text-amber-300 font-medium leading-relaxed bg-amber-500/10 border border-amber-500/20 rounded-lg px-4 py-3">
            {strategic_assessment.recommended_focus}
          </p>
        </div>
      </div>

      {/* Metrics Grid */}
      <div>
        <h3 className="text-[13px] font-bold text-white/60 uppercase tracking-wide mb-3">Metrics</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {metrics.map(m => <MetricCard key={m.id} metric={m} />)}
        </div>
      </div>

      {/* External Signals */}
      {external_signals.length > 0 && (
        <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-5">
          <h3 className="text-[13px] font-bold text-white/60 uppercase tracking-wide mb-4">External Signals</h3>
          <div className="space-y-4">
            {external_signals.map((sig, idx) => (
              <div key={idx} className="flex gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-violet-400 flex-shrink-0 mt-2" />
                <div className="flex-1">
                  <p className="text-[13px] text-white/90 font-medium mb-1">{sig.signal}</p>
                  <p className="text-[12px] text-white/50 mb-1">
                    <span className="text-violet-400 font-semibold">{sig.source}:</span> {sig.relevance}
                  </p>
                  {sig.recommended_action && (
                    <p className="text-[12px] text-amber-400/80 italic">→ {sig.recommended_action}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Footer — Timestamp & Data Freshness */}
      <div className="bg-white/[0.02] border border-white/[0.05] rounded-lg px-4 py-3">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[11px] text-white/40">
          <div>
            <span className="font-semibold text-white/50">Last updated:</span> {formatTimestamp(generatedDate)}
          </div>
          <div>
            <span className="font-semibold text-white/50">Next run:</span> {formatTimestamp(nextRunDate)}
          </div>
          <div className="flex gap-4">
            <span>Vera: {timeAgo(data_freshness.vera_last_run)}</span>
            <span>Sequences: {timeAgo(data_freshness.sequences_last_updated)}</span>
            <span>Zara: {timeAgo(data_freshness.zara_last_signal)}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
