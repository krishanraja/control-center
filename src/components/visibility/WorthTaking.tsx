import { useMemo, useState } from 'react'
import { Megaphone, Target, Clock, ChevronRight, XCircle } from '@/lib/icons'
import { DoThisNextHero } from '../shared/DoThisNextHero'
import { Eyebrow } from '../shared/Eyebrow'
import { WhyBadge } from '../shared/WhyBadge'
import { Working } from '../shared/Working'
import { useToast } from '../shared/Toast'
import { useHaptics } from '../../hooks/useHaptics'
import { relativeTimeOr } from '../../lib/ageHelpers'
import { axesOf, rejectSentence, VERDICT_LABEL } from '../../lib/visibilityScale'
import { applyStandard, kindLabel, channelLabel, STRETCH_CAP } from '../../lib/visibilityStandard'
import type { VisibilityTargetRow } from '../../hooks/useVisibilityTargets'

/**
 * The one stage worth standing on, and what makes it worth it.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS IS THE FOCAL SURFACE AND THE OLD HERO WAS NOT
 *
 * The outbound hero used to read "Apply to <whatever has the nearest deadline,
 * else the highest relevance_score>". Both halves of that were wrong:
 *
 *   - the nearest deadline is urgency, not worth, and the house rule is never
 *     to manufacture urgency;
 *   - relevance_score is two scales in one column (7-9 from the nell-* sources,
 *     72-95 from the nova_* ones), so "highest" meant "written by Nova",
 *     and on 108 open rows that pointed at a set Krish has never acted on.
 *
 * So the hero now shows ONE row, only ever a row Nova's standard judged `take`,
 * and it shows the four things that make it worth a day: who is actually in the
 * room, why him and not somebody else, why now if there is a real reason, and
 * the angle. Those sit UNDER the headline and ABOVE the button, because the
 * verdict belongs where the action is: if he has to open a detail panel to find
 * out what the Apply button means, the layout failed.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * IT IS ALLOWED TO BE EMPTY, AND TODAY IT IS
 *
 * There are three different empty states here and they are three different
 * facts. Collapsing them into one "nothing here" line is what let a lane go
 * fifteen days without a new row while nothing on screen said so:
 *
 *   1. The standard has never run. That is a gap in the system, not a verdict
 *      on the world, and it says so and names the queue length.
 *   2. The standard ran and nothing cleared the bar. That is the honest answer
 *      and the right number of opportunities is zero.
 *   3. Nothing is in the queue at all.
 *
 * None of the three is filled with the next-best row. A board of rows nobody
 * acts on is an oracle asking to be trusted; an empty board that names what is
 * missing is an instrument.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * NOTHING HERE SENDS
 *
 * Apply marks the row applied, which is Krish recording what he did. There is
 * no outbound client on this path and there never will be; the OS is pull-only
 * and CI guard scripts/check-bridges-never-send.mts holds the boundary.
 */

/** One axis, as a number and a bar. Three of these, because the standard is a
 *  conjunction: the reader has to be able to see WHICH of the three is weak. */
