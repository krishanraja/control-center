import { useMemo } from 'react'
import { ExternalLink, FileText, Target } from '@/lib/icons'
import { BoardSkeleton } from '../shared/Skeleton'
import { Eyebrow } from '../shared/Eyebrow'
import { BridgeCard } from '../BridgeCard'
import { HunterStatus } from '../HunterStatus'
import { FreshnessLine } from '../shared/FreshnessLine'
import { useBridges } from '../../hooks/useBridges'
import { useHuntRoles, type HuntRole } from '../../hooks/useHuntRoles'

// The Hunt lane: the roles Krish said Yes to on the Pipeline sheet, each with
// its package and the person who can get him in. Verdicts are given on the
// sheet (column A) and everything else follows from a Process run. Nothing
// here sends anything: drafts land in his Gmail drafts and he presses send.

const MAX_CARDS = 5

export const HUNT_LINE = 'The roles you said Yes to, and the person who can get you in. Change column A in the sheet, press Process, and everything else lands here.'

function packageLine(r: HuntRole): string {
  if (r.cv_url && r.letter_url) return r.package_status || 'Materials staged'
  if (r.status === 'dead') return 'Posting dead, cannot build. Your call on the sheet.'
  if (r.package_status === 'blocked') return `Not built: ${r.rejection_reason || 'blocked'}`
  return 'Package builds on the next Process run'
}

function RoleRow({ r }: { r: HuntRole }) {
  const built = !!(r.cv_url && r.letter_url)
  return (
    <li className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3" data-testid="hunt-role">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-ui font-semibold text-white/90">
            {r.title}
            <span className="text-white/50 font-normal"> at {r.company}</span>
          </p>
          <p className="text-label text-white/50 mt-0.5">
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
        <span className={built ? 'text-emerald-300' : 'text-white/55'}>
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
      <div className="mt-2 text-label text-white/70" data-testid="hunt-person">
        {r.person ? (
          <>
            <span className="text-white/45">Reach out to </span>
            {r.person.linkedin_url
              ? <a href={r.person.linkedin_url} target="_blank" rel="noreferrer" className="text-violet-200 hover:text-violet-100 font-medium">{r.person.name}</a>
              : <span className="font-medium text-white/85">{r.person.name}</span>}
            {r.person.title && <span className="text-white/55">, {r.person.title}</span>}
            {r.person.company && <span className="text-white/55"> at {r.person.company}</span>}
            {r.bridge?.evidence && (
              <p className="text-micro text-white/40 mt-1">{r.bridge.evidence}</p>
            )}
          </>
        ) : (
          <span className="text-white/40">Nobody found yet. The next Process run searches your network again and looks outside it.</span>
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
    <header>
      <h1 className="text-2xl font-semibold text-white tracking-tight flex items-center gap-2">
        <Target size={20} className="text-violet-300" />
        Hunt
      </h1>
      <p className="text-body text-white/55 mt-1">{HUNT_LINE}</p>
      <FreshnessLine lane="hunt" />
    </header>
  )

  if (loading && hunt.loading && bridges.length === 0 && hunt.roles.length === 0) {
    return (
      <div className={narrow ? 'space-y-4 px-5' : 'space-y-5'}>
        {header}
        <BoardSkeleton lanes={1} cardsPerLane={3} hero={false} />
      </div>
    )
  }

  return (
    <div className={narrow ? 'space-y-4 px-5' : 'space-y-5'}>
      {/* On narrow the MobileShell owns the title, like every other lane. */}
      {header}

      <HunterStatus />

      <section data-testid="hunt-roles">
        <Eyebrow>Roles you said Yes to</Eyebrow>
        {hunt.roles.length === 0 ? (
          <p className="text-body text-white/45 mt-2">
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
          <p className="text-body text-white/45 mt-2">
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
          <p className="text-label text-white/40 mt-2">Handled so far: {historyLine}.</p>
        )}
      </section>
    </div>
  )
}

export function DesktopBridges() {
  return <BridgesBody narrow={false} />
}
