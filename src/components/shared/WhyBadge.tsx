import { formatDistanceToNow } from 'date-fns'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { whyFor, surfaceFor, type Why } from '../../lib/servedSurfaces'

// "Why am I being shown this?", asked the same way on every surface.
//
// The system already knew the answer nearly everywhere -- leads.why_relevant,
// guests.why_fit, milestones.marcus_reasoning, goals.why_now, contacts.why_them,
// content_ideas.thesis, tasks.evidence -- and threw it away at the last inch.
// Three surfaces had built their own explanation UI (the network score ring,
// Today's "Why <agent> flagged this" panel, the triage card's thesis blurb) and
// twenty-odd had none, so the answer to "can I interrogate this?" depended on
// which tab you were standing in.
//
// Two faces, one component. Where the surface genuinely ranks (a lead's fit, a
// visibility target's relevance) the trigger is the number, because a number
// carries information at a glance that a "?" does not. Everywhere else it is
// the subtle "?" Krish asked for. Same popover, same contents, same gesture.
//
// A missing reason renders as "No reason recorded", muted, rather than being
// hidden. Hiding it would make the badge unreliable -- you could never tell
// whether a card had nothing to say or the affordance had simply not been
// wired -- and it would hide the real defect, which is a generator that emits
// suggestions it cannot justify.

interface Props {
  /** The served table this row came from, e.g. 'leads'. */
  table: string
  /** The row itself. The registry knows which columns hold the reason. */
  row: Record<string, any> | null | undefined
  /** Pre-resolved why, when the caller already has one (avoids re-deriving). */
  why?: Why
  align?: 'start' | 'center' | 'end'
  className?: string
}

function Bar({ strength }: { strength: number }) {
  return (
    <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/[0.07]">
      <div
        className="h-full rounded-full bg-violet-400/70 transition-[width] duration-300 ease-out-soft"
        style={{ width: `${Math.max(0, Math.min(1, strength)) * 100}%` }}
      />
    </div>
  )
}

function ringFor(score: number) {
  if (score >= 75) return 'border-violet-400/45 text-violet-100'
  if (score >= 50) return 'border-white/20 text-white/85'
  return 'border-white/12 text-white/55'
}

export function WhyBadge({ table, row, why: given, align = 'end', className = '' }: Props) {
  const why = given ?? whyFor(table, row)
  const label = surfaceFor(table)?.label ?? 'item'
  const scored = typeof why.score === 'number' && Number.isFinite(why.score)

  const trigger = scored
    ? `Match score ${Math.round(why.score!)} of 100. Why this ${label} is here.`
    : `Why this ${label} is here.`

  return (
    <Popover>
      <PopoverTrigger
        aria-label={trigger}
        title={trigger}
        className={
          scored
            ? `shrink-0 inline-flex h-11 w-11 items-center justify-center rounded-full border text-[13px] font-semibold tabular-nums transition-colors hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/50 ${ringFor(why.score!)} ${className}`
            : `shrink-0 inline-flex h-5 w-5 items-center justify-center rounded-full border border-white/[0.14] text-[10px] font-semibold leading-none text-white/40 transition-colors hover:border-white/30 hover:bg-white/[0.06] hover:text-white/75 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-violet-400/60 ${className}`
        }
      >
        {scored ? Math.round(why.score!) : '?'}
      </PopoverTrigger>

      <PopoverContent align={align} className="w-72">
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/40">
            Why you're seeing this
          </span>
          {scored ? (
            <span className="text-[13px] font-semibold tabular-nums text-white">
              {Math.round(why.score!)}
            </span>
          ) : null}
        </div>

        <p className={`text-[13px] leading-relaxed ${why.recorded ? 'text-white/80' : 'italic text-white/40'}`}>
          {why.headline}
        </p>

        {!why.recorded ? (
          <p className="mt-1.5 text-[10.5px] leading-relaxed text-white/30">
            Nothing was written when this was created. That is a gap in the generator, not in the card.
          </p>
        ) : null}

        {why.factors?.length ? (
          <div className="mt-3 space-y-2 border-t border-white/[0.07] pt-2.5">
            {why.factors.map(f => (
              <div key={f.label}>
                <div className="flex items-baseline justify-between gap-2 text-[11px]">
                  <span className="text-white/70">{f.label}</span>
                  {f.value ? <span className="tabular-nums text-white/40">{f.value}</span> : null}
                </div>
                {typeof f.strength === 'number' ? <Bar strength={f.strength} /> : null}
              </div>
            ))}
          </div>
        ) : null}

        {(why.agent || why.at || why.sourceLabel || why.sourceUrl) ? (
          <div className="mt-2.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 border-t border-white/[0.07] pt-2 text-[11px] text-white/40">
            {why.agent ? <span className="capitalize text-white/60">{why.agent}</span> : null}
            {why.agent && why.at ? <span aria-hidden>·</span> : null}
            {why.at ? <RelativeTime at={why.at} /> : null}
            {why.sourceLabel ? (
              <>
                {(why.agent || why.at) ? <span aria-hidden>·</span> : null}
                <span>{why.sourceLabel}</span>
              </>
            ) : null}
            {why.sourceUrl ? (
              <a
                href={why.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-auto text-violet-300 hover:text-violet-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-violet-400/60 rounded"
              >
                Source
              </a>
            ) : null}
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}

/** A bad timestamp must not throw inside a popover. */
function RelativeTime({ at }: { at: string }) {
  const d = new Date(at)
  if (Number.isNaN(d.getTime())) return null
  return <span>{formatDistanceToNow(d, { addSuffix: true })}</span>
}