function Axis({ label, value, narrow }: { label: string; value: number | null; narrow?: boolean }) {
  const pct = value == null ? 0 : Math.max(0, Math.min(100, value))
  return (
    <div className="min-w-0 flex-1">
      {/* The number sits beside the label on a phone and at the right edge on a
          desk. On a 390px screen the right edge of the third axis is exactly
          where the floating create button lands, and it covered "Only you 88"
          on arrival. The button is fixed and the card scrolls under it, so the
          fix is to keep the value out of that column rather than to move the
          button, which belongs to every surface. */}
      <div className={`flex items-baseline gap-2 ${narrow ? 'justify-start' : 'justify-between'}`}>
        <Eyebrow className="truncate">{label}</Eyebrow>
        <span className="font-mono text-micro tabular-nums text-ink-muted flex-shrink-0">
          {value == null ? 'not judged' : value}
        </span>
      </div>
      <div className={`mt-1 overflow-hidden rounded-full bg-white/[0.07] ${narrow ? 'h-1' : 'h-1.5'}`}>
        <div
          className="h-full rounded-full bg-violet-400/70 transition-[width] duration-300 ease-out-soft"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

/** One of the four reasons it is worth it. Wraps in full, never clipped: the
 *  house text rule, and the whole value of the line is the detail in it. */
function Reason({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <Eyebrow className="block">{label}</Eyebrow>
      <p className="mt-0.5 text-body leading-snug text-ink break-words">{children}</p>
    </div>
  )
}

function daysTo(iso?: string | null): number | null {
  if (!iso || Number.isNaN(Date.parse(iso))) return null
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000)
}

interface Props {
  targets: VisibilityTargetRow[]
  onOpen?: (id: string) => void
  narrow?: boolean
}

export function WorthTaking({ targets, onOpen, narrow }: Props) {
  const { toast } = useToast()
  const h = useHaptics()
  const [busy, setBusy] = useState(false)
  const [stretchOpen, setStretchOpen] = useState(false)
  const [whyOpen, setWhyOpen] = useState(false)
  const view = useMemo(() => applyStandard(targets), [targets])

  const top = view.take[0] || null
  const freshestJudgement = useMemo(
    () => targets.reduce<string | null>((acc, t) => {
      const at = t.scored_at || null
      return !acc || (at && at > acc) ? (at || acc) : acc
    }, null),
    [targets],
  )

  const apply = async () => {
    if (!top) return
    h.heavy(); setBusy(true)
    try {
      const r = await fetch(`/api/visibility-targets/${top.id}/apply`, { method: 'POST' })
      const j = await r.json().catch(() => ({}))
      if (!r.ok || j?.ok === false) throw new Error(j?.error || String(r.status))
      h.success(); toast('Marked applied.', 'success')
    } catch (e: unknown) {
      h.error(); toast(`Could not mark it applied: ${(e as Error)?.message || 'try again'}`, 'error')
    } finally { setBusy(false) }
  }

  // ── The three empty states, said in three different ways ──────────────────
  if (!top) {
    const line = view.neverRun
      ? {
          title: 'Nothing has been judged against the standard yet.',
          body: `The weekly pass has not run, so no row here has been measured against who is in the room, whether the platform carries authority, and whether the angle is one only you could give. ${view.awaiting.length} waiting.`,
        }
      : view.awaiting.length + view.unjudged.length + view.refused.length === 0
        ? {
            title: 'Nothing in the queue.',
            body: 'No stages, calls for papers or shows are waiting. New ones land here as they are found.',
          }
        : {
            title: 'Nothing clears the bar this week.',
            body: `Nova measured ${view.refused.length + view.unjudged.length + view.take.length + view.stretch.length} and none of them put a decision-maker in the room, carried enough standing to cite later, and had an angle only you could give, all at once. That is the honest answer, so the board is empty rather than filled with the next best thing.`,
          }
    return (
      <section
        aria-label="Worth taking"
        data-testid="worth-taking-empty"
        data-state={view.neverRun ? 'never-run' : 'nothing-clears'}
        className={`rounded-2xl border border-white/[0.07] bg-white/[0.02] ${narrow ? 'p-3.5' : 'px-5 py-4'}`}
      >
        <Eyebrow className="block">Worth taking</Eyebrow>
        <p className="mt-1 text-ui font-display font-semibold leading-tight text-ink break-words">{line.title}</p>
        <p className="mt-1 text-label leading-snug text-ink-muted break-words">{line.body}</p>
        <p className="mt-2 font-mono text-micro text-ink-faint">
          Last judged {relativeTimeOr(freshestJudgement, 'never')}
          {view.unjudged.length > 0 && ` · ${view.unjudged.length} with too little on the page to judge`}
          {view.stretch.length > 0 && ` · ${view.stretch.length} stretch below`}
        </p>
      </section>
    )
  }

  const ax = axesOf(top)
  const d = daysTo(top.deadline_at)
  const channel = channelLabel(top.feeds_channel)

  return (
    <DoThisNextHero
      testId="worth-taking"
      narrow={narrow}
      layout="card"
      descriptor={{
        headline: top.title,
        sub: top.who_is_in_the_room || 'Who is in the room was not recorded, which is itself worth checking before you commit a day.',
        tone: 'violet',
        icon: <Megaphone size={16} className="text-violet-300" />,
      }}
      eyebrow={
        <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <Eyebrow tone="accent">Worth taking</Eyebrow>
          <span className="font-mono text-micro text-ink-faint">{kindLabel(top.type)}</span>
          {channel && <span className="font-mono text-micro text-ink-faint">· feeds {channel}</span>}
        </span>
      }
      meta={
        <span className="flex flex-shrink-0 items-center gap-2">
          {/* The number is the trigger, because a number carries information at
              a glance that a question mark does not. Same affordance as every
              other ranked surface. */}
          <WhyBadge table="visibility_targets" row={top} label="visibility target" align="end" />
          {view.take.length > 1 && (
            <span className="font-mono text-micro tabular-nums text-ink-faint">1 of {view.take.length}</span>
          )}
        </span>
      }
    >
      {/* What makes it worth it, at the point of action.
          Two-up on a desk, stacked on a phone. Measured at 1280x800 with the
          three stacked in one column: the card came to 652px inside a 608px
          frame, so "Mark applied" sat 44px below the fold on arrival. A focal
          surface whose action you have to scroll to find is not focal. */}
      <div className={narrow ? 'flex flex-col gap-2.5' : 'grid grid-cols-2 gap-x-5 gap-y-2.5'}>
        {/* The angle is the one that stays on a phone, because it is the thing
            he would actually say in the room. Why you and why now fold behind
            one tap: measured at 360x640, all three expanded put the card at
            781px in a 533px frame and left "Mark applied" 448px below the fold.
            Nothing is removed and nothing is ellipsised. */}
        {top.angle && <Reason label="The angle">{top.angle}</Reason>}
        {(!narrow || whyOpen) && top.why_him && <Reason label="Why you">{top.why_him}</Reason>}
        {(!narrow || whyOpen) && top.why_now && <Reason label="Why now">{top.why_now}</Reason>}
        {narrow && !whyOpen && (top.why_him || top.why_now) && (
          <button
            type="button"
            onClick={() => setWhyOpen(true)}
            className="inline-flex min-h-[44px] items-center gap-1.5 self-start rounded-lg text-left focus-visible:ring-2 focus-visible:ring-white/30"
          >
            <ChevronRight size={12} className="flex-shrink-0 text-ink-faint" />
            <Eyebrow>Why you, and why now</Eyebrow>
          </button>
        )}
        {!top.why_him && !top.angle && (
          <p className="text-label leading-snug text-amber-300 break-words">
            The standard cleared this room, and nobody wrote down why it is yours rather
            than anybody&apos;s. Open it before you commit a day to it.
          </p>
        )}
      </div>

      {/* The three axes. All three have to be right at once, so all three are
          shown: the headline number is their minimum and the reader needs to be
          able to see which one is carrying it. */}
      <div className={narrow ? 'flex flex-col gap-2' : 'flex items-start gap-5'} data-testid="worth-taking-axes">
        <Axis label="Room" value={ax.room} narrow={narrow} />
        <Axis label="Platform" value={ax.standing} narrow={narrow} />
        <Axis label="Only you" value={ax.onlyHim} narrow={narrow} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={apply}
          disabled={busy}
          // The visible word shortens on a phone so the two actions stay on one
          // row; the accessible name does not, because "Applied" on its own
          // reads as a status rather than as something you press.
          aria-label="Mark applied"
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-violet-400/40 bg-violet-500/20 px-4 text-body font-semibold text-violet-100 outline-none transition-colors hover:bg-violet-500/30 focus-visible:ring-2 focus-visible:ring-white/30 disabled:opacity-50"
        >
          {busy ? <Working size={14} /> : <Target size={14} />}
          {narrow ? 'Applied' : 'Mark applied'}
        </button>
        <button
          type="button"
          onClick={() => onOpen?.(top.id)}
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-white/12 bg-white/[0.04] px-4 text-body font-medium text-ink-muted outline-none transition-colors hover:bg-white/[0.08] hover:text-ink focus-visible:ring-2 focus-visible:ring-white/30"
        >
          Open it
          <ChevronRight size={14} />
        </button>
        {d != null && d >= 0 && (
          <span className="inline-flex items-center gap-1 font-mono text-micro text-ink-faint">
            <Clock size={12} />
            {d === 0 ? 'applications close today' : `applications close in ${d}d`}
          </span>
        )}
      </div>

      {/* The stretch lane, named and capped. Precedent: on 2026-10-05 a
          correction proposing a hard profile filter on Nell was closed because
          "Krish refined it to keep a marked stretch slot". A real room and a
          real angle on a platform that is merely small is a call he should make,
          not a row to bury. */}
      {view.stretch.length > 0 && (
        <div className="border-t border-white/[0.06] pt-3" data-testid="worth-taking-stretch">
          {/* One line until he asks. The stretch lane is a second answer to the
              same question, so it must not compete with the first for height:
              two expanded rows cost 110px of a 608px frame and pushed the
              primary action off the screen at 1280x800. */}
          <button
            type="button"
            onClick={() => setStretchOpen(o => !o)}
            aria-expanded={stretchOpen}
            className="flex min-h-[44px] w-full items-center gap-2 rounded-lg text-left transition-colors hover:bg-white/[0.03] focus-visible:ring-2 focus-visible:ring-white/30"
          >
            <ChevronRight size={12} className={`flex-shrink-0 text-ink-faint transition-transform ${stretchOpen ? 'rotate-90' : ''}`} />
            <Eyebrow>Stretch, your call</Eyebrow>
            <span className="font-mono text-micro tabular-nums text-ink-faint">
              {view.stretch.length} with the right room on a smaller platform
            </span>
          </button>
          {stretchOpen && (
          <ul className="mt-1 space-y-1">
            {view.stretch.map(s => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => onOpen?.(s.id)}
                  className="min-h-[44px] w-full rounded-lg px-2 py-1 text-left transition-colors hover:bg-white/[0.03] focus-visible:ring-2 focus-visible:ring-white/30 tap-44"
                >
                  <span className="block text-label text-ink break-words">{s.title}</span>
                  <span className="block font-mono text-micro text-ink-faint">
                    {kindLabel(s.type)} · right room, smaller platform
                    {axesOf(s).standing != null && ` (${axesOf(s).standing} standing)`}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          )}
          {stretchOpen && view.stretch.length >= STRETCH_CAP && (
            <p className="mt-1 font-mono text-micro text-ink-faint">
              Capped at {STRETCH_CAP}. A stretch lane that grows is the long tail
              coming back under a new name.
            </p>
          )}
        </div>
      )}
    </DoThisNextHero>
  )
}

/**
 * What the standard refused, and why.
 *
 * Collapsed by default and never hidden. The old rule lived in Nova's brief as
 * "if I cannot enrich a candidate to green or amber quality, DO NOT write the
 * row", so a refusal left no trace: nothing could be learned from it, and the
 * one thing it did produce was a corpus where 91 of 129 rows are marked green,
 * because green was the entry ticket rather than a judgement.
 *
 * Shown as a count with a reason per row. A reader can overturn any of them,
 * which is what makes a cautious judge cheap: a false refusal costs one click,
 * a false acceptance costs a day and the credibility of standing in front of
 * the wrong room.
 */
export function RefusedByStandard({ targets, onOpen }: { targets: VisibilityTargetRow[]; onOpen?: (id: string) => void }) {
  const [open, setOpen] = useState(false)
  const view = useMemo(() => applyStandard(targets), [targets])
  const n = view.refused.length
  const waiting = view.awaiting.length
  const unjudged = view.unjudged.length

  if (n === 0 && waiting === 0 && unjudged === 0) return null

  return (
    <section className="rounded-xl border border-white/[0.05] bg-white/[0.015]" data-testid="refused-by-standard">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-white/[0.02]"
      >
        <ChevronRight size={12} className={`flex-shrink-0 text-ink-faint transition-transform ${open ? 'rotate-90' : ''}`} />
        <span className="min-w-0 flex-1">
          <span className="block font-display text-label font-semibold uppercase tracking-[0.14em] text-ink-muted">
            Refused by the standard
          </span>
          <span className="block font-mono text-micro text-ink-faint">
            {n} refused
            {unjudged > 0 && ` · ${unjudged} with too little on the page to judge`}
            {waiting > 0 && ` · ${waiting} not reached yet`}
          </span>
        </span>
      </button>

      {open && (
        <div className="space-y-2 border-t border-white/[0.05] p-3">
          {n === 0 && (
            <p className="text-micro text-ink-faint">
              Nothing has been refused. The counts beside the title are rows the
              standard has not judged, which is a queue length and not a verdict.
            </p>
          )}
          {view.refused.slice(0, 25).map(t => (
            <div key={t.id} className="rounded-lg border border-white/[0.05] bg-white/[0.015] p-3">
              <div className="flex items-start gap-2">
                <XCircle size={14} className="mt-0.5 flex-shrink-0 text-rose-300/80" />
                <div className="min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={() => onOpen?.(t.id)}
                    className="min-h-[44px] text-left text-label text-ink break-words hover:text-white focus-visible:ring-2 focus-visible:ring-white/30 tap-44"
                  >
                    {t.title}
                  </button>
                  {/* The reason, as a sentence. A raw code at a reader is a
                      category name, not an explanation. */}
                  <p className="mt-0.5 text-micro leading-snug text-ink-muted break-words">
                    {rejectSentence(t.reject_reason)}
                  </p>
                  {t.score_reason && (
                    <p className="mt-0.5 text-micro leading-snug text-ink-faint break-words">{t.score_reason}</p>
                  )}
                  <p className="mt-1 flex flex-wrap items-center gap-x-2 font-mono text-micro text-ink-faint">
                    <span>{kindLabel(t.type)}</span>
                    <span>· {VERDICT_LABEL.rejected} {relativeTimeOr(t.scored_at, 'at an unknown time')}</span>
                  </p>
                </div>
                <WhyBadge table="visibility_targets" row={t} label="visibility target" align="end" tone="weak" />
              </div>
            </div>
          ))}
          {n > 25 && (
            <p className="font-mono text-micro text-ink-faint">
              Showing 25 of {n}. The rest are in the board below with the same reason on each.
            </p>
          )}
        </div>
      )}
    </section>
  )
}
