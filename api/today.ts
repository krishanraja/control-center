import type { VercelRequest, VercelResponse } from '@vercel/node'
import { readFileSync } from 'fs'
import { join } from 'path'

const today = new Date().toLocaleDateString('en-GB', {
  weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
})

// Today's queue is derived from sequences.json — Krish-owned pending unblocked steps only.
// Update sequences.json (public/data/sequences.json) to change what appears here.

function getKrishStepsFromSequences() {
  try {
    const raw = readFileSync(join(process.cwd(), 'public', 'data', 'sequences.json'), 'utf8')
    const data = JSON.parse(raw)

    const items: Array<{
      id: string; title: string; detail: string; owner: string;
      status: string; priority: number; est: string; link?: string
    }> = []

    let priority = 1
    for (const seq of data.sequences ?? []) {
      // Build a set of done step IDs for this sequence
      const doneIds = new Set(
        (seq.steps ?? [])
          .filter((s: { status: string }) => s.status === 'done')
          .map((s: { id: string }) => s.id)
      )

      for (const step of seq.steps ?? []) {
        if (step.owner !== 'krish') continue
        if (step.status === 'done') continue

        // Is it blocked?
        const isBlocked = step.blocked_by && !doneIds.has(step.blocked_by)
        if (isBlocked) continue

        // Unblocked Krish step — add to queue
        const mins = step.estimated_mins ? `${step.estimated_mins} min` : '—'
        const firstLink = step.links?.[0]?.url

        items.push({
          id: step.id,
          title: step.description,
          detail: step.owner_note ?? `Part of ${seq.agent}'s sequence: ${seq.title}`,
          owner: 'krish',
          status: 'pending',
          priority: priority++,
          est: mins,
          link: firstLink,
        })
      }
    }

    return items
  } catch {
    return []
  }
}

export default function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Cache-Control', 'no-store')
  res.json({ date: today, items: getKrishStepsFromSequences() })
}
