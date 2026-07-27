import React, { useState } from 'react'
import type { PilotCheckin } from '../../types/pilot'
import { logOverride, saveEvening } from '../../hooks/usePilot'
import { validateConcreteness } from '../../lib/pilotConcreteness'
import { LogShipForm } from './LogShipForm'

// One screen, one action, and the means to do it. No navigation, no dashboard,
// no list of other tasks.
//
// No red anywhere in red mode. The name describes the operator's state, not the
// palette. Generous whitespace and one focal point are the intervention.

interface Props {
  /** The most recent evening check-in, which carries today's ONE. */
  lastEvening: PilotCheckin | null
  /** Called after a ship is logged or the escape hatch is used. */
  onUnlock: () => void
}

type Phase = 'ask' | 'task' | 'marking' | 'done'

export function RedMode({ lastEvening, onUnlock }: Props) {
  const [one, setOne] = useState(lastEvening?.tomorrow_one || '')
  const [oneUrl] = useState(lastEvening?.tomorrow_one_url || '')
  const [phase, setPhase] = useState<Phase>(lastEvening?.tomorrow_one ? 'task' : 'ask')

  // The fallback path: no evening entry exists, so red mode asks exactly one
  // question, holds it to the same concreteness bar, then locks to the answer.
  const [draft, setDraft] = useState('')
  const [hint, setHint] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const commitOne = async () => {
    const check = validateConcreteness(draft)
    if (!check.ok) { setHint(check.hint || null); return }
    setSaving(true)
    try {
      await saveEvening({ tomorrow_one: draft.trim() })
      setOne(draft.trim())
      setPhase('task')
    } catch {
      setHint('Could not save. Try once more.')
    } finally {
      setSaving(false)
    }
  }

  const override = async () => {
    await logOverride()
    onUnlock()
  }

  return (
    <div className="min-h-[100dvh] w-full flex flex-col items-center justify-center px-6 py-12 text-ink">
      <div className="w-full max-w-[440px] flex flex-col gap-8">

        {phase === 'ask' && (
          <div className="flex flex-col gap-5">
            <h1 className="font-display text-[21px] leading-snug">
              What is the one 15-minute action that leaves your machine today?
            </h1>
            <textarea
              value={draft}
              onChange={e => { setDraft(e.target.value); setHint(null) }}
              rows={3}
              autoFocus
              placeholder="Verb, artifact, recipient"
              className="w-full px-4 py-3 rounded-xl bg-white/[0.03] border border-white/10 text-[15px] leading-relaxed text-ink placeholder:text-ink-faint outline-none focus:border-white/25 resize-none"
            />
            {hint && <p className="text-[13px] text-ink-muted leading-relaxed">{hint}</p>}
            <button
              type="button"
              onClick={commitOne}
              disabled={saving || !draft.trim()}
              className="w-full py-3.5 rounded-xl text-[15px] font-medium bg-white/[0.10] border border-white/20 text-ink hover:bg-white/[0.14] disabled:opacity-40 transition-colors"
            >
              {saving ? 'Saving' : 'Lock it in'}
            </button>
          </div>
        )}

        {phase === 'task' && (
          <div className="flex flex-col gap-7">
            <div className="flex flex-col gap-3">
              <span className="text-[12px] uppercase tracking-[0.14em] text-ink-faint">Today</span>
              <p className="font-display text-[24px] leading-snug">{one}</p>
              <p className="text-[13px] text-ink-faint leading-relaxed">
                Fifteen minutes. Done when it leaves your machine.
              </p>
            </div>

            {oneUrl ? (
              <a
                href={oneUrl}
                target="_blank"
                rel="noreferrer"
                className="w-full py-4 rounded-xl text-[15px] font-medium text-center bg-white/[0.10] border border-white/20 text-ink hover:bg-white/[0.14] transition-colors"
              >
                Open it
              </a>
            ) : null}

            <button
              type="button"
              onClick={() => setPhase('marking')}
              className={`w-full py-3.5 rounded-xl text-[15px] transition-colors ${
                oneUrl
                  ? 'text-ink-muted hover:text-ink border border-white/10 hover:bg-white/[0.05]'
                  : 'font-medium bg-white/[0.10] border border-white/20 text-ink hover:bg-white/[0.14]'
              }`}
            >
              Mark done
            </button>
          </div>
        )}

        {phase === 'marking' && (
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-1.5">
              <span className="text-[12px] uppercase tracking-[0.14em] text-ink-faint">Log it</span>
              <p className="text-[13px] text-ink-muted leading-relaxed">Where did it go, and what was it.</p>
            </div>
            <LogShipForm
              initialDescription={one}
              submitLabel="It shipped"
              onLogged={() => setPhase('done')}
              onCancel={() => setPhase('task')}
            />
          </div>
        )}

        {phase === 'done' && (
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-2">
              <p className="font-display text-[22px] leading-snug">That left your machine.</p>
              <p className="text-[13px] text-ink-faint leading-relaxed">
                It is in the ledger. Nothing else is required today.
              </p>
            </div>
            <button
              type="button"
              onClick={onUnlock}
              className="w-full py-3.5 rounded-xl text-[15px] font-medium bg-white/[0.10] border border-white/20 text-ink hover:bg-white/[0.14] transition-colors"
            >
              Open the dashboard
            </button>
          </div>
        )}
      </div>

      {phase !== 'done' && (
        <button
          type="button"
          onClick={override}
          className="mt-12 text-[11px] text-ink-faint/60 hover:text-ink-faint transition-colors"
        >
          override to full dashboard
        </button>
      )}
    </div>
  )
}
