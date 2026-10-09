import { portfolioRank } from './portfolio'

/**
 * The one queue (ADR-030, docs/design/corpus/03-the-ask.md).
 *
 * Krish, 2026-10-09: "there's a lot going on in here and it's sometimes too
 * much for me. I don't need to get less done." In the longest honest morning
 * Home showed up to seven things wanting a decision at once: today's move, a
 * due test, the drafted-approaches strip, the Waiting count, "Set this week's
 * 3", two empty slots and Log. Each was right where it stood; together they
 * were seven asks to sort, and the written rule is one ask per screen.
 *
 * This is the order instead. Home shows the head of the queue through the one
 * hero, the move keeps its slot, and the rest is one tap away, in order, each
 * with its own press. The tiers, first to last:
 *
 *   reply     a person is waiting on him. Newer and human beats 05:00:
 *             Ruling (Krish, 2026-10-09), a reply outranks today's move
 *   move      today's move, while unanswered. Rendered by Today's first slot,
 *             never by the hero, so the hero yields while it is the head
 *   prepared  work that waits only on his press: drafted notes to send
 *   ruling    something waiting on his answer: a due test, fresh rulings
 *   health    a service down, a failing run (not on Home yet; the tabs own it)
 *   wiring    the week's 3, and anything that makes the board more complete
 *
 * Within a tier the mission leads and the products follow the ladder in
 * src/lib/portfolio.ts (Ruling, Krish, 2026-10-06: one queue, the mission as
 * the parent). Pure: no clock, no fetches; tested in tests/api/homeQueue.test.ts.
 */

export type QueueTier = 'reply' | 'move' | 'prepared' | 'ruling' | 'health' | 'wiring'
export const TIER_ORDER: readonly QueueTier[] = ['reply', 'move', 'prepared', 'ruling', 'health', 'wiring']

/** Where a press goes. Home maps each kind to the thing it already does. */
export type QueueGo =
  | { kind: 'nav'; tab: string; params?: Record<string, string> }
  | { kind: 'tests' }
  | { kind: 'waiting' }
  | { kind: 'week' }
  | { kind: 'slot' }

export interface QueueEntry {
  id: string
  tier: QueueTier
  headline: string
  sub: string
  venture: string | null
  press: { label: string; go: QueueGo }
  /**
   * Where Home already draws this entry, when it does. The hero never shows
   * an entry something else on Home is showing: the move is Today's first
   * slot, a due test is its own card, the fresh rulings are the Waiting
   * count in the vitals band, the week's ask is on the This week line. A
   * second copy of any of them is a second ask, and the height it costs
   * folded the OS goals at 360x640 when the first cut of this put the
   * Waiting count in the hero too.
   */
  renderedBy?: 'today_slot' | 'tests_card' | 'vitals' | 'ladder'
}

