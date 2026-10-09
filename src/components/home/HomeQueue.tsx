import { useEffect, useMemo, useState } from 'react'
import { ArrowRight } from '@/lib/icons'
import { DoThisNextHero } from '../shared/DoThisNextHero'
import { getZone } from '../../lib/civilDate'
import { homeQueue, queueHead, type HomeQueueInput, type QueueEntry, type QueueGo } from '../../lib/homeQueue'

// The one queue on Home (ADR-030, src/lib/homeQueue.ts). The hook gathers
// what Home already reads or cheaply can: today's move (Home passes it),
// the advisory counts the old drafted-approaches strip fetched, the due
// tests the DueTestsCard fetches, the fresh rulings the vitals line counts,
// and the week's ask. The hero shows the head through the one house hero,
// and yields while the head is today's move, which Today's slot draws.

type NavigateFn = (tab: string, params?: Record<string, string>) => void
const API = import.meta.env.VITE_API_URL ?? ''

/** The advisory lane's counts, read the way the old strip read them. */
function usePilotCounts(): HomeQueueInput['pilots'] {
  const [counts, setCounts] = useState<HomeQueueInput['pilots']>(null)
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const r = await fetch('/api/pilot-deals')
        const j = await r.json()
        const n = (k: string) => { const v = Number(j?.stateCounts?.[k]); return j?.ok && Number.isFinite(v) ? v : 0 }
        if (!cancelled) setCounts({ replied: n('replied'), drafted: n('drafted') })
      } catch {
        if (!cancelled) setCounts({ replied: 0, drafted: 0 })
      }
    }
    void load()
    const iv = setInterval(load, 60_000)
    return () => { cancelled = true; clearInterval(iv) }
  }, [])
  return counts
}

/** How many tests are due, from the same read the DueTestsCard makes. */
function useDueTestCount(): number {
  const [n, setN] = useState(0)
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const res = await fetch(`${API}/api/pilot/worries?tz=${encodeURIComponent(getZone())}`)
        const json = await res.json()
        if (!cancelled) setN(res.ok && json?.ok && Array.isArray(json.due) ? json.due.length : 0)
      } catch {
        if (!cancelled) setN(0)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [])
  return n
}

/** Home reads the fresh rulings once (useWaitingDecisions) and passes the
 *  count: a second subscriber here churned the fit measurement at 1366x768. */
export function useHomeQueue(input: { dailyMove: HomeQueueInput['dailyMove']; weekAsk: string | null; waiting: number }): { queue: QueueEntry[]; head: QueueEntry | null } {
  const pilots = usePilotCounts()
  const dueTests = useDueTestCount()
  const queue = useMemo(
    () => homeQueue({ dailyMove: input.dailyMove, pilots, dueTests, waiting: input.waiting, weekAsk: input.weekAsk }),
    [input.dailyMove, input.weekAsk, input.waiting, pilots, dueTests],
  )
  return { queue, head: queueHead(queue) }
}

export interface QueuePressHandlers {
  onNavigate?: NavigateFn
  /** Open the due tests (the desk pins the card open; the phone opens its sheet). */
  onTests: () => void
  /** Open the list behind the Waiting count. */
  onWaiting: () => void
  /** Open the week's composer (the Focus Ritual's weekly step). */
  onWeek: () => void
}

export function pressFor(go: QueueGo, h: QueuePressHandlers): (() => void) | undefined {
  switch (go.kind) {
    case 'nav': return () => h.onNavigate?.(go.tab, go.params)
    case 'tests': return h.onTests
    case 'waiting': return h.onWaiting
    case 'week': return h.onWeek
    case 'slot': return undefined
  }
}

/** The head of the queue, through the one hero. Renders nothing when the hero yields. */
export function HomeQueueHero({ head, narrow, handlers }: { head: QueueEntry | null; narrow: boolean; handlers: QueuePressHandlers }) {
  if (!head) return null
  return (
    <DoThisNextHero
      testId="home-queue-move"
      narrow={narrow}
      stackAction={narrow}
      descriptor={{
        headline: head.headline, sub: head.sub, actionLabel: head.press.label,
        tone: head.tier === 'reply' ? 'emerald' : head.tier === 'health' ? 'amber' : 'violet',
        icon: <ArrowRight size={16} className="text-accent" />,
      }}
      onAct={pressFor(head.press.go, handlers)}
    />
  )
}
