import React, { useState } from 'react'
import { Gavel } from 'lucide-react'
import { useToast } from '../shared/Toast'
import { BTN_GHOST, BTN_PRIMARY, Chip, EmptyNote, INPUT_CLS, ProductChip, SectionHead } from './atoms'
import { asList, asPairs, dayLabel, shortDate, type CouncilReviewRow } from '../../lib/growth'
import type { GrowthData } from '../../hooks/useGrowth'
import { SkeletonList } from '../shared/Skeleton'

/**
 * C) THE COUNCIL FEED: the weekly growth council, newest week first.
 *
 * Findings, kill list and double-down come from the council workflow (a join of
 * the attribution warehouse, Stripe and channel stats against the map). The
 * only thing this surface writes is Krish's ruling, through /api/growth/council.
 *
 * The empty state says nothing has been written yet. It never fabricates a
 * review to make the tab look alive.
 */

export function CouncilFeed({ g }: { g: GrowthData }) {
  const undecided = g.reviews.filter(r => !r.krish_decision).length

  if (g.loading) {
    return <div className="space-y-4 pb-8"><SkeletonList rows={3} /></div>
  }

  return (
    <div className="space-y-4 pb-8">
      <SectionHead
        title="Council feed"
        sub={
          g.reviews.length
            ? `${g.reviews.length} review${g.reviews.length === 1 ? '' : 's'}, ${undecided} still waiting on your ruling.`
            : 'The weekly kill and double-down call, once the council has written one.'
        }
      />

      {g.reviews.length === 0 ? (
        <EmptyNote>
          No council reviews have been written yet. This feed fills from growth_council_reviews, one row per product per
          week, produced by the council workflow that joins revenue and channel data against the touchpoint map.
          Nothing is shown here until a real review row exists.
        </EmptyNote>
      ) : (
        g.reviews.map(r => <ReviewCard key={r.id} review={r} g={g} />)
      )}
    </div>
  )
}

function ReviewCard({ review, g }: { review: CouncilReviewRow; g: GrowthData }) {
  const { toast } = useToast()
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(review.krish_decision || '')
  const [saving, setSaving] = useState(false)

  const findings = asPairs(review.findings)
  const kill = asList(review.kill_list)
  const doubleDown = asList(review.double_down)

  const record = async () => {
    setSaving(true)
    try {
      await g.recordDecision(review.id, text.trim())
      setEditing(false)
      toast(text.trim() ? 'Decision recorded.' : 'Decision cleared.', 'success')
    } catch (e) {
      toast(`Could not record: ${String(e)}`, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <article className="rounded-xl border border-white/[0.07] bg-white/[0.015] p-4">
      <header className="flex items-center gap-2 flex-wrap">
        <ProductChip slug={review.product_slug} />
        <span className="text-label font-semibold text-white/85">Week of {shortDate(review.week_start)}</span>
        <span className="flex-1" />
        {review.krish_decision ? (
          <Chip tone="text-emerald-300 border-emerald-500/25">
            decided{review.decided_at ? ` ${dayLabel(review.decided_at)}` : ''}
          </Chip>
        ) : (
          <Chip tone="text-amber-300 border-amber-500/30">waiting on you</Chip>
        )}
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
        <div>
          <h4 className="text-micro uppercase tracking-[0.14em] text-white/35 font-semibold mb-1.5">Findings</h4>
          {findings.length ? (
            <ul className="space-y-1">
              {findings.map(f => (
                <li key={f.key} className="text-label text-white/70 leading-snug">
                  <span className="text-white/40">{f.key}: </span>{f.value}
                </li>
              ))}
            </ul>
          ) : <p className="text-label text-white/30">None recorded.</p>}
        </div>
        <div>
          <h4 className="text-micro uppercase tracking-[0.14em] text-rose-300/80 font-semibold mb-1.5">Kill</h4>
          {kill.length ? (
            <ul className="space-y-1">
              {kill.map((k, i) => <li key={i} className="text-label text-white/70 leading-snug">{k}</li>)}
            </ul>
          ) : <p className="text-label text-white/30">Nothing proposed for the chop.</p>}
        </div>
        <div>
          <h4 className="text-micro uppercase tracking-[0.14em] text-emerald-300/80 font-semibold mb-1.5">Double down</h4>
          {doubleDown.length ? (
            <ul className="space-y-1">
              {doubleDown.map((d, i) => <li key={i} className="text-label text-white/70 leading-snug">{d}</li>)}
            </ul>
          ) : <p className="text-label text-white/30">Nothing proposed to press.</p>}
        </div>
      </div>

      <div className="mt-3 pt-3 border-t border-white/[0.06]">
        {review.krish_decision && !editing ? (
          <div className="flex items-start gap-2">
            <Gavel size={13} className="text-emerald-300 mt-0.5 flex-shrink-0" />
            <p className="text-label text-white/80 leading-relaxed flex-1">{review.krish_decision}</p>
            <button type="button" onClick={() => { setEditing(true); setText(review.krish_decision || '') }} className={BTN_GHOST}>
              Change
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              rows={2}
              placeholder="Your call. What gets killed, what gets pressed, and why."
              className={INPUT_CLS}
            />
            <div className="flex gap-2">
              <button type="button" onClick={record} disabled={saving} className={BTN_PRIMARY}>
                {saving ? 'Recording…' : 'Record decision'}
              </button>
              {editing && (
                <button type="button" onClick={() => { setEditing(false); setText(review.krish_decision || '') }} className={BTN_GHOST}>
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
