import { useMemo } from 'react'
import { isToday, isPast, parseISO } from 'date-fns'
import { Clock, AlarmClock, Inbox, CheckCircle2 } from 'lucide-react'
import type { TaskRow } from '../../hooks/useRealtimeTasks'
import { DoThisNextHero, type HeroDescriptor } from '../shared/DoThisNextHero'

// Today's "Do this next" — same shared hero grammar as Pipeline / Network /
// Visibility / Content. Krish opens Today to knock through what's due and what's
// waiting on him; the hero picks the single highest-priority item (most overdue
// first) so he never has to scan to find it. Action selects the task, which is
// exactly what "Open" does in the list.

type TaskKind = 'overdue' | 'due_today' | 'waiting' | 'clear'

interface NextTask {
  kind: TaskKind
  task?: TaskRow
  descriptor: HeroDescriptor
}

function clip(s: string | null | undefined, n = 56): string {
  if (!s) return ''
  return s.length > n ? `${s.slice(0, n)}…` : s
}

function overdueDays(t: TaskRow): number {
  if (!t.due_date) return 0
  const d = parseISO(t.due_date)
  if (!isPast(d) || isToday(d)) return 0
  return Math.max(1, Math.floor((Date.now() - d.getTime()) / 86_400_000))
}

export function computeNextTask(due: TaskRow[], waiting: TaskRow[]): NextTask {
  // 1) Most overdue task wins — earliest due_date that's strictly past.
  const overdue = due
    .filter(t => t.due_date && isPast(parseISO(t.due_date)) && !isToday(parseISO(t.due_date)))
    .sort((a, b) => (a.due_date! < b.due_date! ? -1 : 1))
  if (overdue[0]) {
    const t = overdue[0]
    const d = overdueDays(t)
    return {
      kind: 'overdue', task: t,
      descriptor: {
        headline: `Start with ${clip(t.title)}`,
        sub: `${d}d overdue · ${due.length} due · ${waiting.length} waiting`,
        actionLabel: 'Open task',
        icon: <AlarmClock size={16} className="text-rose-300" />,
        tone: 'amber',
      },
    }
  }
  // 2) Due today.
  const today = due.filter(t => t.due_date && isToday(parseISO(t.due_date)))
  if (today[0]) {
    const t = today[0]
    return {
      kind: 'due_today', task: t,
      descriptor: {
        headline: `Start with ${clip(t.title)}`,
        sub: due.length > 1 ? `${due.length} due today · ${waiting.length} waiting` : `Due today · ${waiting.length} waiting`,
        actionLabel: 'Open task',
        icon: <Clock size={16} className="text-sky-300" />,
        tone: 'sky',
      },
    }
  }
  // 3) First waiting.
  if (waiting[0]) {
    const t = waiting[0]
    return {
      kind: 'waiting', task: t,
      descriptor: {
        headline: `Unblock ${clip(t.title)}`,
        sub: waiting.length > 1 ? `${waiting.length} waiting on you · nothing due` : 'Waiting on you · nothing due',
        actionLabel: 'Open task',
        icon: <Inbox size={16} className="text-violet-300" />,
        tone: 'violet',
      },
    }
  }
  // 4) Clear.
  return {
    kind: 'clear',
    descriptor: {
      headline: 'Inbox zero for today',
      sub: 'Nothing due and nothing waiting on you. Pipeline runs below.',
      icon: <CheckCircle2 size={16} className="text-emerald-400/80" />,
      tone: 'neutral', clear: true,
    },
  }
}

interface Props {
  due: TaskRow[]
  waiting: TaskRow[]
  onOpen?: (taskId: string) => void
  narrow?: boolean
}

export function NextTaskHero({ due, waiting, onOpen, narrow }: Props) {
  const next = useMemo(() => computeNextTask(due, waiting), [due, waiting])
  return (
    <DoThisNextHero
      descriptor={next.descriptor}
      onAct={() => next.task && onOpen?.(next.task.id)}
      narrow={narrow}
    />
  )
}
