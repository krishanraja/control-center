import React, { useEffect, useRef, useState } from 'react'
import { ExternalLink, Clock, MapPin, Sparkles, AlertTriangle, Copy, CheckCircle2 } from 'lucide-react'
import { formatDistanceToNow, parseISO } from 'date-fns'
import { supabase } from '../lib/supabase'

/**
 * Visibility deep-enrich webhook. Pulled from env so we can swap N8N envs
 * without redeploying. Falls back to the production cloud webhook URL when
 * unset so dev environments still light up Nova.
 */
const VISIBILITY_DEEP_ENRICH_URL =
  (import.meta.env.VITE_N8N_VISIBILITY_DEEP_ENRICH_URL as string | undefined)
  || 'https://krishraja10101.app.n8n.cloud/webhook/visibility-deep-enrich'

/** A target is "stale" if it was never enriched, or last enriched > 14d ago. */
const STALE_AFTER_MS = 14 * 24 * 60 * 60 * 1000

function isTargetStale(t: { deep_enriched_at: string | null; strategic_value: string | null }): boolean {
  if (!t.strategic_value) return true
  if (!t.deep_enriched_at) return true
  const ts = Date.parse(t.deep_enriched_at)
  if (Number.isNaN(ts)) return true
  return Date.now() - ts > STALE_AFTER_MS
}

export interface VisibilityTargetDeep {
  id: string
  title: string
  type: string | null
  status: string | null
  event_url: string | null
  cfp_url: string | null
  deadline_at: string | null
  event_start_at: string | null
  audience: string | null
  audience_size: number | null
  why_relevant: string | null
  suggested_talk_title: string | null
  relevance_score: number | null
  quality_score: string | null
  recommended_next_step: string | null
  format: string | null
  location: string | null
  ticket_price_usd: number | null
  // Deep enrichment fields (may be null on legacy or unenriched rows).
  organizer: string | null
  organizer_reputation: string | null
  audience_sector: string | null
  audience_seniority: string | null
  past_speakers: Array<{ name: string; role?: string; talk_title?: string }> | null
  cfp_requirements: {
    needs_bio?: boolean
    needs_headshot?: boolean
    needs_video?: boolean
    abstract_max_words?: number | null
    talk_length_min?: number | null
    additional_notes?: string
  } | null
  proposed_talk: {
    title: string
    abstract: string
    format: string
    length_min: number
  } | null
  strategic_value: string | null
  angle: string | null
  effort_estimate: {
    prep_hours?: number
    travel_days?: number
    cost_usd_low?: number
    cost_usd_high?: number
  } | null
  risk_notes: string | null
  next_actions: string[] | null
  deep_enriched_at: string | null
  enrichment_version?: number | null
}

interface Props {
  target: VisibilityTargetDeep
}

