import React, { useState } from 'react'
import { Sun, AlertOctagon, CheckCircle2, ChevronDown } from 'lucide-react'
import { useHomeIntelligence } from '../hooks/useHomeIntelligence'

interface Props {
  /**
   * If false, the Friday retro is rendered as a normal collapsible card
   * instead of a blocking acknowledge-to-dismiss banner. The Mission Control
   * Home no longer wants the retro to block — it lives as a collapsed surface
   * the user can expand.
   */
  blocking?: boolean
  variant?: 'desktop' | 'mobile'
  /**
   * When true, render only the Friday retro and never the daily brief. The
   * daily spine's ContextHeader now owns the brief at the top of Home, so Home
   * passes retroOnly to keep the retro as a below-fold weekly surface without
   * double-rendering the brief.
   */
  retroOnly?: boolean
}

/**
 * Pillar 4 surface. Renders Marcus's latest daily brief at the top of Home.
 * If a Friday retro is unacknowledged, it shows alongside the brief — but
 * only as a blocking banner when explicitly requested. The Mission Control
 * default (Phase 2) is non-blocking; the user can expand it on demand.
 *
 * All data flows through `useHomeIntelligence`, the canonical reader.
 */
export function DailyBriefBanner({ blocking = false, variant = 'desktop', retroOnly = false }: Props = {}) {
  const { intel, ackRetro } = useHomeIntelligence()
  const [acking, setAcking] = useState(false)
  const [retroOpen, setRetroOpen] = useState(false)

  const brief = intel.daily_brief
  const briefAt = intel.daily_brief_at
  const retro = intel.weekly_retro
  const retroAt = intel.weekly_retro_at
  const retroAcked = intel.weekly_retro_ack_at

  const showRetro = retro != null && retroAt && (!retroAcked || retroAt > retroAcked)

  const onAck = async () => {
    setAcking(true)
    await ackRetro()
    setAcking(false)
  }

  // Blocking variant — only used in legacy callers; Mission Control passes
  // blocking={false} so the retro becomes a collapsible card under the brief.
  if (blocking && showRetro && retro) {
    return (
      <section
        className="rounded-2xl border-2 border-amber-500/40 bg-gradient-to-br from-amber-500/[0.10] to-amber-500/[0.02] p-4 sm:p-5 min-w-0 overflow-hidden break-words"
        aria-label="Weekly retro — blocking"
      >
        <header className="flex items-center gap-2 mb-3 min-w-0">
          <AlertOctagon size={14} className="text-amber-300 flex-shrink-0" />
          <h2 className="text-micro font-bold uppercase tracking-[0.14em] text-amber-300 truncate">
            Friday retro — acknowledge to dismiss
          </h2>
        </header>
        <RetroBody retro={retro} />
        <button
          type="button"
          onClick={onAck}
          disabled={acking}
          className="mt-3 px-3 py-1.5 rounded-md text-label font-semibold bg-amber-500/25 border border-amber-500/40 text-amber-100 hover:bg-amber-500/35 disabled:opacity-40 min-h-[44px] sm:min-h-0"
        >
          <CheckCircle2 size={12} className="inline mr-1" />
          {acking ? 'Saving…' : 'Acknowledged — dismiss'}
        </button>
      </section>
    )
  }

  if (retroOnly && !showRetro) return null
  if (!brief && !showRetro) return null

  const delta = brief?.yesterday_mrr_delta_usd ?? 0
  const deltaColor = delta > 0 ? 'text-emerald-300' : delta < 0 ? 'text-red-300' : 'text-white/55'

  return (
    <div className="flex flex-col gap-3 min-w-0">
      {brief && !retroOnly && (
        <section
          className="rounded-2xl border border-violet-500/20 bg-gradient-to-br from-violet-500/[0.06] to-violet-500/[0.01] p-4 sm:p-5 min-w-0 overflow-hidden break-words"
          aria-label="Marcus daily brief"
        >
          <header className="flex items-center gap-2 mb-3 min-w-0">
            <Sun size={14} className="text-violet-300 flex-shrink-0" />
            <h2 className="text-micro font-bold uppercase tracking-[0.14em] text-violet-300 truncate">
              Today's brief from Marcus
            </h2>
            {briefAt && (
              <span className="text-micro text-white/35 ml-auto tabular-nums flex-shrink-0">
                {humanAgo(briefAt)}
              </span>
            )}
          </header>

          {delta !== 0 && (
            <p className={`text-ui font-semibold mb-2 ${deltaColor}`}>
              Yesterday: {delta > 0 ? '+' : ''}${Math.round(delta).toLocaleString()} MRR
            </p>
          )}

          {brief.one_bet && (
            <p className="text-body text-white/85 leading-snug mb-1.5 break-words">
              <span className="text-violet-300/80 font-semibold">Today's bet · </span>
              {brief.one_bet}
            </p>
          )}
          {brief.one_customer && (
            <p className="text-body text-white/85 leading-snug mb-1.5 break-words">
              <span className="text-emerald-300/80 font-semibold">Talk to · </span>
              {brief.one_customer}
            </p>
          )}
          {brief.one_anti_action && (
            <p className="text-body text-white/85 leading-snug break-words">
              <span className="text-red-300/80 font-semibold">Don't · </span>
              {brief.one_anti_action}
            </p>
          )}
          {brief.body && !brief.one_bet && (
            <p className="text-body text-white/75 leading-snug whitespace-pre-wrap break-words">
              {brief.body}
            </p>
          )}
        </section>
      )}

      {showRetro && retro && (
        <section
          className="rounded-2xl border border-amber-500/25 bg-amber-500/[0.04] min-w-0 overflow-hidden"
          aria-label="Friday retro"
        >
          <button
            type="button"
            onClick={() => setRetroOpen(o => !o)}
            className="w-full flex items-center gap-2 px-4 sm:px-5 py-3 hover:bg-amber-500/[0.06] transition-colors min-h-[44px]"
          >
            <AlertOctagon size={13} className="text-amber-300 flex-shrink-0" />
            <span className="text-micro font-bold uppercase tracking-[0.14em] text-amber-300 truncate">
              Friday retro
            </span>
            {retroAt && (
              <span className="text-micro text-white/35 tabular-nums flex-shrink-0 ml-1">
                {humanAgo(retroAt)}
              </span>
            )}
            <span className="ml-auto flex items-center gap-2 flex-shrink-0">
              {!retroAcked && (
                <span className="text-micro uppercase tracking-[0.14em] font-semibold text-amber-200/80 hidden sm:inline">
                  New
                </span>
              )}
              <ChevronDown
                size={14}
                className={`text-amber-300/60 transition-transform ${retroOpen ? 'rotate-180' : ''}`}
              />
            </span>
          </button>

          {retroOpen && (
            <div className="px-4 sm:px-5 pb-4 sm:pb-5 break-words">
              <RetroBody retro={retro} />
              {!retroAcked && (
                <button
                  type="button"
                  onClick={onAck}
                  disabled={acking}
                  className="mt-3 px-3 py-1.5 rounded-md text-label font-semibold bg-amber-500/15 border border-amber-500/30 text-amber-100 hover:bg-amber-500/25 disabled:opacity-40 min-h-[44px] sm:min-h-0"
                >
                  <CheckCircle2 size={12} className="inline mr-1" />
                  {acking ? 'Saving…' : 'Mark read'}
                </button>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  )
}

function RetroBody({ retro }: { retro: NonNullable<ReturnType<typeof useHomeIntelligence>['intel']['weekly_retro']> }) {
  return (
    <div className="space-y-3 min-w-0">
      {retro.what_worked && retro.what_worked.length > 0 && (
        <div>
          <p className="text-micro uppercase tracking-[0.14em] text-emerald-300/80 font-semibold mb-1">
            Worked
          </p>
          <ul className="text-body text-white/85 space-y-0.5 whitespace-normal break-words">
            {retro.what_worked.slice(0, 4).map((w, i) => (
              <li key={i} className="break-words">· {w}</li>
            ))}
          </ul>
        </div>
      )}
      {retro.what_flopped && retro.what_flopped.length > 0 && (
        <div>
          <p className="text-micro uppercase tracking-[0.14em] text-red-300/80 font-semibold mb-1">
            Flopped
          </p>
          <ul className="text-body text-white/85 space-y-0.5 whitespace-normal break-words">
            {retro.what_flopped.slice(0, 4).map((w, i) => (
              <li key={i} className="break-words">· {w}</li>
            ))}
          </ul>
        </div>
      )}
      {retro.next_focus && (
        <p className="text-body text-amber-100 font-medium leading-snug break-words line-clamp-3">
          → Next week: {retro.next_focus}
        </p>
      )}
    </div>
  )
}

function humanAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  if (!Number.isFinite(ms)) return ''
  const h = Math.floor(ms / 3_600_000)
  if (h < 1) return `${Math.max(1, Math.floor(ms / 60_000))}m`
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}d`
}
