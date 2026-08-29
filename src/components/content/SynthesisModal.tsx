import React, { useEffect, useState } from 'react'
import { Sparkles, X, Loader2, GitMerge } from 'lucide-react'
import { useToast } from '../shared/Toast'
import type { ContentIdeaRow } from '../../hooks/useRealtimeContentIdeas'

// Venture + format, mirroring venture_formats. There is ONE content venture,
// Publication, with two formats. Synthesis targets a FORMAT, never the
// venture, because the two carry different registers.
interface LaneChoice {
  lane: 'publication'
  slot?: string | null
  label: string
  description: string
}

const LANES: LaneChoice[] = [
  { lane: 'publication', slot: 'money_of_ai', label: 'The Money of AI', description: 'Who pays for this, where does value move, and what mechanism changes when the shift lands. Take one load-bearing claim apart against dated evidence, and end where the record runs out. The event is never the story.' },
  { lane: 'publication', slot: 'built_with_ai', label: 'Built with AI', description: 'Someone who actually built something, dug past what they built to why they really built it. The third turn of the why is the piece. Warm, Gear B.' },
]

interface Props {
  open: boolean
  onClose: () => void
  /** Cards the user pre-selected (from cluster expansion or multi-select). */
  selected: ContentIdeaRow[]
  /** Called with the new synthesis id once it's drafted. */
  onSynthesized?: (newId: string) => void
}

/**
 * SynthesisModal — pick a lane + optional angle hint, then collapse N selected
 * cards into one drafted narrative via /api/content-ideas/synthesize. The new
 * draft lands in 'drafting' state; source cards flip to 'absorbed'.
 */
export function SynthesisModal({ open, onClose, selected, onSynthesized }: Props) {
  const { toast } = useToast()
  const [busy, setBusy] = useState(false)
  const [choice, setChoice] = useState<LaneChoice>(LANES[0])
  const [angleHint, setAngleHint] = useState('')

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const submit = async () => {
    if (busy || selected.length < 2) return
    setBusy(true)
    try {
      const r = await fetch('/api/content-ideas/synthesize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_idea_ids: selected.map(s => s.id),
          target_lane: choice.lane,
          lane_slot: choice.slot || null,
          angle_hint: angleHint.trim() || null,
        }),
      })
      const payload = await r.json().catch(() => ({}))
      if (!r.ok || !payload.ok) throw new Error(payload.error || `HTTP ${r.status}`)
      toast(
        `Synthesized ${payload.sources_used} cards into a ${choice.label} draft.${
          typeof payload.cohesion_confidence === 'number' && payload.cohesion_confidence < 0.6
            ? ' Low cohesion — review carefully.'
            : ''
        }`,
        'success',
      )
      onSynthesized?.(payload.id)
      onClose()
      // Deep-link into the composer.
      window.location.hash = `#/content?idea=${payload.id}`
    } catch (e: any) {
      toast(`Synthesis failed: ${String(e?.message || e)}`, 'error')
    } finally {
      setBusy(false)
    }
  }

  if (!open) return null

  return (
    <div
      className="fixed top-0 left-0 w-[calc(100vw/var(--z,1))] h-[calc(100dvh/var(--z,1))] z-50 bg-black/50 backdrop-blur-sm flex items-start justify-center pt-[10vh] px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-2xl border border-white/10 bg-sunk shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center gap-2 px-5 pt-4 pb-2 border-b border-white/[0.06]">
          <GitMerge size={14} className="text-violet-300" />
          <h2 className="text-[13px] font-semibold text-white">Synthesize narrative</h2>
          <span className="text-[10.5px] text-white/40 ml-1">
            {selected.length} card{selected.length === 1 ? '' : 's'} → one draft
          </span>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto text-white/40 hover:text-white/80"
            aria-label="Close"
          >
            <X size={14} />
          </button>
        </header>

        <div className="px-5 py-4 max-h-[70vh] overflow-y-auto">
          {/* Cards going in */}
          <section className="mb-4">
            <h3 className="text-[10.5px] uppercase tracking-[0.1em] text-white/45 mb-2">Folding in</h3>
            <div className="space-y-1 max-h-[140px] overflow-y-auto pr-1">
              {selected.slice(0, 14).map((s, i) => (
                <div key={s.id} className="flex items-start gap-2 text-[12px]">
                  <span className="text-white/35 tabular-nums w-5 flex-shrink-0">[{i + 1}]</span>
                  <span className="text-white/80 truncate">{s.idea}</span>
                </div>
              ))}
              {selected.length > 14 && (
                <p className="text-[11px] text-white/40 pl-7">…and {selected.length - 14} more</p>
              )}
            </div>
          </section>

          {/* Lane picker */}
          <section className="mb-4">
            <h3 className="text-[10.5px] uppercase tracking-[0.1em] text-white/45 mb-2">Target lane</h3>
            <div className="grid grid-cols-1 gap-1.5">
              {LANES.map((l) => {
                const active = l.lane === choice.lane && (l.slot || null) === (choice.slot || null)
                return (
                  <button
                    key={`${l.lane}:${l.slot || ''}`}
                    type="button"
                    onClick={() => setChoice(l)}
                    className={`text-left px-3 py-2 rounded-md border transition-colors ${
                      active
                        ? 'border-violet-400/50 bg-violet-500/15'
                        : 'border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.04]'
                    }`}
                  >
                    <p className={`text-[12.5px] font-medium ${active ? 'text-white' : 'text-white/80'}`}>{l.label}</p>
                    <p className="text-[11px] text-white/45 mt-0.5">{l.description}</p>
                  </button>
                )
              })}
            </div>
          </section>

          {/* Angle hint */}
          <section className="mb-2">
            <h3 className="text-[10.5px] uppercase tracking-[0.1em] text-white/45 mb-2">Angle hint (optional)</h3>
            <textarea
              value={angleHint}
              onChange={(e) => setAngleHint(e.target.value)}
              rows={2}
              placeholder='e.g. "Frame this around platform lock-in becoming the new moat" or leave blank for Cleo to find the throughline.'
              className="w-full bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-[12.5px] text-white placeholder-white/30 focus:outline-none focus:border-violet-500/40 resize-none"
            />
          </section>
        </div>

        <footer className="flex items-center justify-between px-5 py-3 border-t border-white/[0.06]">
          <p className="text-[11px] text-white/40">
            Goes to <span className="text-white/55">drafting</span>; source cards flip to <span className="text-white/55">absorbed</span>.
          </p>
          <button
            type="button"
            onClick={submit}
            disabled={busy || selected.length < 2}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-medium border border-violet-500/30 bg-violet-500/15 text-violet-200 hover:bg-violet-500/25 disabled:opacity-40 transition-colors"
          >
            {busy ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
            Synthesize {selected.length} → 1
          </button>
        </footer>
      </div>
    </div>
  )
}
