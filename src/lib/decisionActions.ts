import type { SheetAction } from '../components/mobile/DetailSheet'
import { navigateDecision } from './routeDecision'
import { deferDateISO } from './taskQueue'
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
  /**
   * Collect a send-back note from the user (resolves null on cancel). When the
   * consumer supplies this, task rows gain the "Send back" verb; without it the
   * verb is omitted rather than broken.
   */
  promptNote?: (title: string) => Promise<string | null>
  /** Pick a defer horizon (resolves null on cancel). Gates the "Defer" verb. */
  promptDefer?: () => Promise<'tomorrow' | 'monday' | 'next_week' | null>
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
  const { toast, navigate, refresh, onDone, promptNote, promptDefer } = ctx
  const acts: SheetAction[] = []

  // Small helper: fire a request, surface result, refresh + close on success.
  // Haptics are intentionally NOT fired here — the button (Pressable) owns the
  // full tactile choreography (touch-down `press`, then `success`/`error` on
  // settle) by awaiting this promise. We resolve on success and REJECT on
  // failure so the button can draw the earned check vs. the error shake. The
  // toast (the textual confirmation) still lives here.
  const run = async (
    label: string,
    fn: () => Promise<Response>,
    okMsg: string,
    opts: { terminal?: boolean; openUrlFrom?: string } = {},
  ) => {
    try {
      const r = await fn()
      const body = await r.json().catch(() => ({} as any))
      if (!r.ok || body?.ok === false) throw new Error(body?.error || `HTTP ${r.status}`)
      toast(okMsg, 'success')
      if (opts.openUrlFrom && body?.[opts.openUrlFrom]) {
        try { window.open(body[opts.openUrlFrom], '_blank', 'noreferrer,noopener') } catch { /* popup blocked */ }
      }
      refresh?.()
      if (opts.terminal) onDone?.()
    } catch (e: any) {
      toast(`${label} failed: ${e?.message || 'try again'}`, 'error')
      throw e // let the button surface the error state + haptic
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
      // Un-enriched candidates get the Enrich/Skip pair (Apollo spend is a
      // per-lead decision); already-enriched leads get a quieter manual enrich.
      const isCandidate = !row.deep_enriched_at && (row.status === 'new' || row.status === 'enriching')
      if (isCandidate) {
        acts.push({
          label: 'Enrich (~$0.50)',
          variant: acts.length === 0 ? 'primary' : 'secondary',
          onClick: () => run('Enrich',
            () => fetch(`/api/leads/${row.id}/enrich`, { method: 'POST' }),
            'Agatha is enriching — refresh in ~30s.'),
        })
        acts.push({
          label: 'Skip',
          variant: 'secondary',
          onClick: () => run('Skip',
            () => json('/api/triage/reject', {
              source_table: 'leads',
              source_id: row.id,
              agent: row.assignee_agent || 'felix',
              reason_code: 'lead_other',
            }),
            'Skipped. Vera will learn from this.', { terminal: true }),
        })
      } else if (!row.deep_enriched_at) {
        acts.push({
          label: 'Deep enrich',
          variant: 'secondary',
          onClick: () => run('Enrich',
            () => fetch(`/api/leads/${row.id}/enrich`, { method: 'POST' }),
            'Agatha is enriching — refresh in ~30s.'),
        })
      }
      if (!row.promoted_task_id) {
        acts.push({
          label: 'Promote',
          variant: 'secondary',
          onClick: () => run('Promote',
            () => json('/api/leads/promote', { lead_id: row.id }),
            'Promoted to an active task.', { terminal: true }),
        })
      }
      if (row.status !== 'contacted' && row.status !== 'conversation') {
        acts.push({
          label: 'Mark contacted',
          variant: 'secondary',
          onClick: () => run('Mark contacted',
            () => json(`/api/leads/${row.id}`, { status: 'contacted' }, 'PATCH'),
            'Marked contacted.', { terminal: true }),
        })
      }
      if (row.linkedin_url) {
        acts.push({
          label: 'Open LinkedIn',
          variant: 'secondary',
          onClick: () => { try { window.open(row.linkedin_url, '_blank', 'noreferrer,noopener') } catch { /* blocked */ } },
        })
      }
      pushClose(acts, row, run, json)
      acts.push({
        label: 'Drop',
        variant: 'danger',
        onClick: () => run('Drop',
          () => json(`/api/leads/${row.id}`, { status: 'superseded' }, 'PATCH'),
          'Dropped.', { terminal: true }),
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
      // Develop, never relabel (CORE_PROBLEM F-1). Opening the Composer is the
      // only thing that moves a piece forward; state changes as a consequence
      // of a real draft existing, not via a bare PATCH.
      const openComposer = () => {
        try { window.location.hash = `#/content?idea=${row.id}` } catch { /* noop */ }
        navigateDecision(navigate, 'idea', row.id)
        onDone?.()
      }
      const bodyLen = ((row.body as string | null) || '').trim().length
      const chat = (row.meta as { cleo_chat?: unknown[] } | null)?.cleo_chat
      const ready = bodyLen >= 200 || (Array.isArray(chat) && chat.length > 0)

      if (row.state === 'review' && ready) {
        // P-22: a ready review card's most-likely next action is Approve.
        acts.push({
          label: 'Approve',
          variant: 'primary',
          onClick: () => run('Approve',
            () => json('/api/content-ideas', { id: row.id, state: 'approved' }, 'PATCH'),
            'Approved — ready to ship.', { terminal: true }),
        })
        acts.push({ label: 'Open & refine', variant: 'secondary', onClick: openComposer })
      } else {
        // Everything pre-review: the next action is to develop it.
        acts.push({ label: 'Open & develop', variant: 'primary', onClick: openComposer })
      }
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
      const taskAgent = row.agent || row.owner || 'agatha'
      acts.push({
        label: 'Approve',
        variant: 'primary',
        onClick: () => run('Approve',
          () => json('/api/tasks/update', {
            id: row.id,
            action: 'approve',
            agent: taskAgent,
          }),
          'Approved.', { terminal: true }),
      })
      // Today's ruling verbs, absorbed into the unified queue: Send back (with
      // a note the owning agent acts on) and Defer (off the plate until its
      // date). Both need a consumer-supplied prompt; without one the verb is
      // simply not offered.
      if (promptNote) {
        acts.push({
          label: 'Send back',
          variant: 'secondary',
          onClick: async () => {
            const notes = await promptNote(row.title || 'Send back with a note')
            if (notes == null) return
            await run('Send back',
              () => json('/api/tasks/update', { id: row.id, action: 'send_back', agent: taskAgent, notes }),
              `Sent back to ${taskAgent}.`, { terminal: true })
          },
        })
      }
      if (promptDefer) {
        acts.push({
          label: 'Defer',
          variant: 'secondary',
          onClick: async () => {
            const choice = await promptDefer()
            if (choice == null) return
            await run('Defer',
              () => json('/api/tasks/update', { id: row.id, action: 'defer', agent: taskAgent, due_date: deferDateISO(choice) }),
              'Deferred.', { terminal: true })
          },
        })
      }
      acts.push({
        label: 'Reject',
        variant: 'danger',
        onClick: () => run('Reject',
          () => json('/api/triage/reject', {
            source_table: 'tasks',
            source_id: row.id,
            agent: taskAgent,
            reason_code: 'task_other',
          }),
          'Rejected. Vera will learn from this.', { terminal: true }),
      })
      break
    }

    case 'correction': {
      // Vera's learning-loop approvals, previously actionable only on the Org
      // tab (PendingCorrectionsPanel). Same endpoints, same payload shape; the
      // Org panel stays as a second consumer.
      acts.push({
        label: 'Approve',
        variant: 'primary',
        onClick: () => run('Approve',
          () => json('/api/corrections/approve', { correction_id: row.id }),
          'Correction approved — brief updated within 15 minutes.', { terminal: true }),
      })
      acts.push({
        label: 'Reject',
        variant: 'danger',
        onClick: () => run('Reject',
          () => json('/api/corrections/reject', { correction_id: row.id }),
          'Correction rejected.', { terminal: true }),
      })
      break
    }

    case 'skill_proposal': {
      acts.push({
        label: 'Approve',
        variant: 'primary',
        onClick: () => run('Approve',
          () => json('/api/skill-proposals/approve', { skill_proposal_id: row.id }),
          'Skill approved and taught to the agent.', { terminal: true }),
      })
      acts.push({
        label: 'Reject',
        variant: 'danger',
        onClick: () => run('Reject',
          () => json('/api/skill-proposals/reject', { skill_proposal_id: row.id }),
          'Skill proposal dismissed.', { terminal: true }),
      })
      break
    }

    case 'content_decision': {
      // The Content Engine v2 weekly queue (spec R4): kind-correct one-tap
      // rulings, same endpoints the Content tab's own queue uses. `row` is the
      // content_decisions row: { id, kind, ref, week, payload }.
      const dKind = row.kind || row.decision_kind
      if (dKind === 'shift_proposal') {
        acts.push({
          label: 'Accept shift',
          variant: 'primary',
          onClick: () => run('Accept',
            () => json(`/api/shifts/${row.ref}`, { action: 'accept' }, 'PATCH'),
            'Shift accepted onto the register.', { terminal: true }),
        })
        acts.push({
          label: 'Dismiss',
          variant: 'danger',
          onClick: () => run('Dismiss',
            () => json(`/api/shifts/${row.ref}`, { action: 'dismiss' }, 'PATCH'),
            'Proposal dismissed.', { terminal: true }),
        })
      } else if (dKind === 'shift_fading') {
        acts.push({
          label: 'Retire with verdict',
          variant: 'primary',
          onClick: () => run('Retire',
            () => json(`/api/shifts/${row.ref}`, { action: 'retire' }, 'PATCH'),
            'Shift retired; dossier kept.', { terminal: true }),
        })
        acts.push({
          label: 'Keep watching',
          variant: 'secondary',
          onClick: () => run('Keep watching',
            () => json(`/api/shifts/${row.ref}`, { action: 'keep_watching' }, 'PATCH'),
            'Back on the watchlist.', { terminal: true }),
        })
      } else if (dKind === 'graduation') {
        acts.push({
          label: 'Graduate to Library',
          variant: 'primary',
          onClick: () => run('Graduate',
            () => json(`/api/content-decisions/${row.id}`, { action: 'done' }, 'PATCH'),
            'Kept forever, receipts attached.', { terminal: true }),
        })
        acts.push({
          label: 'Let it purge',
          variant: 'secondary',
          onClick: () => run('Let it purge',
            () => json(`/api/content-decisions/${row.id}`, { action: 'dismiss' }, 'PATCH'),
            'It expires Monday.', { terminal: true }),
        })
      } else if (dKind === 'brief_review') {
        acts.push({
          label: 'Open the brief',
          variant: 'primary',
          onClick: async () => {
            navigate?.('content', { brief: row.week })
            onDone?.()
          },
        })
      } else {
        acts.push({
          label: 'Acknowledged',
          variant: 'primary',
          onClick: () => run('Acknowledge',
            () => json(`/api/content-decisions/${row.id}`, { action: 'done' }, 'PATCH'),
            'Noted.', { terminal: true }),
        })
      }
      break
    }

    case 'inbox_returned': {
      // A capture that came back needing Krish. Open the routed target when
      // one exists; Archive resolves the inbox row itself (terminal).
      if (navigate && row.target_table && row.target_id) {
        const kindByTable: Record<string, string> = {
          tasks: 'task', leads: 'lead', guests: 'guest',
          visibility_targets: 'visibility', content_ideas: 'idea',
        }
        const targetKind = kindByTable[String(row.target_table)]
        if (targetKind) {
          acts.push({
            label: 'Open the item',
            variant: 'primary',
            onClick: () => { navigateDecision(navigate, targetKind, String(row.target_id)); onDone?.() },
          })
        }
      }
      acts.push({
        label: 'Archive',
        variant: acts.length ? 'secondary' : 'primary',
        onClick: () => run('Archive',
          () => json('/api/tasks-inbox/archive', { id: row.id, reason: 'krish_dismissed' }),
          'Archived.', { terminal: true }),
      })
      break
    }

    case 'vera_gap': {
      // Persistent gaps resolve by fixing their owned task; Vera auto-closes
      // the gap on the next sweep once the task moves.
      if (navigate && row.task_id) {
        acts.push({
          label: 'Open the owning task',
          variant: 'primary',
          onClick: () => { navigateDecision(navigate, 'task', String(row.task_id)); onDone?.() },
        })
      }
      break
    }

    case 'sequence_approval': {
      // One strategic ruling per proposed nurture / frame-promotion sequence.
      // Approve arms it for the scheduler; reject feeds Vera's learning loop.
      acts.push({
        label: 'Approve sequence',
        variant: 'primary',
        onClick: () => run('Approve',
          () => json('/api/acquisition/sequences', { id: row.id, action: 'approve' }),
          'Sequence approved — the scheduler can use it.', { terminal: true }),
      })
      acts.push({
        label: 'Reject',
        variant: 'danger',
        onClick: () => run('Reject',
          () => json('/api/acquisition/sequences', { id: row.id, action: 'reject' }),
          'Sequence rejected. Vera will learn from this.', { terminal: true }),
      })
      break
    }

    case 'send_sample': {
      // A queued nurture send (L1 every-send / L2 sampled). One-tap approve
      // fires the dispatcher; "Review batch" opens the Growth deck for bulk.
      acts.push({
        label: 'Approve & send',
        variant: 'primary',
        onClick: () => run('Approve',
          () => json('/api/acquisition/sends', { ids: [row.id], action: 'approve' }),
          'Approved — dispatching now.', { terminal: true }),
      })
      if (navigate) {
        acts.push({
          label: 'Review batch',
          variant: 'secondary',
          onClick: () => { navigate('acquisition', { lane: String((row.meta as any)?.lane || row.lane || '') }); onDone?.() },
        })
      }
      acts.push({
        label: 'Reject',
        variant: 'danger',
        onClick: () => run('Reject',
          () => json('/api/acquisition/sends', { ids: [row.id], action: 'reject', reason: 'krish_rejected_sample' }),
          'Rejected — the lane’s rejection rate will reflect this.', { terminal: true }),
      })
      break
    }

    case 'growth_stall': {
      // A stalled growth line with ~3 drafted moves attached. Adopting a move
      // creates a high-priority task for the owning agent (which re-enters
      // this queue as a task ruling); dismiss closes the episode.
      const moves = (Array.isArray(row.moves) ? row.moves : (row.meta as any)?.moves || []) as Array<{ title?: string }>
      moves.slice(0, 3).forEach((m, i) => {
        if (!m?.title) return
        acts.push({
          label: `Adopt: ${m.title}`,
          variant: i === 0 ? 'primary' : 'secondary',
          onClick: () => run('Adopt',
            () => json('/api/growth/stall-check', { action: 'adopt', id: row.id, move_index: i }),
            'Move adopted — task created.', { terminal: true }),
        })
      })
      if (moves.length === 0) {
        acts.push({
          label: 'Draft 3 moves',
          variant: 'primary',
          onClick: () => run('Draft',
            () => json('/api/growth/stall-check', { action: 'redraft', id: row.id }),
            'Moves drafted — reopen the card.'),
        })
      }
      acts.push({
        label: 'Dismiss stall',
        variant: 'danger',
        onClick: () => run('Dismiss',
          () => json('/api/growth/stall-check', { action: 'dismiss', id: row.id }),
          'Stall dismissed.', { terminal: true }),
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
      onClick: () => { navigateDecision(navigate, kind, row.id); onDone?.() },
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
