import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRealtimeContentIdeas, type ContentIdeaRow } from './useRealtimeContentIdeas'
import { useContentV2 } from './useContentV2'
import { useVideoStudioReviews } from './useVideoStudioReviews'
import { useJudgeVerdictsForRuns, type JudgeVerdict } from './useJudgeVerdicts'
import { useHeldItem } from './useHeldItem'
import { rememberVideoStudioReturnFocus, videoEngineEnabled, type VideoStudioReviewListItem } from '../lib/videoStudio'
import { fetchBoard, type BoardItem } from '../lib/workBoard'
import { contentEngineAttention, type ContentEngineAttention } from '../lib/contentEngineSchedule'
import type { ContentDecisionRow } from '../lib/contentV2'
import { ladderVerdict } from '../lib/ladder'
import { formatLabel } from '../lib/formats'
import {
  calendarDate, howSureOf, pipeline, stageOf, todaysCalls, weekSlots,
  type CallsResult, type FactGateRead, type Pipeline, type TodaysCall, type WeekSlot,
} from '../lib/contentModel'
import {
  allowFactCheck, approvePiece, pickForSeries, readFactCheck, replyOnBoard, schedulePiece, setHowSure, unpick,
  type ActionResult,
} from '../lib/contentActions'
import { longDay, numberWord, whenWords } from '../lib/contentCallWords'

/**
 * Today's calls: the decisions that need Krish, held still while he reads.
 *
 * Every decision comes from todaysCalls (src/lib/contentModel.ts) and every
 * write from src/lib/contentActions.ts. This hook adds the three things a
 * screen needs on top of a pure model:
 *
 *   HELD ORDER. The list is frozen in the order it was first seen once every
 *   source has answered. A refetch can add a call (it goes to the end) but
 *   never re-sorts the ones on screen, and a call that disappears without him
 *   acting here stays where it was as a one-line "settled somewhere else".
 *
 *   RECEIPTS. When he acts, the verdict replaces the call where it stood.
 *   Nothing slides away and nothing advances by itself.
 *
 *   NOT NOW. A per-device snooze until tomorrow. It lives in this browser only
 *   (localStorage, every access wrapped), because a snooze is a convenience,
 *   not a decision the engine needs to know about.
 */

export interface Receipt {
  kind: 'done' | 'later' | 'refused' | 'gone'
  line: string
  /** What happens next, or the engine's own reason for saying no. */
  next?: string
  /** Undo, where the write can be reversed. Resolves false when it could not. */
  undo?: () => Promise<boolean>
}

const SNOOZE_KEY = 'content.notNow.v1'

