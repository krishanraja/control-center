import React, { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, Gavel } from '@/lib/icons'
import { useToast } from '../shared/Toast'
import { Working } from '../shared/Working'
import { BTN_GHOST, BTN_PRIMARY, Chip, EmptyNote, INPUT_CLS, ProductChip, SectionHead } from './atoms'
import { asList, asPairs, dayLabel, mondayOf, shortDate, type CouncilReviewRow } from '../../lib/growth'
import type { GrowthData } from '../../hooks/useGrowth'
import { SkeletonList } from '../shared/Skeleton'
import { useDailyFocus } from '../../hooks/useDailyFocus'
import { civilYmd } from '../../lib/civilDate'
import { requestOk, failureMessage } from '../../lib/apiFetch'

/**
 * C) THE WEEKLY REVIEW: the growth council's verdicts, newest week first.
 *
 * Findings, kill list and double-down come from the council workflow (a join of
 * the attribution warehouse, Stripe and channel stats against the map). The
 * only thing this surface writes is Krish's ruling, through /api/growth/council.
 *
 * Insight first, evidence second (2026-09-08). The council has always written
 * a one-sentence headline and a list of next moves; the first version of this
 * surface buried the headline as one "key: value" row among eight, in a
 * three-column grid a phone stacked into a wall. Krish: "It's just data. It's
 * not insight. There's a pass missing where we turn data into insight, figure
 * out what's important, and actually link something to action." The pass
 * already runs on Sunday; the surface just never led with its output. Now:
 *
 *   1. the headline, large, the one sentence that matters this week;
 *   2. "Do next": the council's moves, each with two ways to act on it right
 *      here: put it on today's list, or make it a clip on the board;
 *   3. "Stop": the kill list, when there is one;
 *   4. the evidence, folded, for when the sentence needs checking;
 *   5. the ruling.
 *
 * The empty state says nothing has been written yet. It never fabricates a
 * review to make the tab look alive.
 */

export function CouncilFeed({ g, variant, onNavigate, focusSignal = 0 }: {
  g: GrowthData
  variant: 'desktop' | 'mobile'
  onNavigate?: (tab: string, params?: Record<string, string>) => void
  /** Bumped by the tab's "Do this next" button. Scrolls the first review that
   *  still owes a ruling into view and opens its box, the same way
   *  `composeSignal` opens the clip composer on the board. */
  focusSignal?: number
}) {
  const undecided = g.reviews.filter(r => !r.krish_decision).length
  const firstWaiting = g.reviews.find(r => !r.krish_decision)?.id || null

  if (g.loading) {
    return <div className="space-y-4 pb-8"><SkeletonList rows={3} /></div>
  }

  return (
    <div className="space-y-4 pb-8">
      <SectionHead
        title={variant === 'desktop' ? 'Weekly review' : undefined}
        sub={
          g.reviews.length
            ? `${g.reviews.length} review${g.reviews.length === 1 ? '' : 's'}, ${undecided} waiting on your ruling.${variant === 'desktop' ? ' One per product, written every Sunday from the real numbers.' : ''}`
            : variant === 'desktop' ? 'One verdict per product, written every Sunday from the real numbers: what to stop, what to do next.' : undefined
        }
      />

      {g.reviews.length === 0 ? (
        <EmptyNote>
          No review has been written yet. The council writes one per product every Sunday from revenue, traffic,
          the AI answer probes and the map. Nothing shows here until a real one exists.
        </EmptyNote>
      ) : (
        g.reviews.map(r => (
          <ReviewCard
            key={r.id}
            review={r}
            g={g}
            variant={variant}
            onNavigate={onNavigate}
            firstWaiting={r.id === firstWaiting}
            focusSignal={r.id === firstWaiting ? focusSignal : 0}
          />
        ))
      )}
    </div>
  )
}

