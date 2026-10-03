import { useCallback, useEffect, useMemo, useState } from 'react'
import { requestOk } from '../lib/apiFetch'
import { postVerdict } from '../lib/suggestionsApi'
import type { NextStepSection, StrategistReadWire, StrategistGetResponse, StrategistVerdictKind } from '../types/strategist'

// Today's move (ADR-028): the strategist's read nobody asked for, written by
// the cron before he wakes and proposed in Today's first slot when it is
// empty. This hook reads it and records what he does with it. It never writes
// his Today list itself: TodayList's own slot write does that when he takes it.

type Answered = NonNullable<StrategistReadWire['answered']>

export interface DailyMoveState {
  wire: StrategistReadWire | null
  /** The move to propose now, and its rank (1 is the read's first pick), or null. */
  current: { move: NextStepSection; rank: number } | null
  /** Record an answer on one move. Optimistic: the next move shows at once. */
  answer: (move: NextStepSection, verdict: StrategistVerdictKind, extra?: { reason_code?: string | null; note?: string | null; final?: unknown }) => void
}

/**
 * What an answer is kept under: the bank's id, or the move's place in the read
 * when the bank could not be written that morning. Without the second, a day
 * whose bank write failed would show Not this and Later doing nothing at all.
 */
export function answerKey(move: NextStepSection, moves: NextStepSection[]): string {
  if (move.suggestion_id) return move.suggestion_id
  const i = moves.indexOf(move)
  return i >= 0 ? `rank:${i + 1}` : `text:${move.text}`
}

/**
 * Which move to propose, from what he has already said about each.
 *
 * Taken (accepted, tweaked, replaced) or Later (deferred) on any move closes
 * the day's proposal: he has his move, or he has said not today. A move he set
 * aside (rejected) gives way to the next one. Pure, so the rule is tested.
 */
export function currentMove(wire: StrategistReadWire | null, answered: Answered): DailyMoveState['current'] {
  const moves = wire?.read?.next_steps ?? []
  const closes = new Set<string>(['accepted', 'tweaked', 'replaced', 'deferred'])
  const said = (m: NextStepSection) => answered[answerKey(m, moves)]
  if (moves.some(m => closes.has(said(m) ?? ''))) return null
  const i = moves.findIndex(m => !said(m))
  return i >= 0 ? { move: moves[i], rank: i + 1 } : null
}

export function useDailyMove(enabled = true): DailyMoveState {
  const [wire, setWire] = useState<StrategistReadWire | null>(null)
  const [local, setLocal] = useState<Answered>({})

  const load = useCallback(async () => {
    try {
      const j = await requestOk<Partial<StrategistGetResponse> & { ok?: boolean; error?: string }>(
        '/api/strategist?daily=today',
        { timeoutMs: 12_000 },
      )
      // A thin answer is "no move today", never an error he has to read.
      const w = j.read && typeof j.read === 'object' && j.read.read ? j.read : null
      setWire(w)
    } catch {
      setWire(null)
    }
  }, [])

  useEffect(() => { if (enabled) void load() }, [enabled, load])

  const answered = useMemo<Answered>(() => ({ ...(wire?.answered ?? {}), ...local }), [wire, local])
  const current = useMemo(() => currentMove(wire, answered), [wire, answered])

  const answer = useCallback<DailyMoveState['answer']>((move, verdict, extra = {}) => {
    const key = answerKey(move, wire?.read?.next_steps ?? [])
    setLocal(a => ({ ...a, [key]: verdict }))
    // Sends nothing when the move has no bank row to answer.
    void postVerdict({
      suggestion_id: move.suggestion_id ?? null,
      verdict,
      reason_code: extra.reason_code ?? null,
      note: extra.note ?? null,
      final: extra.final ?? null,
    })
  }, [wire])

  return { wire, current, answer }
}
