import React, { useState } from 'react'
import {
  formatDue,
  type Compilation,
  type OpenTest,
  type TestOutcome,
} from '../../lib/worryStates'
import { LogShipForm } from './LogShipForm'
import { useHaptics } from '../../hooks/useHaptics'
import { Tap, VoiceField, DockButton } from './controls'

// Capture and close. One textarea in, one terminal state out, then the modal
// shuts. Nothing here ever lists past worries: the only rows this component
// renders are the five open tests when a save is capped, and that list exists
// solely so closing one is a single tap away.

const API = import.meta.env.VITE_API_URL ?? ''

type Phase = 'capture' | 'confirm' | 'capped' | 'shipping' | 'done'

interface Props {
  open: boolean
  onClose: () => void
}

/**
 * The compiler's entry point, mounted beside the shutdown button.
 *
 * Green mode only, and structurally so: this renders inside PilotGate's
 * children, and red mode returns before children ever render. The button
 * therefore cannot appear on a red day. That is enforced by where it is
 * mounted, not by a conditional someone could later flip.
 */
export function WorryCompilerButton() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <DockButton label="compile a worry" title="Compile a worry" onTap={() => setOpen(true)} />
      <WorryCompiler open={open} onClose={() => setOpen(false)} />
    </>
  )
}

