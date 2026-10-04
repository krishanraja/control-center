import { useEffect, useMemo, useState } from 'react'
import type { ContentIdeaRow } from './useRealtimeContentIdeas'
import { readFactCheck } from '../lib/contentActions'
import { REVIEW_MIN_BODY } from '../lib/contentEngine'
import type { FactGateRead, GateMap } from '../lib/contentModel'

/**
 * The engine's fact gate for every piece that has a real draft, keyed by id.
 *
 * The gate can only be read from the engine (GET
 * /api/content-ideas/:id/fact-check): its hash is taken over the engine's own
 * normalisation of the words, so the stored meta.fact_check cannot say whether
 * it still covers the current text. Article 1 showed the difference on
 * 2026-10-04: its stored check had passed, and the words had changed since.
 * todaysCalls and stageOf take this map, and fall back to the stored result,
 * marked as a guess, for any piece it does not cover yet.
 *
 * Only drafts are read (drafting, review and approved, a handful at a time),
 * and each is read again only when its row changes. The read is free: no
 * model is called.
 */
export function useFactGates(ideas: readonly ContentIdeaRow[]): GateMap {
  const [gates, setGates] = useState<Record<string, FactGateRead>>({})

  const wanted = useMemo(
    () => ideas
      .filter(i => ['drafting', 'review', 'approved'].includes(i.state) && !i.buried_at && (i.body || '').trim().length >= REVIEW_MIN_BODY)
      .map(i => ({ id: i.id, stamp: `${i.id}:${i.updated_at}` }))
      .sort((a, b) => (a.stamp < b.stamp ? -1 : 1)),
    [ideas],
  )
  const key = wanted.map(w => w.stamp).join('|')

  useEffect(() => {
    if (!wanted.length) return
    let alive = true
    void Promise.all(wanted.map(async w => [w.id, await readFactCheck(w.id)] as const)).then(results => {
      if (!alive) return
      setGates(prev => {
        const next = { ...prev }
        for (const [id, r] of results) {
          if (r.ok === false) continue
          next[id] = { ok: r.data.gate.ok, reason: r.data.gate.reason, freshSentences: r.data.freshSentences }
        }
        return next
      })
    })
    return () => { alive = false }
    // `key` carries every id and updated_at in `wanted`, so it is the whole
    // dependency: a re-render with the same rows reads nothing again.
  }, [key])

  return gates
}
