import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, Users } from '@/lib/icons'
import { BoardSkeleton } from '../shared/Skeleton'
import { FreshnessLine } from '../shared/FreshnessLine'
import { Working } from '../shared/Working'
import { useToast } from '../shared/Toast'
import { PilotCard } from '../pilotDeals/PilotCard'
import { BottomSheet } from '../mobile/BottomSheet'
import { TriageDeck } from '../shared/TriageDeck'
import { SwipeCockpit } from '../shared/SwipeCockpit'
import { buildPilotTriageConfig, buildPilotLadderConfig } from '../../lib/triageConfig'
import { degradedWords } from '../../lib/degradedWords'
import type { PilotDealItem } from '../../lib/triageConfig'
import { feedbackVote } from '../../lib/triageActions'
import {
  addPilotDeal, ADVISORY_LABEL, patchPilot, PILOT_STATE_LABEL, PILOT_STATES, seedPilots, usePilots,
} from '../../hooks/usePilots'
import type { PilotDealRow, PilotProposal, PilotState } from '../../hooks/usePilots'

// Pilots, job 1 (docs/plans/one-swing/CHARTER.md): the 25 leaders who fit
// the face. The OS drafts, Krish sends. Listed and drafted show by default
// because that is where the work waits; every other state is one chip away
// so a sent approach can be moved along when the reply comes.

