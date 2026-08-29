import React, { useMemo, useState } from 'react'
import { TrendingUp, Pencil } from 'lucide-react'
import {
  useGrowthMetrics, combineSeries,
  type GrowthSeries, type GrowthPoint,
} from '../../hooks/useGrowthMetrics'
import { useCustomers } from '../../hooks/useCustomers'
import { useRealtimeDecisionsWaiting } from '../../hooks/useRealtimeDecisionsWaiting'

/**
 * The Growth Scoreboard: the three engines Krish is growing, one line each.
 *
 *   Content subscribers  = Maven students + both Substack publications
 *   App subscriptions    = paid customers (live) + MRR
 *   Network reach        = guests confirmed + visibility wins, last 30d
 *
 * Each line: current value, 7d/30d delta, sparkline, and honesty chips: amber
 * "flat Nd" when the line has not increased across the stall window, grey
 * "stale Nd" when the newest snapshot is old (a dead feed must look dead, never
 * quietly frozen). Counts come from the daily /api/growth/snapshot cron; the
 * pencil opens a manual "log counts" sheet as the fallback for the scraped keys.
 */

const STALL_DAYS = 14
const STALE_AFTER_DAYS = 2

interface LineDef {
  id: 'content' | 'apps' | 'network'
  label: string
  accent: string
  bar: string
}

const LINES: LineDef[] = [
  { id: 'content', label: 'Content subscribers', accent: 'text-cyan-300', bar: 'bg-cyan-400/70' },
  { id: 'apps', label: 'App subscriptions', accent: 'text-emerald-300', bar: 'bg-emerald-400/70' },
  { id: 'network', label: 'Network reach 30d', accent: 'text-violet-300', bar: 'bg-violet-400/70' },
]

const SOURCE_CHIPS: Array<{ key: 'substack_publication_total' | 'substack_tech0nomic_total' | 'maven_students'; label: string }> = [
  { key: 'substack_publication_total', label: 'MM Live' },
  // Retired 2026-08-06, folded into Mindmake LIVE. The chip stays so the
  // subscribers it still holds are not silently missing from the total.
  { key: 'substack_tech0nomic_total', label: 'Techonomic (retired)' },
  { key: 'maven_students', label: 'Maven' },
]

function Spark({ points, bar }: { points: GrowthPoint[]; bar: string }) {
  if (points.length < 2) return null
  const recent = points.slice(-21)
  const min = Math.min(...recent.map(p => p.value))
  const max = Math.max(...recent.map(p => p.value))
  const span = max - min
  return (
    <div className="flex items-end gap-[2px] h-6 w-24" role="img" aria-label="trend">
      {recent.map((p, i) => {
        const pct = span > 0 ? 15 + ((p.value - min) / span) * 85 : 50
        return <div key={i} className={`flex-1 rounded-sm ${bar}`} style={{ height: `${pct}%` }} title={`${p.date}: ${p.value.toLocaleString()}`} />
      })}
    </div>
  )
}

function DeltaChip({ delta, money }: { delta: number | null; money?: boolean }) {
  if (delta == null) return null
  const fmt = (v: number) => money ? `$${Math.abs(Math.round(v)).toLocaleString()}` : Math.abs(Math.round(v)).toLocaleString()
  if (delta === 0) return <span className="text-[10px] tabular-nums text-white/35">±0 · 7d</span>
  const up = delta > 0
  return (
    <span className={`text-[10px] tabular-nums font-semibold ${up ? 'text-emerald-300' : 'text-rose-300'}`}>
      {up ? '+' : '-'}{fmt(delta)} · 7d
    </span>
  )
}

export interface GrowthScoreboardProps {
  variant?: 'desktop' | 'mobile'
}

