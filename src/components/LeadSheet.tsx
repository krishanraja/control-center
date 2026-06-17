import React, { useEffect, useMemo, useState } from 'react'
import { Flame, Sparkles, Mail, Loader2, Check, ExternalLink, Target } from 'lucide-react'
import { BottomSheet } from './mobile/BottomSheet'
import { useToast } from './shared/Toast'
import { useHaptics } from '../hooks/useHaptics'
import { humanAge } from '../lib/ageHelpers'
import { VENTURE_LABEL, topFit, dossierMove, contactRationale } from '../lib/contactSignals'
import type { ContactRow } from '../hooks/useRealtimeContacts'

const TIER_LABEL: Record<string, string> = {
  customer: 'Customer', warm: 'Warm', permissioned: 'Permissioned',
  cold_engaged: 'Cold · engaged', cold_scraped: 'Cold · scraped',
}

function Signal({ label, value, accent }: { label: string; value: React.ReactNode; accent?: string }) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-2">
      <p className="text-[11px] uppercase tracking-wider text-white/40">{label}</p>
      <p className={`text-[15px] font-semibold mt-0.5 ${accent || 'text-white'}`}>{value}</p>
    </div>
  )
}

/**
 * What opens when you tap a lead. Shows enough already-known signal to decide if
 * the lead is worth anything — heat, fit, tier, source, last touch, tags, and (if
 * it has been researched) the dossier gist — WITHOUT spending any tokens. From
 * here you take one of two one-click actions: Research (queue the Dossier Engine,
 * opt-in so credits aren't burned on leads you won't use) or Draft email.
 */
