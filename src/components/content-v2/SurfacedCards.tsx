import { useMemo, useState } from 'react'
import type { ArcCardRow, ShiftRow } from '../../lib/contentV2'
import { Eyebrow } from '../shared/Eyebrow'
import type { RoomId } from './ContentV2Tab'

// What the engine chose this week, and what it refused.
//
// Until 26 Aug this had nowhere to render. The scorer picked seven cards a week
// and nothing displayed them, so the tab was still showing the old pending
// decisions and the entire rewrite was invisible.
//
// Two things here are deliberate and easy to "tidy" away:
//
//   the empty reserved slot   Two of the seven are held for arcs matching none
//                             of the tracked questions. When fewer than two
//                             qualify, the gap is SHOWN. An empty slot is the
//                             week saying it produced nothing unfamiliar, and
//                             backfilling it with a familiar card hides that.
//   the refusals              A card that scored and lost, or was blocked, is
//                             listed with its reason. "Why is this not in my
//                             queue" had no answer in the previous engine, and
//                             that is how it produced 54 proposals and zero
//                             explanations.

/** Mirrors RESERVED_FOR_UNTHEMED in api/_arcScore.ts. Display only: the server
 *  decides what surfaces, this just says how many gaps to draw. */
const RESERVED = 2

const FIELDS: Array<[keyof ArcCardRow, string]> = [
  ['what_changed', 'What changed'],
  ['why_now', 'Why now'],
  ['the_opening', 'The opening'],
  ['where_this_goes', 'Where this goes'],
  ['reader_decision', 'Your decision'],
]

export function SurfacedCards({
  cards, shifts, lane,
}: {
  cards: ArcCardRow[]
  shifts: ShiftRow[]
  lane: Exclude<RoomId, 'library'>
}) {
  const laneOfShift = useMemo(() => new Map(shifts.map(s => [s.id, s.lane])), [shifts])

  const week = useMemo(() => {
    const latest = cards.reduce<string | null>((a, c) => (!a || c.week > a ? c.week : a), null)
    return cards.filter(c => c.week === latest)
  }, [cards])

  const surfaced = week.filter(c => c.surfaced)
  const mine = surfaced.filter(c => laneOfShift.get(c.shift_id) === lane)
  // Global, because the seven slots are decided once across both lanes rather
  // than per room. Stating it plainly beats faking a per-lane reservation.
  const reservedFilled = surfaced.filter(c => c.reserved_slot).length
  const emptyReserved = Math.max(0, RESERVED - reservedFilled)
  const refused = week.filter(c => !c.surfaced && laneOfShift.get(c.shift_id) === lane)

  if (!week.length) return null

  return (
    <section>
      <h3 className="mb-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <Eyebrow>This week</Eyebrow>
        <span className="text-micro text-white/40 tabular-nums">
          {surfaced.length} of 7 chosen, {reservedFilled} in the {RESERVED} slots held for questions you are not already tracking
        </span>
      </h3>

      {mine.length === 0 ? (
        <p className="text-label text-white/40">Nothing surfaced in this format this week.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {mine.map(c => <Card key={c.id} card={c} />)}
        </ul>
      )}

      {emptyReserved > 0 && (
        <div className="mt-2 flex flex-col gap-1.5">
          {Array.from({ length: emptyReserved }, (_, i) => (
            <div key={i}
              className="rounded border border-dashed border-white/12 px-3 py-2.5 text-label text-white/35">
              Empty on purpose. Nothing this week matched none of your tracked questions well enough to earn this slot.
            </div>
          ))}
        </div>
      )}

      {refused.length > 0 && <Refused rows={refused} />}
    </section>
  )
}

function Card({ card }: { card: ArcCardRow }) {
  const [open, setOpen] = useState(false)
  return (
    <li className="rounded border border-white/10 bg-white/[0.02]">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        className="flex w-full flex-col gap-1.5 px-3 py-2.5 text-left hover:bg-white/[0.03]"
      >
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {card.reserved_slot && (
            <span className="rounded-sm bg-white/10 px-1.5 py-0.5 text-micro uppercase tracking-wide text-white/60">
              Unfamiliar
            </span>
          )}
          {card.format && <span className="text-micro text-white/45">{card.format}</span>}
          {typeof card.score === 'number' && (
            <span className="text-micro text-white/35 tabular-nums">{card.score.toFixed(2)}</span>
          )}
        </span>
        <span className="text-ui font-medium text-white/90">{card.headline}</span>
        {card.surface_reason && (
          <span className="text-label text-white/45">{card.surface_reason}</span>
        )}
      </button>
      {open && (
        <dl className="flex flex-col gap-2 border-t border-white/8 px-3 py-2.5">
          {FIELDS.map(([k, label]) => {
            const v = card[k]
            if (typeof v !== 'string' || !v) return null
            return (
              <div key={k}>
                <dt className="text-micro uppercase tracking-wide text-white/35">{label}</dt>
                <dd className="text-label text-white/70">{v}</dd>
              </div>
            )
          })}
        </dl>
      )}
    </li>
  )
}

function Refused({ rows }: { rows: ArcCardRow[] }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="mt-2.5">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        className="text-label text-white/40 underline-offset-2 hover:text-white/60 hover:underline"
      >
        {open ? 'Hide' : 'Show'} the {rows.length} the engine passed over
      </button>
      {open && (
        <ul className="mt-1.5 flex flex-col gap-1">
          {rows.map(r => (
            <li key={r.id} className="rounded border border-white/8 px-3 py-2 text-label">
              <span className="text-white/60">{r.headline || 'Not composed'}</span>
              <span className="mt-0.5 block text-micro text-white/35">{r.surface_reason}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
