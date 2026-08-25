import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from '@/lib/icons'
import { DrawnCheck } from '../shared/DrawnCheck'
import type { useContentV2 } from '../../hooks/useContentV2'
import type { ContentDecisionRow } from '../../lib/contentV2'
import { reasonsFor } from '../../lib/triageReasons'
import { feedbackVote } from '../../lib/triageActions'
import { useLikelyReasons } from '../../hooks/useLikelyReasons'
import { RejectReasonBar } from '../shared/RejectReasonBar'
import { Skeleton } from '../shared/Skeleton'
import { useToast } from '../shared/Toast'

// The whole mobile job (mockup set 2, pin 11): the week's finite decision
// queue, one card at a time, every action in the bottom thumb zone. Finishable
// in a coffee line; when it hits zero it says so and means it (the queue is a
// real count, never a filtered view over a hidden pile).
//
// Browsing and deciding are two different acts, and the deck now honors both.
// SWIPE (or the chevrons) moves back and forth through every waiting card
// freely, wrapping at the ends, resolving nothing: that is how perspective on
// what to keep or cull gets built. The BUTTONS decide. Deciding removes the
// card and the deck closes ranks; the count only ever moves because something
// was actually decided.
//
// Every card also carries a REJECT path, because clearing a card and judging it
// are two more different acts. "Skip for the desktop sitting" defers and teaches
// nothing. "Not for me" bins it and asks one question, answerable in one tap,
// and that answer is the −1 Vera clusters by reason code. Without it Krish could
// open a brief he had no appetite for and had no way to say so, which is how the
// engine kept assembling the same subject back at him.

const KIND_CHIP: Record<string, { label: string; cls: string }> = {
  brief_review: { label: 'Weekly brief', cls: 'bg-sky-400/15 text-sky-300' },
  shift_proposal: { label: 'New shift spotted', cls: 'bg-emerald-400/15 text-emerald-300' },
  shift_fading: { label: 'Shift going quiet', cls: 'bg-amber-400/15 text-amber-300' },
  graduation: { label: 'Keep for good?', cls: 'bg-sky-400/15 text-sky-300' },
  purge_preview: { label: 'Expiring Monday', cls: 'bg-amber-400/15 text-amber-300' },
  investigation: { label: 'Investigation', cls: 'bg-violet-400/15 text-violet-300' },
}

/** Swipe distance that commits a navigation. Under it, the card snaps home. */
const SWIPE_COMMIT_PX = 64

