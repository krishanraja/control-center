import React, { useEffect, useRef, useState } from 'react'
import { ArrowUpRight, Copy, Check } from '@/lib/icons'
import { Eyebrow } from '../shared/Eyebrow'
import { requestOk, failureMessage } from '../../lib/apiFetch'

/**
 * Where the walkthrough for a note stands (api/_walkthrough.ts).
 *
 * A kept note read starts a Claude Code session on his subscription that takes
 * him through each step with options. This card is the door to it: the link
 * when it started, and when it did not, one tap to try again plus the prompt to
 * paste into claude.ai/code by hand. It never leaves him with nothing.
 */

type Status = 'firing' | 'started' | 'failed' | 'not_configured'
interface Run { status: Status; session_url: string | null; error: string | null; attempts: number }
interface View { ok: boolean; read_id: string; run: Run | null; prompt: string; not_ready?: string }

const POLL_MS = 3_000
const POLL_LIMIT = 12

/** Why it did not start, in a sentence he can act on. */
export function whyNotStarted(run: Run | null, notReady?: string): string {
  if (notReady) return 'The walkthrough tables are not in the database yet, so paste the prompt into Claude instead.'
  if (!run) return 'No session has started for this read yet.'
  const code = (run.error || '').split(':')[0]
  switch (code) {
    case 'not_configured': return 'The Claude routine is not connected to Control Center yet.'
    case 'rate_limited': return 'Too many sessions started this hour. Try again shortly.'
    case 'token_rejected': return 'The routine token was refused. Generate a new one in Claude.'
    case 'routine_not_found': return 'The routine id Control Center holds does not exist.'
    case 'timed_out': return 'Claude took too long to answer. A session may have started anyway, so check Claude before trying again.'
    default: return 'The session did not start.'
  }
}

export function WalkthroughCard({ readId }: { readId: string }) {
  const [view, setView] = useState<View | null>(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const polls = useRef(0)

  useEffect(() => {
    let alive = true
    let timer: number | undefined
    const load = async () => {
      try {
        const v = await requestOk<View>(`/api/walkthrough?readId=${encodeURIComponent(readId)}`)
        if (!alive) return
        setView(v)
        // The fire runs on the server after the read lands. Look again for a
        // short while; after that the button is the answer.
        const pending = !v.not_ready && (!v.run || v.run.status === 'firing')
        if (pending && polls.current < POLL_LIMIT) {
          polls.current += 1
          timer = window.setTimeout(load, POLL_MS)
        }
      } catch {
        // Unreachable route: the card stays quiet rather than guessing.
      }
    }
    polls.current = 0
    void load()
    return () => { alive = false; if (timer) window.clearTimeout(timer) }
  }, [readId])

  const start = async () => {
    setBusy(true)
    setError(null)
    try {
      setView(await requestOk<View>('/api/walkthrough', { method: 'POST', body: { readId }, timeoutMs: 20_000 }))
    } catch (e) {
      setError(failureMessage(e, 'The walkthrough did not start. Try again.'))
    } finally {
      setBusy(false)
    }
  }

  const copy = async () => {
    if (!view) return
    try {
      await navigator.clipboard.writeText(view.prompt)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2_000)
    } catch {
      setError('Copying did not work here. Select the prompt and copy it by hand.')
    }
  }

  if (!view) return null
  const run = view.run
  const starting = !view.not_ready && (!run || run.status === 'firing') && polls.current < POLL_LIMIT

  return (
    <section data-testid="walkthrough-card" data-status={run?.status ?? (view.not_ready ? 'not_ready' : 'none')} className="flex flex-col gap-2 min-w-0 rounded-xl border border-violet-500/15 bg-violet-500/[0.04] p-3">
      <Eyebrow>Walk through it with Claude</Eyebrow>
      {run?.status === 'started' && run.session_url ? (
        <>
          <p className="text-body leading-relaxed text-ink-muted">Claude has your plan and will take you through it one step at a time, with options for each.</p>
          <a
            data-testid="walkthrough-open"
            href={run.session_url}
            target="_blank"
            rel="noreferrer"
            className="tap-44 inline-flex min-h-[36px] items-center gap-1.5 self-start rounded-lg border border-violet-400/40 bg-violet-500/20 px-3 text-label text-violet-200 hover:bg-violet-500/30"
          >
            Open your walkthrough <ArrowUpRight size={12} />
          </a>
        </>
      ) : starting ? (
        <p data-testid="walkthrough-starting" className="text-body leading-relaxed text-ink-muted">Starting your walkthrough in Claude.</p>
      ) : (
        <>
          <p data-testid="walkthrough-why" className="text-body leading-relaxed text-ink-muted">{whyNotStarted(run, view.not_ready)}</p>
          <div className="flex flex-wrap items-center gap-2">
            {!view.not_ready && (
              <button
                type="button"
                data-testid="walkthrough-start"
                disabled={busy}
                onClick={() => void start()}
                className="tap-44 inline-flex min-h-[36px] items-center rounded-lg border border-violet-400/40 bg-violet-500/20 px-3 text-label text-violet-200 hover:bg-violet-500/30 disabled:opacity-40"
              >
                {busy ? 'Starting your walkthrough' : 'Start walkthrough'}
              </button>
            )}
            <button
              type="button"
              data-testid="walkthrough-copy"
              onClick={() => void copy()}
              className="tap-44 inline-flex min-h-[36px] items-center gap-1.5 text-label text-ink-faint hover:text-ink-muted"
            >
              {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? 'Copied' : 'Copy the prompt for claude.ai/code'}
            </button>
          </div>
          <p data-testid="walkthrough-prompt" className="text-micro text-ink-faint break-words select-all">{view.prompt}</p>
        </>
      )}
      {error && <p role="alert" className="text-micro text-ink-muted">{error}</p>}
    </section>
  )
}
