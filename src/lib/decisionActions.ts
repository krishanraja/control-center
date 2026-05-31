import type { SheetAction } from '../components/mobile/DetailSheet'
import { navigateDecision } from './routeDecision'
import type { DecisionRow } from '../hooks/useRealtimeDecisionsWaiting'

type Haptics = {
  tap: () => void
  heavy: () => void
  success: () => void
  error: () => void
  select: () => void
}

export interface DecisionActionCtx {
  /** (tab, params) navigator — used for the always-present "Open full detail". */
  navigate?: (tab: string, params?: Record<string, string>) => void
  /** Re-pull the source list after a mutation (realtime usually covers this). */
  refresh?: () => void
  /** Toast for success/error feedback. */
  toast: (msg: string, variant?: 'success' | 'error' | 'info') => void
  /** Haptics for tap/success/error. */
  haptics: Haptics
  /** Close the open sheet after a terminal action fires. */
  onDone?: () => void
}

type Kind = DecisionRow['kind']

/**
 * The one place that maps a `decisions_waiting` row to its kind-correct,
 * one-tap actions. Both the Home DecisionsInbox and the per-tab cards consume
 * this so "act in one tap" behaves identically everywhere. Every action reuses
 * an existing `/api/*` route (see api/leads, api/guests, api/content-ideas,
 * api/visibility-targets, api/triage, api/concepts) and confirms with a toast +
 * haptic. Optional actions are gated on the fields the row actually carries, so
 * a thin row just yields fewer buttons rather than a broken call.
 */
export function buildDecisionActions(
  kind: Kind,
  row: Record<string, any>,
  ctx: DecisionActionCtx,
): SheetAction[] {
  const { toast, haptics: h, navigate, refresh, onDone } = ctx
  const acts: SheetAction[] = []

  // Small helper: fire a request, surface result, refresh + close on success.
  const run = async (
    label: string,
    fn: () => Promise<Response>,
    okMsg: string,
    opts: { terminal?: boolean; openUrlFrom?: string } = {},
  ) => {
    h.heavy()
    try {
      const r = await fn()
      const body = await r.json().catch(() => ({} as any))
      if (!r.ok || body?.ok === false) throw new Error(body?.error || `HTTP ${r.status}`)
      h.success()
      toast(okMsg, 'success')
      if (opts.openUrlFrom && body?.[opts.openUrlFrom]) {
        try { window.open(body[opts.openUrlFrom], '_blank', 'noreferrer,noopener') } catch { /* popup blocked */ }
      }
      refresh?.()
      if (opts.terminal) onDone?.()
    } catch (e: any) {
      h.error()
      toast(`${label} failed: ${e?.message || 'try again'}`, 'error')
    }
  }

  const json = (url: string, payload: unknown, method: 'POST' | 'PATCH' = 'POST') =>
    fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

  switch (kind) {
    case 'lead': {
      if (row.email) {
        acts.push({
          label: 'Draft email',
          variant: 'primary',
          onClick: () => run('Draft email',
            () => json(`/api/leads/${row.id}/draft-email`, { intent: 'introduction' }),
            'Draft created in Gmail.', { openUrlFrom: 'draft_url' }),
        })
      }
      if (!row.promoted_task_id) {
        acts.push({
          label: 'Promote',
          variant: acts.length === 0 ? 'primary' : 'secondary',
          onClick: () => run('Promote',
            () => json('/api/leads/promote', { lead_id: row.id }),
            'Promoted to an active task.', { terminal: true }),
        })
      }
      if (!row.deep_enriched_at) {
        acts.push({
          label: 'Deep enrich',
          variant: 'secondary',
          onClick: () => run('Enrich',
            () => fetch(`/api/leads/${row.id}/enrich`, { method: 'POST' }),
            'Agatha is enriching — refresh in ~30s.'),
        })
      }
      pushClose(acts, row, run, json)
      acts.push({
        label: 'Drop',
        variant: 'danger',
        onClick: () => run('Drop',
          () => json(`/api/leads/${row.id}`, { status: 'superseded' }, 'PATCH'),
          'Lead dropped.', { terminal: true }),
      })
      break
    }

    case 'guest': {
      acts.push({
        label: 'Confirm',
        variant: 'primary',
        onClick: () => run('Confirm',
          () => json('/api/guests/confirm', { guest_id: row.id }),
          'Guest confirmed — cascade fired.', { terminal: true }),
      })
      pushClose(acts, row, run, json)
      acts.push({
        label: 'Skip',
        variant: 'danger',
        onClick: () => run('Skip',
          () => json(`/api/guests/${row.id}`, { status: 'dropped' }, 'PATCH'),
          'Guest skipped.', { terminal: true }),
      })
      break
    }

    case 'idea': {
      acts.push({
        label: 'Greenlight → drafting',
        variant: 'primary',
        onClick: () => run('Greenlight',
          () => json('/api/content-ideas', { id: row.id, state: 'drafting' }, 'PATCH'),
          'Promoted to drafting.', { terminal: true }),
      })
      acts.push({
        label: 'Send to research',
        variant: 'secondary',
        onClick: () => run('Research',
          () => json('/api/content-ideas', { id: row.id, state: 'researching' }, 'PATCH'),
          'Sent to Zara for research.', { terminal: true }),
      })
      acts.push({
        label: 'Kill',
        variant: 'danger',
        onClick: () => run('Kill',
          () => json('/api/content-ideas', { id: row.id, state: 'dropped' }, 'PATCH'),
          'Idea dropped.', { terminal: true }),
      })
      break
    }

    case 'visibility': {
      acts.push({
        label: 'Apply',
        variant: 'primary',
        onClick: () => run('Apply',
          () => fetch(`/api/visibility-targets/${row.id}/apply`, { method: 'POST' }),
          'Marked applied — follow-up task created for Nova.', { terminal: true }),
      })
      pushClose(acts, row, run, json)
      acts.push({
        label: 'Decline',
        variant: 'danger',
        onClick: () => run('Decline',
          () => json(`/api/visibility-targets/${row.id}`, { status: 'rejected' }, 'PATCH'),
          'Target declined.', { terminal: true }),
      })
      break
    }

    case 'task': {
      acts.push({
        label: 'Reject',
        variant: 'danger',
        onClick: () => run('Reject',
          () => json('/api/triage/reject', {
            source_table: 'tasks',
            source_id: row.id,
            agent: row.agent || row.owner || 'agatha',
            reason_code: 'task_other',
          }),
          'Rejected. Vera will learn from this.', { terminal: true }),
      })
      break
    }

    default:
      break
  }

  // Floor: always offer a way into the full, kind-correct detail surface.
  if (navigate) {
    acts.push({
      label: 'Open full detail',
      variant: 'secondary',
      onClick: () => { h.tap(); navigateDecision(navigate, kind, row.id); onDone?.() },
    })
  }

  return acts
}

/** Close-concept action, shared across kinds that carry a concept_id. */
function pushClose(
  acts: SheetAction[],
  row: Record<string, any>,
  run: (label: string, fn: () => Promise<Response>, okMsg: string, opts?: any) => Promise<void>,
  json: (url: string, payload: unknown, method?: 'POST' | 'PATCH') => Promise<Response>,
) {
  if (!row.concept_id) return
  acts.push({
    label: 'Close concept',
    variant: 'secondary',
    onClick: () => run('Close concept',
      () => json(`/api/concepts/${encodeURIComponent(row.concept_id)}/close`, {
        reason: 'Closed from Home decisions inbox',
        decided_by: 'krish',
      }),
      'Concept closed — cascade applied.', { terminal: true }),
  })
}
