import React from 'react'
import { Sparkles } from 'lucide-react'
import type { MomentumPayload } from '../hooks/useHomeIntelligence'

interface Props {
  momentum: MomentumPayload | null
  generatedAt?: string | null
  variant?: 'desktop' | 'mobile'
}

interface Series {
  key: keyof MomentumPayload
  label: string
  format: (v: number) => string
  accent: string
  bar: string
}

const SERIES: Series[] = [
  {
    key: 'mrr',
    label: 'MRR',
    format: (v) => `$${Math.round(v).toLocaleString()}`,
    accent: 'text-emerald-300',
    bar: 'bg-emerald-400/70',
  },
  {
    key: 'leads',
    label: 'Leads',
    format: (v) => `${Math.round(v)}`,
    accent: 'text-violet-300',
    bar: 'bg-violet-400/70',
  },
  {
    key: 'shipped',
    label: 'Shipped',
    format: (v) => `${Math.round(v)}`,
    accent: 'text-amber-300',
    bar: 'bg-amber-400/70',
  },
  {
    key: 'visibility',
    label: 'Visibility',
    format: (v) => `${Math.round(v)}`,
    accent: 'text-rose-300',
    bar: 'bg-rose-400/70',
  },
]

/**
 * 7-day momentum mini-bars. One bar group per dimension. Total above each
 * group, then 7 vertical bars sized 0–1 against the local max so a
 * dimension's pattern is readable even when its absolute scale is tiny.
 *
 * Hidden if Marcus hasn't written a momentum payload yet so we never show
 * a row of empty placeholders.
 */
export function MomentumStrip({ momentum, generatedAt, variant = 'desktop' }: Props) {
  if (!momentum) return null
  const days = momentum.days ?? []
  const present = SERIES.filter(s => Array.isArray(momentum[s.key]) && (momentum[s.key] as number[]).length > 0)
  if (present.length === 0) return null

  return (
    <section
      aria-label="7-day momentum"
      className="rounded-2xl border border-white/[0.06] bg-white/[0.015] p-4"
    >
      <header className="flex items-baseline justify-between mb-3">
        <div className="flex items-center gap-1.5">
          <Sparkles size={11} className="text-white/40" />
          <h2 className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/45">
            7-day momentum
          </h2>
        </div>
        {generatedAt && (
          <span className="text-[10px] text-white/30 tabular-nums">
            {humanAgo(generatedAt)}
          </span>
        )}
      </header>
      <div className={`grid gap-3 ${variant === 'mobile' ? 'grid-cols-2' : 'grid-cols-2 md:grid-cols-4'}`}>
        {present.map(s => {
          const arr = (momentum[s.key] as number[]) ?? []
          const total = arr.reduce((a, b) => a + b, 0)
          const max = Math.max(...arr, 0)
          return (
            <div key={s.key} className="flex flex-col gap-1.5 min-w-0">
              <div className="flex items-baseline justify-between">
                <span className={`text-[10px] uppercase tracking-[0.14em] font-semibold ${s.accent}`}>
                  {s.label}
                </span>
                <span className="text-[11px] tabular-nums text-white/70 font-semibold truncate">
                  {s.format(total)}
                </span>
              </div>
              <div className="flex items-end gap-[3px] h-7" role="img" aria-label={`${s.label} 7-day trend`}>
                {arr.map((v, i) => {
                  const pct = max > 0 ? Math.max(6, (v / max) * 100) : 6
                  return (
                    <div
                      key={i}
                      className={`flex-1 rounded-sm ${s.bar} ${v === 0 ? 'opacity-25' : 'opacity-100'}`}
                      style={{ height: `${pct}%` }}
                      title={days[i] ? `${days[i]}: ${s.format(v)}` : s.format(v)}
                    />
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function humanAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  if (!Number.isFinite(ms) || ms < 0) return ''
  const m = Math.floor(ms / 60_000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const hr = Math.floor(m / 60)
  if (hr < 24) return `${hr}h ago`
  return `${Math.floor(hr / 24)}d ago`
}
