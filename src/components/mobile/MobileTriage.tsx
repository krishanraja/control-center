import React, { useCallback } from 'react'
import { Layers, ChevronRight, ExternalLink, FileText, UserPlus, Target, Mic } from 'lucide-react'
import { MobileShell as MobileShellPrim, TabHeader } from './primitives'
import { MobileShell as MobileStage } from './MobileShell'
import { TriagePanel } from '../TriagePanel'
import { SwipeDeck } from '../shared/SwipeDeck'
import { useSwipeTriage } from '../../hooks/useSwipeTriage'
import { useTriageQueue, type TriageRow, type TriageKind } from '../../hooks/useTriageQueue'
import { useToast } from '../shared/Toast'
import { reasonsFor } from '../../lib/triageReasons'
import { triagePromote, triageReject } from '../../lib/triageActions'
import { navigateDecision } from '../../lib/routeDecision'

interface Props {
  onNavigate?: (tab: string, params?: Record<string, string>) => void
}

const KIND_ICON: Record<TriageKind, typeof Mic> = {
  content_idea: FileText, lead: UserPlus, visibility: Target, guest: Mic,
}
const KIND_LABEL: Record<TriageKind, string> = {
  content_idea: 'Idea', lead: 'Lead', visibility: 'Visibility', guest: 'Guest',
}

// Mobile Triage. When the agent-suggestion pile is large it becomes a one-card
// swipe deck (right = accept → promote +1, left = reject → reason chip → −1);
// small piles fall back to the tappable TriagePanel list. Both write the same
// feedback_queue votes Vera learns from.
export function MobileTriage({ onNavigate }: Props) {
  const { rows, loading } = useTriageQueue()
  const { toast } = useToast()

  const onAccept = useCallback(async (r: TriageRow) => {
    const ok = await triagePromote(r.source_table, r.id, r.agent)
    toast(ok ? 'Accepted. Moved to Today.' : 'Could not accept — try again.', ok ? 'success' : 'error')
    return ok
  }, [toast])

  const onReject = useCallback(async (r: TriageRow, code?: string) => {
    const ok = await triageReject(r.source_table, r.id, r.agent, code)
    toast(ok ? 'Dropped. Vera will learn.' : 'Could not drop — try again.', ok ? 'success' : 'error')
    return ok
  }, [toast])

  const triage = useSwipeTriage<TriageRow>({
    items: rows, getId: r => r.id, loading, onAccept, onReject,
  })

  const open = (r: TriageRow) => navigateDecision(onNavigate || (() => {}), r.kind === 'content_idea' ? 'idea' : r.kind, r.id)

  const renderBody = (r: TriageRow) => {
    const Icon = KIND_ICON[r.kind]
    return (
      <>
        <div className="flex items-center gap-2 flex-wrap mb-3">
          <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded uppercase tracking-[0.1em] font-semibold bg-white/[0.08] text-white/65">
            <Icon size={10} /> {KIND_LABEL[r.kind]}
          </span>
          <span className="text-[10px] uppercase tracking-[0.1em] text-white/40">{r.agent}</span>
          {typeof r.confidence === 'number' && r.confidence > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.06] text-white/55 tabular-nums">conf {r.confidence.toFixed(1)}</span>
          )}
        </div>
        <p className="text-[19px] font-semibold text-white leading-snug">{r.title}</p>
        {r.description && (
          <p className="text-[13px] text-white/60 leading-relaxed mt-3 overflow-hidden flex-1 min-h-0">
            {r.description.slice(0, 360)}{r.description.length > 360 ? '…' : ''}
          </p>
        )}
        {r.source_url && (
          <div className="flex items-center gap-3 mt-3 pt-3 border-t border-white/[0.06] flex-shrink-0">
            <a href={r.source_url} target="_blank" rel="noreferrer noopener" onClick={e => e.stopPropagation()}
              className="text-[11px] text-violet-300 hover:text-violet-200 inline-flex items-center gap-1">
              Source <ExternalLink size={10} />
            </a>
          </div>
        )}
      </>
    )
  }

  if (triage.mode === 'deck') {
    return (
      <MobileStage scroll="none" header={<TabHeader title="Triage" subtitle={`${rows.length} pending · swipe to clear`} />}>
        <SwipeDeck<TriageRow>
          deck={triage.deck}
          getId={r => r.id}
          renderBody={renderBody}
          ariaLabel={r => `${KIND_LABEL[r.kind]}: ${r.title}`}
          onAccept={triage.accept}
          onReject={triage.reject}
          onOpen={open}
          leftLabel="Drop"
          rightLabel="Accept"
          pending={triage.pending}
          reasonChips={r => reasonsFor(r.source_table)}
          onChooseReason={triage.chooseReason}
          onCancelPending={triage.cancelPending}
          remaining={triage.remaining}
          triagedCount={triage.triagedCount}
          onExit={triage.exitDeck}
          title="Clear the pile"
          narrow
        />
      </MobileStage>
    )
  }

  return (
    <MobileShellPrim>
      <TabHeader title="Triage" subtitle="Suggestions for your call" />
      <div className="pb-6">
        {!loading && rows.length > 0 && (
          <button
            type="button"
            onClick={triage.forceDeck}
            className="w-full mb-4 flex items-center gap-2.5 rounded-2xl border border-violet-400/30 bg-violet-500/10 active:bg-violet-500/20 p-3.5 text-left transition-colors"
          >
            <Layers size={18} className="text-violet-300 flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-violet-100">Swipe to triage · {rows.length}</p>
              <p className="text-[11px] text-white/45">One card at a time — right keeps, left drops with a reason.</p>
            </div>
            <ChevronRight size={16} className="text-violet-300/70 ml-auto flex-shrink-0" />
          </button>
        )}
        <TriagePanel onNavigate={onNavigate} hideHeader />
      </div>
    </MobileShellPrim>
  )
}
