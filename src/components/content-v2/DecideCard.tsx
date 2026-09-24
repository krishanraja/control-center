import { useMemo, useState } from 'react'
import { PenLine, Layers, Gavel, GitBranch } from '@/lib/icons'
import type { ContentIdeaRow } from '../../hooks/useRealtimeContentIdeas'
import { ladderVerdict, judgeAsk, type LadderVerdict } from '../../lib/ladder'
import { DECISION_REASONS, recordDecision, recordReroute } from '../../lib/editLedger'
import { useJudgeVerdicts } from '../../hooks/useJudgeVerdicts'
import { SUBCHANNELS } from '../../lib/formats'
import { Eyebrow } from '../shared/Eyebrow'
import { IconTile } from '../shared/IconTile'
import { BottomSheet } from '../mobile/BottomSheet'
import { relativeTimeOr } from '../../lib/ageHelpers'

// One piece, one decision, and a reason for it.
//
// ── WHAT THIS REPLACES, AND WHY ──────────────────────────────────────────
//
// The Content tab was organised by subchannel: three rooms, and Krish picked
// one. The router assigns the subchannel now, which makes it an attribute
// rather than a destination, and it left the axis that DOES carry meaning with
// nowhere to live. Every surface here read a title and a thesis while the
// engine was producing a standing, a weakest judge, a repair history with
// sources, three channel fits and a machine-versus-human disagreement.
//
// ── THE THREE RULES THIS SURFACE IS BUILT ON, all Krish's ────────────────
//
// 1. "It's just a good idea presented to me with enough information to make a
//    clear decision." The first version put the machine's case in the
//    foreground and the idea behind it. Every number the panel produced is
//    behind a control now. What leads is the piece.
//
// 2. "Enough interaction at each point so the system can learn from every
//    interaction and why." Approve, decline and reroute each capture a reason
//    in one tap, and every one carries panel_run_id, which is the field that
//    turns judge_calibration from an empty view into a weekly report card.
//
// 3. "There should be an element of stability and predictability behind any
//    interaction." Nothing above the footer moves when a button is pressed.
//    The footer is a fixed slot and only its contents swap; on a phone the
//    question is a sheet over the card, because re-laying-out the card to make
//    room is the same jump wearing a different coat. Measured, not asserted:
//    e2e/decide-card.spec.ts records the geometry before and after a press.
//
// The depth layers each REPLACE the card in the same box rather than expanding
// underneath it. That is what keeps a no-scroll frame honest at four
// viewports, and the shared min-height is why opening one never resizes the
// panel.

type Door = 'topic' | 'scores' | 'origin'
type Asking = { kind: 'approved' | 'binned' } | { kind: 'rerouted'; to: string } | null

/** Held in one place so the reason step and the receipt cannot disagree about
 *  what was just decided. */
const VERB: Record<'approved' | 'binned' | 'rerouted', string> = {
  approved: 'Queued to write.',
  binned: 'Set aside.',
  rerouted: 'Moved.',
}

function Facts({ v }: { v: LadderVerdict }) {
  // The expansion's own working, which is the substance of the piece rather
  // than the machine's opinion of it. An expansion that failed has none, and
  // says so: a surface that is excellent with good data and blank without it
  // is the failure this repo keeps re-learning.
  if (!v.expansion.ok) {
    return (
      <p className="mt-3 text-label text-ink-faint" data-testid="decide-no-expansion">
        The machine could not work this one up, so there is only the seed below. Judge it on that.
      </p>
    )
  }
  const rows: Array<[string, string]> = []
  if (v.expansion.parties.length) rows.push(['Who moves', v.expansion.parties.slice(0, 3).join(', ')])
  if (v.expansion.scenarios) rows.push(['What follows', `${v.expansion.scenarios} ways this runs forward`])
  if (v.expansion.decisionRule) rows.push(['The test', 'It lands on a rule a reader can apply'])
  if (!rows.length) return null
  return (
    <dl className="mt-3.5 space-y-0.5" data-testid="decide-facts">
      {rows.map(([k, val]) => (
        <div key={k} className="grid grid-cols-[92px_1fr] gap-3 py-1">
          <dt className="pt-0.5"><Eyebrow tone="accent">{k}</Eyebrow></dt>
          <dd className="text-label text-ink">{val}</dd>
        </div>
      ))}
    </dl>
  )
}

