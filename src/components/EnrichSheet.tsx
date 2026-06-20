import React, { useEffect, useState } from 'react'
import { Wand2, ExternalLink, Sparkles } from 'lucide-react'
import { BottomSheet } from './mobile/BottomSheet'
import { ProcessingOverlay } from './shared/ProcessingOverlay'
import { useToast } from './shared/Toast'
import { useHaptics } from '../hooks/useHaptics'

/** One target for the unified "Research this" sheet. Callers extract the existing
 *  brief from whatever field their entity stores it in (leads.raw_extraction,
 *  contacts.dossier, visibility_targets.raw_data → direct_research.summary). */
export interface EnrichTarget {
  id: string
  name: string
  subtitle?: string | null
  kind: 'person' | 'event'
  /** Enrich endpoint, e.g. /api/leads/:id/enrich or /api/visibility-targets/:id/enrich-deep */
  endpoint: string
  existingBrief?: string | null
}

/**
 * Unified enrichment sheet shared by Leads, Contacts and Visibility. One
 * affordance, one grammar: it shows the last research brief if there is one, lets
 * you choose n8n (queue the deep workflow) or Direct (research now via
 * Apollo/PDL + web + Cleo, no n8n), and renders the resulting brief in place.
 */
export function EnrichSheet({ target, onClose }: { target: EnrichTarget | null; onClose: () => void }) {
  const { toast } = useToast()
  const h = useHaptics()
  const [direct, setDirect] = useState(false)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ summary: string; sources: string[] } | null>(null)

  useEffect(() => {
    if (!target) return
    setDirect(false)
    setBusy(false)
    setResult(null)
  }, [target?.id])

  const run = async () => {
    if (!target || busy) return
    h.heavy()
    setBusy(true)
    try {
      const r = await fetch(target.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: direct ? 'direct' : undefined }),
      })
      const j = await r.json().catch(() => ({}))
      if (r.status === 409) { toast('Already researched.', 'info'); return }
      if (!r.ok || j?.ok === false) throw new Error(j?.error || `HTTP ${r.status}`)
      h.success()
      if (j?.mode === 'direct' && j?.summary) {
        setResult({ summary: j.summary, sources: Array.isArray(j.sources) ? j.sources : [] })
        toast('Research ready.', 'success')
      } else {
        toast('Enrichment queued — the card refreshes shortly.', 'success')
        onClose()
      }
    } catch (e: any) {
      h.error()
      toast(`Could not enrich: ${e?.message || 'try again'}`, 'error')
    } finally {
      setBusy(false)
    }
  }

  const brief = result?.summary || target?.existingBrief || null

  return (
    <BottomSheet open={!!target} onClose={onClose} fullHeight={false} ariaLabel="Research this">
      {busy && (
        <ProcessingOverlay
          label={direct ? 'Researching now' : 'Sending to enrich'}
          sub={direct ? 'Apollo + web + Cleo are building a brief' : 'Queuing the deep-enrich workflow'}
        />
      )}
      {target && (
        <div className="flex flex-col">
          <div className="px-5 pb-4 flex flex-col gap-4 overflow-y-auto scrollbar-hide" style={{ maxHeight: '70vh' }}>
            <div className="flex items-start gap-3">
              <span className="mt-0.5 w-9 h-9 rounded-full bg-violet-500/15 flex items-center justify-center flex-shrink-0">
                <Sparkles size={16} className="text-violet-300" />
              </span>
              <div className="min-w-0">
                <p className="text-[17px] font-semibold text-white leading-snug">{target.name}</p>
                {target.subtitle && <p className="text-[14px] text-white/55 leading-snug">{target.subtitle}</p>}
              </div>
            </div>

            {brief ? (
              <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-3">
                <p className="text-[11px] uppercase tracking-wider text-white/40 mb-1">{result ? 'Research brief' : 'Last brief'}</p>
                <p className="text-[14px] text-white/85 leading-relaxed whitespace-pre-wrap">{brief}</p>
                {result?.sources?.length ? (
                  <div className="mt-2 flex flex-col gap-1">
                    {result.sources.slice(0, 6).map((s, i) => (
                      <a key={i} href={s} target="_blank" rel="noreferrer noopener"
                        className="text-[12px] text-violet-300 hover:underline truncate inline-flex items-center gap-1">
                        <ExternalLink size={11} /> {s}
                      </a>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="text-[13px] text-white/45">
                No research yet. {target.kind === 'event' ? 'Pull organiser, audience and how to get on stage.' : 'Pull role, company, career and recent activity.'}
              </p>
            )}
          </div>

          <div className="px-5 pt-3 pb-[max(20px,env(safe-area-inset-bottom))] border-t border-white/[0.06] bg-[#0f0f12]">
            <button type="button" onClick={() => { h.tap(); setDirect(d => !d) }} className="w-full flex items-center justify-between mb-3 text-left">
              <span className="text-[13px] text-white/55">{direct ? 'Direct — research now, no n8n' : 'Via n8n — queues the deep workflow'}</span>
              <span className={`relative w-10 h-6 rounded-full transition-colors flex-shrink-0 ${direct ? 'bg-violet-500/80' : 'bg-white/15'}`}>
                <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${direct ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
              </span>
            </button>
            <button type="button" onClick={run} disabled={busy}
              className="w-full flex items-center justify-center gap-2 rounded-full bg-white text-black text-[16px] font-semibold py-4 active:scale-[0.98] transition-transform disabled:opacity-50 disabled:active:scale-100">
              <Wand2 size={18} /> {brief ? 'Re-research' : 'Research'}
            </button>
          </div>
        </div>
      )}
    </BottomSheet>
  )
}
