/**
 * Growth: the small instruments. Hand-drawn SVG and boxes in the house
 * accent language, theme-adaptive through the CSS channels:
 *   mint  rgb(var(--accent))    the answer, good
 *   amber rgb(var(--accent-3))  something moved or needs you
 *   faint rgb(var(--fg) / .12)  the empty part of a measure
 *
 * Growth is their only reader. If a second surface needs one, the family
 * moves to components/shared/ together, the way Sparkline was lifted out of
 * MrrTicker.
 */
import React from 'react'

export type Tone = 'mint' | 'amber' | 'neutral'

const INK: Record<Tone, string> = {
  mint: 'rgb(var(--accent))',
  amber: 'rgb(var(--accent-3))',
  neutral: 'rgb(var(--ink-muted))',
}
const EMPTY = 'rgb(var(--fg) / 0.12)'

/** A ring for a share of a whole. Honest at tiny values: a sliver is a sliver. */
export function Ring({ value, max, size = 40, stroke = 4, tone = 'mint', label }: {
  value: number; max: number; size?: number; stroke?: number; tone?: Tone; label: string
}) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const share = max > 0 ? Math.min(1, value / max) : 0
  // A non-zero share always shows at least a visible tick.
  const dash = share > 0 ? Math.max(c * share, stroke * 1.2) : 0
  // A hand-drawn mark, not a lucide glyph: its line is the measure itself, so
  // it sets its own width (the DrawnCheck and Sparkline precedent, and on
  // check-icons' STROKE_OK list for the same reason).
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label} className="flex-shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={EMPTY} strokeWidth={stroke} />
      {dash > 0 && (
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={INK[tone]} strokeWidth={stroke}
          strokeDasharray={`${dash} ${c}`} strokeLinecap="round" transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      )}
    </svg>
  )
}

/** Columns for a short run of counts, oldest first. The last column carries the tone. */
export function Columns({ values, w = 64, h = 24, tone = 'mint', label, max }: {
  values: number[]; w?: number; h?: number; tone?: Tone; label: string; max?: number
}) {
  const top = Math.max(max ?? 0, ...values, 1)
  const gap = values.length > 14 ? 1 : 3
  const bw = (w - gap * (values.length - 1)) / values.length
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={label} className="flex-shrink-0 overflow-visible">
      {values.map((v, i) => {
        const bh = v > 0 ? Math.max(2, (v / top) * (h - 1)) : 1.5
        const last = i === values.length - 1
        return (
          <rect
            key={i} x={i * (bw + gap)} y={h - bh} width={bw} height={bh} rx={Math.min(1.5, bw / 2)}
            fill={v > 0 ? (last ? INK[tone] : 'rgb(var(--fg) / 0.32)') : EMPTY}
          />
        )
      })}
    </svg>
  )
}

/** A grid of dots, `lit` of them in the tone. For "5 of 74". */
export function DotGrid({ total, lit, cols, dot = 4, gap = 2, tone = 'mint', label }: {
  total: number; lit: number; cols: number; dot?: number; gap?: number; tone?: Tone; label: string
}) {
  const rows = Math.ceil(total / cols)
  const w = cols * dot + (cols - 1) * gap
  const h = rows * dot + (rows - 1) * gap
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={label} className="flex-shrink-0">
      {Array.from({ length: total }).map((_, i) => (
        <circle
          key={i}
          cx={(i % cols) * (dot + gap) + dot / 2}
          cy={Math.floor(i / cols) * (dot + gap) + dot / 2}
          r={dot / 2}
          fill={i < lit ? INK[tone] : EMPTY}
        />
      ))}
    </svg>
  )
}

/** This week against last week, as two bars on one scale. */
export function PairBars({ cur, prev, max, tone = 'mint', label }: {
  cur: number; prev: number; max: number; tone?: Tone; label: string
}) {
  const pct = (v: number) => `${max > 0 ? Math.max(v > 0 ? 6 : 0, (v / max) * 100) : 0}%`
  return (
    <div role="img" aria-label={label} className="flex w-full flex-col gap-1">
      <div className="h-1.5 w-full rounded-full" style={{ background: EMPTY }}>
        <div className="h-full rounded-full" style={{ width: pct(cur), background: INK[tone] }} />
      </div>
      <div className="h-1.5 w-full rounded-full" style={{ background: EMPTY }}>
        <div className="h-full rounded-full" style={{ width: pct(prev), background: 'rgb(var(--fg) / 0.32)' }} />
      </div>
    </div>
  )
}

/** This week against the week before, each bar named and numbered. */
export function WeekPair({ cur, prev, max }: { cur: number; prev: number; max: number }) {
  const row = (label: string, v: number, ink: string) => (
    <>
      <span className="text-micro text-ink-muted">{label}</span>
      <span className="h-1.5 w-full rounded-full" style={{ background: EMPTY }}>
        {v > 0 && <span className="block h-full rounded-full" style={{ width: `${Math.max(8, (v / Math.max(1, max)) * 100)}%`, background: ink }} />}
      </span>
      <span className="text-right font-mono text-label tabular-nums text-ink">{v}</span>
    </>
  )
  return (
    <div role="img" aria-label={`${cur} this week, ${prev} the week before`} className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2.5 gap-y-1">
      {row('This week', cur, INK.neutral)}
      {row('Week before', prev, 'rgb(var(--fg) / 0.32)')}
    </div>
  )
}

/** One horizontal share bar, for a product's rate or a site's count. */
export function ShareBar({ value, max, tone = 'mint', label, height = 6 }: {
  value: number; max: number; tone?: Tone; label: string; height?: number
}) {
  const w = max > 0 ? (value / max) * 100 : 0
  return (
    <div role="img" aria-label={label} className="w-full rounded-full" style={{ height, background: EMPTY }}>
      {value > 0 && <div className="h-full rounded-full" style={{ width: `${Math.max(3, w)}%`, background: INK[tone] }} />}
    </div>
  )
}

/** A 1 to 10 score as ten ticks. */
export function ScoreTicks({ score, label }: { score: number; label: string }) {
  return (
    <span role="img" aria-label={label} className="inline-flex items-end gap-[2px]">
      {Array.from({ length: 10 }).map((_, i) => (
        <span
          key={i}
          className="w-[3px] rounded-[1px]"
          style={{ height: 4 + i * 0.9, background: i < score ? (score >= 8 ? INK.mint : INK.neutral) : EMPTY }}
        />
      ))}
    </span>
  )
}

export type SegState = 'done' | 'today' | 'clip' | 'answered' | 'skipped' | 'current' | 'open'

/** The week as segments: what is done, what is now, what is still to come. */
export function SegBar({ states, label }: { states: SegState[]; label: string }) {
  return (
    <div role="img" aria-label={label} className="flex w-full gap-[3px]">
      {states.map((s, i) => {
        const settled = s === 'done' || s === 'today' || s === 'clip' || s === 'answered'
        const style: React.CSSProperties = settled
          ? { background: INK.mint }
          : s === 'current'
            ? { background: 'rgb(var(--ink))' }
            : s === 'skipped'
              ? { background: 'rgb(var(--fg) / 0.22)' }
              : { background: EMPTY }
        return (
          <span
            key={i}
            className="h-1.5 flex-1 rounded-full transition-colors duration-300"
            style={style}
          />
        )
      })}
    </div>
  )
}
