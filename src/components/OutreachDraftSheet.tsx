import React, { useEffect, useMemo, useState } from 'react'
import { Mail, Sparkles, Loader2 } from 'lucide-react'
import { BottomSheet } from './mobile/BottomSheet'
import { useToast } from './shared/Toast'
import { useHaptics } from '../hooks/useHaptics'

/** The minimum a caller needs to provide to draft an email for someone. */
export interface DraftTarget {
  id: string
  name: string
  subtitle?: string | null
  email?: string | null
  /** Venture slug to default the "how we could work together" angle to. */
  venture?: string | null
}

type Intent = 'introduction' | 'podcast_invite' | 'check_in' | 'follow_up'
type Length = 'short' | 'standard'
type Tone = 'warm' | 'direct'

const INTENTS: Array<{ id: Intent; label: string; hint: string }> = [
  { id: 'introduction', label: 'Intro', hint: 'Open a conversation, no pitch' },
  { id: 'podcast_invite', label: 'Podcast invite', hint: 'Pitch them for Signal & Noise' },
  { id: 'check_in', label: 'Check-in', hint: 'Light touch-base' },
  { id: 'follow_up', label: 'Follow up', hint: 'Continue a prior thread' },
]

// Kept in sync with the venture chips on the Leads tab.
const VENTURES: Array<{ slug: string; label: string }> = [
  { slug: 'mindmaker', label: 'Mindmaker' },
  { slug: 'meliora', label: 'Meliora' },
  { slug: 'adfixus', label: 'AdFixus' },
  { slug: 'signal_noise', label: 'Signal & Noise' },
  { slug: 'builder_economy', label: 'Builder Economy' },
  { slug: 'fractionl', label: 'Fractionl' },
  { slug: 'investor', label: 'Investor' },
]

