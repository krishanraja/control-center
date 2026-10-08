import { useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, ExternalLink, FileText, Mail, Play, Send, Target } from '@/lib/icons'
import { BoardSkeleton } from '../shared/Skeleton'
import { Eyebrow } from '../shared/Eyebrow'
import { BridgeCard } from '../BridgeCard'
import { HunterStatus, SHEET_URL, useHunterStatus } from '../HunterStatus'
import { DoThisNextHero } from '../shared/DoThisNextHero'
import { huntMove, type HuntMoveKind } from '../../lib/surfaceMoves'
import { FreshnessLine } from '../shared/FreshnessLine'
import { AppFrame } from '../shared/AppFrame'
import { SurfaceHeader } from '../shared/SurfaceHeader'
import { useBridges } from '../../hooks/useBridges'
import { useHuntRoles, type HuntRole } from '../../hooks/useHuntRoles'
import { contactAction, copyText } from '../../lib/contactAction'
import { useToast } from '../shared/Toast'
import { HuntRuleList } from '../HuntRuleList'
import { OptionChips } from '../goals/GoalPickers'
import { useHuntReview, type OpenApplication, type PendingPress } from '../../hooks/useHuntReview'
import { OUTCOMES, OUTCOME_LABEL } from '../../lib/hunterActions'

type Toast = ReturnType<typeof useToast>['toast']

// The Hunt lane: the roles Krish said Yes to on the Pipeline sheet, each with
// its package and the person who can get him in. Verdicts are given on the
// sheet (column A) and everything else follows from a Process run. Nothing
// here sends anything: drafts land in his Gmail drafts and he presses send.

const MAX_CARDS = 5

export const HUNT_LINE = 'Rule on new roles, open the applications hunter filled in for you, and reach the person who can get you in. Every press here goes to hunter, which keeps the sheet up to date.'

// Krish's own column A verdict, mirrored onto the role by hunter: "Applied",
// "Already applied", or null for not applied. Shown because the lane could name the
// role and the person but not say whether he had already gone in, which is the first
// thing you need before reaching out to anyone about it.
function appliedLine(r: HuntRole): string | null {
  if (!r.application_state) return null
  const when = r.applied_at ? new Date(r.applied_at) : null
  const day = when && !Number.isNaN(when.getTime())
    ? when.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
    : null
  return day ? `${r.application_state} ${day}` : r.application_state
}

function packageLine(r: HuntRole): string {
  if (r.cv_url && r.letter_url) return r.package_status || 'Materials staged'
  if (r.status === 'dead') return 'Posting dead, cannot build. Your call on the sheet.'
  if (r.package_status === 'blocked') return `Not built: ${r.rejection_reason || 'blocked'}`
  return 'Package builds on the next Process run'
}

function roleAction(r: HuntRole) {
  return r.person ? contactAction(r.person, r.bridge?.ask || '', { role: r.title, company: r.company }) : null
}

/** One click to contact, from the row or from the lane's move: the same act either way. */
async function contactRole(r: HuntRole, toast: Toast) {
  const action = roleAction(r)
  if (!action) return
  let copied = true
  if (action.copies) copied = await copyText(r.bridge?.ask || '')
  if (action.href) window.open(action.href, action.kind === 'email' ? '_self' : '_blank', 'noopener')
  toast(copied ? action.note
    : 'Could not reach the clipboard. Open the Hunt card to copy the draft by hand.')
}

type ActFn = ReturnType<typeof useHuntReview>['act']