// What the page is, why it matters, what to do next — the three questions the
// lane failed to answer on a phone, where the explanation never rendered at all.
// The offer is the door from `api/_mission.ts`, restated in the second person;
// `api/` is server-only so the constant cannot be imported here.
export const PILOT_PURPOSE = 'People you already know who could pay for a three week pilot.'
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
  /** True while a swiped draft is actually running, so the deck holds rather
   *  than letting a second card take the gesture mid-flight. */
  const [drafting, setDrafting] = useState(false)
  const [openDeal, setOpenDeal] = useState<PilotDealRow | null>(null)
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

  // The ladder deck: listed and drafted deals, swiped one at a time. Built
  // here rather than inside the narrow branch so the identity of the config is
  // stable across renders and the deck does not lose its place.
  const ladder = useMemo(() => buildPilotLadderConfig(
    targets as unknown as PilotDealItem[],
    { toast },
    {
      advance: async (d, next) => {
        setDrafting(true)
        try {
          await patchPilot(d.id, { state: next })
          refetch()
          return true
        } catch (err) {
          toast(`Could not move them on: ${(err as Error)?.message || 'try again'}`, 'error')
          return false
        } finally {
          setDrafting(false)
        }
      },
      notNow: async (d, code) => {
        try {
          await patchPilot(d.id, { state: 'not_now' })
          if (code) await feedbackVote('pilot_deals', d.id, -1, code)
          refetch()
          return true
        } catch (err) {
          toast(`Could not park them: ${(err as Error)?.message || 'try again'}`, 'error')
          return false
        }
      },
      // Paid needs a number, so the gesture hands off to the card's modal.
      bounce: d => setOpenDeal(targets.find(t => t.id === d.id) ?? null),
    },
    loading,
  ), [targets, loading, toast, refetch])

  // The deck owns the phone screen when proposals are up. Visibility already
  // does this (`MobileGuests` returns a `scroll="none"` shell while triaging);
  // this lane gave the deck a fixed 540px box inside the page scroller instead,
  // so the page and the cards fought each other under the thumb. The shell is
  // owned by `MobilePilots`, so the lane reports the mode and the shell reacts.
  const deckOwnsScreen = narrow && !!proposals && proposals.length > 0
  useEffect(() => { onDeckActive?.(deckOwnsScreen) }, [deckOwnsScreen, onDeckActive])

  const header = !narrow && (
    <header>
      <h1 className="text-title font-semibold text-ink tracking-tight flex items-center gap-2">
        <Users size={20} className="text-violet-300" />
        {ADVISORY_LABEL}
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
  // The stage is the shared swipe deck, the same one every other lane uses.
  //
  // This was a pager first, and the argument for it was that a nine rung
  // ladder with named moves is not a direction and a mis-swipe would move
  // someone's state. Krish overruled it on 2026-09-16: "The room should be a
  // swipe experience like the other tabs." He is right that a lane which
  // behaves unlike its four neighbours is the worse cost. The mis-swipe worry
  // is answered where it actually bites - the one rung that spends money goes
  // behind a five second Undo, and the one rung that needs a number bounces to
  // its modal. See buildPilotLadderConfig.
  if (narrow) {
    // No bottom padding on the frame: SwipeDeck already reserves the nav
    // clearance when narrow (safe-area + 120). Reserving it here as well
    // double counted it and left the card 156 points to render 187 into.
    return (
      <div className="flex h-full min-h-0 flex-col px-5 pt-1">
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
                onClick={() => setView(v.id)}
                className={`shrink-0 min-h-[32px] rounded-full border px-3 py-1 text-label transition-colors ${
                  on
                    ? 'border-violet-400/50 bg-violet-500/15 text-violet-100'
                    : 'border-white/10 bg-white/[0.03] text-ink-faint'
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

        {/* The stage: no scroll, no pager, the deck owns it. */}
        <div className="flex-1 min-h-0 mt-2 overflow-hidden flex flex-col">
          {ladder.items.length ? (
            <TriageDeck
              config={{ ...ladder, title: counts || 'Your pilots' }}
              paused={drafting || !!openDeal}
              onOpen={d => setOpenDeal(targets.find(t => t.id === d.id) ?? null)}
            />
          ) : (
            <p
              data-testid="pilot-empty"
              className="text-body text-ink-faint pb-[calc((env(safe-area-inset-bottom,0px)+96px)/var(--z,1))]"
            >{emptyLine}</p>
          )}
        </div>

        {/* The whole card, one tap away.
            The deck is for fast verdicts. Everything that needs reading or
            typing - the draft, the contact button, the cash amount for Paid -
            lives on PilotCard, so a tap opens it rather than the deck growing
            a second copy of any of it. "Paid" bounces here for the same
            reason: a gesture cannot supply a number. Same shape as
            MobileGuests, which pauses its deck behind a detail sheet. */}
        <BottomSheet open={!!openDeal} onClose={() => setOpenDeal(null)} ariaLabel={openDeal?.contact?.full_name || 'Pilot'}>
          {openDeal && (
            <div className="px-4 pb-4" data-testid="pilot-sheet">
              <PilotCard
                target={openDeal}
                narrow
                onChanged={() => { refetch(); setOpenDeal(null) }}
              />
            </div>
          )}
        </BottomSheet>
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
        <p className="text-body text-ink-muted leading-snug">{PILOT_PURPOSE}</p>
        <details className="group rounded-xl border border-white/[0.06] bg-white/[0.01]">
          <summary className="flex cursor-pointer list-none items-baseline gap-2 px-3 py-2">
            <span className="text-label text-ink-faint">Why these people</span>
            <span className="ml-auto text-micro text-ink-faint group-open:hidden">Show</span>
            <span className="ml-auto hidden text-micro text-ink-faint group-open:inline">Hide</span>
          </summary>
          <div className="space-y-1.5 px-3 pb-3">
            <p className="text-label text-ink-faint leading-snug">{PILOT_OFFER}</p>
            <p className="text-label text-ink-faint leading-snug">{progressLine(stateCounts)}</p>
          </div>
        </details>
      </section>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p data-testid="pilot-counts" className="text-label text-ink-faint">
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
                    : 'border-white/10 bg-white/[0.03] text-ink-faint hover:bg-white/[0.06]'
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
          <p className="text-label text-ink-faint">
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
        <p data-testid="pilot-empty" className="text-body text-ink-faint">{emptyLine}</p>
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