const LENGTHS: Array<{ id: Length; label: string }> = [
  { id: 'short', label: 'Short' },
  { id: 'standard', label: 'Standard' },
]
const TONES: Array<{ id: Tone; label: string }> = [
  { id: 'direct', label: 'Direct' },
  { id: 'warm', label: 'Warm' },
]

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3.5 py-2 rounded-full text-[14px] font-medium whitespace-nowrap transition-colors ${
        active ? 'bg-white text-black' : 'bg-white/[0.06] text-white/70 active:bg-white/[0.12]'
      }`}
    >
      {children}
    </button>
  )
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[12px] uppercase tracking-wider text-white/40">{label}</p>
      {children}
    </div>
  )
}

/**
 * One-tap personalised outreach. Open it on a lead, choose a few things — the
 * angle, which venture to pitch, length/tone, an optional note — then hit Draft.
 * The Cleo Email Draft workflow composes the email in Krish's voice and drops it
 * into his Gmail as a draft. Nothing sends; he reviews and sends manually.
 */
export function OutreachDraftSheet({ target, onClose }: { target: DraftTarget | null; onClose: () => void }) {
  const { toast } = useToast()
  const h = useHaptics()

  const [intent, setIntent] = useState<Intent>('introduction')
  const [venture, setVenture] = useState<string | null>(null)
  const [length, setLength] = useState<Length>('standard')
  const [tone, setTone] = useState<Tone>('direct')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  // Reset the form each time a new target is opened, defaulting the venture to
  // the lead's own venture so the common case is zero extra taps.
  useEffect(() => {
    if (!target) return
    setIntent('introduction')
    setVenture(target.venture && VENTURES.some(v => v.slug === target.venture) ? target.venture : null)
    setLength('standard')
    setTone('direct')
    setNote('')
    setBusy(false)
  }, [target?.id])

  const hasEmail = !!target?.email
  const ventureLabel = useMemo(
    () => VENTURES.find(v => v.slug === venture)?.label || null,
    [venture],
  )

  const draft = async () => {
    if (!target || busy) return
    if (!hasEmail) {
      h.warning()
      toast('No email on file for this lead — add one first.', 'error')
      return
    }
    h.heavy()
    setBusy(true)
    try {
      const r = await fetch(`/api/contacts/${target.id}/draft-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intent, venture, length, tone, note: note.trim() || undefined }),
      })
      const payload = await r.json().catch(() => ({}))
      if (!r.ok || payload?.ok === false) throw new Error(payload?.error || `HTTP ${r.status}`)
      h.success()
      const url = payload?.draft_url
      toast(url ? 'Draft waiting in your Gmail.' : 'Draft created in Gmail.', 'success')
      if (url && typeof window !== 'undefined') {
        try { window.open(url, '_blank', 'noreferrer,noopener') } catch { /* popup blocked — toast still shown */ }
      }
      onClose()
    } catch (e: any) {
      h.error()
      toast(`Could not draft email: ${e?.message || 'try again'}`, 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <BottomSheet open={!!target} onClose={onClose} fullHeight={false} ariaLabel="Draft outreach email">
      {target && (
        <div className="flex flex-col">
          <div className="px-5 pb-4 flex flex-col gap-5 overflow-y-auto scrollbar-hide" style={{ maxHeight: '70vh' }}>
            {/* Recipient */}
            <div className="flex items-start gap-3">
              <span className="mt-0.5 w-9 h-9 rounded-full bg-violet-500/15 flex items-center justify-center flex-shrink-0">
                <Mail size={16} className="text-violet-300" />
              </span>
              <div className="min-w-0">
                <p className="text-[17px] font-semibold text-white leading-snug">{target.name}</p>
                {target.subtitle && <p className="text-[14px] text-white/55 leading-snug">{target.subtitle}</p>}
                <p className={`text-[13px] mt-0.5 ${hasEmail ? 'text-white/40' : 'text-rose-300'}`}>
                  {hasEmail ? target.email : 'No email on file'}
                </p>
              </div>
            </div>

            <Section label="Angle">
              <div className="flex flex-col gap-1.5">
                {INTENTS.map(it => (
                  <button
                    key={it.id}
                    type="button"
                    onClick={() => { h.tap(); setIntent(it.id) }}
                    className={`text-left px-4 py-3 rounded-2xl border transition-colors ${
                      intent === it.id
                        ? 'border-violet-400/50 bg-violet-500/10'
                        : 'border-white/[0.08] bg-white/[0.02] active:bg-white/[0.05]'
                    }`}
                  >
                    <span className="text-[15px] font-medium text-white">{it.label}</span>
                    <span className="block text-[13px] text-white/45 mt-0.5">{it.hint}</span>
                  </button>
                ))}
              </div>
            </Section>

            <Section label="How we could work together">
              <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-1 px-1">
                {VENTURES.map(v => (
                  <Chip key={v.slug} active={venture === v.slug} onClick={() => { h.tap(); setVenture(v.slug) }}>
                    {v.label}
                  </Chip>
                ))}
              </div>
            </Section>

            <div className="flex gap-6">
              <Section label="Length">
                <div className="flex gap-2">
                  {LENGTHS.map(l => (
                    <Chip key={l.id} active={length === l.id} onClick={() => { h.tap(); setLength(l.id) }}>{l.label}</Chip>
                  ))}
                </div>
              </Section>
              <Section label="Tone">
                <div className="flex gap-2">
                  {TONES.map(t => (
                    <Chip key={t.id} active={tone === t.id} onClick={() => { h.tap(); setTone(t.id) }}>{t.label}</Chip>
                  ))}
                </div>
              </Section>
            </div>

            <Section label="Anything to weave in (optional)">
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. mention we met at the AdTech panel, reference their Series B…"
                rows={2}
                className="w-full resize-none rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-[15px] text-white placeholder:text-white/30 focus:border-violet-400/40 focus:outline-none"
              />
            </Section>
          </div>

          {/* Sticky action */}
          <div className="px-5 pt-3 pb-[max(20px,env(safe-area-inset-bottom))] border-t border-white/[0.06] bg-[#0f0f12]">
            <button
              type="button"
              onClick={draft}
              disabled={busy || !hasEmail}
              className="w-full flex items-center justify-center gap-2 rounded-full bg-white text-black text-[16px] font-semibold py-4 active:scale-[0.98] transition-transform disabled:opacity-50 disabled:active:scale-100"
            >
              {busy ? (
                <><Loader2 size={18} className="animate-spin" /> Drafting…</>
              ) : (
                <><Sparkles size={18} /> Draft email{ventureLabel ? ` · ${ventureLabel}` : ''}</>
              )}
            </button>
          </div>
        </div>
      )}
    </BottomSheet>
  )
}
