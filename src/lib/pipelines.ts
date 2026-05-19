/**
 * Pure pipeline classification. Given a TaskRow (or a NellCandidate), return
 * which pipeline / stage it belongs to. No DB views, no realtime channels —
 * lanes compute these client-side from the shared `tasks-rt-shared` cache
 * (ADR-002).
 *
 * The mapping is intentionally permissive because the schema is mid-evolution:
 * tasks live under both `workstream` and `group_label`, with significant null
 * coverage. We accept either signal and fall back gracefully.
 */

import type { TaskRow } from '../hooks/useRealtimeTasks'

export type PipelineKey = 'content' | 'leads' | 'visibility'

export const PIPELINE_ORDER: PipelineKey[] = ['content', 'leads', 'visibility']

export const PIPELINE_LABEL: Record<PipelineKey, string> = {
  content:    'Content',
  leads:      'Leads',
  visibility: 'Visibility',
}

/** Pipeline accent token — matches the project's existing colour vocabulary. */
export const PIPELINE_ACCENT: Record<PipelineKey, { text: string; bg: string; border: string; dot: string }> = {
  content:    { text: 'text-rose-300',    bg: 'bg-rose-500/[0.04]',    border: 'border-rose-500/20',    dot: 'bg-rose-400' },
  leads:      { text: 'text-emerald-300', bg: 'bg-emerald-500/[0.04]', border: 'border-emerald-500/20', dot: 'bg-emerald-400' },
  visibility: { text: 'text-violet-300',  bg: 'bg-violet-500/[0.04]',  border: 'border-violet-500/20',  dot: 'bg-violet-400' },
}

// ─── Stage definitions ──────────────────────────────────────────────────────

export interface Stage {
  key: string
  label: string
}

export const CONTENT_STAGES: Stage[] = [
  { key: 'drafting',    label: 'Drafting' },
  { key: 'review',      label: 'Awaiting review' },
  { key: 'approved',    label: 'Approved' },
  { key: 'published',   label: 'Published this week' },
]

export const LEADS_STAGES: Stage[] = [
  { key: 'drafted',      label: 'Drafted' },
  { key: 'contacted',    label: 'Contacted' },
  { key: 'conversation', label: 'In conversation' },
  { key: 'closed',       label: 'Closed' },
]

export const VISIBILITY_STAGES: Stage[] = [
  { key: 'pitch_drafted', label: 'Pitch drafted' },
  { key: 'outreach_sent', label: 'Outreach sent' },
  { key: 'booked',        label: 'Booked / speaking' },
]

// ─── Pipeline membership ────────────────────────────────────────────────────

const LEADS_WORKSTREAMS = new Set(['advisory_sales', 'AdFixus Pipeline'])
const LEADS_GROUPS      = new Set(['Enterprise Pipeline', 'Outreach Campaigns', 'Growth'])

const VISIBILITY_WORKSTREAMS = new Set(['podcast_booking'])
const VISIBILITY_GROUPS      = new Set(['Visibility'])

export function pipelineForTask(t: TaskRow): PipelineKey | null {
  if (t.workstream === 'content') return 'content'
  if (LEADS_WORKSTREAMS.has(t.workstream || '') || LEADS_GROUPS.has(t.group_label || '')) return 'leads'
  if (VISIBILITY_WORKSTREAMS.has(t.workstream || '') || VISIBILITY_GROUPS.has(t.group_label || '')) return 'visibility'
  return null
}

// ─── Stage classification ───────────────────────────────────────────────────

