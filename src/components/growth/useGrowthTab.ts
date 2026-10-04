/**
 * Growth: the tab's one data and write layer.
 *
 * It composes the readers that already exist and the read model built over
 * them, and adds nothing to either:
 *   useGrowth()        touchpoints, cards, reviews, probes, accounts (Supabase, anon)
 *   useWebInsights()   the four sites, their one action each, Check now, one-tap answers
 *   useSeoRank()       where the products rank on Google (service role read)
 *   useAcquisition()   integrations: the one spend fact that survives on this tab
 *   useDailyFocus()    today's 3, the slots "Put on today" fills
 *   growthModel        nextMoves, productSignals, splitReviews, weekLoop
 *
 * The queue holds still. nextMoves drops a move the moment its write lands
 * (it is on today's list, it is a clip, the site took the answer), which would
 * make the card under his thumb vanish. So a settled move is kept, with its
 * outcome, at the place it held, for as long as the tab is open. A skip is a
 * client-side rule only: kept in localStorage per loop week (inside try/catch,
 * so a private window just forgets it).
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useGrowth } from '../../hooks/useGrowth'
import { useWebInsights, type WebRefreshResult } from '../../hooks/useWebInsights'
import { useSeoRank } from '../../hooks/useSeoRank'
import { useAcquisition, type IntegrationRow } from '../../hooks/useAcquisition'
import { useDailyFocus } from '../../hooks/useDailyFocus'
import { civilYmd } from '../../lib/civilDate'
import { requestJson, requestOk, failureMessage } from '../../lib/apiFetch'
import {
  PRODUCTS, clipWeekFor, growthWeekOf, shortDate,
  type CreativeCardRow, type ProductSlug, type Stage,
} from '../../lib/growth'
import {
  nextMoves, oldUnruled, productSignals, splitReviews,
  type MoveChoice, type NextMove,
} from '../../lib/growthModel'
import type { KrishAction, WebJob } from '../../lib/webProperties'

export type Outcome =
  | { kind: 'today'; slot: 1 | 2 | 3 }
  | { kind: 'clip'; count: number; title: string; cardId: string }
  | { kind: 'answered'; label: string }
  | { kind: 'done'; line: string }
  | { kind: 'skipped' }

/** Not a settled outcome: the write could not happen, said where it was pressed. */
export type Refusal = { kind: 'full' } | { kind: 'failed'; line: string }

const SLOTS = [1, 2, 3] as const
/** How long the first paint waits for the site read before rendering without it. */
const READ_WAIT_MS = 4000
const STAGES: Stage[] = ['brief', 'script', 'producing', 'produced', 'posted']
export const STAGE_WORD: Record<Stage, string> = {
  brief: 'Idea', script: 'Script', producing: 'Filming', produced: 'Ready to post', posted: 'Posted', dropped: 'Dropped',
}

function skipKey(week: string) { return `growth.skipped.${week}` }
function readSkips(week: string): string[] {
  try {
    const raw = window.localStorage.getItem(skipKey(week))
    const v = raw ? JSON.parse(raw) : []
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
  } catch { return [] }
}
function writeSkips(week: string, ids: string[]) {
  try { window.localStorage.setItem(skipKey(week), JSON.stringify(ids)) } catch { /* private window: forget it */ }
}