export interface HomeQueueInput {
  /** Today's unanswered move, or null once he has answered or there is none. */
  dailyMove: { text: string; venture?: string | null } | null
  /** The advisory lane's counts. Null while unread. */
  pilots: { replied: number; drafted: number } | null
  /** Tests whose due date has arrived. */
  dueTests: number
  /** Fresh rulings waiting on him (src/lib/freshDecisions.ts). */
  waiting: number
  /** The week's ask, when the week's 3 are not set. */
  weekAsk: string | null
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** The mission first, then the ladder, then everything with no venture. */
export function queueRank(venture: string | null | undefined): number {
  if (venture === 'mindmake') return -1
  return portfolioRank(venture)
}

export function homeQueue(i: HomeQueueInput): QueueEntry[] {
  const out: QueueEntry[] = []
  const replied = i.pilots?.replied ?? 0
  if (replied > 0) {
    out.push({
      id: 'advisory-reply', tier: 'reply', venture: 'mindmake',
      headline: replied === 1 ? 'Someone replied. Book the call' : `${plural(replied, 'person', 'people')} replied. Book the calls`,
      sub: 'A reply is waiting on you in Advisory. It comes before anything the machine wrote this morning.',
      press: { label: replied === 1 ? 'Show the reply' : 'Show the replies', go: { kind: 'nav', tab: 'people', params: { lane: 'pilots' } } },
    })
  }
  if (i.dailyMove) {
    out.push({
      id: 'daily-move', tier: 'move', venture: i.dailyMove.venture ?? 'mindmake',
      headline: i.dailyMove.text, sub: "Today's move, in the first slot of Today.",
      press: { label: 'Take it', go: { kind: 'slot' } },
      renderedBy: 'today_slot',
    })
  }
  const drafted = i.pilots?.drafted ?? 0
  if (drafted > 0) {
    out.push({
      id: 'advisory-drafted', tier: 'prepared', venture: 'mindmake',
      headline: drafted === 1 ? 'Send the drafted note' : `Send the ${plural(drafted, 'drafted note')}`,
      sub: drafted === 1 ? 'The draft is written and in your Gmail. Your press.' : 'The drafts are written and in your Gmail. Your press, one at a time.',
      press: { label: 'Open Advisory', go: { kind: 'nav', tab: 'people', params: { lane: 'pilots' } } },
    })
  }
  if (i.dueTests > 0) {
    out.push({
      id: 'due-tests', tier: 'ruling', venture: null,
      headline: i.dueTests === 1 ? 'A test is due. Say how it went' : `${plural(i.dueTests, 'test')} are due. Say how they went`,
      sub: 'A prediction you made has come due. One tap each: confirmed, disconfirmed or partial.',
      press: { label: 'Answer it', go: { kind: 'tests' } },
      renderedBy: 'tests_card',
    })
  }
  if (i.waiting > 0) {
    out.push({
      id: 'waiting', tier: 'ruling', venture: null,
      headline: i.waiting === 1 ? 'One ruling is waiting on you' : `${plural(i.waiting, 'ruling')} are waiting on you`,
      sub: 'Each is decided in the tab that owns it. The list says where.',
      press: { label: 'Show them', go: { kind: 'waiting' } },
      renderedBy: 'vitals',
    })
  }
  if (i.weekAsk) {
    out.push({
      id: 'week', tier: 'wiring', venture: null,
      headline: i.weekAsk, sub: 'The week has no objectives yet, so nothing below can be measured against them.',
      press: { label: 'Set them', go: { kind: 'week' } },
      renderedBy: 'ladder',
    })
  }
  // Stable: a tie keeps the order above, which is the order each tier was reasoned in.
  return out
    .map((e, idx) => ({ e, idx }))
    .sort((a, b) =>
      TIER_ORDER.indexOf(a.e.tier) - TIER_ORDER.indexOf(b.e.tier)
      || queueRank(a.e.venture) - queueRank(b.e.venture)
      || a.idx - b.idx)
    .map(x => x.e)
}

/**
 * What the hero shows: the head of the queue, unless the head is drawn by
 * something else on Home already (the move in its slot, a due test in its
 * card, the rulings in the vitals band, the week on its line). Then the hero
 * yields and Home has one ask. A reply or a drafted note ahead of the move
 * takes the hero, which with the move in its slot is two, the ruling.
 */
export function queueHead(queue: QueueEntry[]): QueueEntry | null {
  const head = queue[0] ?? null
  return head && !head.renderedBy ? head : null
}

/**
 * The list behind the Waiting count: everything but what the hero shows,
 * the move (its slot draws it) and the rulings (the count the list opens
 * from is the rulings). A due test and the week stay listed, in order, each
 * with its press, because nothing else says where they stand in the queue.
 */
export function queueRest(queue: QueueEntry[]): QueueEntry[] {
  const head = queueHead(queue)
  return queue.filter(e => e !== head && e.renderedBy !== 'today_slot' && e.renderedBy !== 'vitals')
}
