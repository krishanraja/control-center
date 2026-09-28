// The Studio's Windows runners, as the content engine's health route reports
// them. Since 2026-09-28 there are two machines, a primary and a cold standby,
// and only the runner with the active role is leased work (content-engine,
// supabase/migrations/20260928120000_video_studio_runner_roles.sql). Ruling
// (Krish, 2026-09-28): a second Windows machine is a cold standby with its
// task disabled.
//
// Pure: the parsing, the words and the refusal copy live here so the Systems
// panel, the phone and the alert drawer say the same thing, and so they can
// be tested without a browser.

export type StudioRunnerRole = 'active' | 'standby' | 'unassigned'

export interface StudioRunner {
  runner_id_prefix: string
  role: StudioRunnerRole
  last_heartbeat_at: string | null
  heartbeat_age_seconds: number | null
  fresh: boolean
  runner_status: string | null
  drive_state: string | null
  software_commit: string | null
  pending_receipts: number | null
  working: boolean
}

export interface StudioRunnerAttention {
  code: string
  line: string
}

export interface StudioRunners {
  /** True once the roles are seeded and only the active runner takes work. */
  fenced: boolean
  active: StudioRunner | null
  standby: StudioRunner[]
  unassigned: StudioRunner[]
  retired_count: number
  waiting: number
  attention: StudioRunnerAttention[]
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function runner(value: unknown, role: StudioRunnerRole): StudioRunner | null {
  const r = record(value)
  if (!r || typeof r.runner_id_prefix !== 'string' || !/^[a-f0-9]{8}$/.test(r.runner_id_prefix)) return null
  const age = typeof r.heartbeat_age_seconds === 'number' && Number.isFinite(r.heartbeat_age_seconds) && r.heartbeat_age_seconds >= 0
    ? r.heartbeat_age_seconds
    : null
  return {
    runner_id_prefix: r.runner_id_prefix,
    role,
    last_heartbeat_at: typeof r.last_heartbeat_at === 'string' ? r.last_heartbeat_at : null,
    heartbeat_age_seconds: age,
    fresh: r.fresh === true,
    runner_status: typeof r.runner_status === 'string' ? r.runner_status : null,
    drive_state: typeof r.drive_state === 'string' ? r.drive_state : null,
    software_commit: typeof r.software_commit === 'string' ? r.software_commit : null,
    pending_receipts: typeof r.pending_receipts === 'number' ? r.pending_receipts : null,
    working: r.working === true,
  }
}

function runners(value: unknown, role: StudioRunnerRole): StudioRunner[] {
  return Array.isArray(value) ? value.map((item) => runner(item, role)).filter((item): item is StudioRunner => item !== null) : []
}

/** The `runners` block of GET /api/content-engine/health, or null when the engine predates it. */
export function parseStudioRunners(value: unknown): StudioRunners | null {
  const r = record(value)
  if (!r || typeof r.fenced !== 'boolean') return null
  const waiting = record(r.waiting)
  const attention = Array.isArray(r.attention)
    ? r.attention
      .map((item) => record(item))
      .filter((item): item is Record<string, unknown> => Boolean(item && typeof item.code === 'string' && typeof item.line === 'string'))
      .map((item) => ({ code: String(item.code), line: String(item.line) }))
    : []
  return {
    fenced: r.fenced,
    active: runner(r.active, 'active'),
    standby: runners(r.standby, 'standby'),
    unassigned: runners(r.unassigned, 'unassigned'),
    retired_count: typeof r.retired_count === 'number' ? r.retired_count : 0,
    waiting: waiting && typeof waiting.total === 'number' ? waiting.total : 0,
    attention,
  }
}

/** "5 seconds ago", "24 minutes ago", "3 hours ago", "2 days ago". */
export function runnerAgeLabel(seconds: number | null): string {
  if (seconds === null) return 'never heard'
  if (seconds < 60) return `${seconds} second${seconds === 1 ? '' : 's'} ago`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`
  const hours = Math.round(seconds / 3600)
  if (hours < 48) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.round(seconds / 86_400)
  return `${days} days ago`
}

export function driveLabel(state: string | null): string {
  switch (state) {
    case 'ready': return 'Drive ready'
    case 'unavailable': return 'Drive offline'
    case 'not_configured': return 'Drive not set up'
    default: return 'Drive unknown'
  }
}

export function roleLabel(role: StudioRunnerRole, fenced: boolean): string {
  if (role === 'active') return fenced ? 'Active' : 'Working (roles not set)'
  if (role === 'standby') return 'Standby'
  return 'No role'
}

/** Every runner worth a row, the active one first. */
export function studioRunnerRows(value: StudioRunners): StudioRunner[] {
  return [...(value.active ? [value.active] : []), ...value.standby, ...value.unassigned]
}

/** Runners the active role could move to: up, idle, Drive ready, holding nothing. */
export function switchTargets(value: StudioRunners): StudioRunner[] {
  if (!value.fenced) return []
  return [...value.standby, ...value.unassigned].filter((row) =>
    row.fresh && row.runner_status === 'idle' && row.drive_state === 'ready' && !row.working && (row.pending_receipts ?? 0) === 0)
}

/** The database's refusals, in the words the operator needs. */
export function switchRefusalLine(code: string): string {
  switch (code) {
    case 'active_runner_still_running': return 'The active runner is still heartbeating. Stop and disable its task first, then wait a minute.'
    case 'active_runner_has_pending_receipts': return 'The active runner last reported work it has not delivered. Start it again so it can finish, then stop it.'
    case 'active_runner_holds_work': return 'Work is still leased to the active runner. It must finish that work before the role can move.'
    case 'target_runner_not_ready': return 'That runner is not heartbeating idle with Drive ready. Start its task and check its status first.'
    case 'active_runner_changed': return 'The active runner changed while this was open. Reload and try again.'
    case 'runner_retired': return 'That runner is retired and can never become active.'
    case 'runner_roles_not_seeded': return 'The runner roles have not been set up yet, so there is nothing to switch.'
    case 'runner_already_active': return 'That runner is already the active one.'
    case 'invalid_runner_role_request': return 'Give a reason of at least eight characters.'
    default: return 'The switch did not go through. Nothing changed.'
  }
}
