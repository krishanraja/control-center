import { useMemo } from 'react'
import { HeartHandshake } from '@/lib/icons'
import { BoardSkeleton } from '../shared/Skeleton'
import { BridgeCard } from '../BridgeCard'
import { HunterStatus } from '../HunterStatus'
import { useBridges } from '../../hooks/useBridges'

// The warm-intro lane: the five best paths into live target roles, drafted
// by hunter, decided and sent by Krish. Five cards maximum by design; depth
// belongs to the pipeline, not this surface.

const MAX_CARDS = 5

export function BridgesBody({ narrow }: { narrow: boolean }) {
  const { bridges, stateCounts, loading, refetch } = useBridges()
  const top = useMemo(() => bridges.slice(0, MAX_CARDS), [bridges])

  const historyLine = useMemo(() => {
    const parts: string[] = []
    if (stateCounts.reached_out) parts.push(`${stateCounts.reached_out} reached out`)
    if (stateCounts.snoozed) parts.push(`${stateCounts.snoozed} snoozed`)
    if (stateCounts.not_a_path) parts.push(`${stateCounts.not_a_path} not a path`)
    return parts.join(', ')
  }, [stateCounts])

  if (loading && bridges.length === 0) {
    return (
      <div className="space-y-5">
        <header>
          <h1 className="text-2xl font-semibold text-white tracking-tight flex items-center gap-2">
            <HeartHandshake size={20} className="text-violet-300" />
            Bridges
          </h1>
          <p className="text-body text-white/55 mt-1">Finding the warm paths in…</p>
        </header>
        <BoardSkeleton lanes={1} cardsPerLane={3} hero={false} />
      </div>
    )
  }

  return (
    <div className={narrow ? 'space-y-4 p-1' : 'space-y-5'}>
      <header>
        <h1 className="text-2xl font-semibold text-white tracking-tight flex items-center gap-2">
          <HeartHandshake size={20} className="text-violet-300" />
          Bridges
        </h1>
        <p className="text-body text-white/55 mt-1">
          The five warmest paths into roles you are tracking. You send everything yourself.
        </p>
      </header>

      <HunterStatus />

      {top.length === 0 ? (
        <p className="text-body text-white/45">
          No bridges waiting. The Monday and Thursday runs refill this lane.
        </p>
      ) : (
        <div className={narrow ? 'space-y-3' : 'grid grid-cols-1 xl:grid-cols-2 gap-4'}>
          {top.map(b => (
            <BridgeCard key={b.bridge_id} bridge={b} onChanged={refetch} />
          ))}
        </div>
      )}

      {historyLine && (
        <p className="text-label text-white/40">Handled so far: {historyLine}.</p>
      )}
    </div>
  )
}

export function DesktopBridges() {
  return <BridgesBody narrow={false} />
}