function startOfWeekMs(): number {
  const d = new Date()
  const day = d.getDay()           // 0=Sun..6=Sat
  const back = (day + 6) % 7       // days since Monday
  d.setDate(d.getDate() - back)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

export function classifyContentStage(t: TaskRow): string | null {
  if (t.status === 'done') {
    const c = t.completed_at ? new Date(t.completed_at).getTime() : 0
    return c >= startOfWeekMs() ? 'published' : null
  }
  if (t.status === 'waiting') return 'review'
  if (t.krish_reviewed && (t.status === 'active' || t.status === 'in_progress')) return 'approved'
  if (t.status === 'active' || t.status === 'in_progress') return 'drafting'
  return null
}

export function classifyLeadStage(t: TaskRow): string | null {
  if (t.status === 'done') return 'closed'
  if (t.status === 'in_progress') return 'conversation'
  if (t.contact_email && (t.status === 'active' || t.status === 'waiting')) return 'contacted'
  if (t.draft_subject || t.draft_hook) return 'drafted'
  // Tasks with no draft/contact yet — bucket as drafted (earliest stage) so
  // they're visible rather than dropped.
  return 'drafted'
}

export function classifyVisibilityStage(t: TaskRow): string | null {
  if (t.status === 'done') {
    const c = t.completed_at ? new Date(t.completed_at).getTime() : 0
    const monthAgo = Date.now() - 30 * 86_400_000
    return c >= monthAgo ? 'booked' : null
  }
  if (t.status === 'waiting') return 'pitch_drafted'
  if (t.status === 'active' || t.status === 'in_progress') return 'outreach_sent'
  return null
}

// ─── Rollup ─────────────────────────────────────────────────────────────────

export interface PipelineRollup {
  key: PipelineKey
  total: number
  byStage: Record<string, TaskRow[]>
}

export function rollupTasks(tasks: TaskRow[]): Record<PipelineKey, PipelineRollup> {
  const out: Record<PipelineKey, PipelineRollup> = {
    content:    { key: 'content',    total: 0, byStage: {} },
    leads:      { key: 'leads',      total: 0, byStage: {} },
    visibility: { key: 'visibility', total: 0, byStage: {} },
  }

  for (const t of tasks) {
    const pipe = pipelineForTask(t)
    if (!pipe) continue
    const stage =
      pipe === 'content'    ? classifyContentStage(t) :
      pipe === 'leads'      ? classifyLeadStage(t) :
      classifyVisibilityStage(t)
    if (!stage) continue
    if (!out[pipe].byStage[stage]) out[pipe].byStage[stage] = []
    out[pipe].byStage[stage].push(t)
    out[pipe].total += 1
  }

  return out
}

/** Stages owned by each pipeline (drives the rollup chip row in the lane). */
export const PIPELINE_STAGES: Record<PipelineKey, Stage[]> = {
  content:    CONTENT_STAGES,
  leads:      LEADS_STAGES,
  visibility: VISIBILITY_STAGES,
}

// ─── Featured-card selection (Content lane's "one-click Approve" target) ────

/**
 * Pick the single most-urgent task for the Content lane's featured slot.
 * Strategy: from "Awaiting review" stage, oldest-updated wins (longest in the
 * queue floats to the top). Falls back to oldest "Drafting" if review is empty.
 */
export function pickFeaturedContent(roll: PipelineRollup): TaskRow | null {
  const review = roll.byStage.review || []
  const drafting = roll.byStage.drafting || []
  const pool = review.length > 0 ? review : drafting
  if (pool.length === 0) return null
  return [...pool].sort((a, b) => {
    const au = a.updated_at ? new Date(a.updated_at).getTime() : 0
    const bu = b.updated_at ? new Date(b.updated_at).getTime() : 0
    return au - bu
  })[0]
}

/**
 * Compose the inline draft preview text. Combines whichever of the populated
 * draft-bearing fields exist, in priority order. Caller truncates.
 */
export function draftPreview(t: TaskRow): string {
  const parts: string[] = []
  if (t.draft_subject) parts.push(String(t.draft_subject))
  if (t.draft_hook)    parts.push(String(t.draft_hook))
  if (t.evidence)      parts.push(String(t.evidence))
  if (t.description)   parts.push(String(t.description))
  if (t.krish_notes)   parts.push(String(t.krish_notes))
  return parts.join(' · ').trim()
}
