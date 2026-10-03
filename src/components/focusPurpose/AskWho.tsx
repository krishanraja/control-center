import React, { useState } from 'react'
import { Eyebrow } from '../shared/Eyebrow'
import { Tap, VoiceField } from '../pilot/controls'
import { useWork } from '../../lib/loadingVoice'

// "I need something. Who do I ask, and what do I say?"
//
// The daily ask card asks Krish for one clean ask a day. It has always handed
// him an empty box, and an empty box is the exact shape of the thing he says he
// avoids: asking his own network for help. He knows what he needs long before
// he can write who to send it to.
//
// So this proposes three named people with the reason each one is right, the
// reason today is the day, and wording he can edit. It never sends. Picking one
// drops the words into today's ask through the card's existing compose field,
// the same path the strategist's seed uses (ADR-026), so there is still one ask
// a day and one place it lives.
//
// The proof line under each name is the point. It is the measured record, not a
// warm adjective: "11 messages both ways on LinkedIn; 2 meetings, last 7 months
// ago; they wrote last, so a reply is owed". He can disagree with a sentence a
// model wrote. He cannot disagree with his own mailbox.

export interface AskCandidate {
  contact_id: string
  name: string | null
  title: string | null
  company: string | null
  why_them: string
  why_now: string
  ask: string
  channel: string
  give_back: string
  confidence: 'high' | 'medium' | 'low'
  evidence: { summary: string; warmth: number | null; measured: boolean } | null
}

interface Props {
  /** Drop the chosen wording into today's ask. */
  onUse: (text: string) => void
  compact?: boolean
}

export function AskWho({ onUse, compact }: Props) {
  const [open, setOpen] = useState(false)
  const [need, setNeed] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [candidates, setCandidates] = useState<AskCandidate[] | null>(null)
  const work = useWork('network.ask')

  async function find() {
    const q = need.trim()
    if (!q || loading) return
    setLoading(true); setError(null); setCandidates(null)
    try {
      const r = await fetch('/api/network/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ need: q }),
      })
      const j = await r.json()
      if (!j.ok) throw new Error(j.error || 'that did not work')
      setCandidates(Array.isArray(j.candidates) ? j.candidates : [])
    } catch (e) {
      setError(String((e as Error)?.message || e))
    } finally {
      setLoading(false)
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-testid="ask-who-open"
        className="min-h-[44px] text-left text-label text-ink-faint hover:text-ink-muted transition-colors touch-manipulation"
      >
        Not sure who to ask? Find three people from your network.
      </button>
    )
  }

  return (
    <div className="flex flex-col gap-3 pt-3 border-t border-white/[0.06]" data-testid="ask-who">
      <div>
        <Eyebrow>Who to ask</Eyebrow>
        <p className="text-label text-ink-faint mt-1">
          Say what you need. Three people come back with the reason, and words you can change.
        </p>
      </div>

      <VoiceField
        value={need}
        onChange={setNeed}
        rows={2}
        placeholder="An intro to a retail media buyer. Someone who has priced an AI workshop. A second opinion on the Maven launch."
      />

      <div className="flex items-center gap-2">
        <Tap onTap={() => void find()} disabled={!need.trim() || loading} variant="secondary">
          {loading ? work.label : 'Find three people'}
        </Tap>
        {candidates && !loading && (
          <Tap onTap={() => { setCandidates(null); setNeed('') }} variant="quiet">
            Start again
          </Tap>
        )}
      </div>

      {error && <p className="text-label text-ink-muted leading-relaxed">{error}</p>}

      {candidates && candidates.length === 0 && !loading && (
        <p className="text-label text-ink-muted leading-relaxed">
          Nobody in your network matches that yet. Try saying it another way, or in plainer words.
        </p>
      )}

      {candidates?.map(c => (
        <div
          key={c.contact_id}
          data-testid="ask-who-candidate"
          className={`rounded-xl bg-white/[0.03] border border-white/10 flex flex-col gap-2 ${compact ? 'p-3' : 'p-4'}`}
        >
          <div>
            <p className="text-ui text-ink leading-snug">{c.name || 'Someone'}</p>
            {(c.title || c.company) && (
              <p className="text-label text-ink-faint leading-relaxed">
                {[c.title, c.company].filter(Boolean).join(', ')}
              </p>
            )}
          </div>

          {c.why_them && <p className="text-label text-ink-muted leading-relaxed">{c.why_them}</p>}
          {c.why_now && <p className="text-label text-ink-muted leading-relaxed">{c.why_now}</p>}

          {/* The measured record, in his own data's words. */}
          {c.evidence?.summary && (
            <p className="text-micro text-ink-faint leading-relaxed">{c.evidence.summary}</p>
          )}

          <p className="text-body text-ink leading-relaxed whitespace-pre-wrap break-words">{c.ask}</p>

          {(c.channel || c.give_back) && (
            <p className="text-micro text-ink-faint leading-relaxed">
              {c.channel ? `Send on ${c.channel}.` : ''}
              {c.give_back ? ` Offer back: ${c.give_back}` : ''}
            </p>
          )}

          <div className="flex items-center gap-2 pt-0.5">
            <Tap onTap={() => onUse(c.ask)} variant="secondary">Use this wording</Tap>
            {c.confidence === 'low' && <span className="text-micro text-ink-faint">Thin match</span>}
          </div>
        </div>
      ))}
    </div>
  )
}
