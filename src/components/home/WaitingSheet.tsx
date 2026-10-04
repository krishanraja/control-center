import React from 'react'
import { ArrowRight } from '@/lib/icons'
import type { DecisionRow } from '../../hooks/useRealtimeDecisionsWaiting'
import { routeDecision } from '../../lib/routeDecision'
import { waitingLine } from '../../lib/freshDecisions'
import { useHaptics } from '../../hooks/useHaptics'
import { Modal } from '../shared/Modal'
import { Eyebrow } from '../shared/Eyebrow'

type NavigateFn = (tab: string, params?: Record<string, string>) => void

// The tab each ruling is decided in, named the way the nav names it.
const TAB_NAME: Record<string, string> = {
  content: 'Content', os: 'Org', growth: 'Growth', acquisition: 'Growth',
  guests: 'People', leads: 'People', people: 'People', org: 'Org', home: 'Home',
}

function plainTitle(row: DecisionRow): string {
  const m = (row.meta ?? {}) as Record<string, unknown>
  const named = typeof m.title === 'string' && m.title ? m.title : null
  const dk = typeof m.decision_kind === 'string' ? m.decision_kind : null
  if (row.kind === 'content_decision' && named) {
    if (dk === 'brief_review') return `Read this week's brief: ${named}`
    if (dk === 'graduation') return `Keep for good? ${named}`
    if (dk === 'shift_proposal') return `A new shift to approve: ${named}`
  }
  if (row.kind === 'idea') return `A piece to read: ${row.title}`
  return row.title
}

/**
 * What the Waiting count opens: the fresh rulings, grouped by the tab that
 * owns each one. Nothing is decided here. Each row says where it is decided
 * and takes him there, which is the job the OS Queue did badly before it was
 * removed (ruling, Krish 2026-10-04).
 */
export function WaitingSheet({ open, onClose, waiting, onNavigate }: {
  open: boolean
  onClose: () => void
  waiting: DecisionRow[]
  onNavigate?: NavigateFn
}) {
  const h = useHaptics()
  const groups = new Map<string, Array<{ row: DecisionRow; tab: string; params: Record<string, string> }>>()
  for (const row of waiting) {
    const target = routeDecision(row.kind, row.id)
    const name = TAB_NAME[target.tab] ?? 'Home'
    const list = groups.get(name) ?? []
    list.push({ row, ...target })
    groups.set(name, list)
  }

  return (
    <Modal open={open} onClose={onClose} title="Waiting on you" className="sm:max-w-lg p-4">
      <div data-testid="waiting-sheet" className="space-y-4">
        <p className="text-body text-ink-muted">{waitingLine(waiting.length)}</p>
        {[...groups.entries()].map(([name, items]) => (
          <section key={name} className="space-y-1.5">
            <Eyebrow>In {name}</Eyebrow>
            <ul className="space-y-1.5">
              {items.map(({ row, tab, params }) => (
                <li key={`${row.kind}:${row.id}`}>
                  <button
                    type="button"
                    onClick={() => { h.tap(); onClose(); onNavigate?.(tab, params) }}
                    className="w-full flex items-start justify-between gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5 text-left hover:border-white/15"
                  >
                    <span className="text-label text-ink">{plainTitle(row)}</span>
                    <ArrowRight size={14} className="mt-0.5 shrink-0 text-ink-faint" />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Modal>
  )
}