export function VisibilityTargetDetail({ target }: Props) {
  const [enriching, setEnriching] = useState(false)
  const [autoFired, setAutoFired] = useState(false)
  const [actionsChecked, setActionsChecked] = useState<Set<number>>(() => {
    const initial = new Set<number>()
    ;(target.next_actions || []).forEach((a, i) => {
      if (typeof a === 'string' && a.startsWith('[x] ')) initial.add(i)
    })
    return initial
  })
  const [copied, setCopied] = useState(false)

  const isEnriched = !!target.deep_enriched_at && !!target.strategic_value
  const stale = isTargetStale(target)
  const deadlineMeta = useDeadlineMeta(target.deadline_at)

  const fireDeepEnrich = async () => {
    if (enriching) return
    setEnriching(true)
    try {
      await fetch(VISIBILITY_DEEP_ENRICH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_id: target.id }),
      })
    } catch (e) {
      console.warn('[VisibilityTargetDetail] deep enrich fire failed', e)
    } finally {
      // Realtime will refresh `deep_enriched_at`, but keep the pill visible
      // long enough for the user to clock that something happened.
      setTimeout(() => setEnriching(false), 4000)
    }
  }

  // Auto-fire enrichment on detail open if the target is stale. Once per
  // mount per target id — never spam the webhook on re-renders.
  const firedForRef = useRef<string | null>(null)
  useEffect(() => {
    if (firedForRef.current === target.id) return
    if (!stale) return
    firedForRef.current = target.id
    setAutoFired(true)
    fireDeepEnrich()
  }, [target.id, stale])

  const copyAbstract = async () => {
    if (!target.proposed_talk?.abstract) return
    await navigator.clipboard.writeText(target.proposed_talk.abstract)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const toggleAction = async (idx: number) => {
    const next = new Set(actionsChecked)
    if (next.has(idx)) next.delete(idx)
    else next.add(idx)
    setActionsChecked(next)
    const updated = (target.next_actions || []).map((a, i) => {
      const stripped = typeof a === 'string' && a.startsWith('[x] ') ? a.slice(4) : a
      return next.has(i) ? `[x] ${stripped}` : stripped
    })
    await supabase.from('visibility_targets').update({ next_actions: updated }).eq('id', target.id)
  }

  const approveStartPrep = async () => {
    const first = (target.next_actions || [])[0]
    if (first) {
      await supabase.from('tasks').insert({
        title: typeof first === 'string' ? first.replace(/^\[x\] /, '') : 'Prep for ' + target.title,
        owner: 'krish',
        agent: 'nova',
        status: 'waiting',
        priority: 'high',
        workstream: 'visibility',
        next_step: `Prep for ${target.title}`,
      })
    }
    await supabase.from('visibility_targets').update({ status: 'applied' }).eq('id', target.id)
  }

  const reject = async () => {
    await supabase.from('visibility_targets').update({ status: 'dropped' }).eq('id', target.id)
  }

  const tomorrow09 = () => {
    const d = new Date()
    d.setDate(d.getDate() + 1)
    d.setHours(9, 0, 0, 0)
    return d.toISOString()
  }
  const snoozeTomorrow = async () => {
    await supabase
      .from('visibility_targets')
      .update({ status: 'queued', updated_at: tomorrow09() })
      .eq('id', target.id)
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto">
        <HeaderStrip
          target={target}
          deadlineMeta={deadlineMeta}
          enriching={enriching}
          autoFired={autoFired && stale}
        />

        <div className="px-5 pb-5 space-y-5">
          <StrategicValueBlock target={target} onEnrich={fireDeepEnrich} enriching={enriching} />

          {isEnriched && target.angle && (
            <AngleBlock angle={target.angle} />
          )}

          {isEnriched && target.proposed_talk && (
            <ProposedTalkCard talk={target.proposed_talk} onCopy={copyAbstract} copied={copied} />
          )}

          {isEnriched && (
            <AudienceSnapshot target={target} />
          )}

          {isEnriched && target.past_speakers && target.past_speakers.length > 0 && (
            <PastSpeakers speakers={target.past_speakers} />
          )}

          {isEnriched && target.cfp_requirements && (
            <CfpChecklist req={target.cfp_requirements} />
          )}

          {isEnriched && target.effort_estimate && (
            <EffortStrip effort={target.effort_estimate} />
          )}

          {isEnriched && target.risk_notes && target.risk_notes !== 'No significant risk identified.' && (
            <RiskBlock notes={target.risk_notes} />
          )}

          {isEnriched && target.next_actions && target.next_actions.length > 0 && (
            <NextActions
              actions={target.next_actions}
              checked={actionsChecked}
              onToggle={toggleAction}
            />
          )}
        </div>
      </div>

      <ActionFooter
        target={target}
        isEnriched={isEnriched}
        enriching={enriching}
        onApprove={approveStartPrep}
        onReEnrich={fireDeepEnrich}
        onReject={reject}
        onSnooze={snoozeTomorrow}
      />
    </div>
  )
}