export function GrowthScoreboard({ variant = 'desktop' }: GrowthScoreboardProps) {
  const { series, loading } = useGrowthMetrics()
  const { totals } = useCustomers()
  const [logOpen, setLogOpen] = useState(false)
  // Open stall episodes, straight from the shared decisions cache: a line with
  // an open stall renders its flat chip as a link into the ruling (the deck,
  // seeded to the stall's 3 drafted moves).
  const { decisions: decisionRows } = useRealtimeDecisionsWaiting()
  const openStalls = useMemo(() => {
    const map = new Map<string, string>() // metric_key -> stall id
    for (const d of decisionRows) {
      if (d.kind !== 'growth_stall') continue
      const key = (d.meta as { metric_key?: string })?.metric_key
      if (key) map.set(key, d.id)
    }
    return map
  }, [decisionRows])
  const openStallFor = (keys: string[]): string | null => {
    for (const k of keys) { const id = openStalls.get(k); if (id) return id }
    return null
  }
  const openStallRuling = (stallId: string) => {
    try { window.location.hash = `#/home?decision=growth_stall:${stallId}` } catch { /* noop */ }
  }

  const lines = useMemo(() => {
    const contentKeys: GrowthSeries[] = [
      series.substack_publication_total,
      series.substack_tech0nomic_total,
      series.maven_students,
    ]
    const networkKeys: GrowthSeries[] = [series.guests_confirmed_30d, series.visibility_accepted_30d]

    const build = (id: LineDef['id'], parts: GrowthSeries[], liveLatest?: number | null) => {
      const combined = combineSeries(parts.filter(p => p.points.length > 0))
      const last = combined.length ? combined[combined.length - 1].value : null
      const latest = liveLatest ?? last
      const ago7 = combined.length ? valueAt(combined, 7) : null
      const ago14 = combined.length ? valueAt(combined, STALL_DAYS) : null
      const withData = parts.filter(p => p.staleDays != null)
      const staleDays = withData.length ? Math.max(...withData.map(p => p.staleDays as number)) : null
      const hasAnyData = withData.length > 0
      return {
        id,
        latest,
        delta7: last != null && ago7 != null ? last - ago7 : null,
        flat: last != null && ago14 != null && combined.length >= 2 && last <= ago14,
        staleDays,
        hasAnyData,
        combined,
        parts,
      }
    }

    return {
      content: build('content', contentKeys),
      apps: build('apps', [series.app_paid_subs], totals.paid > 0 ? totals.paid : series.app_paid_subs.latest),
      network: build('network', networkKeys),
    }
  }, [series, totals.paid])

  // The stall detector fires per metric_key; a line-level chip opens the
  // first open stall among its constituent keys.
  const LINE_KEYS: Record<LineDef['id'], string[]> = {
    content: ['substack_publication_total', 'substack_tech0nomic_total', 'maven_students'],
    apps: ['app_paid_subs', 'app_mrr_usd'],
    network: ['guests_confirmed_30d', 'visibility_accepted_30d'],
  }

  if (loading && !lines.content.hasAnyData && !lines.network.hasAnyData) {
    // Pre-migration / first run: show nothing rather than a wall of empties,
    // but keep the apps line if customer data exists.
    if (totals.paid === 0) return null
  }

  const mrr = totals.mrrUsd

  return (
    <section aria-label="Growth scoreboard" className="rounded-2xl border border-white/[0.06] bg-white/[0.015] p-4">
      <header className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5">
          <TrendingUp size={11} className="text-white/40" />
          <h2 className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/45">Growth</h2>
        </div>
        <button
          onClick={() => setLogOpen(v => !v)}
          className="flex items-center gap-1 text-[10px] text-white/35 hover:text-white/70 transition-colors"
          title="Log subscriber counts manually"
        >
          <Pencil size={10} /> log counts
        </button>
      </header>

      <div className={`grid gap-3 ${variant === 'mobile' ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-3'}`}>
        {LINES.map(def => {
          const line = lines[def.id]
          const headline = def.id === 'apps'
            ? `${(line.latest ?? 0).toLocaleString()} paid`
            : line.latest != null ? Math.round(line.latest).toLocaleString() : null
          return (
            <div key={def.id} className="flex flex-col gap-1.5 min-w-0 rounded-xl border border-white/[0.05] bg-white/[0.01] p-3">
              <div className="flex items-baseline justify-between gap-2">
                <span className={`text-[10px] uppercase tracking-[0.14em] font-semibold ${def.accent}`}>{def.label}</span>
                <DeltaChip delta={line.delta7} />
              </div>
              <div className="flex items-end justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-lg font-bold tabular-nums text-white/90 truncate">
                    {headline ?? <span className="text-white/30 text-sm font-medium">no data yet</span>}
                  </div>
                  {def.id === 'apps' && (
                    <div className="text-[11px] tabular-nums text-white/45">${Math.round(mrr).toLocaleString()}/mo</div>
                  )}
                  {def.id === 'content' && (
                    <div className="flex flex-wrap gap-1 mt-0.5">
                      {SOURCE_CHIPS.map(c => {
                        const s = series[c.key]
                        return (
                          <span key={c.key} className="text-[9px] tabular-nums px-1.5 py-px rounded border border-white/[0.08] text-white/45">
                            {c.label} {s.latest != null ? Math.round(s.latest).toLocaleString() : '?'}
                          </span>
                        )
                      })}
                    </div>
                  )}
                  {def.id === 'network' && (
                    <div className="text-[10px] text-white/40 tabular-nums">
                      {Math.round(series.guests_confirmed_30d.latest ?? 0)} guests · {Math.round(series.visibility_accepted_30d.latest ?? 0)} visibility
                    </div>
                  )}
                </div>
                <Spark points={line.combined} bar={def.bar} />
              </div>
              <div className="flex items-center gap-1.5 min-h-[16px]">
                {(() => {
                  const stallId = openStallFor(LINE_KEYS[def.id])
                  if (stallId) {
                    return (
                      <button
                        onClick={() => openStallRuling(stallId)}
                        className="text-[9px] font-semibold uppercase tracking-wide px-1.5 py-px rounded bg-amber-500/15 text-amber-300 border border-amber-500/25 hover:bg-amber-500/25 transition-colors"
                      >
                        stalled · moves ready
                      </button>
                    )
                  }
                  if (line.flat) {
                    return (
                      <span className="text-[9px] font-semibold uppercase tracking-wide px-1.5 py-px rounded bg-amber-500/15 text-amber-300 border border-amber-500/25">
                        flat {STALL_DAYS}d
                      </span>
                    )
                  }
                  return null
                })()}
                {line.staleDays != null && line.staleDays > STALE_AFTER_DAYS && (
                  <span className="text-[9px] uppercase tracking-wide px-1.5 py-px rounded bg-white/[0.04] text-white/40 border border-white/[0.08]">
                    stale {line.staleDays}d
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {logOpen && <LogCountsSheet onClose={() => setLogOpen(false)} />}
    </section>
  )
}

function valueAt(points: GrowthPoint[], daysAgo: number): number | null {
  if (!points.length) return null
  const cutoff = Date.parse(points[points.length - 1].date) - daysAgo * 86_400_000
  let best: number | null = null
  for (const p of points) {
    if (Date.parse(p.date) <= cutoff) best = p.value
    else break
  }
  return best
}

function LogCountsSheet({ onClose }: { onClose: () => void }) {
  const [values, setValues] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const submit = async () => {
    const entries = SOURCE_CHIPS
      .map(c => ({ metric_key: c.key, value: Number(values[c.key]) }))
      .filter(e => Number.isFinite(e.value) && values[e.metric_key] !== undefined && values[e.metric_key] !== '')
    if (!entries.length) { setMsg('Enter at least one count.'); return }
    setBusy(true); setMsg(null)
    try {
      const r = await fetch('/api/growth/snapshot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'log', entries }),
      })
      const j = await r.json()
      if (j.ok) { setMsg(`Logged ${j.written.length} count${j.written.length === 1 ? '' : 's'}.`); setTimeout(onClose, 900) }
      else setMsg(j.rejected?.[0]?.error || j.error || 'Failed to log counts.')
    } catch {
      setMsg('Network error, counts not logged.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-3 rounded-xl border border-white/[0.08] bg-white/[0.02] p-3 space-y-2">
      <div className="text-[10px] uppercase tracking-[0.14em] font-semibold text-white/45">Log today's counts</div>
      {SOURCE_CHIPS.map(c => (
        <label key={c.key} className="flex items-center justify-between gap-2 text-[12px] text-white/70">
          <span>{c.label}</span>
          <input
            type="number"
            min={0}
            inputMode="numeric"
            value={values[c.key] ?? ''}
            onChange={e => setValues(v => ({ ...v, [c.key]: e.target.value }))}
            className="w-28 bg-black/30 border border-white/10 rounded-lg px-2 py-1 text-right tabular-nums text-white/85 focus:outline-none focus:border-white/25"
            placeholder="count"
          />
        </label>
      ))}
      <div className="flex items-center justify-between gap-2 pt-1">
        <span className="text-[10px] text-white/35">{msg}</span>
        <div className="flex gap-2">
          <button onClick={onClose} className="text-[11px] px-2.5 py-1 rounded-lg border border-white/10 text-white/55 hover:text-white/80">Cancel</button>
          <button onClick={submit} disabled={busy} className="text-[11px] px-2.5 py-1 rounded-lg bg-white/10 border border-white/15 text-white/85 hover:bg-white/15 disabled:opacity-50">
            {busy ? 'Saving' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