export function LeadSheet({
  contact,
  onClose,
  onDraft,
}: {
  contact: ContactRow | null
  onClose: () => void
  onDraft: (c: ContactRow) => void
}) {
  const { toast } = useToast()
  const h = useHaptics()
  const [queued, setQueued] = useState(false)
  const [busy, setBusy] = useState(false)
  const [venture, setVenture] = useState<string | null>(null)
  const [savingVenture, setSavingVenture] = useState(false)

  useEffect(() => {
    if (!contact) return
    setBusy(false)
    setQueued(contact.enrichment_status === 'queued' || contact.enrichment_status === 'enriching')
    setVenture(contact.primary_venture ?? null)
  }, [contact?.id])

  // Reassign which venture this contact belongs to — e.g. a recorded Signal &
  // Noise guest who's actually a better fit for another venture.
  const changeVenture = async (v: string | null) => {
    if (!contact || v === venture) return
    const prev = venture
    setVenture(v)
    setSavingVenture(true)
    h.select()
    try {
      const r = await fetch(`/api/contacts/${contact.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ primary_venture: v }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok || j?.ok === false) throw new Error(j?.error || `HTTP ${r.status}`)
      toast('Venture updated.', 'success')
    } catch (e: any) {
      setVenture(prev)
      toast(`Could not update venture: ${e?.message || 'try again'}`, 'error')
    } finally {
      setSavingVenture(false)
    }
  }

  const fit = useMemo(() => topFit(contact?.fit_scores), [contact?.fit_scores])
  const why = useMemo(() => (contact ? contactRationale(contact) : null), [contact?.id])
  const move = useMemo(() => dossierMove(contact?.dossier), [contact?.dossier])
  const enriched = !!contact?.dossier

  const research = async () => {
    if (!contact || busy || queued) return
    h.heavy()
    setBusy(true)
    try {
      const r = await fetch(`/api/contacts/${contact.id}/enrich`, { method: 'POST' })
      const payload = await r.json().catch(() => ({}))
      if (r.status === 409) { setQueued(true); toast('Already researched.', 'info'); return }
      if (!r.ok || payload?.ok === false) throw new Error(payload?.error || `HTTP ${r.status}`)
      h.success()
      setQueued(true)
      toast('Queued for research — the dossier lands shortly.', 'success')
    } catch (e: any) {
      h.error()
      toast(`Could not queue research: ${e?.message || 'try again'}`, 'error')
    } finally {
      setBusy(false)
    }
  }

  const name = contact ? (contact.full_name || contact.company || (contact.email ? contact.email.split('@')[0] : '—')) : ''
  const subtitle = contact ? [contact.title, contact.company].filter(Boolean).join(' @ ') : ''

  return (
    <BottomSheet open={!!contact} onClose={onClose} fullHeight={false} ariaLabel="Lead detail">
      {contact && (
        <div className="flex flex-col">
          <div className="px-5 pb-4 flex flex-col gap-4 overflow-y-auto scrollbar-hide" style={{ maxHeight: '70vh' }}>
            {/* Header */}
            <div>
              <p className="text-[19px] font-semibold text-white leading-tight">{name}</p>
              {subtitle && <p className="text-[14px] text-white/55 mt-0.5">{subtitle}</p>}
              <div className="flex flex-wrap items-center gap-2 mt-2">
                {/* Editable venture — reassign relationship to another venture */}
                <div className="relative inline-flex items-center">
                  <select
                    value={venture ?? ''}
                    onChange={(e) => changeVenture(e.target.value || null)}
                    disabled={savingVenture}
                    aria-label="Venture"
                    className="appearance-none px-2.5 py-1 pr-7 rounded-full text-[12px] bg-violet-500/15 text-violet-200 border border-violet-400/30 focus:outline-none focus:border-violet-400/60 disabled:opacity-50"
                  >
                    <option value="">Unassigned</option>
                    {Object.entries(VENTURE_LABEL).map(([slug, label]) => (
                      <option key={slug} value={slug}>{label}</option>
                    ))}
                  </select>
                  {savingVenture
                    ? <Loader2 size={11} className="absolute right-2 animate-spin text-violet-200/70 pointer-events-none" />
                    : <Target size={11} className="absolute right-2 text-violet-200/70 pointer-events-none" />}
                </div>
                {contact.consent_tier && (
                  <span className="px-2.5 py-1 rounded-full text-[12px] bg-white/[0.06] text-white/70">
                    {TIER_LABEL[contact.consent_tier] || contact.consent_tier}
                  </span>
                )}
                {contact.linkedin_url && (
                  <a
                    href={contact.linkedin_url}
                    target="_blank"
                    rel="noreferrer noopener"
                    onClick={(e) => e.stopPropagation()}
                    className="px-2.5 py-1 rounded-full text-[12px] bg-white/[0.06] text-sky-200 inline-flex items-center gap-1"
                  >
                    LinkedIn <ExternalLink size={11} />
                  </a>
                )}
              </div>
            </div>

            {/* Signal grid — everything you can judge on without spending a credit */}
            <div className="grid grid-cols-2 gap-2">
              <Signal
                label="Heat"
                accent="text-rose-300"
                value={<span className="inline-flex items-center gap-1"><Flame size={13} />{contact.heat_score ?? 0}</span>}
              />
              <Signal
                label={fit ? `Fit · ${VENTURE_LABEL[fit.venture] || fit.venture}` : 'Fit'}
                accent="text-amber-300"
                value={fit ? <span className="inline-flex items-center gap-1"><Target size={12} />{fit.score}</span> : '—'}
              />
              <Signal label="Relationship" value={contact.relationship_strength != null ? `${contact.relationship_strength}` : '—'} />
              <Signal label="Last touch" value={contact.last_touch_at ? humanAge(contact.last_touch_at) : 'never'} />
            </div>

            {(contact.origin_campaign || contact.origin_channel) && (
              <p className="text-[13px] text-white/45">
                Source: {[contact.origin_channel, contact.origin_campaign].filter(Boolean).join(' · ')}
              </p>
            )}

            {Array.isArray(contact.tags) && contact.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {contact.tags.slice(0, 8).map(t => (
                  <span key={t} className="px-2 py-0.5 rounded-md text-[11px] bg-white/[0.05] text-white/55">{t}</span>
                ))}
              </div>
            )}

            {/* Research state */}
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-3.5">
              <div className="flex items-center gap-2 mb-1.5">
                <Sparkles size={14} className="text-violet-300" />
                <span className="text-[13px] font-semibold text-white">
                  {enriched ? `Researched · ${humanAge(contact.deep_enriched_at || contact.updated_at)}` : 'Not researched yet'}
                </span>
              </div>
              {enriched ? (
                <div className="flex flex-col gap-2">
                  {why && <p className="text-[13.5px] text-white/70 leading-relaxed"><span className="text-white/45">{why.label}: </span>{why.text}</p>}
                  {move && <p className="text-[13px] text-violet-200/80 leading-relaxed"><span className="text-white/45">The move: </span>{move}</p>}
                  {!why && !move && <p className="text-[13px] text-white/45">Dossier on file.</p>}
                </div>
              ) : (
                <p className="text-[13px] text-white/50 leading-relaxed">
                  You have heat, fit and source above to judge this lead. Worth a closer look? Queue a dossier — a 5-pass research brief (public voice, prior history with you, the per-venture angle). Opt-in, so credits only go to leads you choose.
                </p>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="px-5 pt-3 pb-[max(20px,env(safe-area-inset-bottom))] border-t border-white/[0.06] bg-[#0f0f12] flex gap-2.5">
            {!enriched && (
              <button
                type="button"
                onClick={research}
                disabled={busy || queued}
                className="flex-1 flex items-center justify-center gap-2 rounded-full border border-white/15 text-white text-[15px] font-semibold py-3.5 active:scale-[0.98] transition-transform disabled:opacity-60"
              >
                {busy ? <><Loader2 size={17} className="animate-spin" /> Queuing…</>
                  : queued ? <><Check size={17} className="text-emerald-300" /> Queued</>
                  : <><Sparkles size={17} /> Research</>}
              </button>
            )}
            <button
              type="button"
              onClick={() => { h.select(); onDraft(contact) }}
              className="flex-1 flex items-center justify-center gap-2 rounded-full bg-white text-black text-[15px] font-semibold py-3.5 active:scale-[0.98] transition-transform"
            >
              <Mail size={17} /> Draft email
            </button>
          </div>
        </div>
      )}
    </BottomSheet>
  )
}