function HeaderStrip({
  target,
  deadlineMeta,
  enriching,
  autoFired,
}: {
  target: VisibilityTargetDeep
  deadlineMeta: DeadlineMeta
  enriching: boolean
  autoFired: boolean
}) {
  return (
    <header className="px-5 pt-5 pb-4 border-b border-white/[0.06] space-y-3">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-[20px] text-white font-semibold leading-tight">{target.title}</h2>
        <div className="flex flex-col items-end gap-1 flex-shrink-0 mt-1">
          {enriching && (
            <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border border-violet-400/40 bg-violet-500/10 text-violet-200 inline-flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-violet-300 animate-pulse" />
              {autoFired ? 'Auto enriching' : 'Enriching now'}
            </span>
          )}
          {target.deep_enriched_at && !enriching && (
            <span className="text-[10px] text-emerald-300/80 uppercase tracking-wider">
              Deep enriched {formatDistanceToNow(parseISO(target.deep_enriched_at), { addSuffix: true })}
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 flex-wrap text-[11px]">
        {target.type && <Chip>{target.type}</Chip>}
        {target.format && <Chip>{target.format}</Chip>}
        {target.location && <Chip><MapPin size={10} className="mr-1" />{target.location}</Chip>}
        {deadlineMeta && (
          <span className={`px-2 py-0.5 rounded-full border text-[11px] ${deadlineMeta.tone}`}>
            <Clock size={10} className="inline-block mr-1" />
            {deadlineMeta.label}
          </span>
        )}
      </div>
    </header>
  )
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="px-2 py-0.5 rounded-full bg-white/[0.04] border border-white/[0.06] text-white/75">
      {children}
    </span>
  )
}

function StrategicValueBlock({
  target,
  onEnrich,
  enriching,
}: {
  target: VisibilityTargetDeep
  onEnrich: () => void
  enriching: boolean
}) {
  if (target.strategic_value) {
    return (
      <section className="rounded-xl border border-violet-500/30 bg-violet-500/[0.05] p-4 border-l-[3px] border-l-violet-400">
        <h3 className="text-[10px] uppercase tracking-[0.16em] text-violet-300/80 mb-2 flex items-center gap-1">
          <Sparkles size={11} /> Strategic value
        </h3>
        <p className="text-[15px] text-white/90 leading-relaxed">{target.strategic_value}</p>
      </section>
    )
  }
  return (
    <section className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-5 text-center">
      <p className="text-[13px] text-white/65 mb-3">
        Not yet deep-enriched. Run Nova to get strategic value, angle, proposed talk, audience snapshot, and a real prep checklist.
      </p>
      <button
        type="button"
        onClick={onEnrich}
        disabled={enriching}
        className="px-4 py-2 rounded-lg bg-violet-500/20 border border-violet-400/40 text-violet-100 text-[12px] font-medium hover:bg-violet-500/30 disabled:opacity-50"
      >
        {enriching ? 'Enriching…' : 'Deep enrich now'}
      </button>
      {target.why_relevant && (
        <p className="text-[11px] text-white/50 mt-3 italic">Legacy note: {target.why_relevant}</p>
      )}
    </section>
  )
}

function AngleBlock({ angle }: { angle: string }) {
  return (
    <section className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-4">
      <h3 className="text-[10px] uppercase tracking-[0.14em] text-white/55 mb-2">Angle</h3>
      <p className="text-[13px] text-white/80 italic leading-relaxed">{angle}</p>
    </section>
  )
}

function ProposedTalkCard({
  talk,
  onCopy,
  copied,
}: {
  talk: NonNullable<VisibilityTargetDeep['proposed_talk']>
  onCopy: () => void
  copied: boolean
}) {
  return (
    <section className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
      <header className="flex items-baseline justify-between gap-3 mb-2">
        <h3 className="text-[10px] uppercase tracking-[0.14em] text-emerald-300/80">Proposed talk</h3>
        <button
          type="button"
          onClick={onCopy}
          className="text-[11px] text-white/50 hover:text-white/85 flex items-center gap-1"
        >
          {copied ? <><CheckCircle2 size={11} className="text-emerald-300" /> Copied</> : <><Copy size={11} /> Copy abstract</>}
        </button>
      </header>
      <p className="text-[15px] text-white font-medium leading-snug mb-2">{talk.title}</p>
      <p className="text-[13px] text-white/80 leading-relaxed whitespace-pre-wrap">{talk.abstract}</p>
      <div className="flex items-center gap-2 mt-3 text-[10px]">
        <Chip>{talk.format}</Chip>
        <Chip>{talk.length_min} min</Chip>
      </div>
    </section>
  )
}

function AudienceSnapshot({ target }: { target: VisibilityTargetDeep }) {
  return (
    <section className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-4">
      <h3 className="text-[10px] uppercase tracking-[0.14em] text-white/55 mb-2">Audience</h3>
      <div className="grid grid-cols-3 gap-3 text-[12px]">
        <Stat label="Size" value={target.audience_size ? `${target.audience_size.toLocaleString()}+` : '-'} />
        <Stat label="Sector" value={target.audience_sector || '-'} />
        <Stat label="Seniority" value={target.audience_seniority || '-'} />
      </div>
      {target.audience && (
        <p className="text-[12px] text-white/65 mt-3 leading-relaxed">{target.audience}</p>
      )}
    </section>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-white/35">{label}</p>
      <p className="text-white/85 mt-0.5">{value}</p>
    </div>
  )
}

function PastSpeakers({ speakers }: { speakers: NonNullable<VisibilityTargetDeep['past_speakers']> }) {
  const defaultOpen = speakers.length <= 3
  return (
    <details className="rounded-xl border border-white/[0.06] bg-white/[0.015]" open={defaultOpen}>
      <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden px-4 py-3 flex items-baseline justify-between hover:bg-white/[0.02] transition-colors">
        <h3 className="text-[10px] uppercase tracking-[0.14em] text-white/55">Past speakers</h3>
        <span className="text-[11px] text-white/45">{speakers.length}</span>
      </summary>
      <ul className="px-4 pb-3 space-y-2">
        {speakers.map((s, i) => (
          <li key={`${s.name}-${i}`} className="text-[12px] text-white/75 leading-snug">
            <a
              href={`https://www.google.com/search?q=${encodeURIComponent(s.name + ' ' + (s.role || ''))}`}
              target="_blank"
              rel="noreferrer noopener"
              className="text-white/90 hover:text-violet-300 font-medium"
            >
              {s.name}
            </a>
            {s.role && <span className="text-white/55">, {s.role}</span>}
            {s.talk_title && <p className="text-[11px] text-white/45 italic ml-0.5">{s.talk_title}</p>}
          </li>
        ))}
      </ul>
    </details>
  )
}

function CfpChecklist({ req }: { req: NonNullable<VisibilityTargetDeep['cfp_requirements']> }) {
  const items: { label: string; on: boolean }[] = [
    { label: 'Bio', on: !!req.needs_bio },
    { label: 'Headshot', on: !!req.needs_headshot },
    { label: 'Video', on: !!req.needs_video },
  ]
  return (
    <section className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-4">
      <h3 className="text-[10px] uppercase tracking-[0.14em] text-white/55 mb-2">CFP requirements</h3>
      <ul className="grid grid-cols-2 gap-2 text-[12px]">
        {items.map(it => (
          <li key={it.label} className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${it.on ? 'bg-amber-300' : 'bg-white/15'}`} />
            <span className={it.on ? 'text-white/85' : 'text-white/40'}>{it.label}{it.on ? ' required' : ' not required'}</span>
          </li>
        ))}
        {req.abstract_max_words != null && (
          <li className="text-white/75 col-span-2">Abstract max {req.abstract_max_words} words</li>
        )}
        {req.talk_length_min != null && (
          <li className="text-white/75 col-span-2">Talk length {req.talk_length_min} min</li>
        )}
      </ul>
      {req.additional_notes && (
        <p className="text-[11px] text-white/55 mt-2 italic">{req.additional_notes}</p>
      )}
    </section>
  )
}

function EffortStrip({ effort }: { effort: NonNullable<VisibilityTargetDeep['effort_estimate']> }) {
  return (
    <section className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-4">
      <h3 className="text-[10px] uppercase tracking-[0.14em] text-white/55 mb-2">Effort estimate</h3>
      <div className="grid grid-cols-3 gap-3 text-[12px]">
        <Stat label="Prep" value={effort.prep_hours != null ? `${effort.prep_hours}h` : '-'} />
        <Stat label="Travel" value={effort.travel_days != null ? (effort.travel_days === 0 ? 'online' : `${effort.travel_days}d`) : '-'} />
        <Stat
          label="Cost"
          value={
            effort.cost_usd_low != null
              ? `$${effort.cost_usd_low} to ${effort.cost_usd_high ?? effort.cost_usd_low}`
              : '-'
          }
        />
      </div>
    </section>
  )
}

function RiskBlock({ notes }: { notes: string }) {
  return (
    <section className="rounded-xl border border-amber-500/25 bg-amber-500/[0.05] p-4 flex items-start gap-2">
      <AlertTriangle size={14} className="text-amber-300 flex-shrink-0 mt-0.5" />
      <div>
        <h3 className="text-[10px] uppercase tracking-[0.14em] text-amber-200 mb-1">Risk</h3>
        <p className="text-[12px] text-white/80 leading-relaxed">{notes}</p>
      </div>
    </section>
  )
}

function NextActions({
  actions,
  checked,
  onToggle,
}: {
  actions: string[]
  checked: Set<number>
  onToggle: (i: number) => void
}) {
  return (
    <section className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-4">
      <h3 className="text-[10px] uppercase tracking-[0.14em] text-white/55 mb-2">Next actions</h3>
      <ol className="space-y-1.5 text-[12px]">
        {actions.map((a, i) => {
          const stripped = typeof a === 'string' ? a.replace(/^\[x\] /, '') : ''
          const isChecked = checked.has(i)
          return (
            <li key={i} className="flex items-start gap-2">
              <button
                type="button"
                onClick={() => onToggle(i)}
                className={`mt-1 w-3.5 h-3.5 rounded border flex-shrink-0 flex items-center justify-center ${isChecked ? 'bg-emerald-400/80 border-emerald-300' : 'border-white/25 hover:border-white/55'}`}
                aria-pressed={isChecked}
              >
                {isChecked && <CheckCircle2 size={10} className="text-white" />}
              </button>
              <span className={`leading-snug ${isChecked ? 'line-through text-white/45' : 'text-white/85'}`}>
                {stripped}
              </span>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

function ActionFooter({
  target,
  isEnriched,
  enriching,
  onApprove,
  onReEnrich,
  onReject,
  onSnooze,
}: {
  target: VisibilityTargetDeep
  isEnriched: boolean
  enriching: boolean
  onApprove: () => void
  onReEnrich: () => void
  onReject: () => void
  onSnooze: () => void
}) {
  return (
    <footer className="sticky bottom-0 px-5 py-3 border-t border-white/[0.06] bg-base/95 backdrop-blur flex items-center gap-2 flex-wrap">
      {isEnriched && (
        <button
          type="button"
          onClick={onApprove}
          className="px-3 py-1.5 rounded-lg bg-emerald-500/15 border border-emerald-400/40 text-emerald-100 text-[12px] font-medium hover:bg-emerald-500/25"
        >
          Approve, start prep
        </button>
      )}
      <button
        type="button"
        onClick={onReEnrich}
        disabled={enriching}
        className="px-3 py-1.5 rounded-lg border border-white/15 text-white/75 text-[12px] hover:border-white/35 hover:text-white disabled:opacity-50"
      >
        {enriching ? 'Enriching…' : isEnriched ? 'Re-enrich' : 'Deep enrich'}
      </button>
      <button
        type="button"
        onClick={onSnooze}
        className="px-3 py-1.5 rounded-lg border border-white/15 text-white/55 text-[12px] hover:text-white/85"
      >
        Tomorrow
      </button>
      <button
        type="button"
        onClick={onReject}
        className="ml-auto px-3 py-1.5 rounded-lg border border-rose-400/30 text-rose-300/85 text-[12px] hover:bg-rose-500/10"
      >
        Reject
      </button>
      {(target.cfp_url || target.event_url) && (
        <a
          href={target.cfp_url || target.event_url || '#'}
          target="_blank"
          rel="noreferrer noopener"
          className="px-3 py-1.5 rounded-lg border border-white/15 text-white/75 text-[12px] hover:border-white/35 hover:text-white inline-flex items-center gap-1"
        >
          Open <ExternalLink size={11} />
        </a>
      )}
    </footer>
  )
}

interface DeadlineMeta {
  label: string
  tone: string
}

function useDeadlineMeta(iso: string | null): DeadlineMeta | null {
  if (!iso) return null
  const date = parseISO(iso)
  const days = Math.floor((date.getTime() - Date.now()) / 86_400_000)
  if (days < 0) return { label: `Passed ${formatDistanceToNow(date, { addSuffix: true })}`, tone: 'border-white/15 text-white/45 bg-white/[0.02]' }
  if (days < 7) return { label: `Due ${formatDistanceToNow(date, { addSuffix: true })}`, tone: 'border-rose-400/40 text-rose-200 bg-rose-500/[0.08]' }
  if (days < 30) return { label: `Due ${formatDistanceToNow(date, { addSuffix: true })}`, tone: 'border-amber-400/40 text-amber-200 bg-amber-500/[0.06]' }
  return { label: `Due ${formatDistanceToNow(date, { addSuffix: true })}`, tone: 'border-emerald-400/30 text-emerald-200 bg-emerald-500/[0.04]' }
}
