import React from 'react'
import { ArrowUpRight } from 'lucide-react'
import { PIPELINE_ACCENT, PIPELINE_LABEL, type PipelineKey, type Stage } from '../../lib/pipelines'

interface Props {
  pipeline: PipelineKey
  total: number
  stages: Stage[]
  stageCounts: Record<string, number>
  onOpenAll?: () => void
  emptyLabel?: string
  /** Body content — featured card, compact rows, Nell header, etc. */
  children?: React.ReactNode
}

/**
 * One pipeline column. Stage chip row + caller-provided body + "Open all" link.
 * The body is intentionally composition-driven so each lane (Content / Leads /
 * Visibility) can render the right primitives without forking the shell.
 */
export function PipelineLane({ pipeline, total, stages, stageCounts, onOpenAll, emptyLabel, children }: Props) {
  const accent = PIPELINE_ACCENT[pipeline]
  const isEmpty = total === 0
  const empty = emptyLabel ?? 'Nothing in motion.'

  return (
    <section
      aria-label={`${PIPELINE_LABEL[pipeline]} pipeline`}
      className={`rounded-2xl border ${accent.border} ${accent.bg} flex flex-col min-h-0`}
    >
      <header className="flex items-center justify-between px-4 pt-3 pb-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`w-1.5 h-1.5 rounded-full ${accent.dot} flex-shrink-0`} aria-hidden />
          <h3 className={`text-[10px] font-semibold uppercase tracking-[0.16em] ${accent.text}`}>
            {PIPELINE_LABEL[pipeline]}
          </h3>
          <span className="text-[11px] text-white/55 tabular-nums font-semibold">{total}</span>
        </div>
        {onOpenAll && total > 0 && (
          <button
            type="button"
            onClick={onOpenAll}
            className="flex items-center gap-1 text-[10px] text-white/45 hover:text-white/80 transition-colors"
          >
            Open all
            <ArrowUpRight size={10} />
          </button>
        )}
      </header>

      {/* Stage rollup chips */}
      <div className="px-4 pb-2 flex items-center gap-1.5 flex-wrap">
        {stages.map(s => {
          const n = stageCounts[s.key] || 0
          const muted = n === 0
          return (
            <div
              key={s.key}
              className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md border border-white/[0.06] ${muted ? 'opacity-40' : ''}`}
              title={`${s.label}: ${n}`}
            >
              <span className="text-[9px] uppercase tracking-[0.12em] text-white/45">{s.label}</span>
              <span className="text-[10px] text-white tabular-nums font-semibold">{n}</span>
            </div>
          )
        })}
      </div>

      <div className="px-2 pb-2 flex-1 min-h-0">
        {isEmpty ? (
          <div className="px-2 py-6 text-center">
            <p className="text-[12px] text-white/40">{empty}</p>
          </div>
        ) : (
          children
        )}
      </div>
    </section>
  )
}