export function WorryCompiler({ open, onClose }: Props) {
  const h = useHaptics()
  const [phase, setPhase] = useState<Phase>('capture')
  const [rawText, setRawText] = useState('')
  const [compilation, setCompilation] = useState<Compilation | null>(null)
  const [evidence, setEvidence] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [openTests, setOpenTests] = useState<OpenTest[]>([])
  const [closingMessage, setClosingMessage] = useState('')

  if (!open) return null

  const reset = () => {
    setPhase('capture'); setRawText(''); setCompilation(null); setEvidence('')
    setError(null); setOpenTests([]); setClosingMessage(''); setBusy(false)
  }

  const shut = () => { reset(); onClose() }

  const compile = async () => {
    if (!rawText.trim()) return
    setBusy(true); setError(null)
    try {
      const res = await fetch(`${API}/api/pilot/worries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'compile', raw_text: rawText.trim() }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) throw new Error(json.error || `Compile failed (${res.status})`)
      setCompilation(json.compilation)
      setPhase('confirm')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not compile that')
    } finally {
      setBusy(false)
    }
  }

  const save = async (extra: Record<string, unknown> = {}) => {
    if (!compilation) return
    setBusy(true); setError(null)
    try {
      const res = await fetch(`${API}/api/pilot/worries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw_text: rawText.trim(), ...compilation, ...extra }),
      })
      const json = await res.json()
      if (res.status === 409 && json.open_tests) {
        setOpenTests(json.open_tests)
        setPhase('capped')
        return
      }
      if (res.status === 409 && json.needs_confirm) {
        const ok = window.confirm(
          `Tomorrow's ONE is already "${json.existing_one}". Replace it?`,
        )
        if (ok) return save({ ...extra, confirm_overwrite: true })
        return
      }
      if (!res.ok || !json.ok) throw new Error(json.error || `Save failed (${res.status})`)
      return json
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save')
      return null
    } finally {
      setBusy(false)
    }
  }

  const closeTest = async (id: string, outcome: TestOutcome) => {
    await fetch(`${API}/api/pilot/worries`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, outcome }),
    })
    setOpenTests(prev => prev.filter(t => t.id !== id))
  }

  const finish = (message: string) => { setClosingMessage(message); setPhase('done') }

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center sm:px-5 sm:py-8 bg-base/80 backdrop-blur-sm">
      <div className="w-full sm:max-w-[460px] max-h-[92dvh] overflow-y-auto rounded-t-3xl sm:rounded-2xl bg-base border border-white/[0.10] p-6 pb-[calc(env(safe-area-inset-bottom,0px)+24px)] sm:pb-6 flex flex-col gap-5 text-ink">

        {phase === 'capture' && (
          <>
            <div>
              <h2 className="font-display text-[19px] leading-tight">Compile a worry</h2>
              <p className="text-[12px] text-ink-faint mt-1">It comes out as one thing you can finish.</p>
            </div>
            <VoiceField
              value={rawText}
              onChange={setRawText}
              rows={5}
              placeholder="Dump it. 60 seconds, any language."
            />
            {error && <p className="text-[12px] text-ink-muted leading-relaxed">{error}</p>}
            <div className="flex items-center gap-2">
              <Tap onTap={compile} disabled={busy || !rawText.trim()} feel="impactMedium" className="flex items-center justify-center">
                {busy ? 'Compiling' : 'Compile'}
              </Tap>
              <Tap variant="quiet" className="!min-h-[48px] text-[13px] flex items-center" onTap={() => { h.tap(); shut() }}>
                Cancel
              </Tap>
            </div>
          </>
        )}

        {phase === 'confirm' && compilation && (
          <ConfirmCard
            compilation={compilation}
            evidence={evidence}
            setEvidence={setEvidence}
            onEdit={patch => setCompilation({ ...compilation, ...patch })}
            busy={busy}
            error={error}
            onSaveTest={async () => { if (await save()) finish('Test open. It closes when reality answers.') }}
            onDoNow={async () => {
              if (await save({ action_disposition: 'done_now' })) setPhase('shipping')
            }}
            onTomorrow={async () => {
              if (await save({ action_disposition: 'tomorrow_one' })) finish('That is tomorrow. Nothing to hold tonight.')
            }}
            onRelitigation={async (note: string) => {
              const saved = await save({ outcome_note: note || 'no new evidence' })
              if (saved) {
                finish(note
                  ? 'Logged. Reopen it deliberately in tomorrow’s shutdown if it still matters.'
                  : 'Closed. The decision stands.')
              }
            }}
            onWeather={async () => { if (await save()) finish('Labelled. It expires in seven days on its own.') }}
            onCancel={shut}
          />
        )}

        {phase === 'capped' && (
          <>
            <div>
              <h2 className="font-display text-[19px] leading-tight">Five tests are open.</h2>
              <p className="text-[13px] text-ink-muted mt-1.5 leading-relaxed">Close one to open another.</p>
            </div>
            <div className="flex flex-col gap-3">
              {openTests.map(t => (
                <div key={t.id} className="rounded-xl bg-white/[0.03] border border-white/[0.08] p-3.5 flex flex-col gap-2.5">
                  <p className="text-[13px] leading-relaxed text-ink">{t.prediction}</p>
                  <span className="text-[11px] text-ink-faint">Due {formatDue(t.test_due_date)}</span>
                  <div className="flex gap-1.5">
                    {(['confirmed', 'disconfirmed', 'partial'] as TestOutcome[]).map(o => (
                      <button
                        key={o} type="button"
                        onPointerDown={() => h.select()}
                        onClick={() => closeTest(t.id, o)}
                        className="min-h-[44px] px-3.5 rounded-xl text-[13px] bg-white/[0.05] border border-white/10 text-ink-muted hover:bg-white/[0.10] hover:text-ink transition-all active:scale-95 touch-manipulation"
                      >
                        {o === 'confirmed' ? 'Came true' : o === 'disconfirmed' ? 'Did not' : 'Partly'}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Tap onTap={() => save().then(r => { if (r) finish('Test open.') })} disabled={busy || openTests.length >= 5} className="flex items-center justify-center">
                Save the new test
              </Tap>
              <Tap variant="quiet" className="!min-h-[48px] text-[13px] flex items-center" onTap={() => { h.tap(); shut() }}>
                Leave it
              </Tap>
            </div>
          </>
        )}

        {phase === 'shipping' && (
          <>
            <div>
              <h2 className="font-display text-[19px] leading-tight">Log what left.</h2>
              <p className="text-[12px] text-ink-faint mt-1">Same ledger as everything else.</p>
            </div>
            <LogShipForm
              initialDescription={compilation?.action_text || ''}
              submitLabel="It shipped"
              onLogged={() => finish('In the ledger. Done.')}
              onCancel={() => finish('Saved. Log it when it lands.')}
            />
          </>
        )}

        {phase === 'done' && (
          <>
            <p className="font-display text-[19px] leading-snug">{closingMessage}</p>
            <Tap className="self-start flex items-center justify-center" onTap={() => { h.tap(); shut() }}>
              Close
            </Tap>
          </>
        )}
      </div>
    </div>
  )
}

interface ConfirmProps {
  compilation: Compilation
  evidence: string
  setEvidence: (s: string) => void
  onEdit: (patch: Partial<Compilation>) => void
  busy: boolean
  error: string | null
  onSaveTest: () => void
  onDoNow: () => void
  onTomorrow: () => void
  onRelitigation: (note: string) => void
  onWeather: () => void
  onCancel: () => void
}

const FIELD = 'w-full px-4 py-3 min-h-[48px] rounded-xl bg-white/[0.03] border border-white/10 text-[16px] leading-relaxed text-ink outline-none focus:border-white/25'
const PRIMARY = 'min-h-[48px] px-4 rounded-xl text-[15px] font-medium bg-white/[0.10] border border-white/20 text-ink hover:bg-white/[0.14] disabled:opacity-40 active:scale-[0.97] transition-all touch-manipulation'
const SECONDARY = 'min-h-[48px] px-4 rounded-xl text-[15px] border border-white/10 text-ink-muted hover:bg-white/[0.05] hover:text-ink disabled:opacity-40 active:scale-[0.97] transition-all touch-manipulation'

function Label({ children }: { children: React.ReactNode }) {
  return <span className="text-[11px] uppercase tracking-[0.12em] text-ink-faint">{children}</span>
}

function ConfirmCard(p: ConfirmProps) {
  const c = p.compilation

  return (
    <>
      <div className="flex flex-col gap-1">
        <Label>{c.state}</Label>
        <p className="text-[12px] text-ink-faint leading-relaxed">{c.reasoning}</p>
      </div>

      {c.state === 'test' && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label>Belief</Label>
            <textarea value={c.belief || ''} rows={2} onChange={e => p.onEdit({ belief: e.target.value })} className={`${FIELD} resize-none`} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Prediction</Label>
            <textarea value={c.prediction || ''} rows={2} onChange={e => p.onEdit({ prediction: e.target.value })} className={`${FIELD} resize-none`} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Test</Label>
            <textarea value={c.test_plan || ''} rows={2} onChange={e => p.onEdit({ test_plan: e.target.value })} className={`${FIELD} resize-none`} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Due</Label>
            <input type="date" value={c.test_due_date || ''} onChange={e => p.onEdit({ test_due_date: e.target.value })} className={FIELD} />
          </div>
          {p.error && <p className="text-[12px] text-ink-muted">{p.error}</p>}
          <div className="flex items-center gap-2">
            <button type="button" onClick={p.onSaveTest} disabled={p.busy} className={PRIMARY}>Save test</button>
            <button type="button" onClick={p.onCancel} className="min-h-[48px] px-3 text-[13px] text-ink-faint hover:text-ink-muted transition-colors touch-manipulation">Cancel</button>
          </div>
        </div>
      )}

      {c.state === 'action' && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label>The action</Label>
            <textarea value={c.action_text || ''} rows={2} onChange={e => p.onEdit({ action_text: e.target.value })} className={`${FIELD} resize-none`} />
          </div>
          {p.error && <p className="text-[12px] text-ink-muted">{p.error}</p>}
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={p.onDoNow} disabled={p.busy} className={PRIMARY}>Do it now</button>
            <button type="button" onClick={p.onTomorrow} disabled={p.busy} className={SECONDARY}>Make it tomorrow&rsquo;s ONE</button>
          </div>
        </div>
      )}

      {c.state === 'relitigation' && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label>The decision</Label>
            <p className="text-[13px] leading-relaxed text-ink">{c.original_decision}</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>{c.evidence_question || 'What new evidence has arrived since this was decided?'}</Label>
            <textarea
              value={p.evidence} rows={3}
              onChange={e => p.setEvidence(e.target.value)}
              placeholder="Discomfort is not evidence."
              className={`${FIELD} resize-none placeholder:text-ink-faint`}
            />
          </div>
          {p.error && <p className="text-[12px] text-ink-muted">{p.error}</p>}
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => p.onRelitigation(p.evidence.trim())} disabled={p.busy} className={PRIMARY}>
              {p.evidence.trim() ? 'Log the evidence' : 'Close it'}
            </button>
            <button type="button" onClick={() => p.onRelitigation('')} disabled={p.busy} className={SECONDARY}>
              No new evidence
            </button>
          </div>
        </div>
      )}

      {c.state === 'weather' && (
        <div className="flex flex-col gap-3">
          <p className="text-[15px] leading-relaxed text-ink">{c.label}</p>
          {p.error && <p className="text-[12px] text-ink-muted">{p.error}</p>}
          <div className="flex items-center gap-2">
            <button type="button" onClick={p.onWeather} disabled={p.busy} className={PRIMARY}>Label it and let it sit</button>
            <button type="button" onClick={p.onCancel} className="px-3 py-2.5 text-[13px] text-ink-faint hover:text-ink-muted transition-colors">Cancel</button>
          </div>
        </div>
      )}
    </>
  )
}
