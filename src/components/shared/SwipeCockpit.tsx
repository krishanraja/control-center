import React, { useEffect, useMemo, useState } from 'react'
import { Layers } from 'lucide-react'
import { useSwipeTriage } from '../../hooks/useSwipeTriage'
import { SwipeDeck } from './SwipeDeck'
import { DecisionDetail } from '../DecisionDetail'
import { reasonsFor } from '../../lib/triageReasons'
import type { TriageConfig } from '../../lib/triageConfig'

interface Props<T> {
  config: TriageConfig<T>
  onExit: () => void
  onNavigate?: (tab: string, params?: Record<string, string>) => void
}

/**
 * SwipeCockpit — the desktop triage shell. Same gesture grammar as the phone
 * (it embeds the shared SwipeDeck in the center, so ←/→ swipe, mouse-drag,
 * reason chips, and the context-aware right action are all identical), but it
 * spends the landscape real estate the phone can't:
 *  - LEFT rail: the "up next" queue — see what's coming; click a row to focus it.
 *  - CENTER: the large focus card + an optional pipeline stage track so a
 *    RIGHT-swipe "advance" is legible (the item visibly walks its lifecycle).
 *  - RIGHT rail: the full detail + complete action set docked permanently
 *    (DecisionDetail w/ buildDecisionActions) — no tap-to-open needed.
 */
export function SwipeCockpit<T>({ config, onExit, onNavigate }: Props<T>) {
  const triage = useSwipeTriage<T>({
    items: config.items,
    getId: config.getId,
    loading: config.loading,
    onAccept: config.onAccept,
    onReject: config.onReject,
  })

  const [focusId, setFocusId] = useState<string | null>(null)

  // Clicking a queue row brings that card to the front of the deck.
  const deck = useMemo(() => {
    if (!focusId) return triage.deck
    const idx = triage.deck.findIndex(t => config.getId(t) === focusId)
    if (idx <= 0) return triage.deck
    const copy = [...triage.deck]
    const [f] = copy.splice(idx, 1)
    return [f, ...copy]
  }, [triage.deck, focusId, config])

  // Drop a stale focus once that card has left the deck (swiped/cleared).
  useEffect(() => {
    if (focusId && !triage.deck.some(t => config.getId(t) === focusId)) setFocusId(null)
  }, [triage.deck, focusId, config])

  const top = deck[0] ?? null
  // The config already names the surface for its reason chips; the same key
  // answers "why is this here", so every cockpit surface gets the badge without
  // its five call sites each restating the table.
  const whyOf = (t: T) => ({ table: config.reasonsTable, row: t as Record<string, any> })

  const detailDecision = top && config.detailKey ? config.detailKey(top) : null
  const currentStage = top && config.stageTrack ? config.stageTrack.current(top) : null

  return (
    <div className="flex gap-4 h-[calc(100vh-170px)] min-h-[480px]">
      {/* Left rail — up next */}
      <aside className="w-64 flex-shrink-0 rounded-2xl border border-white/[0.06] bg-white/[0.015] flex flex-col overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.06] flex-shrink-0">
          <Layers size={14} className="text-violet-300" />
          <span className="text-label font-medium text-white/70">Up next</span>
          <span className="ml-auto text-micro text-white/40 tabular-nums">{triage.remaining}</span>
        </div>
        <div className="flex-1 overflow-y-auto py-1">
          {deck.length === 0 ? (
            <p className="px-4 py-6 text-label text-white/40">Queue cleared.</p>
          ) : (
            deck.slice(0, 40).map((t, i) => {
              const id = config.getId(t)
              const active = i === 0
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setFocusId(id)}
                  className={`w-full text-left px-4 py-2 border-l-2 transition-colors ${
                    active ? 'border-violet-400 bg-violet-500/10' : 'border-transparent hover:bg-white/[0.04]'
                  }`}
                >
                  {config.renderRow
                    ? config.renderRow(t, active)
                    : <span className={`text-label truncate ${active ? 'text-white' : 'text-white/70'}`}>{config.ariaLabel?.(t) ?? id}</span>}
                </button>
              )
            })
          )}
        </div>
      </aside>

      {/* Center — focus card (reuses the shared SwipeDeck) */}
      <div className="flex-1 min-w-0 flex flex-col">
        {config.stageTrack && currentStage && (
          <StageTrack stages={config.stageTrack.stages} current={currentStage} />
        )}
        <div className="flex-1 min-h-0">
          <SwipeDeck<T>
            deck={deck}
            getId={config.getId}
            renderBody={config.renderBody}
            why={whyOf}
            ariaLabel={config.ariaLabel}
            onAccept={triage.accept}
            onReject={triage.reject}
            leftLabel={config.leftLabel}
            rightLabel={config.rightLabel}
            rightIntent={config.rightIntent}
            pending={triage.pending}
            reasonChips={() => reasonsFor(config.reasonsTable)}
            onChooseReason={triage.chooseReason}
            onCancelPending={triage.cancelPending}
            remaining={triage.remaining}
            triagedCount={triage.triagedCount}
            onExit={onExit}
            title={config.title}
          />
        </div>
      </div>

      {/* Right rail — docked detail + full action set */}
      <aside className="w-80 flex-shrink-0 rounded-2xl border border-white/[0.06] bg-white/[0.015] overflow-hidden">
        {top && config.renderDetail ? (
          <div className="h-full overflow-y-auto">{config.renderDetail(top)}</div>
        ) : detailDecision ? (
          <DecisionDetail key={detailDecision} decision={detailDecision} actionsEnabled onNavigate={onNavigate} />
        ) : (
          <div className="h-full flex items-center justify-center text-label text-white/35 px-6 text-center">
            Nothing focused — the deck is clear.
          </div>
        )}
      </aside>
    </div>
  )
}

/** Horizontal lifecycle track; completed stages go emerald, current is violet. */
function StageTrack({ stages, current }: { stages: { key: string; label: string }[]; current: string }) {
  const idx = Math.max(0, stages.findIndex(s => s.key === current))
  return (
    <div className="flex items-center gap-1 px-1 pb-3 flex-shrink-0">
      {stages.map((s, i) => (
        <React.Fragment key={s.key}>
          <div
            className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-micro uppercase tracking-[0.14em] whitespace-nowrap transition-colors ${
              i === idx
                ? 'bg-violet-500/20 text-violet-100 border border-violet-400/40'
                : i < idx
                ? 'text-emerald-300/70'
                : 'text-white/30'
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${i === idx ? 'bg-violet-300' : i < idx ? 'bg-emerald-400/70' : 'bg-white/20'}`} />
            {s.label}
          </div>
          {i < stages.length - 1 && (
            <div className={`flex-1 h-px ${i < idx ? 'bg-emerald-400/30' : 'bg-white/10'}`} />
          )}
        </React.Fragment>
      ))}
    </div>
  )
}
