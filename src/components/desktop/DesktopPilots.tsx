import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, Users } from '@/lib/icons'
import { BoardSkeleton } from '../shared/Skeleton'
import { FreshnessLine } from '../shared/FreshnessLine'
import { Working } from '../shared/Working'
import { useToast } from '../shared/Toast'
import { PilotCard } from '../pilotDeals/PilotCard'
import { TriageDeck } from '../shared/TriageDeck'
import { SwipeCockpit } from '../shared/SwipeCockpit'
import { buildPilotTriageConfig } from '../../lib/triageConfig'
import {
  addPilotDeal, PILOT_STATE_LABEL, PILOT_STATES, seedPilots, usePilots,
} from '../../hooks/usePilots'
import type { PilotProposal, PilotState } from '../../hooks/usePilots'

// Pilots, job 1 (docs/plans/one-swing/CHARTER.md): the 25 leaders who fit
// the face. The OS drafts, Krish sends. Listed and drafted show by default
// because that is where the work waits; every other state is one chip away
// so a sent approach can be moved along when the reply comes.

// What the page is, why it matters, what to do next — the three questions the
// lane failed to answer on a phone, where the explanation never rendered at all.
// The offer is the door from `api/_mission.ts`, restated in the second person;
// `api/` is server-only so the constant cannot be imported here.
export const PILOT_PURPOSE = 'People you already know who could pay for a three week private diagnostic.'
export const PILOT_OFFER = 'What you are selling: a paid three week pilot. They come out knowing where they stand, what is coming for their business, and what to do first.'

/** Anyone who has been written to, at any point along the ladder. */
const ASKED_STATES: PilotState[] = [
  'sent', 'replied', 'call_booked', 'call_taken', 'pilot_booked', 'pilot_paid',
]

/**
 * The arithmetic from the charter, against the real counts: 25 approaches buy
 * 5 calls buy 1 paid pilot by 5 December (docs/plans/one-swing/CHARTER.md).
 * Saying it here is the whole answer to "why am I looking at these people".
 */
function progressLine(counts: Record<string, number>): string {
  const onList = PILOT_STATES.reduce((n, s) => n + (s === 'not_now' ? 0 : (counts[s] || 0)), 0)
  const asked = ASKED_STATES.reduce((n, s) => n + (counts[s] || 0), 0)
  const list = onList === 1 ? '1 person on the list' : `${onList} people on the list`
  return `${list}, ${asked} asked so far. The plan needs about 25 asks to get 5 calls and one paid pilot by 5 December.`
}

/** Plain words for the search stages the server reports as skipped. */
function degradedWords(stages: string[]): string {
  const words = stages.map(stage => stage.startsWith('embedding') ? 'semantic matching'
    : stage.startsWith('rerank') ? 'the reranker'
    : stage.replace(/[:_]/g, ' '))
  return [...new Set(words)].join(' or ')
}

/** The counts line, in ladder order, only the states that have anyone. */
function countsLine(counts: Record<string, number>): string {
  return PILOT_STATES
    .filter(s => counts[s])
    .map(s => `${counts[s]} ${PILOT_STATE_LABEL[s].toLowerCase()}`)
    .join(', ')
}

