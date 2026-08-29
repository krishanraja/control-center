import React, { useState } from 'react'
import type { PilotCheckin } from '../../types/pilot'
import { logOverride, saveEvening } from '../../hooks/usePilot'
import { useHaptics } from '../../hooks/useHaptics'
import { LogShipForm } from './LogShipForm'
import { OneActionPicker } from './OneActionPicker'
import { Tap } from './controls'

// One screen, one action, and the means to do it. No navigation, no dashboard,
// no list of other tasks.
//
// No red anywhere in red mode. The name describes the operator's state, not the
// palette. Generous whitespace and one focal point are the intervention.

interface Props {
  /** The most recent evening check-in, which carries today's ONE. */
  lastEvening: PilotCheckin | null
  /**
   * Called after a ship is logged or the escape hatch is used. `navigated`
   * is true when this unlock already carried its own destination (the in-app
   * draft), so the gate must not route the day anywhere else on top of it.
   */
  onUnlock: (navigated?: boolean) => void
}

type Phase = 'ask' | 'task' | 'marking' | 'done'

export function RedMode({ lastEvening, onUnlock }: Props) {
  const h = useHaptics()
  const [one, setOne] = useState(lastEvening?.tomorrow_one || '')
  const [oneUrl, setOneUrl] = useState(lastEvening?.tomorrow_one_url || '')
  const [phase, setPhase] = useState<Phase>(lastEvening?.tomorrow_one ? 'task' : 'ask')

  // The fallback path: no evening entry exists, so red mode asks exactly one
  // question. The picker guarantees a valid answer without the keyboard, so
  // this can no longer dead-end the way free-text validation did.
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // A url arrives when the picker resolved the action against the publish
  // queue, and becomes the "Open it" button so the draft is one tap away.
  const commitOne = async (text: string, url?: string) => {
    setSaving(true)
    setError(null)
    try {
      await saveEvening({ tomorrow_one: text, tomorrow_one_url: url })
      setOne(text)
      setOneUrl(url || '')
      setPhase('task')
    } catch {
      setError('Could not save. Try once more.')
    } finally {
      setSaving(false)
    }
  }

  const override = async () => {
    h.tap()
    await logOverride()
    onUnlock()
  }

  return (
    <div className="min-h-[100dvh] w-full flex flex-col items-center justify-center px-6 py-12 text-ink">
      <div className="w-full max-w-[440px] flex flex-col gap-8">

        {phase === 'ask' && (
          <div className="flex flex-col gap-6">
            <h1 className="font-display text-title leading-snug">
              What is the one 15-minute thing you can finish and send out today?
            </h1>
            <OneActionPicker onCommit={commitOne} saving={saving} />
            {error && <p className="text-body text-ink-muted">{error}</p>}
          </div>
        )}

        {phase === 'task' && (
          <div className="flex flex-col gap-7">
            <div className="flex flex-col gap-3">
              <span className="text-label uppercase tracking-[0.14em] text-ink-faint">Today</span>
              <p className="font-display text-heading leading-snug">{one}</p>
              <p className="text-body text-ink-faint leading-relaxed">
                Fifteen minutes. Done when it leaves your machine.
              </p>
            </div>

            {oneUrl ? (
              oneUrl.startsWith('#') ? (
                // An in-app draft (the Composer). The gate owns the screen, so
                // opening it means unlocking, and the logged override keeps a
                // reload from re-trapping the operator mid-draft. This is the
                // one action's workspace, not the dashboard.
                <Tap
                  className="w-full justify-center flex items-center"
                  feel="impactMedium"
                  onTap={async () => {
                    await logOverride()
                    window.location.hash = oneUrl
                    onUnlock(true)
                  }}
                >
                  Open the draft
                </Tap>
              ) : (
                <a
                  href={oneUrl}
                  target="_blank"
                  rel="noreferrer"
                  onPointerDown={() => h.impactMedium()}
                  className="w-full min-h-[52px] flex items-center justify-center rounded-xl text-lede font-medium text-center bg-white/[0.10] border border-white/20 text-ink hover:bg-white/[0.14] active:scale-[0.98] transition-all touch-manipulation"
                >
                  Open it
                </a>
              )
            ) : null}

            <Tap
              variant={oneUrl ? 'secondary' : 'primary'}
              className="w-full justify-center flex items-center"
              onTap={() => { h.select(); setPhase('marking') }}
            >
              Mark done
            </Tap>

            {/* The escape from a ONE that no longer fits: back to the ask,
                where the judge and the build live. Without this, a stale or
                vague ONE was a dead end with nothing but Mark done. */}
            <Tap
              variant="quiet"
              className="!min-h-[44px] text-body w-full justify-center flex items-center"
              onTap={() => { h.tap(); setOne(''); setOneUrl(''); setPhase('ask') }}
            >
              Pick a different action
            </Tap>
          </div>
        )}

        {phase === 'marking' && (
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-1.5">
              <span className="text-label uppercase tracking-[0.14em] text-ink-faint">Log it</span>
              <p className="text-body text-ink-muted leading-relaxed">What was it, and who got it?</p>
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
              <p className="font-display text-title leading-snug">That one went out.</p>
              <p className="text-body text-ink-faint leading-relaxed">
                It is logged. Nothing else is needed from you today.
              </p>
            </div>
            <Tap className="w-full justify-center flex items-center" onTap={() => { h.notifySuccess(); onUnlock() }}>
              Open the dashboard
            </Tap>
          </div>
        )}
      </div>

      {phase !== 'done' && (
        <button
          type="button"
          onClick={override}
          className="mt-12 min-h-[44px] px-4 text-micro text-ink-faint/60 hover:text-ink-faint transition-colors touch-manipulation"
        >
          override to full dashboard
        </button>
      )}
    </div>
  )
}
