import { useMemo } from 'react'
import { CheckCircle2, ExternalLink, FileText, Mail, Target } from '@/lib/icons'
import { BoardSkeleton } from '../shared/Skeleton'
import { Eyebrow } from '../shared/Eyebrow'
import { BridgeCard } from '../BridgeCard'
import { HunterStatus } from '../HunterStatus'
import { FreshnessLine } from '../shared/FreshnessLine'
import { AppFrame } from '../shared/AppFrame'
import { SurfaceHeader } from '../shared/SurfaceHeader'
import { useBridges } from '../../hooks/useBridges'
import { useHuntRoles, type HuntRole } from '../../hooks/useHuntRoles'
import { contactAction, copyText } from '../../lib/contactAction'
import { useToast } from '../shared/Toast'

// The Hunt lane: the roles Krish said Yes to on the Pipeline sheet, each with
// its package and the person who can get him in. Verdicts are given on the
// sheet (column A) and everything else follows from a Process run. Nothing
// here sends anything: drafts land in his Gmail drafts and he presses send.

const MAX_CARDS = 5

export const HUNT_LINE = 'The roles you said Yes to, and the person who can get you in. Change column A in the sheet, press Process, and everything else lands here.'

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

function RoleRow({ r }: { r: HuntRole }) {
  const { toast } = useToast()
  const built = !!(r.cv_url && r.letter_url)
  const applied = appliedLine(r)
  // Krish 2026-09-15: every network suggestion is one click to contact. The name
  // used to be a link to a profile and nothing more, so the drafted opener stayed
  // on the card he was not looking at.
  const action = r.person
    ? contactAction(r.person, r.bridge?.ask || '', { role: r.title, company: r.company })
    : null

  const contactNow = async () => {
    if (!action) return
    let copied = true
    if (action.copies) copied = await copyText(r.bridge?.ask || '')
    if (action.href) window.open(action.href, action.kind === 'email' ? '_self' : '_blank', 'noopener')
    toast(copied ? action.note
      : 'Could not reach the clipboard. Open the Hunt card to copy the draft by hand.')
  }
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
  const top = useMemo(() => bridges.slice(0, MAX_CARDS), [bridges])

  const historyLine = useMemo(() => {
    const parts: string[] = []
    if (stateCounts.reached_out) parts.push(`${stateCounts.reached_out} reached out`)
    if (stateCounts.snoozed) parts.push(`${stateCounts.snoozed} snoozed`)
    if (stateCounts.not_a_path) parts.push(`${stateCounts.not_a_path} not a path`)
    return parts.join(', ')
  }, [stateCounts])

  const header = !narrow && (
    <SurfaceHeader
      title="Hunt"
      description={HUNT_LINE}
      icon={<Target size={18} className="text-accent" />}
      meta={<FreshnessLine lane="hunt" />}
      className="pb-4"
    />
  )

  if (loading && hunt.loading && bridges.length === 0 && hunt.roles.length === 0) {
    return narrow ? (
      <div className="space-y-4 px-5">
        <BoardSkeleton lanes={1} cardsPerLane={3} hero={false} />
      </div>
    ) : (
      <AppFrame header={header}>
        <BoardSkeleton lanes={1} cardsPerLane={3} hero={false} />
      </AppFrame>
    )
  }

  // On narrow the MobileShell owns the title and the scroll, like every other
  // lane. On a desk the title is chrome and the roster scrolls under it.
  const body = (
    <>
      <HunterStatus />

      <section data-testid="hunt-roles">
        <Eyebrow>Roles you said Yes to</Eyebrow>
        {hunt.roles.length === 0 ? (
          <p className="text-body text-ink-faint mt-2">
            Nothing marked Yes on the sheet right now. Mark a row Yes and press Process.
          </p>
        ) : (
          <ul className={narrow ? 'space-y-3 mt-2' : 'grid grid-cols-1 xl:grid-cols-2 gap-3 mt-2'}>
            {hunt.roles.map(r => <RoleRow key={r.job_id} r={r} />)}
          </ul>
        )}
      </section>

      <section>
        <Eyebrow>Warmest paths, with a draft</Eyebrow>
        {top.length === 0 ? (
          <p className="text-body text-ink-faint mt-2">
            No paths waiting. A Process run refills this.
          </p>
        ) : (
          <div className={narrow ? 'space-y-3 mt-2' : 'grid grid-cols-1 xl:grid-cols-2 gap-4 mt-2'}>
            {top.map(b => (
              <BridgeCard key={b.bridge_id} bridge={b} onChanged={refetch} />
            ))}
          </div>
        )}
        {historyLine && (
          <p className="text-label text-ink-faint mt-2">Handled so far: {historyLine}.</p>
        )}
      </section>
    </>
  )

  return narrow
    ? <div className="space-y-4 px-5">{body}</div>
    : <AppFrame header={header}><div className="space-y-5 pb-2">{body}</div></AppFrame>
}

export function DesktopBridges() {
  return <BridgesBody narrow={false} />
}