export function PilotsBody({ narrow, onDeckActive }: { narrow: boolean; onDeckActive?: (active: boolean) => void }) {
  const { toast } = useToast()
  const [view, setView] = useState<PilotState | null>(null)
  const { targets, stateCounts, loading, error, refetch } = usePilots(view)
  const [seeding, setSeeding] = useState(false)
  const [proposals, setProposals] = useState<PilotProposal[] | null>(null)
  const [findNote, setFindNote] = useState<string | null>(null)
  /** Which person the phone's stage is showing. Reset whenever the list it
   *  indexes into changes, or a chip switch would land on a stale position. */
  const [index, setIndex] = useState(0)
  const [accepting, setAccepting] = useState<string | null>(null)

  const counts = useMemo(() => countsLine(stateCounts), [stateCounts])

  // The default view plus any state that has someone in it. Chips, not a
  // select: the set is small and it changes with the counts.
  const views = useMemo(() => {
    const out: Array<{ id: PilotState | null; label: string }> = [{ id: null, label: 'Listed and drafted' }]
    for (const s of PILOT_STATES) {
      if (s === 'listed' || s === 'drafted') continue
      if (stateCounts[s]) out.push({ id: s, label: PILOT_STATE_LABEL[s] })
    }
    return out
  }, [stateCounts])

  const findMore = async () => {
    if (seeding) return
    setSeeding(true)
    setFindNote(null)
    try {
      const { proposals: found, degraded, heldBack } = await seedPilots(5)
      setProposals(found)
      // A held-back person is one the search found and could not identify: no
      // company, no role, and the lookup did not fill them in. Showing a bare
      // first name is worse than showing four cards, so they are dropped, and
      // the drop is said out loud rather than looking like a thin search.
      const held = heldBack
        ? heldBack === 1
          ? 'One more came back with no company or job title, so it is not on the deck.'
          : `${heldBack} more came back with no company or job title, so they are not on the deck.`
        : ''
      if (!found.length) {
        setFindNote(degraded.length
          ? `Nobody came back. The search ran without ${degradedWords(degraded)}, so it could not rank properly.`
          : held || 'Nobody new fits closely enough right now.')
      } else if (degraded.length) {
        setFindNote(`Ranked without ${degradedWords(degraded)}. The order is rougher than usual. ${held}`.trim())
      } else if (held) {
        setFindNote(held)
      }
    } catch (err) {
      setFindNote(`Could not search: ${(err as Error)?.message || 'try again'}`)
    } finally {
      setSeeding(false)
    }
  }

  // The charter says the OS drafts and Krish sends. An empty list that waits
  // for a button is the OS not drafting. So the first time the lane opens
  // empty, the five are found and shown; nothing is listed until Accept.
  const autoFound = useRef(false)
  useEffect(() => {
    if (loading || error || view || targets.length || proposals || autoFound.current) return
    autoFound.current = true
    void findMore()
  }, [loading, error, view, targets.length, proposals])

  const accept = async (p: PilotProposal) => {
    if (accepting) return
    setAccepting(p.contact_id)
    try {
      await addPilotDeal({
        contact_id: p.contact_id,
        why_face: p.why_face,
        sourced_by: 'os',
        ask_kind: p.ask_kind,
        ask_line: p.ask_line,
        // The evidence travels with the decision. Dropping it here is what
        // made a card say "No live trigger found" about someone whose
        // source-checked quote was already in the database.
        intent_score: p.intent_score,
        intent_stance: p.intent_stance,
        intent_evidence: p.intent_evidence,
        intent_evidence_url: p.intent_evidence_url,
        intent_topics: p.intent_topics,
        last_post_at: p.last_post_at,
        followers: p.followers,
        is_influencer: p.is_influencer,
        is_creator: p.is_creator,
        completeness: p.completeness,
      })
      setProposals(prev => (prev || []).filter(x => x.contact_id !== p.contact_id))
      toast(`${p.full_name || 'Added'} is on the list.`, 'success')
      refetch()
    } catch (err) {
      const msg = (err as Error)?.message || ''
      toast(msg === 'already_listed' ? 'Already on the list.' : `Could not add: ${msg || 'try again'}`, 'error')
    } finally {
      setAccepting(null)
    }
  }

  /**
   * A skip is a verdict, so it is written down.
   *
   * It used to filter the local array and write nothing. `/api/pilot-deals/seed`
   * excludes only people who already have a row, and it ranks with the
   * deterministic scorer (`rerank: false`), so the same query over the same
   * corpus returned the identical five on every call: skip Rio, reload, Rio is
   * back at the top. Recording the skip as a `not_now` row both suppresses the
   * person from the next seed and carries a coded feedback vote, which is the
   * only way anything Krish decides here reaches Vera.
   */
  const skip = async (p: PilotProposal, reasonCode?: string) => {
    setProposals(prev => (prev || []).filter(x => x.contact_id !== p.contact_id))
    try {
      await addPilotDeal({
        contact_id: p.contact_id,
        why_face: p.why_face,
        sourced_by: 'os',
        state: 'not_now',
        reason_code: reasonCode,
      })
      refetch()
    } catch (err) {
      const msg = (err as Error)?.message || ''
      // already_listed means the row exists, so the person stays suppressed and
      // there is nothing to put back. Anything else loses the verdict, and a
      // silently dropped verdict is the bug this replaced.
      if (msg !== 'already_listed') {
        setProposals(prev => [p, ...(prev || []).filter(x => x.contact_id !== p.contact_id)])
        toast(`Could not skip: ${msg || 'try again'}`, 'error')
      }
    }
  }

  // Both verdicts are writes here, because a proposal has no row until one is
  // made. accept() and skip() already own the toasts and the optimistic list
  // removal, so the deck's own commit just reports success.
  const proposalConfig = useMemo(() => buildPilotTriageConfig(
    proposals || [],
    { toast },
    {
      accept: async p => { await accept(p as PilotProposal); return true },
      reject: async (p, code) => { await skip(p as PilotProposal, code); return true },
    },
    seeding,
  ), [proposals, seeding])

  // The deck owns the phone screen when proposals are up. Visibility already
  // does this (`MobileGuests` returns a `scroll="none"` shell while triaging);
  // this lane gave the deck a fixed 540px box inside the page scroller instead,
  // so the page and the cards fought each other under the thumb. The shell is
  // owned by `MobilePilots`, so the lane reports the mode and the shell reacts.
  // A chip switch, a refetch or an advanced deal all change what the stage
  // indexes into. Clamping on every change beats letting the pager point past
  // the end and render nothing.
  useEffect(() => { setIndex(i => (i > 0 && i >= targets.length ? Math.max(0, targets.length - 1) : i)) }, [targets.length])

  const deckOwnsScreen = narrow && !!proposals && proposals.length > 0
  useEffect(() => { onDeckActive?.(deckOwnsScreen) }, [deckOwnsScreen, onDeckActive])

  const header = !narrow && (
    <header>
      <h1 className="text-title font-semibold text-white tracking-tight flex items-center gap-2">
        <Users size={20} className="text-violet-300" />
        Pilots
      </h1>
      <FreshnessLine lane="pilots" />
    </header>
  )

  if (deckOwnsScreen) {
    return (
      <div className="flex-1 min-h-0">
        <TriageDeck config={proposalConfig} onExit={() => setProposals(null)} />
      </div>
    )
  }

  if (loading && targets.length === 0) {
    return (
      <div className={narrow ? 'flex h-full min-h-0 flex-col px-5 pt-1' : 'space-y-5'}>
        {header}
        <BoardSkeleton lanes={1} cardsPerLane={narrow ? 1 : 3} hero={false} />
      </div>
    )
  }

  const emptyLine = view
    ? `Nobody is ${PILOT_STATE_LABEL[view].toLowerCase()} right now.`
    : proposals?.length
      ? 'Keep the ones who fit. The Monday run drafts a note for everyone on the list.'
      : seeding
        ? 'Looking through your network for five who fit the face.'
        : 'Nobody is on the list yet. Find five to start, then the Monday run drafts a note for each one.'

  // ── The phone: one fixed screen, one person on it ────────────────────────
  //
  // The lane used to be a scrolling list of tall cards under five bands of
  // chrome, inside a shell zoomed to 1.2, and it needed a scroll before the
  // first name was fully visible. Truncation cannot rescue that: index.css
  // neutralises .truncate and every .line-clamp-* on purpose (the
  // complete-copy invariant), so density has to come from showing less at
  // once, not from clipping what is shown. Same shape as MobileHome: a
  // 100dvh/--z frame, shrink-0 chrome, and one flex-1 min-h-0 stage.
  //
  // A pager rather than a swipe-to-commit deck. The proposals deck swipes
  // because accept and skip are the only two verdicts. A listed deal is on a
  // nine rung ladder where the actions are "Draft it", "I sent it", "They
  // replied": explicit, not a direction, and a mis-swipe would move someone's
  // state. So the swipe is navigation and the ladder stays buttons.
  if (narrow) {
    const list = targets
    const current = list.length ? list[Math.min(index, list.length - 1)] : null
    return (
      <div className="flex h-full min-h-0 flex-col px-5 pt-1 pb-[calc((env(safe-area-inset-bottom,0px)+96px)/var(--z,1))]">
        {/* One band: what this is, and where it stands. The purpose line, the
            counts row and the disclosure used to be three separate bands. */}
        <div className="shrink-0">
          <p data-testid="pilot-counts" className="text-label text-white/55">
            {counts || (error ? 'The list could not be read.' : 'Nobody is on the list yet.')}
          </p>
          <details data-testid="pilot-purpose" className="group mt-1">
            <summary className="flex cursor-pointer list-none items-baseline gap-2">
              <span className="text-label text-white/45 group-open:text-white/70">Why these people</span>
              <span className="text-micro text-white/30 group-open:hidden">Show</span>
              <span className="hidden text-micro text-white/30 group-open:inline">Hide</span>
            </summary>
            <div className="mt-1 space-y-1">
              <p className="text-label text-white/55 leading-snug">{PILOT_PURPOSE}</p>
              <p className="text-label text-white/45 leading-snug">{PILOT_OFFER}</p>
              <p className="text-label text-white/45 leading-snug">{progressLine(stateCounts)}</p>
            </div>
          </details>
        </div>

        {/* The chips scroll sideways if they outgrow the line; Find five sits
            OUTSIDE that scroller so it can never be the part that is cut off,
            which is exactly what an ml-auto inside an overflow-x-auto row
            did. */}
        <div className="shrink-0 mt-2 flex items-center gap-1.5">
          <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto scrollbar-hide">
          {views.length > 1 && views.map(v => {
            const on = v.id === view
            return (
              <button
                key={v.id || 'working'}
                type="button"
                aria-pressed={on}
                data-testid={`pilot-view-${v.id || 'working'}`}
                onClick={() => { setView(v.id); setIndex(0) }}
                className={`shrink-0 min-h-[32px] rounded-full border px-3 py-1 text-label transition-colors ${
                  on
                    ? 'border-violet-400/50 bg-violet-500/15 text-violet-100'
                    : 'border-white/10 bg-white/[0.03] text-white/55'
                }`}
              >
                {v.label}
              </button>
            )
          })}
          </div>
          <button
            type="button"
            data-testid="pilot-find-more"
            onClick={findMore}
            disabled={seeding}
            className="shrink-0 flex items-center gap-1.5 min-h-[32px] px-3 rounded-full text-label font-medium border border-violet-500/30 text-violet-200 disabled:opacity-40"
          >
            {seeding ? <Working size={12} /> : <Search size={12} />}
            Find five
          </button>
        </div>

        {findNote && (
          <p data-testid="pilot-find-note" className="shrink-0 mt-2 text-label text-amber-100/75">{findNote}</p>
        )}

        {/* The stage.
            overflow-hidden is the layout: on a real phone the card fits and
            nothing scrolls, which e2e/pilots-noscroll.spec.ts pins at 390x844
            and 360x800 by asserting no descendant holds more than it shows.
            Below roughly 700 CSS pixels of height - which after the 1.2 zoom
            root is an effective 583, smaller than any current phone - the
            drafted card genuinely cannot fit, and clipping it would hide the
            action row. There the stage scrolls. That is graceful degradation
            for a viewport out of range, not the layout, the same way
            FocusPurposeTab treats its own scroller. */}
        <div className="flex-1 min-h-0 mt-2 overflow-hidden [@media(max-height:700px)]:overflow-y-auto flex flex-col justify-center [@media(max-height:700px)]:justify-start">
          {current ? (
            <PilotCard key={current.id} target={current} onChanged={refetch} narrow />
          ) : (
            <p data-testid="pilot-empty" className="text-body text-white/45">{emptyLine}</p>
          )}
        </div>

        {/* The pager. Only when there is more than one person to move between;
            one person needs no controls and the row would be dead space.
            pr reserves the floating + button's footprint, which is fixed to the
            bottom right OUTSIDE the zoom root, the same reservation MobileHome
            makes for its doors row. Without it the create button sits on top of
            Next and swallows the tap. */}
        {list.length > 1 && (
          <div className="shrink-0 mt-2 flex items-center justify-between gap-3 pr-[68px]">
            <button
              type="button"
              data-testid="pilot-prev"
              onClick={() => setIndex(i => Math.max(0, i - 1))}
              disabled={index <= 0}
              className="min-h-[40px] px-4 rounded-full border border-white/10 bg-white/[0.03] text-label text-white/70 disabled:opacity-30"
            >
              Back
            </button>
            <span className="text-label text-white/45 tabular-nums">
              {Math.min(index + 1, list.length)} of {list.length}
            </span>
            <button
              type="button"
              data-testid="pilot-next"
              onClick={() => setIndex(i => Math.min(list.length - 1, i + 1))}
              disabled={index >= list.length - 1}
              className="min-h-[40px] px-4 rounded-full border border-white/10 bg-white/[0.03] text-label text-white/70 disabled:opacity-30"
            >
              Next
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {header}

      {/* One line, not three. The first pass put the purpose, the offer and the
          charter arithmetic on screen together and pushed the first card below
          the fold on a 390 by 844 phone. The purpose stays out loud because it
          is the answer to "what am I looking at"; the reasoning folds shut. */}
      <section data-testid="pilot-purpose" className="space-y-2">
        <p className="text-body text-white/75 leading-snug">{PILOT_PURPOSE}</p>
        <details className="group rounded-xl border border-white/[0.06] bg-white/[0.01]">
          <summary className="flex cursor-pointer list-none items-baseline gap-2 px-3 py-2">
            <span className="text-label text-white/55">Why these people</span>
            <span className="ml-auto text-micro text-white/35 group-open:hidden">Show</span>
            <span className="ml-auto hidden text-micro text-white/35 group-open:inline">Hide</span>
          </summary>
          <div className="space-y-1.5 px-3 pb-3">
            <p className="text-label text-white/50 leading-snug">{PILOT_OFFER}</p>
            <p className="text-label text-white/50 leading-snug">{progressLine(stateCounts)}</p>
          </div>
        </details>
      </section>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p data-testid="pilot-counts" className="text-label text-white/55">
          {counts || (error ? 'The list could not be read.' : 'Nobody is on the list yet.')}
        </p>
        <button
          type="button"
          data-testid="pilot-find-more"
          onClick={findMore}
          disabled={seeding}
          className="flex items-center gap-1.5 px-3 py-2 rounded-md text-label font-medium border border-violet-500/30 text-violet-200 hover:bg-violet-500/10 disabled:opacity-40 transition-colors"
          title="Searches your own network for people who fit the face. Nothing is added until you accept one."
        >
          {seeding ? <Working size={12} /> : <Search size={12} />}
          Find five more
        </button>
      </div>

      {views.length > 1 && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Pilot states">
          {views.map(v => {
            const on = v.id === view
            return (
              <button
                key={v.id || 'working'}
                type="button"
                aria-pressed={on}
                data-testid={`pilot-view-${v.id || 'working'}`}
                onClick={() => setView(v.id)}
                className={`min-h-[32px] rounded-full border px-3 py-1 text-label transition-colors ${
                  on
                    ? 'border-violet-400/50 bg-violet-500/15 text-violet-100'
                    : 'border-white/10 bg-white/[0.03] text-white/55 hover:bg-white/[0.06]'
                }`}
              >
                {v.label}
              </button>
            )
          })}
        </div>
      )}

      {findNote && (
        <p data-testid="pilot-find-note" className="text-label text-amber-100/75">{findNote}</p>
      )}

      {proposals && proposals.length > 0 && (
        <section aria-label="Proposed leaders" className="space-y-2">
          <p className="text-label text-white/55">
            These come from your own contacts. Nothing is added until you keep one.
          </p>
          {/* The shared deck, not a bespoke chip pair: it brings the reason
              chips, the "why am I seeing this" badge and the undo that the
              lane's own Accept/Skip buttons never had. The narrow half of the
              pair is handled above, where the deck takes the whole screen. */}
          <SwipeCockpit config={proposalConfig} onExit={() => setProposals(null)} />
        </section>
      )}

      {error ? (
        <p data-testid="pilot-error" className="text-body text-rose-100/80" role="alert">
          {error === 'not_signed_in'
            ? 'This phone is not signed in to Control Center, so the list cannot be read. Open it once on a signed-in browser.'
            : `The list could not be read (${error}). It retries every minute.`}
        </p>
      ) : targets.length === 0 ? (
        <p data-testid="pilot-empty" className="text-body text-white/45">{emptyLine}</p>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {targets.map(t => (
            <PilotCard key={t.id} target={t} onChanged={refetch} />
          ))}
        </div>
      )}
    </div>
  )
}

export function DesktopPilots() {
  return <PilotsBody narrow={false} />
}
