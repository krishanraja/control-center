import type { VercelRequest, VercelResponse } from '@vercel/node'

// Shared OpenAI Whisper transcription helper for /api/daily-focus/voice
// and /api/tasks-inbox/voice. Accepts multipart/form-data with one audio
// blob. Returns { ok: true, text } on success or
// { ok: false, fallback: 'text', reason } on any failure. 10-second
// timeout; never throws — the caller's frontend always has a text fallback.

const WHISPER_URL = 'https://api.openai.com/v1/audio/transcriptions'
const WHISPER_MODEL = 'gpt-4o-transcribe'
// 10s cut off any dictation longer than a sentence or two and silently fell
// back to text, which read as "voice capture is bad" rather than "it timed
// out". A voice note is allowed to be a minute long.
const TIMEOUT_MS = 45_000

// Whisper decodes proper nouns cold unless you bias it. Every one of these was
// being mangled: the prompt is a decoding hint, not a transcript, so it only
// needs to name the vocabulary this house actually uses.
const VOCAB_PROMPT = [
  'Mindmaker, Mindmaker Live, Mindmaker OS, Krish Raja, CTRL, Fractionl,',
  'Legibility, Techonomic, Maven, Substack, Signal and Noise, COMPOUND.',
  'Agents: Cleo, Marcus, Vera, Agatha, Nell, Nova, Zara, Kai, Priya, Leo,',
  'Felix, Hunter, Arlo, Maya. Formats: Built, Paid, Teardown, field learning.',
].join(' ')

interface WhisperOk {
  ok: true
  text: string
}

interface WhisperFail {
  ok: false
  fallback: 'text'
  reason: string
}

export type WhisperResult = WhisperOk | WhisperFail

async function readRawBody(req: VercelRequest): Promise<Buffer> {
  if (Buffer.isBuffer(req.body)) return req.body as Buffer
  if (typeof req.body === 'string') return Buffer.from(req.body)
  return await new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    // Same Buffer/Uint8Array variance as api/_auth.ts.
    req.on('end', () => resolve(Buffer.concat(chunks as unknown as Uint8Array[])))
    req.on('error', reject)
  })
}

function inferMime(contentType: string | undefined): { mime: string; ext: string } {
  const ct = (contentType || '').toLowerCase()
  if (ct.includes('webm')) return { mime: 'audio/webm', ext: 'webm' }
  if (ct.includes('ogg'))  return { mime: 'audio/ogg',  ext: 'ogg'  }
  if (ct.includes('mp4'))  return { mime: 'audio/mp4',  ext: 'm4a'  }
  if (ct.includes('wav'))  return { mime: 'audio/wav',  ext: 'wav'  }
  return { mime: 'audio/webm', ext: 'webm' }
}

export interface TranscribeOutcome {
  status: number
  result: WhisperResult
}

// Core transcription: read the audio body, call Whisper, return the result and
// the HTTP status the caller should use. Never throws. Shared by handleWhisper
// (the pass-through voice endpoints) and routes that need the transcript before
// doing more work (e.g. /api/objectives/voice, which then asks Marcus to
// interpret it).
export async function transcribeRequest(req: VercelRequest): Promise<TranscribeOutcome> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return { status: 503, result: { ok: false, fallback: 'text', reason: 'missing_openai_key' } }

  let body: Buffer
  try {
    body = await readRawBody(req)
  } catch {
    return { status: 400, result: { ok: false, fallback: 'text', reason: 'cannot_read_body' } }
  }
  if (body.length === 0) return { status: 400, result: { ok: false, fallback: 'text', reason: 'empty_body' } }

  const { mime, ext } = inferMime(req.headers['content-type'] as string | undefined)

  // One attempt, then one retry. Every other model path in this repo retries
  // once; this one did not, so a single blip became a silent text fallback.
  let last: WhisperResult = { ok: false, fallback: 'text', reason: 'whisper_error' }
  let lastStatus = 502
  for (let attempt = 0; attempt < 2; attempt++) {
    const form = new FormData()
    form.append('file', new Blob([new Uint8Array(body)], { type: mime }), `voice.${ext}`)
    form.append('model', WHISPER_MODEL)
    form.append('language', 'en')
    form.append('prompt', VOCAB_PROMPT)

    const ctrl = new AbortController()
    const tid = setTimeout(() => ctrl.abort('whisper_timeout'), TIMEOUT_MS)
    try {
      const r = await fetch(WHISPER_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
        signal: ctrl.signal,
      })
      if (!r.ok) {
        lastStatus = 502
        last = { ok: false, fallback: 'text', reason: `whisper_${r.status}` }
        // 4xx is a bad request; retrying sends the identical body for the
        // identical answer. Only a 5xx or a network fault is worth a second go.
        if (r.status < 500) return { status: lastStatus, result: last }
        continue
      }
      const j = (await r.json()) as { text?: string }
      const text = (j.text || '').trim()
      if (!text) return { status: 502, result: { ok: false, fallback: 'text', reason: 'whisper_empty' } }
      return { status: 200, result: { ok: true, text } }
    } catch (e: unknown) {
      const timedOut = (e as Error)?.name === 'AbortError'
      lastStatus = 502
      last = { ok: false, fallback: 'text', reason: timedOut ? 'whisper_timeout' : 'whisper_error' }
      // A timeout means the recording was long or the network was slow. Say so
      // rather than emptying the box with no explanation.
      if (timedOut) return { status: lastStatus, result: last }
    } finally {
      clearTimeout(tid)
    }
  }
  return { status: lastStatus, result: last }
}

export async function handleWhisper(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Cache-Control', 'no-store')
  if (req.method === 'OPTIONS') { res.status(200).end(); return }
  if (req.method !== 'POST')    { res.status(405).json({ ok: false, fallback: 'text', reason: 'method_not_allowed' }); return }

  const { status, result } = await transcribeRequest(req)
  res.status(status).json(result)
}

export const config = {
  api: {
    bodyParser: false,
  },
}
