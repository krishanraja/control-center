import React, { useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { ACTION_STARTERS, isVaguePublishIntent, validateConcreteness } from '../../lib/pilotConcreteness'
import { candidateActionText, fetchPublishCandidates, type PublishCandidate } from '../../lib/publishCandidates'
import { useHaptics } from '../../hooks/useHaptics'
import { PublishCandidateCard } from './PublishCandidateCard'
import { Tap, VoiceField } from './controls'

/**
 * Naming the one action, without the keyboard and without a dead end.
 *
 * v1 asked for free text and validated it. On a phone that produced a trap: the
 * operator typed "Schedule content for the week", the rule rejected it, and the
 * only way forward was guessing which words the validator wanted. The button
 * read as broken.
 *
 * The guided path fixes that structurally. Picking a starter verb satisfies the
 * verb half of the rule before a single character is typed, so the only thing
 * left to supply is who and what, by voice if you like. Free text is still
 * available for people who want it, now with a rejection that names the actual
 * problem instead of repeating the rule.
 *
 * Publish is different from the other starters: the system holds real
 * inventory for it (content_ideas). So Publish and Post resolve against the
 * queue first, and typed publish-intent with a placeholder object ("publish
 * something timely") gets the queue's best candidate offered as a substitution
 * rather than being parked verbatim. Always substitution, never rejection, and
 * the manual path stays one tap away.
 */

interface Props {
  onCommit: (text: string, url?: string) => void | Promise<void>
  saving?: boolean
  submitLabel?: string
  /** Seeds free-text mode, used by the shutdown when editing. */
  initial?: string
}

export function OneActionPicker({ onCommit, saving, submitLabel = 'Lock it in', initial = '' }: Props) {
  const h = useHaptics()
  const [starter, setStarter] = useState<typeof ACTION_STARTERS[number] | null>(null)
  const [rest, setRest] = useState('')
  const [freeform, setFreeform] = useState(Boolean(initial))
  const [text, setText] = useState(initial)
  const [hint, setHint] = useState<string | null>(null)

  // The publish queue, loaded once on first need and held for the mount.
  const [cands, setCands] = useState<PublishCandidate[] | null>(null)
  const [candIdx, setCandIdx] = useState(0)
  const [candSource, setCandSource] = useState<null | 'starter' | 'freetext'>(null)
  const [checkingQueue, setCheckingQueue] = useState(false)
  const [keptWords, setKeptWords] = useState('')

  const composed = starter ? `${starter.verb} ${rest.trim()}`.trim() : ''

  const loadCandidates = async (): Promise<PublishCandidate[]> => {
    if (cands) return cands
    setCheckingQueue(true)
    const list = await fetchPublishCandidates()
    setCands(list)
    setCheckingQueue(false)
    return list
  }

  const pickStarter = async (s: typeof ACTION_STARTERS[number]) => {
    h.select()
    setStarter(s)
    setHint(null)
    if (s.verb !== 'Publish' && s.verb !== 'Post') return
    const list = await loadCandidates()
    if (list.length) {
      setCandIdx(0)
      setCandSource('starter')
    } else {
      setHint('Nothing in the queue is ready to publish. Name it yourself.')
    }
  }

  const commitGuided = () => {
    if (!rest.trim()) { setHint('Say or type who it goes to.'); h.warning(); return }
    h.notifySuccess()
    onCommit(composed)
  }

  const commitFree = async () => {
    const check = validateConcreteness(text)
    if (!check.ok) { setHint(check.hint || null); h.warning(); return }
    // Passing the validator is not enough: "publish something timely" carries
    // the verb but names no artifact. If the queue holds a real candidate,
    // offer it instead of parking the placeholder. The operator's words stay
    // one tap away on the card.
    if (isVaguePublishIntent(text)) {
      const list = await loadCandidates()
      if (list.length) {
        setKeptWords(text.trim())
        setCandIdx(0)
        setCandSource('freetext')
        return
      }
    }
    h.notifySuccess()
    onCommit(text.trim())
  }

  // ── The queue is being consulted ───────────────────────────────────────────
  if (checkingQueue) {
    return (
      <p className="text-[13px] text-ink-faint leading-relaxed animate-pulse">
        Checking the queue for a ready draft.
      </p>
    )
  }

  // ── A real candidate, offered one at a time ────────────────────────────────
  if (candSource && cands && cands[candIdx]) {
    const c = cands[candIdx]
    return (
      <PublishCandidateCard
        candidate={c}
        saving={saving}
        submitLabel={submitLabel}
        preface={candSource === 'freetext'
          ? (c.tier === 'ready'
            ? 'That names the intent, not the artifact. The queue has one ready:'
            : 'That names the intent, not the artifact. Nothing is fully fresh; the closest:')
          : (c.tier === 'ready'
            ? null
            : 'Nothing is both approved and fresh. The closest:')}
        onAccept={() => { h.notifySuccess(); onCommit(candidateActionText(c), c.url ?? undefined) }}
        onNext={() => {
          if (candIdx + 1 < cands.length) {
            setCandIdx(candIdx + 1)
          } else {
            setCandSource(null)
            setHint('That was the whole queue. Name the artifact yourself.')
          }
        }}
        onManual={() => { setCandSource(null); setHint(null) }}
        onKeepMine={candSource === 'freetext'
          ? () => { h.notifySuccess(); onCommit(keptWords) }
          : undefined}
      />
    )
  }

  // ── Free text, for when the starters do not fit ────────────────────────────
  if (freeform) {
    return (
      <div className="flex flex-col gap-4">
        <VoiceField
          value={text}
          onChange={v => { setText(v); setHint(null) }}
          placeholder="Verb, artifact, recipient"
          rows={3}
          autoFocus
        />
        {hint && (
          <div className="rounded-xl bg-white/[0.04] border border-white/10 px-4 py-3">
            <p className="text-[13px] leading-relaxed text-ink">{hint}</p>
          </div>
        )}
        <Tap onTap={commitFree} disabled={saving || !text.trim()} feel="success">
          {saving ? 'Saving' : submitLabel}
        </Tap>
        <Tap
          variant="quiet"
          className="!min-h-[44px] text-[13px]"
          onTap={() => { h.tap(); setFreeform(false); setHint(null) }}
        >
          Pick from a list instead
        </Tap>
      </div>
    )
  }

  // ── Step 2: the starter is chosen, so only who and what remain ─────────────
  if (starter) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <Tap
            variant="secondary"
            ariaLabel="Change the action"
            className="!min-h-[44px] !w-[44px] !px-0 flex items-center justify-center shrink-0"
            onTap={() => { h.tap(); setStarter(null); setRest(''); setHint(null) }}
          >
            <ArrowLeft size={16} />
          </Tap>
          <span className="font-display text-[20px] text-ink">{starter.verb}</span>
        </div>

        <VoiceField
          value={rest}
          onChange={v => { setRest(v); setHint(null) }}
          placeholder={starter.placeholder}
          rows={2}
          autoFocus
        />

        {composed && rest.trim() && (
          <p className="text-[13px] text-ink-faint leading-relaxed">
            Locking in: <span className="text-ink-muted">{composed}</span>
          </p>
        )}
        {hint && <p className="text-[13px] text-ink-muted leading-relaxed">{hint}</p>}

        <Tap onTap={commitGuided} disabled={saving || !rest.trim()} feel="success">
          {saving ? 'Saving' : submitLabel}
        </Tap>
      </div>
    )
  }

  // ── Step 1: pick the action. No keyboard, no rejection possible ────────────
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-2.5">
        {ACTION_STARTERS.map(s => (
          <Tap
            key={s.verb}
            variant="chip"
            className="justify-center flex items-center"
            onTap={() => { pickStarter(s) }}
          >
            {s.label}
          </Tap>
        ))}
      </div>
      <Tap
        variant="quiet"
        className="!min-h-[44px] text-[13px]"
        onTap={() => { h.tap(); setFreeform(true) }}
      >
        Type it myself
      </Tap>
    </div>
  )
}