function readSnoozes(): Record<string, string> {
  try {
    const raw = window.localStorage.getItem(SNOOZE_KEY)
    const parsed = raw ? JSON.parse(raw) : {}
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch { return {} }
}

function writeSnooze(key: string, day: string | null) {
  try {
    const all = readSnoozes()
    if (day) all[key] = day
    else delete all[key]
    window.localStorage.setItem(SNOOZE_KEY, JSON.stringify(all))
  } catch { /* private window or blocked storage: the snooze lasts this visit */ }
}

const LATER_NEXT: Record<string, string> = {
  approve: 'It can still go out on time if you approve it by the day before.',
  board: 'The agent waits for your answer.',
  go_out: 'Nothing goes out until you come back to it.',
  allow_fact_check: 'The draft waits. Nothing is spent.',
  set_how_sure: 'The piece cannot be approved until the number is set.',
  pick_for_series: 'The engine cannot start writing until a piece is picked.',
  studio_review: 'The video stays where it is.',
}

function laterReceipt(call: TodaysCall, onUndo: () => Promise<boolean>): Receipt {
  return {
    kind: 'later',
    line: 'Moved to tomorrow.',
    next: LATER_NEXT[call.kind] ?? 'It comes back tomorrow.',
    undo: onUndo,
  }
}

function refused(r: Extract<ActionResult, { ok: false }>): Receipt {
  return { kind: 'refused', line: 'That did not go through.', next: `${r.error.replace(/\.?$/, '.')} Nothing was changed.` }
}

export interface PickCandidate {
  idea: ContentIdeaRow
  verdicts: JudgeVerdict[]
}

export function useContentCalls() {
  const ideasQ = useRealtimeContentIdeas()
  const v2 = useContentV2()
  const videoOn = videoEngineEnabled()
  const video = useVideoStudioReviews(videoOn)
  const ideas = ideasQ.ideas

  // ── The work board ──
  const [board, setBoard] = useState<BoardItem[] | null | undefined>(undefined)
  const loadBoard = useCallback(async () => {
    try { setBoard((await fetchBoard()).items) } catch { setBoard(null) }
  }, [])
  useEffect(() => { void loadBoard() }, [loadBoard])

  // ── The engine's fact gate, for every real draft ──
  //
  // Read from the engine rather than trusted from the stored result, because
  // the stored check may be of an older version of the words. Free: the GET
  // calls no model. Until it answers, the list is not shown, so a call cannot
  // turn from "approve" into "check the facts" under his eyes.
  const draftKey = useMemo(() => ideas
    .filter(i => { const s = stageOf(i); return s === 'fact_check' || s === 'your_call' })
    .map(i => i.id).sort().join(','), [ideas])
  const [gates, setGates] = useState<Record<string, FactGateRead>>({})
  const [gatesFor, setGatesFor] = useState<string | null>(null)
  const [gateNonce, setGateNonce] = useState(0)
  useEffect(() => {
    if (ideasQ.loading) return
    let live = true
    const ids = draftKey ? draftKey.split(',') : []
    void Promise.all(ids.slice(0, 24).map(async id => [id, await readFactCheck(id)] as const)).then(rows => {
      if (!live) return
      const next: Record<string, FactGateRead> = {}
      for (const [id, r] of rows) {
        if (r.ok && r.data.known) next[id] = { ok: r.data.gate.ok, reason: r.data.gate.reason, freshSentences: r.data.freshSentences }
      }
      setGates(next)
      setGatesFor(draftKey)
    })
    return () => { live = false }
  }, [draftKey, ideasQ.loading, gateNonce])

  // ── Ready: every source has answered once ──
  const sourcesIn = !ideasQ.loading && !v2.loading && (!videoOn || !video.loading) && board !== undefined && gatesFor !== null
  const everReady = useRef(false)
  if (sourcesIn) everReady.current = true
  const ready = everReady.current

  // The day, fixed for the visit. A call list that re-dated itself at
  // midnight while open would move under him.
  const now = useMemo(() => new Date(), [])
  const today = calendarDate(now)

  const model: CallsResult | null = useMemo(() => {
    if (!ready) return null
    return todaysCalls({
      ideas,
      decisions: v2.decisions,
      boardItems: board ?? null,
      videoReviews: !videoOn ? [] : video.error ? null : video.reviews,
      gates,
      now,
    })
  }, [ready, ideas, v2.decisions, board, videoOn, video.error, video.reviews, gates, now])

  const slots: WeekSlot[] = useMemo(() => (ready ? weekSlots(ideas, undefined, now, { gates }) : []), [ready, ideas, now, gates])
  const pipe: Pipeline | null = useMemo(() => (ready ? pipeline(ideas, gates) : null), [ready, ideas, gates])
  const foundThisWeek = useMemo(() => {
    const since = now.getTime() - 7 * 86_400_000
    return ideas.filter(i => i.created_at && Date.parse(i.created_at) >= since).length
  }, [ideas, now])
  const failing: ContentEngineAttention[] = useMemo(() => contentEngineAttention(v2.runs, now).attention, [v2.runs, now])

  // ── Held order ──
  const order = useRef<string[]>([])
  const lastSeen = useRef(new Map<string, TodaysCall>())
  const calls = useMemo(() => {
    if (!model) return [] as TodaysCall[]
    for (const c of model.calls) {
      lastSeen.current.set(c.key, c)
      if (!order.current.includes(c.key)) order.current.push(c.key)
    }
    return order.current.map(k => lastSeen.current.get(k)!).filter(Boolean)
  }, [model])

  // ── Receipts ──
  const [receipts, setReceipts] = useState<Record<string, Receipt>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const snoozeSeeded = useRef(new Set<string>())

  const unsnooze = useCallback((key: string) => async () => {
    writeSnooze(key, null)
    setReceipts(r => { const { [key]: _drop, ...rest } = r; return rest })
    return true
  }, [])

  useEffect(() => {
    if (!model) return
    const live = new Set(model.calls.map(c => c.key))
    const snoozes = readSnoozes()
    setReceipts(r => {
      let next = r
      for (const key of order.current) {
        if (next[key]) continue
        const call = lastSeen.current.get(key)
        if (call && snoozes[key] === today && !snoozeSeeded.current.has(key)) {
          snoozeSeeded.current.add(key)
          next = { ...next, [key]: laterReceipt(call, unsnooze(key)) }
        } else if (!live.has(key)) {
          next = { ...next, [key]: { kind: 'gone', line: 'Settled somewhere else.', next: 'Another device or an agent closed this one.' } }
        }
      }
      return next
    })
  }, [model, today, unsnooze])

  // ── What he has chosen inside a call, before pressing it ──
  const [howSure, setHowSureState] = useState<Record<string, number>>({})
  const [chosen, setChosen] = useState<Record<string, string>>({})
  const chooseHowSure = useCallback((key: string, pct: number) => setHowSureState(s => ({ ...s, [key]: pct })), [])
  const choose = useCallback((key: string, ideaId: string) => setChosen(s => ({ ...s, [key]: ideaId })), [])

  // ── Lookups ──
  const ideaById = useMemo(() => new Map(ideas.map(i => [i.id, i])), [ideas])
  const decisionById = useMemo(() => new Map<string, ContentDecisionRow>(v2.decisions.map(d => [d.id, d])), [v2.decisions])
  const reviewById = useMemo(() => new Map<string, VideoStudioReviewListItem>(video.reviews.map(r => [r.id, r])), [video.reviews])
  const slotBySeries = useMemo(() => new Map(slots.map(s => [s.series, s])), [slots])
  /** The day an idea's series slot goes out, when the idea holds that slot. */
  const slotDayOf = useCallback((ideaId: string | undefined): string | null => {
    if (!ideaId) return null
    for (const s of slots) if (s.picked?.id === ideaId) return s.date
    return null
  }, [slots])

  // The top three for every pick call, with their judges' marks.
  const pickRuns = useMemo(() => {
    const ids: string[] = []
    for (const c of calls) {
      if (c.kind !== 'pick_for_series' || !c.series) continue
      for (const p of slotBySeries.get(c.series)?.candidates ?? []) {
        const run = ladderVerdict(ideaById.get(p.id))?.panelRunId
        if (run) ids.push(run)
      }
    }
    return ids
  }, [calls, slotBySeries, ideaById])
  const verdicts = useJudgeVerdictsForRuns(pickRuns, ready)
  const candidatesFor = useCallback((call: TodaysCall): PickCandidate[] => {
    const slot = call.series ? slotBySeries.get(call.series) : undefined
    return (slot?.candidates ?? []).flatMap(p => {
      const idea = ideaById.get(p.id)
      if (!idea) return []
      const run = ladderVerdict(idea)?.panelRunId
      return [{ idea, verdicts: run ? verdicts.byRun.get(run) ?? [] : [] }]
    })
  }, [slotBySeries, ideaById, verdicts.byRun])

  const refreshAll = useCallback(() => {
    ideasQ.refresh()
    void v2.refresh()
    if (videoOn) void video.refresh()
    void loadBoard()
    setGateNonce(n => n + 1)
  }, [ideasQ, v2, videoOn, video, loadBoard])

  // ── The writes ──
  const run = useCallback(async (call: TodaysCall): Promise<Receipt | null> => {
    const idea = call.ideaId ? ideaById.get(call.ideaId) : undefined
    const title = (idea?.idea || call.title).trim()
    const decision = call.decisionId ? decisionById.get(call.decisionId) : undefined
    switch (call.primary.action) {
      case 'approve': {
        if (!call.ideaId) return null
        const sure = howSureOf(idea?.body)
        const current = sure.state === 'set' ? sure.percent : null
        const pct = howSure[call.key] ?? current
        if (pct != null && pct !== current) {
          const set = await setHowSure(call.ideaId, pct)
          if (set.ok === false) return refused(set)
        }
        const r = await approvePiece(call.ideaId, { panelRunId: ladderVerdict(idea)?.panelRunId ?? null })
        if (r.ok === false) return refused(r)
        let locked = ''
        if (call.boardItemId) {
          const reply = await replyOnBoard(call.boardItemId, 'Yes. Approved in Content: lock this exact text for production.')
          locked = reply.ok ? ' Your answer is on the work board too.' : ' The work board reply did not send, so answer it there.'
        }
        const day = slotDayOf(call.ideaId)
        return {
          kind: 'done',
          line: pct != null ? `Approved at ${pct}% sure.` : 'Approved.',
          next: `This wording is locked for production.${day ? ` It goes out ${whenWords(day, today)}.` : ''}${locked}`,
        }
      }
      case 'set_how_sure': {
        const pct = howSure[call.key]
        if (!call.ideaId || pct == null) return null
        const r = await setHowSure(call.ideaId, pct)
        if (r.ok === false) return refused(r)
        return { kind: 'done', line: `How sure we are is now ${pct}%.`, next: 'Once the facts pass, the piece comes back here to approve.' }
      }
      case 'allow_fact_check': {
        if (!call.ideaId) return null
        const r = await allowFactCheck(call.ideaId, call.freshSentences != null ? { maxFreshSentences: call.freshSentences } : {})
        if (r.ok === false) return refused(r)
        return r.data.passed
          ? { kind: 'done', line: 'The facts passed.', next: `"${title}" comes back here when it is ready to approve.` }
          : { kind: 'done', line: `The check found ${numberWord(r.data.blocking).toLowerCase()} claim${r.data.blocking === 1 ? '' : 's'} to fix.`, next: 'Open the draft to see them. The engine fixes what it can on its own.' }
      }
      case 'schedule': {
        if (!call.ideaId || !call.date) return null
        const id = call.ideaId
        const r = await schedulePiece(id, call.date)
        if (r.ok === false) return refused(r)
        return {
          kind: 'done',
          line: `Set to go out on ${longDay(call.date)}.`,
          next: 'You see it again only to mark it published.',
          undo: async () => (await schedulePiece(id, null)).ok,
        }
      }
      case 'pick_for_series': {
        if (!call.series || !call.date) return null
        const list = candidatesFor(call)
        const id = chosen[call.key] ?? list[0]?.idea.id
        const pickedIdea = list.find(c => c.idea.id === id)?.idea
        if (!id || !pickedIdea) return null
        const series = call.series
        const r = await pickForSeries(id, series, { panelRunId: ladderVerdict(pickedIdea)?.panelRunId ?? null })
        if (r.ok === false) return refused(r)
        const previous = r.data.previous
        return {
          kind: 'done',
          line: `Picked for ${formatLabel(series)} on ${longDay(call.date)}.`,
          next: `The engine starts writing "${(pickedIdea.idea || '').trim()}" now, then checks the facts. It comes back to you when it is ready to approve.`,
          undo: async () => (await unpick(id, series, previous)).ok,
        }
      }
      case 'keep_in_library': {
        if (!call.decisionId) return null
        try { await v2.resolveDecision(call.decisionId, 'done') } catch (e) { return refused({ ok: false, status: 0, reason: null, error: (e as Error).message }) }
        return { kind: 'done', line: 'Kept in the Library for good.', next: 'It stays out of the weekly clear-out.' }
      }
      case 'track_shift': {
        if (!decision) return null
        try { await v2.ruleShift(decision.ref, 'accept') } catch (e) { return refused({ ok: false, status: 0, reason: null, error: (e as Error).message }) }
        return { kind: 'done', line: 'Tracking it as a shift.', next: 'New stories are judged against it from now on.' }
      }
      case 'close_shift': {
        if (!decision) return null
        try { await v2.ruleShift(decision.ref, 'retire') } catch (e) { return refused({ ok: false, status: 0, reason: null, error: (e as Error).message }) }
        return { kind: 'done', line: 'Closed out.', next: 'It moves to the Library with its evidence.' }
      }
      case 'open_investigation':
      case 'open_expiring': {
        if (!call.decisionId) return null
        try { await v2.resolveDecision(call.decisionId, 'done') } catch (e) { return refused({ ok: false, status: 0, reason: null, error: (e as Error).message }) }
        return { kind: 'done', line: 'Noted.', next: 'It will not ask again this week.' }
      }
      default:
        return null
    }
  }, [ideaById, decisionById, howSure, chosen, candidatesFor, slotDayOf, today, v2])

  const act = useCallback(async (call: TodaysCall) => {
    if (busy) return
    const a = call.primary.action
    // These open somewhere else; the call clears when the work is done there.
    if (a === 'open_studio_review') {
      if (!call.reviewId) return
      rememberVideoStudioReturnFocus(document.activeElement)
      window.location.hash = `#/content?video=${call.reviewId}`
      return
    }
    if (a === 'board_reply') { window.location.hash = '#/board'; return }
    if (a === 'mark_published') {
      if (call.ideaId) window.location.hash = `#/content?idea=${call.ideaId}`
      return
    }
    setBusy(call.key)
    try {
      const receipt = await run(call)
      if (receipt) setReceipts(r => ({ ...r, [call.key]: receipt }))
    } finally {
      setBusy(null)
    }
    refreshAll()
  }, [busy, run, refreshAll])

  const later = useCallback((call: TodaysCall) => {
    writeSnooze(call.key, today)
    snoozeSeeded.current.add(call.key)
    setReceipts(r => ({ ...r, [call.key]: laterReceipt(call, unsnooze(call.key)) }))
  }, [today, unsnooze])

  const undo = useCallback(async (key: string) => {
    const receipt = receipts[key]
    if (!receipt) return
    if (receipt.kind === 'refused') {
      setReceipts(r => { const { [key]: _drop, ...rest } = r; return rest })
      return
    }
    if (!receipt.undo) return
    setBusy(key)
    try {
      const ok = await receipt.undo()
      setReceipts(r => {
        const { [key]: _drop, ...rest } = r
        return ok ? rest : { ...r, [key]: { ...receipt, next: 'The undo did not go through. Nothing else changed.' } }
      })
    } finally {
      setBusy(null)
    }
    refreshAll()
  }, [receipts, refreshAll])

  // ── Holding the one in focus ──
  const held = useHeldItem(calls, callKey)

  const settled = calls.filter(c => receipts[c.key]).length
  const decided = calls.filter(c => receipts[c.key]?.kind === 'done').length

  return {
    ready,
    loading: !ready,
    // A failed read with nothing on screen is an error, never an empty engine.
    // A failed refetch keeps what was already shown.
    error: ideasQ.error && !ideas.length ? ideasQ.error : null,
    retry: refreshAll,
    today,
    ideas,
    calls,
    unsupported: model?.unsupported ?? [],
    slots,
    pipe,
    foundThisWeek,
    failing,
    runs: v2.runs,
    refreshRuns: v2.refresh,
    v2,
    videoError: videoOn && Boolean(video.error),
    receipts,
    busy,
    settled,
    decided,
    open: calls.length - settled,
    howSure,
    chooseHowSure,
    chosen,
    choose,
    act,
    later,
    undo,
    focus: held.current,
    hold: held.hold,
    ideaById,
    decisionById,
    reviewById,
    slotDayOf,
    candidatesFor,
  }
}

const callKey = (c: TodaysCall) => c.key

export type ContentCalls = ReturnType<typeof useContentCalls>
