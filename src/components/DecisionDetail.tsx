import React, { useEffect, useMemo, useState } from 'react'
import { ExternalLink, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useRealtimeDecisionsWaiting, type DecisionRow } from '../hooks/useRealtimeDecisionsWaiting'
import { VisibilityTargetDetail } from './VisibilityTargetDetail'
import { buildDecisionActions } from '../lib/decisionActions'
import { useHaptics } from '../hooks/useHaptics'
import { useToast } from './shared/Toast'

export type DecisionKind = DecisionRow['kind']

interface Props {
  /** Composite key as kind:id (the format the panel emits). */
  decision: string
  onClose?: () => void
  /** Render a one-tap actions footer (shared buildDecisionActions registry).
   *  Off by default so read-only usages are unchanged. `visibility` is always
   *  suppressed — VisibilityTargetDetail owns its own action bar. */
  actionsEnabled?: boolean
  /** Kind-aware navigator for the registry's "Open full detail" floor. */
  onNavigate?: (tab: string, params?: Record<string, string>) => void
}

interface ResolvedDecision {
  kind: DecisionKind
  id: string
  row: Record<string, any> | null
  loading: boolean
}

const KIND_TO_TABLE: Record<DecisionKind, string> = {
  task: 'tasks',
  guest: 'guests',
  idea: 'content_ideas',
  lead: 'leads',
  visibility: 'visibility_targets',
  correction: 'corrections',
  skill_proposal: 'skill_proposals',
}

function parseDecisionParam(raw: string): { kind: DecisionKind; id: string } | null {
  const idx = raw.indexOf(':')
  if (idx < 0) return null
  const kind = raw.slice(0, idx) as DecisionKind
  const id = raw.slice(idx + 1)
  if (!id) return null
  if (!(kind in KIND_TO_TABLE)) return null
  return { kind, id }
}

function useResolvedDecision(decision: string): ResolvedDecision {
  const parsed = useMemo(() => parseDecisionParam(decision), [decision])
  const { decisions } = useRealtimeDecisionsWaiting()
  const [row, setRow] = useState<Record<string, any> | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    if (!parsed) {
      setRow(null)
      setLoading(false)
      return () => {}
    }
    setLoading(true)
    const table = KIND_TO_TABLE[parsed.kind]
    supabase
      .from(table)
      .select('*')
      .eq('id', parsed.id)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return
        setRow((data as Record<string, any> | null) || null)
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [parsed?.kind, parsed?.id])

  if (!parsed) return { kind: 'task', id: '', row: null, loading: false }

  // Prefer the freshest data: the decisions cache when present, the row fetch otherwise.
  const fromCache = decisions.find(d => d.kind === parsed.kind && d.id === parsed.id)
  return {
    kind: parsed.kind,
    id: parsed.id,
    row: row || (fromCache ? toRowShape(fromCache) : null),
    loading,
  }
}

function toRowShape(d: DecisionRow): Record<string, any> {
  return {
    id: d.id,
    title: d.title,
    description: d.description,
    status: d.status,
    priority: d.priority,
    agent: d.agent,
    url: d.url,
    ...d.meta,
  }
}

export function DecisionDetail({ decision, onClose, actionsEnabled = false, onNavigate }: Props) {
  const resolved = useResolvedDecision(decision)
  const h = useHaptics()
  const { toast } = useToast()

  if (!decision || resolved.id === '') {
    return null
  }

  // visibility keeps its own action bar (VisibilityTargetDetail); every other
  // kind can render the shared one-tap registry footer when opted in.
  const showActions =
    actionsEnabled && !resolved.loading && !!resolved.row && resolved.kind !== 'visibility'
  const actions = showActions
    ? buildDecisionActions(resolved.kind, resolved.row as Record<string, any>, {
        navigate: onNavigate,
        toast,
        haptics: h,
        onDone: onClose,
      })
    : []

  return (
    <section className="h-full flex flex-col">
      <header className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
        <span className="text-[10px] uppercase tracking-[0.18em] text-violet-300/80">{resolved.kind}</span>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="text-white/40 hover:text-white/85"
            aria-label="Close"
          >
            <X size={14} />
          </button>
        )}
      </header>

      <div className="flex-1 overflow-y-auto">
        {resolved.loading && (
          <div className="p-6 text-[12px] text-white/45">Loading…</div>
        )}
        {!resolved.loading && !resolved.row && (
          <div className="p-6 text-[13px] text-white/55">
            Could not resolve {resolved.kind} {resolved.id}. It may have been archived.
          </div>
        )}
        {!resolved.loading && resolved.row && (
          <DecisionBody kind={resolved.kind} row={resolved.row} />
        )}
      </div>

      {actions.length > 0 && (
        <div className="border-t border-white/[0.06] p-4 space-y-2.5 flex-shrink-0">
          {actions.map((a, i) => (
            <button
              key={i}
              onClick={a.onClick}
              className={`w-full rounded-2xl py-3 text-[15px] font-semibold transition-colors ${
                a.variant === 'primary'
                  ? 'bg-violet-500 text-white active:bg-violet-400'
                  : a.variant === 'danger'
                  ? 'bg-red-500/15 text-red-300 active:bg-red-500/25'
                  : 'bg-white/[0.07] text-white active:bg-white/[0.12]'
              }`}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
    </section>
  )
}

function DecisionBody({ kind, row }: { kind: DecisionKind; row: Record<string, any> }) {
  if (kind === 'visibility') {
    return <VisibilityTargetDetail target={row as any} />
  }
  return <GenericDecisionBody kind={kind} row={row} />
}

function GenericDecisionBody({ kind, row }: { kind: DecisionKind; row: Record<string, any> }) {
  const title = row.title || row.skill_title || row.idea || row.name || row.company || `Untitled ${kind}`
  const description = row.description || row.skill_body || row.thesis || row.notes || row.body || null
  const externalUrl = row.url || row.source_url || row.draft_link || row.published_url || row.event_url || null

  return (
    <div className="p-5 space-y-4">
      <div>
        <h2 className="text-[18px] text-white font-semibold leading-tight">{title}</h2>
        {row.status && (
          <p className="text-[11px] uppercase tracking-[0.14em] text-white/45 mt-1.5">{row.status}</p>
        )}
      </div>

      {description && (
        <p className="text-[13px] text-white/80 leading-relaxed whitespace-pre-wrap">{description}</p>
      )}

      <dl className="grid grid-cols-2 gap-3 text-[12px]">
        {row.agent && <Field label="Agent" value={row.agent} />}
        {row.assigned_to && <Field label="Owner" value={row.assigned_to} />}
        {row.priority && <Field label="Priority" value={row.priority} />}
        {row.due_at && <Field label="Due" value={new Date(row.due_at).toLocaleDateString()} />}
        {row.next_step && <Field label="Next step" value={row.next_step} wide />}
      </dl>

      {externalUrl && (
        <a
          href={externalUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex items-center gap-1.5 text-[12px] text-violet-300 hover:text-violet-200"
        >
          Open external <ExternalLink size={11} />
        </a>
      )}
    </div>
  )
}

function Field({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={wide ? 'col-span-2' : ''}>
      <dt className="text-[10px] uppercase tracking-wider text-white/35">{label}</dt>
      <dd className="text-white/85 mt-0.5">{value}</dd>
    </div>
  )
}