// Applying, here instead of the email: prepare the filled application, open it
// in his own browser for the extension to fill, and say what happened after.
// He presses Submit on the employer's page himself; nothing here can.
function ApplyLine({ r, open, pending, act }: {
  r: HuntRole; open: OpenApplication | undefined; pending: PendingPress | undefined; act: ActFn
}) {
  const { toast } = useToast()
  const [busy, setBusy] = useState(false)
  const built = !!(r.cv_url && r.letter_url)
  const press = async (kind: 'prepare' | 'outcome' | 'verdict', payload: Record<string, string> = {}) => {
    setBusy(true)
    const err = await act({ kind, job_id: r.job_id, payload })
    setBusy(false)
    toast(err || 'Sent to hunter. It acts on this within a few minutes.')
  }
  const btn = 'tap-44 inline-flex items-center gap-1 rounded px-2 py-0.5 text-micro font-medium disabled:opacity-50'
  if (pending) {
    return <p className="mt-2 text-label text-emerald-300" data-testid="hunt-apply-pending">Sent to hunter. It acts on this within a few minutes.</p>
  }
  if (r.application_state) {
    return (
      <div className="mt-2" data-testid="hunt-outcome">
        <OptionChips
          label="What happened next?"
          options={OUTCOMES.map(o => ({ value: o, label: OUTCOME_LABEL[o] }))}
          value=""
          disabled={busy}
          onChange={o => { void press('outcome', { outcome: o }) }}
        />
      </div>
    )
  }
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 text-label" data-testid="hunt-apply">
      {open?.open_url ? (
        <a href={open.open_url} target="_blank" rel="noreferrer" data-testid="hunt-open-form"
           className={`${btn} bg-violet-500/15 text-violet-200 hover:bg-violet-500/25`}>
          <ExternalLink size={10} /> Open the filled form
        </a>
      ) : built ? (
        <button type="button" disabled={busy} onClick={() => press('prepare')} data-testid="hunt-prepare"
                className={`${btn} bg-violet-500/15 text-violet-200 hover:bg-violet-500/25`}>
          <FileText size={10} /> Prepare the application
        </button>
      ) : null}
      <button type="button" disabled={busy} onClick={() => press('verdict', { verdict: 'applied' })} data-testid="hunt-applied-btn"
              className={`${btn} bg-white/[0.05] text-ink-muted hover:bg-white/[0.09]`}>
        <CheckCircle2 size={10} /> I applied
      </button>
      {open?.open_url && <span className="text-micro text-ink-faint">Your extension fills it in; you press Submit.</span>}
    </div>
  )
}

