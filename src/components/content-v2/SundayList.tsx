import { useMemo, useState } from 'react'
import { AlertTriangle, Gavel } from '@/lib/icons'
import type { ContentIdeaRow } from '../../hooks/useRealtimeContentIdeas'
import { ladderVerdict, judgeAsk, whatItNeeds, type LadderVerdict } from '../../lib/ladder'
import { SurfaceHeader } from '../shared/SurfaceHeader'
import { Eyebrow } from '../shared/Eyebrow'
import { DecideCard } from './DecideCard'
import { relativeTimeOr } from '../../lib/ageHelpers'

// Everything the machine judged weak, grouped by the judge that did it.
//
// ── WHY THIS IS A LIST AND THE DECIDE ROOM IS NOT ────────────────────────
//
// Both surfaces speak the same language now, but they answer different
// questions and the shapes follow from that. The decide room asks "what do I
// do with this one", so it serves one piece at a time. This asks "IS ONE
// RUBRIC DOING ALL THE KILLING", which only a survey can answer: one at a
// time you would settle eleven pieces without ever noticing that nine of them
// died on the same judge.
//
// So the grouping stays, and it is by killing judge rather than by date. Date
// answers "what happened this week", which nobody needs. By judge the answer
// is in the group sizes, and the line above them says it out loud when one
// rubric holds more than half.
//
// ── WHY TAPPING A ROW OPENS DecideCard ───────────────────────────────────
//
// Because a second decision surface would be a fork of the one that already
// captures a reason in one tap and carries panel_run_id to the ledger. The
// house rule is extend the primitive, and that applies to an interaction as
// much as to a style. A row here opens the same card the queue serves, with a
// Back control, and every overrule it records is the most valuable
// calibration row the system can produce: the machine said weak, he said no.
//
// Nothing here buries. The ladder stopped burying on 2026-09-24 after the Jev
// seed, which Krish graded 7, was scored 3 by three judges on four separate
// rewrites. A settled disagreement is not the machine's to resolve.

interface WeakItem {
  row: ContentIdeaRow
  verdict: LadderVerdict
  needs: ReturnType<typeof whatItNeeds>
}

/** What a piece needs, as a word rather than a score. He already knows it is
 *  weak by being shown this screen; what he cannot work out is which of three
 *  genuinely different jobs it is. */
const NEEDS: Record<string, { label: string; cls: string }> = {
  'your standing': { label: 'Needs you', cls: 'bg-violet-500/12 text-violet-200 ring-1 ring-violet-400/20' },
  'a lookup that never ran': { label: 'Never researched', cls: 'bg-amber-500/12 text-amber-200 ring-1 ring-amber-400/20' },
  'a decision': { label: 'Undecided', cls: 'bg-white/[0.06] text-ink-muted ring-1 ring-white/10' },
}

function Row({ item, onOpen }: { item: WeakItem; onOpen: () => void }) {
  const { row, verdict, needs } = item
  const n = NEEDS[needs]!
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        data-testid={`sunday-row-${row.id}`}
        className="tap-44 w-full rounded-xl border border-white/8 bg-white/[0.02] p-3 text-left transition-colors hover:border-white/15"
      >
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            {/* The angle the panel actually judged. Showing the seed and
                attributing a verdict on the argument to it would be a small
                lie in the one place he reads to overturn one. */}
            <p className="text-body text-ink">{verdict.expansion.angle || row.idea}</p>
            {verdict.expansion.angle ? <p className="mt-1 text-micro text-ink-faint">Seed: {row.idea}</p> : null}
          </div>
          <span className={`flex-shrink-0 rounded-full px-2 py-1 text-micro font-semibold ${n.cls}`}>{n.label}</span>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-micro text-ink-faint">
          <span className="tabular-nums">Panel {verdict.score ?? '—'}/10</span>
          {/* Two different readings agreeing is a much stronger claim than the
              same words read twice, and a row that flattens them is hiding the
              difference. */}
          {verdict.confirmation ? (
            <span>{verdict.confirmation.reExpanded ? 'weak on two rewrites' : 'weak on a second reading'}</span>
          ) : null}
          <span>{relativeTimeOr(verdict.judgedAt, 'not dated')}</span>
        </div>
      </button>
    </li>
  )
}

export function SundayList({ ideas, variant }: { ideas: ContentIdeaRow[]; variant: 'desktop' | 'mobile' }) {
  const [openId, setOpenId] = useState<string | null>(null)
  const [settled, setSettled] = useState<string[]>([])

  const groups = useMemo(() => {
    const done = new Set(settled)
    const items: WeakItem[] = []
    for (const row of ideas) {
      if (done.has(row.id)) continue
      const verdict = ladderVerdict(row)
      if (!verdict || verdict.band !== 'weak') continue
      items.push({ row, verdict, needs: whatItNeeds(verdict) })
    }
    const by = new Map<string, WeakItem[]>()
    for (const it of items) by.set(it.verdict.weakest || 'panel', [...(by.get(it.verdict.weakest || 'panel') || []), it])
    // Biggest group first: the rubric doing the most killing is the finding,
    // so it goes where the eye lands rather than wherever the map iterated.
    return [...by.entries()].sort((a, b) => b[1].length - a[1].length)
  }, [ideas, settled])

  const total = groups.reduce((n, [, g]) => n + g.length, 0)
  const dominant = groups[0]
  const lopsided = Boolean(dominant && total >= 4 && dominant[1].length / total > 0.5)

  const open = useMemo(
    () => groups.flatMap(([, g]) => g).find(i => i.row.id === openId)?.row ?? null,
    [groups, openId],
  )

  // One piece, opened from the list. The same card the queue serves, so the
  // reason capture and the panel_run_id it carries are not written twice.
  if (open) {
    return (
      <DecideCard
        idea={open}
        variant={variant}
        onBack={() => setOpenId(null)}
        onSettled={() => { setSettled(s => [...s, open.id]); setOpenId(null) }}
      />
    )
  }

  if (!total) {
    return (
      <div className="py-10 text-center" data-testid="sunday-list">
        <p className="text-body text-ink-muted">Nothing was judged weak.</p>
        <p className="mt-1 text-label text-ink-faint">
          When the machine cannot lift a piece it lands here, because nothing is buried.
        </p>
      </div>
    )
  }

  return (
    <div data-testid="sunday-list">
      <SurfaceHeader
        title="What the machine could not lift"
        description="Nothing is buried. Every piece here was judged weak and could not be repaired, waiting on you to agree or overrule."
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
              <Eyebrow tone="accent">{judgeAsk(judge)}</Eyebrow>
              <span className="text-micro tabular-nums text-ink-faint">{items.length}</span>
            </div>
            <ul className="mt-2 space-y-2">
              {items.map(it => <Row key={it.row.id} item={it} onOpen={() => setOpenId(it.row.id)} />)}
            </ul>
          </section>
        ))}
      </div>
    </div>
  )
}