/** snake_case finding keys as words. "structural_blocker_seo" reads "structural blocker seo". */
function keyLabel(k: string): string {
  return k.replace(/_/g, ' ').replace(/^#/, 'finding ')
}

function ReviewCard({ review, g, variant, onNavigate, firstWaiting = false, focusSignal = 0 }: {
  review: CouncilReviewRow
  g: GrowthData
  variant: 'desktop' | 'mobile'
  onNavigate?: (tab: string, params?: Record<string, string>) => void
  /** The one review the tab's hero points at. Carries the test id so there is
   *  exactly one, however many reviews still owe a ruling. */
  firstWaiting?: boolean
  focusSignal?: number
}) {
  const { toast } = useToast()
  const { today, refresh: refreshFocus } = useDailyFocus()
  const [editing, setEditing] = useState(false)
  const [ruling, setRuling] = useState(variant === 'desktop')
  const [text, setText] = useState(review.krish_decision || '')
  const [saving, setSaving] = useState(false)
  const [evidenceOpen, setEvidenceOpen] = useState(false)
  const [acting, setActing] = useState<string | null>(null)

  // The tab's "Do this next" button used to only set the section, so pressing
  // "Read the review" while Review was already the open section did nothing at
  // all: the one moment it was most likely to be pressed was the one moment it
  // was dead. Now it points at this card, which brings itself into view and
  // opens the box the ruling is typed into.
  const cardRef = useRef<HTMLElement>(null)
  useEffect(() => {
    if (focusSignal <= 0) return
    setRuling(true)
    cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [focusSignal])

  // `degraded` is a marker, not a finding: it says the writing pass never ran,
  // which is why the kill and double-down columns below are empty. Left in the
  // findings list it read as one more observation about the business.
  const raw = (review.findings && typeof review.findings === 'object' && !Array.isArray(review.findings))
    ? (review.findings as Record<string, unknown>)
    : null
  const degraded = raw?.degraded
  const degradedNote = typeof degraded === 'string' ? degraded : null
  const headline = typeof raw?.headline === 'string' ? raw.headline : null
  const measured = typeof raw?.measured === 'string' ? raw.measured : null
  const findings = useMemo(
    () => asPairs(review.findings).filter(f => !['degraded', 'headline', 'measured'].includes(f.key)),
    [review.findings],
  )
  const kill = asList(review.kill_list)
  const doubleDown = asList(review.double_down)

  const record = async () => {
    setSaving(true)
    try {
      await g.recordDecision(review.id, text.trim())
      setEditing(false)
      toast(text.trim() ? 'Ruling recorded.' : 'Ruling cleared.', 'success')
    } catch (e) {
      toast(failureMessage(e, 'Could not record it.'), 'error')
    } finally {
      setSaving(false)
    }
  }

  // A move becomes today's work through the one write path for a Today slot
  // (POST /api/daily-focus/slot, the same route the Home list uses). First
  // empty slot; a full day says so instead of overwriting one.
  const putOnToday = async (move: string) => {
    const free = ([1, 2, 3] as const).find(n => !(today?.[`target_${n}_text`] as string | null)?.trim())
    if (!free) { toast("Today's 3 are full. Finish one first, or edit a slot on Home.", 'info'); return }
    setActing(move)
    try {
      await requestOk('/api/daily-focus/slot', {
        method: 'POST',
        body: { date: today?.focus_date ?? civilYmd(new Date()), slot: free, text: move.slice(0, 240) },
        timeoutMs: 12_000,
      })
      refreshFocus()
      toast(`On today's list, slot ${free}.`, 'success', { action: { label: 'Open Home', onClick: () => onNavigate?.('home') } })
    } catch (e) {
      toast(failureMessage(e, 'Could not put it on today.'), 'error')
    } finally {
      setActing(null)
    }
  }

  // Or it becomes a clip on the board, in this week's batch, with the
  // review named in the brief so the card remembers where it came from.
  const makeCard = async (move: string) => {
    setActing(move)
    try {
      await g.addCard({
        product_slug: review.product_slug,
        title: move.length > 120 ? `${move.slice(0, 118)}...` : move,
        brief: `From the weekly review, week of ${shortDate(review.week_start)}: ${move}`,
        batch_week: mondayOf(new Date()),
        touchpoint_id: null,
      })
      toast('On the board as a clip to make.', 'success', { action: { label: 'Open To do', onClick: () => onNavigate?.('growth', { section: 'work' }) } })
    } catch (e) {
      toast(failureMessage(e, 'Could not add the clip.'), 'error')
    } finally {
      setActing(null)
    }
  }

  return (
    <article
      ref={cardRef}
      data-testid={firstWaiting ? 'growth-review-waiting' : undefined}
      className="rounded-xl border border-white/[0.07] bg-white/[0.015] p-4 flex flex-col gap-3 min-w-0"
    >
      <header className="flex items-center gap-2 flex-wrap">
        <ProductChip slug={review.product_slug} />
        <span className="text-label font-semibold text-white/85">Week of {shortDate(review.week_start)}</span>
        <span className="flex-1" />
        {review.krish_decision ? (
          <Chip tone="text-emerald-300 border-emerald-500/25">
            ruled{review.decided_at ? ` ${dayLabel(review.decided_at)}` : ''}
          </Chip>
        ) : (
          <Chip tone="text-amber-300 border-amber-500/30">waiting on you</Chip>
        )}
      </header>

      {/* An outage and a quiet week produce the same empty columns. Only this
          line separates "nothing to kill" from "nobody looked". */}
      {degradedNote && (
        <p className="rounded-lg border border-amber-500/25 bg-amber-500/[0.07] px-2.5 py-1.5 text-label leading-snug text-amber-200/90">
          <span className="font-semibold uppercase tracking-[0.14em] text-amber-300/75">Numbers only</span>{' '}
          The writing pass did not run this week, so there is no verdict, only the measured line below.
        </p>
      )}

      {/* 1. The sentence. */}
      {headline ? (
        <p className="text-lede font-semibold text-white leading-snug break-words">{headline}</p>
      ) : measured ? (
        <p className="text-body text-white/80 leading-snug break-words">{measured}</p>
      ) : null}

      {/* 2. The moves, each with a way to act on it now. */}
      {doubleDown.length > 0 && (
        <div className="flex flex-col gap-2">
          <h4 className="text-micro uppercase tracking-[0.14em] text-emerald-300/80 font-semibold">Do next</h4>
          <ol className="flex flex-col gap-2.5">
            {doubleDown.map((d, i) => (
              <li key={i} className="flex flex-col gap-1.5 min-w-0">
                <p className="text-body text-white/85 leading-snug break-words">
                  <span className="text-white/35 tabular-nums mr-1.5">{i + 1}.</span>{d}
                </p>
                <div className="flex items-center gap-1.5 flex-wrap pl-5">
                  <button type="button" disabled={acting != null} onClick={() => void putOnToday(d)} className={`${BTN_GHOST} inline-flex items-center gap-1.5 min-h-[32px]`}>
                    {acting === d ? <Working size={11} /> : null}Put on today
                  </button>
                  <button type="button" disabled={acting != null} onClick={() => void makeCard(d)} className={`${BTN_GHOST} min-h-[32px]`}>
                    Make it a clip
                  </button>
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* 3. What to stop. Only when the council named something. */}
      {kill.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <h4 className="text-micro uppercase tracking-[0.14em] text-rose-300/80 font-semibold">Stop</h4>
          <ul className="flex flex-col gap-1">
            {kill.map((k, i) => <li key={i} className="text-body text-white/80 leading-snug break-words">{k}</li>)}
          </ul>
        </div>
      )}

      {!degradedNote && doubleDown.length === 0 && kill.length === 0 && (
        <p className="text-label text-white/40">The council proposed nothing to start or stop this week.</p>
      )}

      {/* 4. The evidence, folded. */}
      {(findings.length > 0 || measured) && (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => setEvidenceOpen(o => !o)}
            aria-expanded={evidenceOpen}
            className="inline-flex items-center gap-1.5 text-label text-white/45 hover:text-white/70 self-start min-h-[36px]"
          >
            <ChevronDown size={13} className={`transition-transform ${evidenceOpen ? 'rotate-180' : ''}`} />
            {evidenceOpen ? 'Hide the evidence' : `Why: the evidence (${findings.length})`}
          </button>
          {evidenceOpen && (
            <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3 flex flex-col gap-2.5">
              {findings.map(f => (
                <div key={f.key} className="min-w-0">
                  <p className="text-micro uppercase tracking-[0.14em] text-white/35 font-semibold">{keyLabel(f.key)}</p>
                  <p className="text-label text-white/70 leading-snug break-words">{f.value}</p>
                </div>
              ))}
              {measured && (
                <div className="min-w-0 pt-1 border-t border-white/[0.05]">
                  <p className="text-micro uppercase tracking-[0.14em] text-white/35 font-semibold">Measured</p>
                  <p className="text-micro text-white/45 leading-snug break-words font-mono">{measured}</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* 5. The ruling. */}
      <div className="pt-3 border-t border-white/[0.06]">
        {review.krish_decision && !editing ? (
          <div className="flex items-start gap-2">
            <Gavel size={13} className="text-emerald-300 mt-0.5 flex-shrink-0" />
            <p className="text-label text-white/80 leading-relaxed flex-1 break-words">{review.krish_decision}</p>
            <button type="button" onClick={() => { setEditing(true); setRuling(true); setText(review.krish_decision || '') }} className={BTN_GHOST}>
              Change
            </button>
          </div>
        ) : !ruling ? (
          <button type="button" onClick={() => setRuling(true)} className={`${BTN_PRIMARY} inline-flex items-center gap-1.5`}>
            <Gavel size={12} /> Rule on this
          </button>
        ) : (
          <div className="space-y-2">
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              rows={2}
              autoFocus={variant === 'mobile'}
              placeholder="Your call. What stops, what gets pressed, and why."
              className={INPUT_CLS}
            />
            <div className="flex gap-2">
              <button type="button" onClick={record} disabled={saving} className={`${BTN_PRIMARY} inline-flex items-center gap-1.5`}>
                {saving ? <Working size={11} /> : null}Record the ruling
              </button>
              {(editing || variant === 'mobile') && (
                <button type="button" onClick={() => { setEditing(false); setRuling(variant === 'desktop'); setText(review.krish_decision || '') }} className={BTN_GHOST}>
                  Cancel
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </article>
  )
}
