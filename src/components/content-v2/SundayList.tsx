import { useMemo, useState } from 'react'
import { AlertTriangle, ChevronDown, Gavel } from '@/lib/icons'
import type { ContentIdeaRow } from '../../hooks/useRealtimeContentIdeas'
import { ladderVerdict, judgeAsk, whatItNeeds, type LadderVerdict } from '../../lib/ladder'
import { SurfaceHeader } from '../shared/SurfaceHeader'
import { Eyebrow } from '../shared/Eyebrow'
import { relativeTimeOr } from '../../lib/ageHelpers'

// The Sunday list: everything the machine judged weak, grouped by the judge
// that did it.
//
// ── Why this exists and why it is grouped this way ───────────────────────
//
// The ladder used to bury a weak piece by itself. Krish ruled that out on
// 2026-09-24 after the measurement that killed the idea: the Jev seed, which
// he graded 7, was scored 3 by `consequence`, `reader` and `standing` on FOUR
// independent expansions and panels. Not noise — a settled disagreement
// between him and three rubrics, with nothing random in it to average away.
// The machine would have buried it every time, correctly by its own lights,
// and he would never have known.
//
// So nothing buries. Weak pieces come here instead.
//
// GROUPED BY THE KILLING JUDGE, not by date or channel, and that is the whole
// design. A list sorted by date answers "what happened this week", which is a
// question nobody needs answered. Grouped by judge it answers the one that
// matters: IS ONE RUBRIC DOING ALL THE KILLING? One judge holding nine of
// eleven pieces is a broken rubric, and it is visible in a glance rather than
// after somebody thinks to run a query. That is the fastest route to the
// thing that is actually wrong, and it is why the group header carries the
// count before it carries anything else.
//
// The judge names are rendered as what the judge WANTED, never as its rubric
// key. "reader" tells Krish nothing; "Will not reach the person it is for"
// tells him whether he agrees. Agreeing or not is the entire job of this
// screen — every override he makes here is a training row the panel cannot
// get any other way.
//
// ── What each row must say ───────────────────────────────────────────────
//
// Not the score. The score is the least useful number on the card: he has
// already been told it is weak by being shown this screen at all. What he
// cannot work out for himself is WHAT THE PIECE NEEDS, and the three answers
// are genuinely different jobs:
//
//   your standing            the repair had research and still could not
//                            close it — it wants a client, a deal, a moment
//                            he lived, and no lookup will ever supply one
//   a lookup that never ran  the repair had nothing to work from, which is a
//                            failure of the machine rather than the idea
//   a decision               it never got that far
//
// Rendering those three the same way would make the list uniform and useless.

const NEEDS_TONE: Record<string, string> = {
  'your standing': 'bg-violet-500/12 text-violet-200 ring-1 ring-violet-400/20',
  'a lookup that never ran': 'bg-amber-500/12 text-amber-200 ring-1 ring-amber-400/20',
  'a decision': 'bg-white/[0.06] text-ink-muted ring-1 ring-white/10',
}

interface WeakItem {
  row: ContentIdeaRow
  verdict: LadderVerdict
  needs: ReturnType<typeof whatItNeeds>
}

// Opening a piece is a hash route, not a callback passed down from the tab.
// That is the house mechanism (ContentIdeaCardActionable does the same), and
// it is the one that survives a reload: a weak piece Krish opens from here and
// comes back to is still the piece he was looking at.
const openIdea = (id: string) => { window.location.hash = `#/content?idea=${id}` }

