import type { VercelRequest, VercelResponse } from '@vercel/node'
import { hasAccess, applyGatedHeaders } from '../_auth.js'
import { transcribeRequest } from '../_whisper.js'
import { runNetworkSearch } from '../_networkSearch.js'

// POST /api/network/voice   (raw audio body; bodyParser off)
//
// Speak the question. Same two-step shape as api/objectives/voice.ts:
// transcribe, then act on the transcript. Returns { transcript, restated,
// results } so the UI can show what was heard, what was understood, and who
// matched, in that order — a mis-transcription is then obvious at a glance
// rather than inferred from odd results.
//
// bodyParser must stay off: the body is an audio blob, and _whisper reads it
// raw. Hand-rolled guard rather than _auth's guard() for the same reason —
// that helper reads req.body.

export const config = {
  api: { bodyParser: false },
  maxDuration: 60,
}

/** `?countries=GB,AU` or a repeated `?countries=GB&countries=AU`. Vercel gives
 *  either a string or an array depending on how the client wrote it, so both are
 *  read rather than one being assumed. */
function countriesFromQuery(raw: string | string[] | undefined): string[] | null {
  const parts = (Array.isArray(raw) ? raw : [raw || ''])
    .flatMap(x => String(x).split(','))
    .map(x => x.trim().slice(0, 60))
    .filter(Boolean)
    .slice(0, 20)
  return parts.length ? parts : null
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  applyGatedHeaders(res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ ok: false, fallback: 'text', reason: 'method_not_allowed' })
  if (!hasAccess(req)) return res.status(401).json({ ok: false, fallback: 'text', reason: 'unauthorized' })

  // 1. Transcribe. Never throws; every failure carries fallback:'text' so the
  //    client drops back to the typed input instead of showing an error.
  const { status, result } = await transcribeRequest(req)
  if (!result.ok) return res.status(status).json(result)
  const transcript = result.text

  // 2. Search. If this fails, the transcript still comes back so the words are
  //    not lost — the client can drop them into the text field and retry.
  try {
    const out = await runNetworkSearch({
      question: transcript,
      // Filters ride the query string here, not the body: the body is an audio
      // blob and bodyParser is off. Same values the typed path sends.
      countries: countriesFromQuery(req.query.countries),
      filterMode: req.query.filter_mode === 'soft' ? 'soft' : 'hard',
      limit: 20,
      // Same two-phase shape as the typed path: get the ranked list back fast,
      // let the client fetch explanations behind it. Someone who just spoke a
      // question is waiting on a phone, which is the worst place to spend 15s.
      rerank: false,
    })
    return res.status(200).json({ ...out, transcript })
  } catch (e: unknown) {
    return res.status(200).json({
      ok: false,
      transcript,
      fallback: 'text',
      reason: (e as Error)?.message?.slice(0, 160) || 'search_failed',
    })
  }
}