function RoleRow({ r, open, pending, act }: {
  r: HuntRole; open?: OpenApplication; pending?: PendingPress; act: ActFn
}) {
  const { toast } = useToast()
  const built = !!(r.cv_url && r.letter_url)
  const applied = appliedLine(r)
  // Krish 2026-09-15: every network suggestion is one click to contact. The name
  // used to be a link to a profile and nothing more, so the drafted opener stayed
  // on the card he was not looking at.
  const action = roleAction(r)
  const contactNow = () => contactRole(r, toast)
  return (
    <li className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3" data-testid="hunt-role">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-ui font-semibold text-ink">
            {r.title}
            <span className="text-ink-faint font-normal"> at {r.company}</span>
          </p>
          <p className="text-label text-ink-faint mt-0.5">
            {[r.score != null ? `score ${r.score}` : null, r.location, r.comp].filter(Boolean).join(' | ')}
          </p>
        </div>
        {r.url && (
          <a href={r.url} target="_blank" rel="noreferrer" className="shrink-0 text-label text-violet-300 hover:text-violet-200 flex items-center gap-1">
            posting <ExternalLink size={10} />
          </a>
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-label">
        {applied && (
          <span className="text-emerald-300" data-testid="hunt-applied">
            <CheckCircle2 size={11} className="inline mr-1 align-[-1px]" />
            {applied}
          </span>
        )}
        <span className={built ? 'text-emerald-300' : 'text-ink-faint'}>
          <FileText size={11} className="inline mr-1 align-[-1px]" />
          {packageLine(r)}
        </span>
        {built && (
          <>
            <a href={r.cv_url!} target="_blank" rel="noreferrer" className="text-violet-300 hover:text-violet-200">CV</a>
            <a href={r.letter_url!} target="_blank" rel="noreferrer" className="text-violet-300 hover:text-violet-200">Cover letter</a>
          </>
        )}
      </div>
      <ApplyLine r={r} open={open} pending={pending} act={act} />
      <div className="mt-2 text-label text-ink-muted" data-testid="hunt-person">
        {r.person ? (
          <>
            <span className="text-ink-faint">
              {applied ? 'Already in, so follow up with ' : 'Reach out to '}
            </span>
            {r.person.linkedin_url
              ? <a href={r.person.linkedin_url} target="_blank" rel="noreferrer" className="text-violet-200 hover:text-violet-100 font-medium">{r.person.name}</a>
              : <span className="font-medium text-ink-muted">{r.person.name}</span>}
            {r.person.title && <span className="text-ink-faint">, {r.person.title}</span>}
            {r.person.company && <span className="text-ink-faint"> at {r.person.company}</span>}
            {action && (
              <button
                type="button"
                onClick={contactNow}
                data-testid="hunt-contact"
                title={action.note}
                className="ml-2 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-micro font-medium
                           bg-violet-500/15 text-violet-200 hover:bg-violet-500/25 transition-colors"
              >
                {action.kind === 'email' ? <Mail size={10} /> : <ExternalLink size={10} />}
                {action.label}
              </button>
            )}
            {r.bridge?.evidence && (
              <p className="text-micro text-ink-faint mt-1">{r.bridge.evidence}</p>
            )}
          </>
        ) : (
          <span className="text-ink-faint">Nobody found yet. The next Process run searches your network again and looks outside it.</span>
        )}
      </div>
    </li>
  )
}

export function BridgesBody({ narrow }: { narrow: boolean }) {
  const { bridges, stateCounts, loading, refetch } = useBridges()
  const hunt = useHuntRoles()
  const hunter = useHunterStatus()
  const review = useHuntReview()
  const { toast } = useToast()
  const top = useMemo(() => bridges.slice(0, MAX_CARDS), [bridges])

  // The one move (src/lib/surfaceMoves.ts): a broken hunter, then a person to
  // write to, then the sheet, then the packages. The lists below are the rest.
  const move = useMemo(() => huntMove({
    status: hunter.s ? {
      failing: hunter.failing,
      failLine: hunter.failLine,
      waitingOnKrish: hunter.s.waitingOnKrish,
      approvedAwaitingBuild: hunter.s.approvedAwaitingBuild,
    } : null,
    roles: hunt.roles.map(r => ({
      id: r.job_id, title: r.title, company: r.company,
      person: r.person?.name ?? null, applied: !!r.application_state, contactable: !!roleAction(r),
    })),
    paths: top.filter(b => b.contact).map(b => ({
      id: b.bridge_id, person: b.contact!.full_name, title: b.role?.title ?? null, company: b.role?.company ?? null,
    })),
    running: hunter.inFlight?.command ?? null,
  }), [hunter.s, hunter.failing, hunter.failLine, hunter.inFlight, hunt.roles, top])

  const act: Record<HuntMoveKind, (() => void) | undefined> = {
    fix: () => { void hunter.queue('process') },
    contact: () => {
      const r = hunt.roles.find(x => x.person && roleAction(x))
      if (r) void contactRole(r, toast)
    },
    path: () => {
      const first = top.find(b => b.contact)
      const el = first ? document.querySelector<HTMLElement>(`[data-bridge-id="${first.bridge_id}"]`) : null
      el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
      el?.querySelector<HTMLElement>('button, a[href]')?.focus({ preventScroll: true })
    },
    verdicts: () => {
      const el = document.getElementById('hunt-rule-list')
      if (el) el.scrollIntoView({ block: 'start', behavior: 'smooth' })
      else window.open(SHEET_URL, '_blank', 'noopener')
    },
    build: () => { void hunter.queue('packages') },
    running: undefined,
    clear: undefined,
  }
  const icon = move.kind === 'fix' ? <AlertTriangle size={16} className="text-amber-300" />
    : move.kind === 'contact' || move.kind === 'path' ? <Send size={16} className="text-violet-300" />
    : move.kind === 'verdicts' ? <ExternalLink size={16} className="text-violet-300" />
    : move.kind === 'build' ? <FileText size={16} className="text-violet-300" />
    : move.kind === 'running' ? <Play size={16} className="text-ink-muted" />
    : <CheckCircle2 size={16} className="text-emerald-400/80" />
  // Before the roles and the paths are read, "nothing needs you" would be a
  // guess, so there is no move until they are.
  const ready = !loading && !hunt.loading
  const hero = ready && (
    <DoThisNextHero
      testId="hunt-move"
      stackAction={narrow}
      narrow={narrow}
      busy={hunter.busy != null}
      descriptor={{ headline: move.headline, sub: move.sub, actionLabel: move.actionLabel, icon, tone: move.tone, clear: move.clear }}
      onAct={act[move.kind]}
      why={move.why}
    />
  )
  // Nothing in the hunt is said once, by the move. The two lists then say
  // nothing about the same nothing.
  const quiet = move.kind === 'clear' || move.kind === 'running'

  const historyLine = useMemo(() => {
    const parts: string[] = []
    if (stateCounts.reached_out) parts.push(`${stateCounts.reached_out} reached out`)
    if (stateCounts.snoozed) parts.push(`${stateCounts.snoozed} snoozed`)
    if (stateCounts.not_a_path) parts.push(`${stateCounts.not_a_path} not a path`)
    return parts.join(', ')
  }, [stateCounts])

  const header = !narrow && (
    <div className="flex flex-col gap-4 pb-4">
      <SurfaceHeader
        title="Hunt"
        description={HUNT_LINE}
        icon={<Target size={18} className="text-accent" />}
        meta={<FreshnessLine lane="hunt" />}
      />
      {hero}
    </div>
  )

  if (loading && hunt.loading && bridges.length === 0 && hunt.roles.length === 0) {
    return narrow ? (
      <div className="space-y-4 px-5">
        <BoardSkeleton lanes={1} cardsPerLane={3} hero={false} />
      </div>
    ) : (
      <AppFrame header={header} capturePills bodyTestId="hunt-scroll">
        <BoardSkeleton lanes={1} cardsPerLane={3} hero={false} />
      </AppFrame>
    )
  }

  // On narrow the MobileShell owns the title and the scroll, like every other
  // lane. On a desk the title is chrome and the roster scrolls under it.
  const body = (
    <>
      {narrow && hero}
      <HunterStatus hunter={hunter} />

      <HuntRuleList roles={review.toRule} pending={review.pending} act={review.act} narrow={narrow} />

      {/* An empty list on a quiet lane is not a section: the move already
          said why there is nothing, and a heading over nothing says it again. */}
      {!(quiet && hunt.roles.length === 0) && (
      <section data-testid="hunt-roles">
        <Eyebrow>Roles you said Yes to</Eyebrow>
        {hunt.roles.length === 0 ? (
          <p className="text-body text-ink-faint mt-2">
            Nothing marked Yes on the sheet right now.
          </p>
        ) : (
          <ul className={narrow ? 'space-y-3 mt-2' : 'grid grid-cols-1 xl:grid-cols-2 gap-3 mt-2'}>
            {hunt.roles.map(r => (
              <RoleRow key={r.job_id} r={r} open={review.approvals[r.job_id]}
                       pending={review.pending[r.job_id]} act={review.act} />
            ))}
          </ul>
        )}
      </section>
      )}

      {!(quiet && top.length === 0 && !historyLine) && (
      <section>
        <Eyebrow>Warmest paths, with a draft</Eyebrow>
        {top.length === 0 ? (
          <p className="text-body text-ink-faint mt-2">
            No paths waiting. A Process run refills this.
          </p>
        ) : (
          <div className={narrow ? 'space-y-3 mt-2' : 'grid grid-cols-1 xl:grid-cols-2 gap-4 mt-2'}>
            {top.map(b => (
              <div key={b.bridge_id} data-bridge-id={b.bridge_id}>
                <BridgeCard bridge={b} onChanged={refetch} />
              </div>
            ))}
          </div>
        )}
        {historyLine && (
          <p className="text-label text-ink-faint mt-2">Handled so far: {historyLine}.</p>
        )}
      </section>
      )}
    </>
  )

  return narrow
    ? <div className="space-y-4 px-5">{body}</div>
    : <AppFrame header={header} capturePills bodyTestId="hunt-scroll"><div className="space-y-5 pb-2">{body}</div></AppFrame>
}

export function DesktopBridges() {
  return <BridgesBody narrow={false} />
}