function Row({ item }: { item: WeakItem }) {
  const { row, verdict, needs } = item
  const [open, setOpen] = useState(false)
  const last = verdict.attempts[verdict.attempts.length - 1]

  return (
    <li className="rounded-xl border border-white/8 bg-white/[0.02]">
      <div className="p-3">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            {/* The angle the expansion landed on, when there is one, because
                that is the piece the panel actually judged. Falling back to
                the seed silently would show Krish a headline and attribute a
                verdict on an argument to it. */}
            <p className="text-body text-ink">{verdict.expansion.angle || row.idea}</p>
            {verdict.expansion.angle ? (
              <p className="mt-1 text-micro text-ink-faint">Seed: {row.idea}</p>
            ) : null}
          </div>
          <span className={`flex-shrink-0 rounded-full px-2 py-1 text-micro font-semibold ${NEEDS_TONE[needs]}`}>
            {needs === 'your standing' ? 'Needs you' : needs === 'a lookup that never ran' ? 'Never researched' : 'Undecided'}
          </span>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-micro text-ink-faint">
          <span className="tabular-nums">Panel {verdict.score ?? '—'}/10</span>
          {verdict.firstScore !== null && verdict.firstScore !== verdict.score ? (
            <span className="tabular-nums">from {verdict.firstScore}</span>
          ) : null}
          {/* Says whether the second reading was a different expansion or the
              same one. A piece called weak twice on two genuinely different
              readings is a much stronger claim than one called weak twice on
              the same words, and the row would otherwise flatten them. */}
          {verdict.confirmation ? (
            <span>{verdict.confirmation.reExpanded ? 'weak on two different readings' : 'weak on a second reading'}</span>
          ) : null}
          <span>{relativeTimeOr(verdict.judgedAt, 'not dated')}</span>
        </div>

        <div className="mt-2.5 flex items-center gap-2">
          <button
            type="button"
            onClick={() => openIdea(row.id)}
            data-testid="sunday-disagree"
            className="tap-44 rounded-lg bg-white/[0.06] px-3 py-1.5 text-label font-semibold text-ink hover:bg-white/[0.1]"
          >
            I disagree
          </button>
          <button
            type="button"
            onClick={() => setOpen(v => !v)}
            aria-expanded={open}
            className="tap-44 flex items-center gap-1 rounded-lg px-2 py-1.5 text-label text-ink-muted hover:text-ink"
          >
            What it tried
            <ChevronDown size={12} className={open ? 'rotate-180 transition-transform' : 'transition-transform'} />
          </button>
        </div>
      </div>

      {open ? (
        <div className="border-t border-white/8 px-3 py-2.5">
          {last?.detail ? (
            <p className="text-label text-ink-muted">{last.detail}</p>
          ) : (
            <p className="text-label text-ink-faint">No repair was attempted.</p>
          )}
          {last?.researched && last.sources?.length ? (
            <div className="mt-2">
              <Eyebrow>Looked at</Eyebrow>
              <ul className="mt-1 space-y-0.5">
                {last.sources.slice(0, 4).map(s => (
                  // Wrapped, never truncated. A half URL is not a source: the
                  // point of listing these is that Krish can see WHERE the
                  // research came from and go and look, and "thehackernews.com/2026/09/cl…"
                  // fails at exactly that.
                  <li key={s} className="break-all text-micro text-ink-faint">{s}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </li>
  )
}

export function SundayList({ ideas }: { ideas: ContentIdeaRow[] }) {
  const groups = useMemo(() => {
    const items: WeakItem[] = []
    for (const row of ideas) {
      const verdict = ladderVerdict(row)
      if (!verdict || verdict.band !== 'weak') continue
      items.push({ row, verdict, needs: whatItNeeds(verdict) })
    }
    const by = new Map<string, WeakItem[]>()
    for (const it of items) {
      const k = it.verdict.weakest || 'panel'
      by.set(k, [...(by.get(k) || []), it])
    }
    // Biggest group first: the rubric doing the most killing is the finding,
    // so it goes where the eye lands rather than wherever the map happened to
    // iterate.
    return [...by.entries()].sort((a, b) => b[1].length - a[1].length)
  }, [ideas])

  const total = groups.reduce((n, [, g]) => n + g.length, 0)
  const dominant = groups[0]
  // One judge holding more than half of a list worth reading is a rubric
  // problem, not a bad week. Stated on the page rather than left for Krish to
  // work out from the group sizes, because the whole reason to group by judge
  // is to make this sentence possible.
  const lopsided = Boolean(dominant && total >= 4 && dominant[1].length / total > 0.5)

  if (!total) {
    return (
      <div className="py-10 text-center">
        <p className="text-body text-ink-muted">Nothing was judged weak.</p>
        <p className="mt-1 text-label text-ink-faint">
          When the machine cannot lift a piece, it lands here instead of disappearing.
        </p>
      </div>
    )
  }

  return (
    <div data-testid="sunday-list">
      <SurfaceHeader
        title="What the machine could not lift"
        description="Nothing is buried. Every piece here is one the panel judged weak and could not repair, waiting on you to agree or overrule."
        icon={<Gavel size={18} />}
        meta={<span className="tabular-nums">{total} {total === 1 ? 'piece' : 'pieces'}</span>}
      />

      {lopsided ? (
        <div
          data-testid="sunday-lopsided"
          className="mt-3 flex items-start gap-2 rounded-xl border border-amber-400/25 bg-amber-500/[0.06] p-3"
        >
          <AlertTriangle size={14} className="mt-0.5 flex-shrink-0 text-amber-300" />
          <p className="text-label text-amber-100">
            <span className="font-semibold">{dominant![1].length} of {total}</span> are held by one judge.
            That is usually a rubric that needs rewriting, not a bad week of ideas.
          </p>
        </div>
      ) : null}

      <div className="mt-4 space-y-5">
        {groups.map(([judge, items]) => (
          <section key={judge} data-testid={`sunday-group-${judge}`}>
            <div className="flex items-baseline gap-2">
              <Eyebrow>{judgeAsk(judge)}</Eyebrow>
              <span className="text-micro tabular-nums text-ink-faint">{items.length}</span>
            </div>
            <ul className="mt-2 space-y-2">
              {items.map(it => <Row key={it.row.id} item={it} />)}
            </ul>
          </section>
        ))}
      </div>
    </div>
  )
}