export function useGrowthTab() {
  const g = useGrowth()
  const web = useWebInsights()
  const seo = useSeoRank()
  const acq = useAcquisition()
  const focus = useDailyFocus()

  // One clock per render pass. A minute's drift does not move any week line.
  const now = useMemo(() => new Date(), [g.reviews, g.cards, web.data, focus.today])
  const week = growthWeekOf(now)
  const integrations: IntegrationRow[] = acq.data?.integrations ?? []
  const today = focus.today
  const todayTexts = useMemo(() => SLOTS.map(n => today?.[`target_${n}_text`] ?? null), [today])

  const live = useMemo(() => nextMoves({
    reviews: g.reviews,
    web: web.data,
    accounts: g.accounts,
    touchpoints: g.touchpoints,
    cards: g.cards,
    integrations,
    todayTexts,
  }, now), [g.reviews, web.data, g.accounts, g.touchpoints, g.cards, integrations, todayTexts, now])

  const signals = useMemo(() => productSignals({
    probes: g.probes, web: web.data, seo: seo.rows, cards: g.cards, touchpoints: g.touchpoints,
  }, now), [g.probes, web.data, seo.rows, g.cards, g.touchpoints, now])

  const split = useMemo(() => splitReviews(g.reviews), [g.reviews])
  const unruledOld = useMemo(() => oldUnruled(g.reviews), [g.reviews])

  // ── the queue that holds still ──────────────────────────────────────────
  const [outcomes, setOutcomes] = useState<Record<string, Outcome>>({})
  const [kept, setKept] = useState<Record<string, { move: NextMove; index: number }>>({})
  const [skips, setSkips] = useState<string[]>(() => readSkips(week))
  useEffect(() => { setSkips(readSkips(week)) }, [week])

  const queue = useMemo(() => {
    const out = [...live]
    const have = new Set(out.map(m => m.id))
    Object.values(kept)
      .filter(k => !have.has(k.move.id))
      .sort((a, b) => a.index - b.index)
      .forEach(k => out.splice(Math.min(k.index, out.length), 0, k.move))
    return out
  }, [live, kept])

  const outcomeOf = useCallback((id: string): Outcome | undefined =>
    outcomes[id] ?? (skips.includes(id) ? { kind: 'skipped' } : undefined), [outcomes, skips])

  const [cursorId, setCursorId] = useState<string | null>(null)
  const cursor = useMemo(() => {
    const at = cursorId ? queue.findIndex(m => m.id === cursorId) : -1
    if (at >= 0) return at
    const open = queue.findIndex(m => !outcomeOf(m.id))
    return open >= 0 ? open : Math.max(0, queue.length - 1)
  }, [cursorId, queue, outcomeOf])
  const setCursor = useCallback((i: number) => setCursorId(queue[i]?.id ?? null), [queue])

  const openCount = queue.filter(m => !outcomeOf(m.id)).length
  const allDone = queue.length > 0 && openCount === 0

  const next = useCallback(() => {
    for (let k = 1; k <= queue.length; k++) {
      const i = (cursor + k) % queue.length
      if (!outcomeOf(queue[i].id)) { setCursorId(queue[i].id); return }
    }
  }, [queue, cursor, outcomeOf])

  const settle = useCallback((move: NextMove, o: Outcome) => {
    const index = queue.findIndex(m => m.id === move.id)
    setKept(prev => ({ ...prev, [move.id]: { move, index: index < 0 ? queue.length : index } }))
    setOutcomes(prev => ({ ...prev, [move.id]: o }))
    setCursorId(move.id)
  }, [queue])

  const forget = useCallback((id: string) => {
    setOutcomes(prev => { const rest = { ...prev }; delete rest[id]; return rest })
    setKept(prev => { const rest = { ...prev }; delete rest[id]; return rest })
  }, [])

  const skip = useCallback((move: NextMove) => {
    setSkips(prev => {
      const nextIds = prev.includes(move.id) ? prev : [...prev, move.id]
      writeSkips(week, nextIds)
      return nextIds
    })
    setCursorId(move.id)
  }, [week])

  // ── the site action behind a move (its job, first step, detector) ───────
  const siteAction = useCallback((move: NextMove): KrishAction | null => {
    if (move.source !== 'site' || !web.data) return null
    const id = move.id.replace(/^site:/, '')
    if (web.data.shared_action?.id === id) return web.data.shared_action
    return web.data.properties.find(p => p.action?.id === id)?.action ?? null
  }, [web.data])

  // ── writes ──────────────────────────────────────────────────────────────

  /** POST /api/daily-focus/slot: the first empty slot of today's 3. A full day says so. */
  const putOnToday = useCallback(async (move: NextMove): Promise<Outcome | Refusal> => {
    const free = SLOTS.find(n => !(today?.[`target_${n}_text`] ?? '').trim())
    if (!free) return { kind: 'full' }
    const job = siteAction(move)?.job ?? null
    try {
      await requestOk('/api/daily-focus/slot', {
        method: 'POST',
        body: { date: today?.focus_date ?? civilYmd(new Date()), slot: free, text: move.title.slice(0, 240), ...(job ? { job } : {}) },
        timeoutMs: 12_000,
      })
    } catch (e) {
      return { kind: 'failed', line: failureMessage(e, 'Could not put it on today.') }
    }
    const o: Outcome = { kind: 'today', slot: free }
    settle(move, o)
    void focus.refresh()
    return o
  }, [today, siteAction, settle, focus])

  const batch = useMemo(() => g.cards.filter(c => c.batch_week === week && c.stage !== 'dropped'), [g.cards, week])

  /** POST /api/growth/creative into the loop week the move belongs to. */
  const makeClip = useCallback(async (move: NextMove, title: string, product: string | null): Promise<Outcome | Refusal> => {
    const slug = product ?? move.product
    if (!slug || !PRODUCTS.includes(slug as ProductSlug)) return { kind: 'failed', line: 'Pick which product the clip is for first.' }
    const clean = title.trim()
    try {
      const card = await g.addCard({
        product_slug: slug,
        title: clean.length > 120 ? `${clean.slice(0, 118)}...` : clean,
        brief: move.source === 'review' && move.weekStart
          ? `From the weekly review, week of ${shortDate(move.weekStart)}: ${clean}`
          : clean,
        batch_week: clipWeekFor(move.weekStart ?? null, new Date()),
        touchpoint_id: null,
      })
      const o: Outcome = { kind: 'clip', count: batch.length + 1, title: clean, cardId: card.id }
      settle(move, o)
      return o
    } catch (e) {
      return { kind: 'failed', line: failureMessage(e, 'Could not add the clip.') }
    }
  }, [g, batch.length, settle])

  /** POST /api/growth/web-insights { action: 'answer' }: one tap, stored where the next check reads it. */
  const answer = useCallback(async (move: NextMove, choice: MoveChoice, label: string, job?: WebJob | null): Promise<Outcome | Refusal> => {
    if (!move.property) return { kind: 'failed', line: 'This answer has no site to go to.' }
    const r = await web.answer(move.property, choice.value, job ?? null)
    if (r.result !== 'ok') return { kind: 'failed', line: r.message ?? 'Could not save the answer.' }
    const o: Outcome = { kind: 'answered', label }
    settle(move, o)
    return o
  }, [web, settle])

  /** A clip already picked: PATCH /api/growth/creative to its next step. */
  const cardOf = useCallback((move: NextMove): CreativeCardRow | null => {
    const id = move.id.startsWith('clip:') && !move.id.startsWith('clip:pick:') ? move.id.slice(5) : null
    return id ? g.cards.find(c => c.id === id) ?? null : null
  }, [g.cards])

  const advanceClip = useCallback(async (move: NextMove): Promise<Outcome | Refusal> => {
    const card = cardOf(move)
    if (!card) return { kind: 'failed', line: 'That clip is not on the list any more.' }
    const to = STAGES[Math.min(STAGES.length - 1, STAGES.indexOf(card.stage) + 1)]
    try {
      await g.patchCard(card.id, { stage: to })
    } catch (e) {
      return { kind: 'failed', line: failureMessage(e, 'Could not move the clip on.') }
    }
    const o: Outcome = { kind: 'done', line: `Moved on to: ${STAGE_WORD[to]}.` }
    settle(move, o)
    return o
  }, [cardOf, g, settle])

  /** Undo puts the world back where the press found it, not just the card. */
  const undo = useCallback(async (move: NextMove) => {
    const o = outcomeOf(move.id)
    if (!o) return
    if (o.kind === 'skipped') {
      setSkips(prev => { const ids = prev.filter(x => x !== move.id); writeSkips(week, ids); return ids })
      forget(move.id)
      return
    }
    try {
      if (o.kind === 'today') {
        await requestOk('/api/daily-focus/slot', {
          method: 'POST',
          body: { date: today?.focus_date ?? civilYmd(new Date()), slot: o.slot, text: '' },
          timeoutMs: 12_000,
        })
        void focus.refresh()
      } else if (o.kind === 'clip') {
        await g.patchCard(o.cardId, { stage: 'dropped' })
      }
    } finally {
      forget(move.id)
    }
  }, [outcomeOf, forget, week, today, focus, g])

  /** POST /api/growth/clip-ideas: a model call, so the wait is narrated by the caller. */
  const suggestIdeas = useCallback(async (product: string): Promise<{ ideas: string[]; note: string | null }> => {
    try {
      const { json } = await requestJson<{ ok?: boolean; error?: string; note?: string; ideas?: Array<{ title: string }> }>(
        '/api/growth/clip-ideas',
        { method: 'POST', body: { product_slug: product, touchpoint_id: null }, timeoutMs: 60_000 },
      )
      if (!json?.ok) throw new Error(json?.error || 'Could not suggest ideas.')
      const ideas = (json.ideas ?? []).map(i => String(i?.title ?? '').trim()).filter(Boolean).slice(0, 3)
      return { ideas, note: json.note ?? (ideas.length ? null : 'Nothing came back. Write your own.') }
    } catch (e) {
      return { ideas: [], note: failureMessage(e, 'Could not suggest ideas.') }
    }
  }, [])

  const checkSites = useCallback((): Promise<WebRefreshResult> => web.refresh(), [web])

  // Try again re-reads the growth tables, the rank check and the spend row.
  // Never web.refresh: that is Check now, a full run of the site check.
  const retry = useCallback(() => {
    void g.refresh()
    void seo.refresh()
    void acq.refresh()
  }, [g, seo, acq])

  // The site moves sort to the front and their read is slower than the
  // tables'. Showing the queue before it lands put one move under his thumb
  // and swapped it a second later, so the first paint waits for the site read
  // and today's list, for at most READ_WAIT_MS: a read that never answers must
  // not hide the tab for good.
  const [waitOver, setWaitOver] = useState(false)
  useEffect(() => {
    const id = window.setTimeout(() => setWaitOver(true), READ_WAIT_MS)
    return () => window.clearTimeout(id)
  }, [])
  const loading = g.loading || (!waitOver && (!web.loaded || focus.loading))

  return {
    now, week,
    loading,
    growthError: g.error,
    g, web, seo, acq, integrations, today,
    signals, split, unruledOld, batch,
    queue, live, cursor, setCursor, outcomeOf, openCount, allDone, next,
    putOnToday, makeClip, answer, advanceClip, cardOf, siteAction, undo, skip, suggestIdeas, checkSites, retry,
  }
}

export type GrowthTabModel = ReturnType<typeof useGrowthTab>