function Big({ children, tone = 'ghost', onClick, disabled }: {
  children: string; tone?: 'primary' | 'green' | 'ghost'; onClick: () => void; disabled?: boolean
}) {
  const cls = tone === 'green' ? 'bg-emerald-400 text-emerald-950'
    : tone === 'primary' ? 'btn-contrast'
    : 'bg-white/[0.06] text-white/75 border border-white/10'
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full rounded-xl py-3.5 text-body font-bold disabled:opacity-40 ${cls}`}
    >
      {children}
    </button>
  )
}

export function MobileDecisionDeck({ v2 }: { v2: ReturnType<typeof useContentV2> }) {
  const { decisions, brief, loading } = v2
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(0)
  const { toast } = useToast()

  // Where the browse sits in the queue. Navigation moves it; deciding a card
  // removes the card under it and the position clamps to the survivor.
  const [pos, setPos] = useState(0)

  // Live swipe state: the card follows the finger, then commits or snaps back.
  const [dragX, setDragX] = useState(0)
  const [dragging, setDragging] = useState(false)
  // True only while the card is repositioned off-screen between cards, so
  // the jump to the far side is never animated or seen.
  const [swapping, setSwapping] = useState(false)
  const exiting = useRef(false)
  const dragStart = useRef<number | null>(null)

  // Brief first (the anchor decision), then shifts, then the rest.
  const queue = useMemo(() => {
    const order: Record<string, number> = { brief_review: 0, investigation: 1, shift_proposal: 2, shift_fading: 3, graduation: 4, purge_preview: 5 }
    return [...decisions].sort((a, b) => (order[a.kind] ?? 9) - (order[b.kind] ?? 9))
  }, [decisions])

  // Keep the position on a real card when the queue shrinks or reloads.
  useEffect(() => {
    if (queue.length && pos >= queue.length) setPos(queue.length - 1)
  }, [queue.length, pos])

  const current = queue.length ? queue[Math.min(pos, queue.length - 1)] : null
  const total = queue.length + done

  // Krish: "the animation doesnt have me feel like the card is swiping away,
  // even though the next card does appear."
  // Cause: go() changed the index and zeroed dragX in the same tick, so the card
  // TELEPORTED back to centre while its content swapped underneath. Nothing ever
  // left the screen, which is why the gesture registered but the motion did not.
  // Now the card finishes the throw first, then the content swaps behind it, then
  // it returns from the opposite edge.
  const go = (dir: 1 | -1) => {
    if (queue.length < 2) { setDragX(0); return }
    if (exiting.current) return
    exiting.current = true
    const w = typeof window === 'undefined' ? 400 : window.innerWidth
    // 1. finish the throw, off-screen and clear of the edge
    setDragX(dir === 1 ? -Math.round(w * 1.15) : Math.round(w * 1.15))
    window.setTimeout(() => {
      // 2. swap content while the card is out of sight, and park it on the far
      //    side with transitions suppressed so the reposition is never seen
      setSwapping(true)
      setPos(p => (p + dir + queue.length) % queue.length)
      setDragX(dir === 1 ? Math.round(w * 0.5) : -Math.round(w * 0.5))
      // 3. next frame, re-enable transitions and let it settle into place
      requestAnimationFrame(() => requestAnimationFrame(() => {
        setSwapping(false)
        setDragX(0)
        exiting.current = false
      }))
    }, 200)
  }

  const onPointerDown = (e: React.PointerEvent) => {
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    dragStart.current = e.clientX
    setDragging(true)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (dragStart.current === null) return
    setDragX(e.clientX - dragStart.current)
  }
  const endDrag = () => {
    if (dragStart.current === null) return
    dragStart.current = null
    setDragging(false)
    // Swipe left brings the next card, swipe right brings the previous one.
    if (dragX <= -SWIPE_COMMIT_PX) go(1)
    else if (dragX >= SWIPE_COMMIT_PX) go(-1)
    else setDragX(0)
  }

  // A failed ruling must not count as a decision. This was a bare try/finally
  // around a fetch wrapper that throws on any non-OK response, so a 409 or a
  // 500 still incremented `done` and still moved the deck on - the card came
  // back on the next refresh with no explanation.
  const act = async (fn: () => Promise<void>) => {
    setBusy(true)
    try {
      await fn()
      setDone(d => d + 1)
    } catch (e) {
      toast(`Could not save that: ${(e as Error)?.message || 'try again'}`, 'error')
    } finally {
      setBusy(false)
    }
  }

  // Reject flow: tapping "Not for me" swaps the thumb zone for the reason bar,
  // so the question lands where the thumb already is instead of in a modal that
  // covers the card being judged.
  const [rejecting, setRejecting] = useState(false)
  const rejectReasons = reasonsFor('content_decisions')

  // Browsing away closes the question. An open reason bar belongs to the card
  // that opened it, and must never answer for the one that replaced it.
  useEffect(() => { setRejecting(false) }, [current?.id])

  // Prefetched on the card, not on the tap: the prediction costs an embedding
  // and a vector search, and the one place that latency must not land is
  // between deciding to bin something and being asked why.
  const likely = useLikelyReasons(
    current && current.kind !== 'purge_preview' ? current.id : null)

  // A shift ruling lives on its own endpoint (which resolves its own card), so
  // there the ruling and the lesson are two calls. Everything else rejects in
  // one. The vote is best-effort in both: the card is already gone, and telling
  // Krish his tap failed because a learning write missed would be a lie.
  const submitReject = async (reasonCode?: string, reasonText?: string) => {
    if (!current) return
    const d = current
    setRejecting(false)
    await act(async () => {
      if (d.kind === 'shift_proposal' || d.kind === 'shift_fading') {
        await v2.ruleShift(d.ref, 'dismiss', { note: reasonText || null })
        void feedbackVote('content_decisions', d.id, -1, 'cleo', reasonCode || 'content_other', reasonText, {
          kind: d.kind, ref: d.ref, week: d.week, surface: 'content_v2_week',
        })
      } else {
        await v2.rejectDecision(d.id, reasonCode, reasonText)
      }
    })
  }

  if (loading) {
    return (
      <div className="flex flex-col h-full min-h-0 gap-4 animate-rise" aria-busy="true" role="status" aria-label="Loading">
        <Skeleton h={12} w={132} r={5} />
        <Skeleton h={22} w="70%" r={6} />
        <div className="flex-1 min-h-0"><Skeleton h="100%" r={20} /></div>
        <div className="flex gap-2.5">
          <Skeleton h={48} r={16} className="flex-1" />
          <Skeleton h={48} r={16} className="flex-1" />
        </div>
      </div>
    )
  }

  if (!current) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-6 text-center gap-3">
        <DrawnCheck size={44} stroke="rgb(52 211 153)" />
        <div className="text-white/90 font-bold text-lede">All decided for this week</div>
        <p className="text-white/45 text-body max-w-[26ch]">
          Nothing is waiting on you. New decisions will show up here when they are ready.
        </p>
        {brief && ['approved', 'pushed', 'sent'].includes(brief.status) ? (
          <p className="text-emerald-300/80 text-label">Brief {brief.status}. See you Friday.</p>
        ) : null}
      </div>
    )
  }

  const d = current as ContentDecisionRow
  const p = d.payload as Record<string, any>
  const chip = KIND_CHIP[d.kind] || { label: d.kind, cls: 'bg-white/[0.06] text-white/55' }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* progress + browse position */}
      <div className="flex-shrink-0 px-1 pb-3">
        <div className="flex gap-1 mb-2">
          {Array.from({ length: total || 1 }, (_, i) => (
            <span key={i} className={`h-[3px] flex-1 rounded-full ${i < done ? 'bg-emerald-400' : 'bg-white/10'}`} />
          ))}
        </div>
        <div className="flex items-center justify-between">
          <div className="text-micro text-white/40 tabular-nums">
            {pos + 1} of {queue.length} to decide{done ? ` · ${done} done` : ''} · about {Math.max(1, Math.round(queue.length * 0.7))} min
          </div>
          {queue.length > 1 && (
            <div className="flex items-center gap-1">
              <button
                aria-label="Previous card"
                onClick={() => go(-1)}
                className="inline-flex min-w-[40px] min-h-[32px] items-center justify-center rounded-lg text-white/45 hover:text-white/85 hover:bg-white/[0.06]"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                aria-label="Next card"
                onClick={() => go(1)}
                className="inline-flex min-w-[40px] min-h-[32px] items-center justify-center rounded-lg text-white/45 hover:text-white/85 hover:bg-white/[0.06]"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* the one card: swipe left / right to browse, wrapping at the ends */}
      <div className="flex-1 min-h-0 flex flex-col">
        <div
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          style={{
            touchAction: 'pan-y',
            transform: `translateX(${dragX}px) rotate(${dragX / 60}deg)`,
            // Opacity must NOT race the travel: fading while it flies is what
            // makes a throw read as a disappear. It stays legible on the way out.
            opacity: swapping ? 0 : 1 - Math.min(0.25, Math.abs(dragX) / 900),
            transition: dragging || swapping
              ? 'none'
              : 'transform 200ms cubic-bezier(0.32,0,0.67,0), opacity 140ms ease-out',
          }}
          className={`rounded-2xl border p-5 select-none cursor-grab active:cursor-grabbing ${d.kind === 'shift_proposal' ? 'border-emerald-400/25 bg-emerald-400/[0.04]' : d.kind === 'brief_review' ? 'border-sky-400/25 bg-sky-400/[0.05]' : 'border-white/[0.08] bg-white/[0.02]'}`}
        >
          <span className={`inline-block rounded-full px-2.5 py-1 text-micro font-semibold ${chip.cls}`}>{chip.label}</span>
          <h3 className="text-lede font-bold text-white mt-3 leading-snug">
            {d.kind === 'brief_review' ? (p.title || 'This week’s brief')
              : d.kind === 'investigation' ? `Investigation ready: ${p.anchor_headline || 'this week'}`
              : d.kind === 'purge_preview' ? `${p.expiring ?? 0} time-sensitive items expire Monday`
              : (p.title || '')}
          </h3>
          <p className="text-label text-white/50 mt-2 leading-relaxed">
            {d.kind === 'brief_review' ? `${p.headlines ?? '?'} headlines, put together on Friday. Read it, fix anything weak with the edit chips, then send it out.`
              : d.kind === 'shift_proposal' ? `This kept coming up on its own: ${p.stories ?? '?'} stories over ${p.day_span ?? '?'} days from ${p.sources ?? '?'} different sources.${p.nearest?.title ? ` The closest one you already track: ${p.nearest.title}.` : ''}`
              : d.kind === 'shift_fading' ? `No new evidence since ${p.last_evidence_on || 'a while ago'}.`
              : d.kind === 'investigation' ? `${p.citable_evidence ?? 0} pieces of evidence you can cite, from ${p.distinct_domains ?? 0} sites and ${p.distinct_origins ?? 0} original sources.`
              : d.kind === 'graduation' ? 'This has been used for weeks and still holds up. Keep it in the Library for good?'
              : 'Nothing to do here. Anything worth keeping has already been kept.'}
          </p>
          {d.kind === 'shift_proposal' && p.summary ? (
            <p className="text-label text-emerald-200/70 mt-2 leading-relaxed">{p.summary}</p>
          ) : null}
          {queue.length > 1 && (
            <p className="text-micro text-white/25 mt-3">Swipe to look through the cards. The buttons make the call.</p>
          )}
        </div>

        {/* thumb zone — the reason bar takes it over while a reject is being
            answered, so the question sits under the thumb that asked it */}
        <div className="mt-auto pt-4 pb-2 flex flex-col gap-2">
          {rejecting ? (
            <RejectReasonBar
              title="Why bin it?"
              reasons={rejectReasons}
              onChoose={submitReject}
              onCancel={() => setRejecting(false)}
              cancelLabel="Keep it"
              likely={likely}
            />
          ) : (
          <>
          {d.kind === 'brief_review' ? (
            <>
              <Big tone="primary" disabled={busy} onClick={() => { window.location.hash = `#/content?brief=${d.week}` }}>
                Open the brief
              </Big>
              <Big disabled={busy} onClick={() => act(() => v2.resolveDecision(d.id, 'dismiss', 'skipped on mobile'))}>
                Skip until I&rsquo;m at my desk
              </Big>
            </>
          ) : d.kind === 'shift_proposal' ? (
            <>
              <Big tone="green" disabled={busy} onClick={() => act(() => v2.ruleShift(d.ref, 'accept'))}>Track this shift</Big>
              {/* This card's own no already exists, so it carries the reason
                  rather than sitting beside a second, near-identical no. */}
              <Big disabled={busy} onClick={() => setRejecting(true)}>Not a shift</Big>
            </>
          ) : d.kind === 'shift_fading' ? (
            <>
              <Big tone="primary" disabled={busy} onClick={() => act(() => v2.ruleShift(d.ref, 'retire'))}>Close it out</Big>
              <Big disabled={busy} onClick={() => act(() => v2.ruleShift(d.ref, 'keep_watching'))}>Keep watching</Big>
            </>
          ) : d.kind === 'graduation' ? (
            <>
              <Big tone="green" disabled={busy} onClick={() => act(() => v2.resolveDecision(d.id, 'done'))}>Keep it in the Library</Big>
              <Big disabled={busy} onClick={() => act(() => v2.resolveDecision(d.id, 'dismiss'))}>Let it go</Big>
            </>
          ) : (
            <Big tone="primary" disabled={busy} onClick={() => act(() => v2.resolveDecision(d.id, 'done'))}>Got it</Big>
          )}

          {/* The reject, on the cards that offer something without already
              having a no. purge_preview is a notice rather than an offer.
              shift_fading's two verdicts already cover the ground, and
              shift_proposal carries the reason on its own "Not a shift". */}
          {!['purge_preview', 'shift_fading', 'shift_proposal'].includes(d.kind) ? (
            <button
              onClick={() => setRejecting(true)}
              disabled={busy}
              className="w-full rounded-xl py-3 text-body font-semibold text-rose-300/85 border border-rose-400/25 bg-rose-500/[0.06] active:scale-[0.98] transition disabled:opacity-40"
            >
              Not for me
            </button>
          ) : null}
          </>
          )}
        </div>
      </div>
    </div>
  )
}