function ReasonChips({ kind, picked, toggle }: {
  kind: 'approved' | 'binned' | 'rerouted'
  picked: Set<string>
  toggle: (code: string) => void
}) {
  return (
    <div className="flex flex-wrap gap-1.5" data-testid="decide-reasons">
      {DECISION_REASONS[kind].map(r => (
        <button
          key={r.code}
          type="button"
          data-testid={`reason-${r.code}`}
          aria-pressed={picked.has(r.code)}
          onClick={() => toggle(r.code)}
          className={`tap-44 inline-flex min-h-[40px] items-center rounded-full border px-3.5 text-label transition-colors ${
            picked.has(r.code)
              ? 'border-accent/50 bg-accent/15 text-ink'
              : 'border-white/12 text-ink-muted hover:text-ink'
          }`}
        >
          {r.label}
        </button>
      ))}
    </div>
  )
}

export function DecideCard({ idea, onSettled, variant, onBack }: {
  idea: ContentIdeaRow
  /** Called once the decision is recorded, so the tab can advance. */
  onSettled: () => void
  variant: 'desktop' | 'mobile'
  /** Present when the card was opened FROM a list rather than served as the
   *  next in a queue. The Sunday list opens this same card on a row, because
   *  a second decision surface would be a fork of the one that already
   *  records reasons and carries panel_run_id. */
  onBack?: () => void
}) {
  const mobile = variant === 'mobile'
  const v = useMemo(() => ladderVerdict(idea), [idea])
  const [door, setDoor] = useState<Door | null>(null)
  const [asking, setAsking] = useState<Asking>(null)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [receipt, setReceipt] = useState<string | null>(null)
  const [approved, setApproved] = useState(false)
  const [openedAt] = useState(() => Date.now())

  const judges = useJudgeVerdicts(v?.panelRunId ?? null, door === 'scores')

  const toggle = (code: string) =>
    setPicked(p => { const n = new Set(p); n.has(code) ? n.delete(code) : n.add(code); return n })

  const ask = (a: Asking) => { setPicked(new Set()); setAsking(a) }
  const cancel = () => { setAsking(null); setPicked(new Set()) }

  const commit = async () => {
    if (!asking) return
    const reasons = [...picked]
    const runId = v?.panelRunId ?? null
    if (asking.kind === 'rerouted') {
      await recordReroute({ ideaId: idea.id, from: idea.lane_slot ?? null, to: asking.to, reasons, panelRunId: runId })
    } else {
      await recordDecision({ ideaId: idea.id, kind: asking.kind, reasons, panelRunId: runId, dwellMs: Date.now() - openedAt })
    }
    setReceipt(VERB[asking.kind])
    setApproved(asking.kind === 'approved')
    setAsking(null)
  }

  const lane = idea.lane_slot || v?.winner || null

  // ── the receipt ────────────────────────────────────────────────────────
  if (receipt) {
    return (
      <div data-testid="decide-receipt" className="flex min-h-[var(--decide-h)] flex-col justify-center gap-3 rounded-2xl border border-white/8 border-l-[3px] border-l-accent bg-white/[0.02] p-6">
        <p className="text-title font-semibold text-ink">{receipt}</p>
        <p className="max-w-[46ch] text-label text-ink-muted">
          {picked.size ? 'Your reason went with it. ' : 'No reason given. '}
          {v?.panelRunId
            ? 'The checks that disagreed with you will be told.'
            : 'This one was never judged, so there is nothing to tell.'}
        </p>
        <div className="flex flex-wrap gap-2">
          {/* The door from deciding to drafting. The approval is a ledger row
              and moves nothing on its own, so without this "Write this" ended
              at a receipt and the piece sat exactly where it was. The composer
              link is the one six other surfaces already use. */}
          {approved && (
            <button type="button" data-testid="decide-start-writing"
              onClick={() => { window.location.hash = `#/content?idea=${idea.id}` }}
              className="btn-contrast tap-44 min-h-[44px] rounded-xl px-5 text-label font-semibold">Start writing</button>
          )}
          <button type="button" onClick={onSettled}
            className={approved
              ? 'tap-44 min-h-[44px] rounded-xl border border-white/12 px-4 text-label font-semibold text-ink hover:bg-white/[0.06]'
              : 'btn-contrast tap-44 min-h-[44px] rounded-xl px-5 text-label font-semibold'}>Next piece</button>
        </div>
      </div>
    )
  }

  // ── a depth layer: the same box, never an expansion ────────────────────
  if (door) {
    return (
      <div data-testid={`decide-layer-${door}`} className="flex min-h-[var(--decide-h)] flex-col rounded-2xl border border-white/8 bg-white/[0.02] p-4 sm:p-5">
        <div className="flex shrink-0 items-center gap-3 border-b border-white/8 pb-3">
          <button type="button" onClick={() => setDoor(null)} data-testid="decide-back"
            className="tap-44 inline-flex min-h-[32px] items-center rounded-lg border border-white/10 px-3 text-label text-ink-muted hover:text-ink">
            Back
          </button>
          <Eyebrow>{door === 'topic' ? 'The topic' : door === 'scores' ? 'What it scored' : 'Where it came from'}</Eyebrow>
        </div>

        <div className="min-h-0 flex-1 pt-3">
          {door === 'scores' && (
            judges.loading ? <p className="text-label text-ink-faint">Reading the panel…</p>
            : judges.error ? <p className="text-label text-amber-300">Could not read the scores: {judges.error}</p>
            : !judges.verdicts.length ? <p className="text-label text-ink-faint">This piece was never judged.</p>
            : (
              <>
                {judges.verdicts.filter(j => !j.adversarial).map(j => (
                  <div key={j.judge} className="grid grid-cols-[104px_26px_1fr] items-center gap-3 border-t border-white/8 py-1.5 first:border-t-0">
                    <span className="text-label capitalize text-ink-muted">{j.judge}</span>
                    <span className={`text-right text-label tabular-nums ${j.score !== null && j.score < 5 ? 'text-amber-300' : 'text-ink'}`}>{j.score ?? '—'}</span>
                    <span className="h-1 rounded-full bg-white/10">
                      <span className={`block h-1 rounded-full ${j.score !== null && j.score < 5 ? 'bg-amber-400' : 'bg-accent'}`} style={{ width: `${(j.score ?? 0) * 10}%` }} />
                    </span>
                  </div>
                ))}
                {/* Beside the panel, never inside it. Folding a strong
                    objection into the range would read as an endorsement. */}
                {judges.verdicts.filter(j => j.adversarial).map(j => (
                  <p key={j.judge} className="mt-3 border-t border-white/8 pt-3 text-label text-ink-muted">
                    <span className="font-semibold text-ink">Arguing to kill it ({j.score ?? '—'}/10): </span>
                    {j.theOneFix || 'no objection stated'}
                  </p>
                ))}
              </>
            )
          )}

          {door === 'topic' && (
            v?.expansion.ok ? (
              <>
                <p className="text-label leading-relaxed text-ink">{v.expansion.angle}</p>
                <p className="mt-3 border-t border-white/8 pt-3 text-label text-ink-muted">
                  <span className="font-semibold text-ink">Known: </span>{v.expansion.known} points.{' '}
                  <span className="font-semibold text-ink">Inferred: </span>{v.expansion.inferred}.
                </p>
              </>
            ) : <p className="text-label text-ink-faint">{v?.expansion.failed || 'Nothing was worked up for this one.'}</p>
          )}

          {door === 'origin' && (
            <ol className="space-y-2">
              <li className="text-label text-ink">Arrived from {idea.source_type?.replace(/_/g, ' ') || 'an unnamed source'}
                <span className="block text-micro text-ink-faint">{relativeTimeOr(idea.created_at, 'no date')}</span></li>
              {v?.expansion.ok && <li className="text-label text-ink">Rewritten into an argument
                <span className="block text-micro text-ink-faint">Seed: {idea.idea}</span></li>}
              {v?.attempts.map(a => (
                <li key={a.n} className="text-label text-ink">
                  {a.outcome === 'declined' ? 'Tried to lift it and refused' : a.outcome === 'improved' ? 'Lifted it' : `Repair ${a.outcome}`}
                  <span className="block text-micro text-ink-faint">
                    {a.researched ? `Read ${a.sources?.length ?? 0} sources. ` : 'Nothing to research. '}{a.detail || ''}
                  </span>
                </li>
              ))}
              {v?.confirmation && <li className="text-label text-ink">Judged again on a fresh rewrite
                <span className="block text-micro text-ink-faint">{v.confirmation.agreed ? 'Same answer.' : 'Different answer, so the better one was kept.'}</span></li>}
            </ol>
          )}
        </div>
      </div>
    )
  }

  // ── the decision ───────────────────────────────────────────────────────
  const reasonStep = asking && (
    <div data-testid="decide-why">
      <p className="mb-2.5 text-label text-ink-muted">
        {asking.kind === 'rerouted'
          ? <>Moving to <b className="font-semibold text-ink">{asking.to}</b>. Why does it belong there?</>
          : asking.kind === 'approved' ? 'What makes this one worth writing?' : 'What is wrong with it?'}
      </p>
      <ReasonChips kind={asking.kind} picked={picked} toggle={toggle} />
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={commit} data-testid="decide-commit"
          className="btn-contrast tap-44 min-h-[44px] rounded-xl px-5 text-label font-semibold">Done</button>
        <button type="button" onClick={cancel} className="tap-44 min-h-[44px] rounded-xl px-3 text-label text-ink-faint hover:text-ink">Back</button>
      </div>
    </div>
  )

  return (
    <>
      <article data-testid="decide-card" className="flex min-h-[var(--decide-h)] flex-col rounded-2xl border border-white/8 border-l-[3px] border-l-accent bg-white/[0.02] p-4 sm:p-5">
        <div className="flex items-center gap-2.5">
          {onBack ? (
            <button type="button" onClick={onBack} data-testid="decide-close"
              className="tap-44 inline-flex min-h-[32px] items-center rounded-lg border border-white/10 px-3 text-label text-ink-muted hover:text-ink">
              Back
            </button>
          ) : <IconTile icon={PenLine} size="sm" tone="accent" />}
          <Eyebrow tone="accent">{onBack ? 'Overrule this' : 'Decide now'}</Eyebrow>
        </div>

        <h2 className="mt-3 max-w-[34ch] text-title font-semibold leading-snug text-ink" data-testid="decide-claim">
          {v?.expansion.angle || idea.idea}
        </h2>
        {idea.thesis && <p className="mt-2 max-w-[60ch] text-label leading-relaxed text-ink-muted">{idea.thesis}</p>}

        {v && <Facts v={v} />}

        <div className="mt-4 border-t border-white/8 pt-3.5">
          <Eyebrow>Where it goes</Eyebrow>
          <div className="mt-2 flex flex-wrap items-center gap-1.5" data-testid="decide-channels">
            {SUBCHANNELS.map(f => (
              <button
                key={f.slug}
                type="button"
                data-testid={`decide-channel-${f.slug}`}
                disabled={f.slug === lane}
                onClick={() => ask({ kind: 'rerouted', to: f.slug })}
                className={`tap-44 inline-flex min-h-[36px] items-center rounded-full border px-3.5 text-label ${
                  f.slug === lane ? 'border-accent/50 bg-accent/15 font-semibold text-ink' : 'border-white/10 text-ink-muted hover:text-ink'
                }`}
              >
                {f.label}
              </button>
            ))}
            {/* The disagreement, stated rather than buried. It is the most
                valuable row the system produces and it went nowhere before. */}
            {v?.routerDisagrees && v.winner && (
              <span data-testid="decide-disagrees" className="rounded-full border border-amber-400/25 bg-amber-500/10 px-2.5 py-1 text-micro font-semibold text-amber-200">
                The router said {v.winner}
              </span>
            )}
          </div>
        </div>

        {/* The footer is a fixed slot. Swapping the actions for the question
            must not move a single pixel of the piece above it. */}
        {/* MEASURED, not guessed: the actions state is 104px and the reason
            state is 138px, so 104 let the card grow by 16px the moment a
            button was pressed. The spec caught it; the number below is what
            the taller of the two actually needs. */}
        <footer className="mt-3.5 min-h-[140px] shrink-0 border-t border-white/8 pt-3.5">
          {asking && !mobile ? reasonStep : (
            <>
              <div className="flex flex-wrap items-center gap-2" data-testid="decide-actions">
                <button type="button" onClick={() => ask({ kind: 'approved' })} data-testid="decide-write"
                  className="btn-contrast tap-44 min-h-[44px] rounded-xl px-5 text-label font-semibold">Write this</button>
                <button type="button" onClick={() => ask({ kind: 'binned' })} data-testid="decide-bin"
                  className="tap-44 min-h-[44px] rounded-xl border border-white/12 px-4 text-label font-semibold text-ink hover:bg-white/[0.06]">Not this one</button>
                <button type="button" onClick={onSettled} className="tap-44 min-h-[44px] rounded-xl px-3 text-label text-ink-faint hover:text-ink">Later</button>
              </div>
              <div className="mt-2.5 flex flex-wrap gap-1.5" data-testid="decide-doors">
                {([['topic', 'Topic', Layers], ['scores', 'Scores', Gavel], ['origin', 'Origin', GitBranch]] as const).map(([id, label, Icon]) => (
                  <button key={id} type="button" onClick={() => setDoor(id)} data-testid={`decide-door-${id}`}
                    className="tap-44 inline-flex min-h-[32px] items-center gap-1.5 rounded-lg border border-white/8 px-3 text-micro text-ink-faint hover:border-white/15 hover:text-ink">
                    <Icon size={12} />{label}
                  </button>
                ))}
              </div>
            </>
          )}
        </footer>
      </article>

      {/* On a phone the question arrives over the card. Hiding the piece to
          make room for the chips is the same jump the fixed footer exists to
          prevent, so the sheet leaves it exactly where it was. */}
      {mobile && (
        <BottomSheet open={Boolean(asking)} onClose={cancel} fullHeight={false} ariaLabel="Why">
          <div className="p-4">{reasonStep}</div>
        </BottomSheet>
      )}
    </>
  )
}
