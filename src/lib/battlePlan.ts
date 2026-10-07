import type { NextStepSection, StepWhen } from '../types/strategist'

// The battle plan (2026-10-07): a week_open or update read's next steps,
// grouped now, today, this week, each a small timed step under its thread.

const PLAN_ORDER: readonly StepWhen[] = ['now', 'today', 'week']
export const PLAN_LABEL: Record<StepWhen, string> = { now: 'Start here', today: 'Today', week: 'This week' }

export function minutesLabel(m: number): string {
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60), r = m % 60
  return r ? `${h} h ${r} min` : `${h} h`
}

/**
 * The steps grouped now, today, this week, keeping each step's own index (its
 * verdict key). Null when no step carries a `when`: an older read, or a daily
 * one, renders as the plain list it always did. A step with no `when` in a
 * plan read goes under today, so nothing he was told to do disappears.
 */
export function planGroups(steps: NextStepSection[]): { when: StepWhen; minutes: number; items: { n: NextStepSection; i: number }[] }[] | null {
  if (!steps.some(n => n.when)) return null
  return PLAN_ORDER.map(when => {
    const items = steps.map((n, i) => ({ n, i })).filter(({ n }) => (n.when ?? 'today') === when)
    return { when, minutes: items.reduce((t, { n }) => t + (n.minutes ?? 0), 0), items }
  }).filter(g => g.items.length > 0)
}
