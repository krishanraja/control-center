/**
 * Shared visual tokens — consumed by BOTH desktop and mobile surfaces so the
 * product feels like one product across devices.
 *
 * Keep all color/status logic here. No hex literals in components.
 */

export type Pod = 'ops' | 'revenue' | 'growth' | 'unknown'
export type Status =
  | 'needs_you' | 'blocked' | 'active' | 'running'
  | 'waiting' | 'pending' | 'done' | 'complete'
  | 'at_risk' | 'in_progress' | 'on_track' | 'ahead'
  | 'error' | 'success' | 'green' | 'amber' | 'red'

/**
 * Pod color — matches tailwind.config.js `pod.*` tokens (now muted).
 * Restraint: the surface is neutral; colour is carried only by the (muted) text
 * and a thin ring, never a same-hue tinted fill. `bg` is intentionally neutral so
 * pod chips read as one calm family, not a rainbow.
 */
const POD_COLOR: Record<Pod, { ring: string; text: string; bg: string; hex: string }> = {
  ops:     { ring: 'ring-pod-ops/40',     text: 'text-pod-ops',     bg: 'bg-white/[0.04]', hex: '#6ba6b5' },
  revenue: { ring: 'ring-pod-revenue/40', text: 'text-pod-revenue', bg: 'bg-white/[0.04]', hex: '#6cab8b' },
  growth:  { ring: 'ring-pod-growth/40',  text: 'text-pod-growth',  bg: 'bg-white/[0.04]', hex: '#8f88bd' },
  unknown: { ring: 'ring-white/15',       text: 'text-white/55',    bg: 'bg-white/[0.04]', hex: '#8a94a3' },
}

export function podColor(pod?: string) {
  return POD_COLOR[(pod as Pod) ?? 'unknown'] ?? POD_COLOR.unknown
}

export function podLabel(pod?: string) {
  const map: Record<string, string> = { ops: 'Ops', revenue: 'Revenue', growth: 'Growth' }
  return pod ? map[pod] ?? pod : ''
}

/**
 * Status semantic styling. Instrument treatment: a neutral surface + near-white
 * label, with the (muted) colour carried ONLY by the `dot`. This kills the old
 * same-hue-text-on-same-hue-tint muddiness while keeping status legible at a
 * glance. Consumers that read `.dot` get the colour; `.bg`/`.text` stay neutral.
 */
const NEUTRAL_PILL = { bg: 'bg-white/[0.05]', text: 'text-white/80' }
const STATUS_STYLE: Record<string, { dot: string; bg: string; text: string; label: string }> = {
  needs_you:   { dot: 'bg-status-needsYou', ...NEUTRAL_PILL, label: 'Needs you' },
  blocked:     { dot: 'bg-status-blocked',  ...NEUTRAL_PILL, label: 'Blocked' },
  active:      { dot: 'bg-status-active',   ...NEUTRAL_PILL, label: 'Active' },
  running:     { dot: 'bg-status-active',   ...NEUTRAL_PILL, label: 'Running' },
  waiting:     { dot: 'bg-status-waiting',  ...NEUTRAL_PILL, label: 'Waiting' },
  pending:     { dot: 'bg-status-waiting',  ...NEUTRAL_PILL, label: 'Pending' },
  done:        { dot: 'bg-status-done',     ...NEUTRAL_PILL, label: 'Done' },
  complete:    { dot: 'bg-status-done',     ...NEUTRAL_PILL, label: 'Complete' },
  at_risk:     { dot: 'bg-status-needsYou', ...NEUTRAL_PILL, label: 'At risk' },
  in_progress: { dot: 'bg-status-active',   ...NEUTRAL_PILL, label: 'In progress' },
  on_track:    { dot: 'bg-status-active',   ...NEUTRAL_PILL, label: 'On track' },
  ahead:       { dot: 'bg-status-active',   ...NEUTRAL_PILL, label: 'Ahead' },
  error:       { dot: 'bg-status-blocked',  ...NEUTRAL_PILL, label: 'Error' },
  success:     { dot: 'bg-status-active',   ...NEUTRAL_PILL, label: 'Success' },
  green:       { dot: 'bg-status-active',   ...NEUTRAL_PILL, label: 'Green' },
  amber:       { dot: 'bg-status-needsYou', ...NEUTRAL_PILL, label: 'Amber' },
  red:         { dot: 'bg-status-blocked',  ...NEUTRAL_PILL, label: 'Red' },
}

export function statusStyle(status?: string) {
  if (!status) return STATUS_STYLE.waiting
  return STATUS_STYLE[status] ?? STATUS_STYLE.waiting
}

/**
 * Humanize a snake_case / kebab-case / dotted identifier into a readable
 * title. e.g. `arlo_daily_audit` → `Arlo Daily Audit`.
 */
export function humanize(text?: string | null): string {
  if (!text) return ''
  return String(text)
    .replace(/[_\-.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, c => c.toUpperCase())
}

/** Signal lifecycle status styling. */
export type SignalStatus = 'received' | 'routed' | 'actioned' | 'expired'

const SIGNAL_STATUS_STYLE: Record<SignalStatus, { bg: string; text: string; border: string; label: string }> = {
  received: { bg: 'bg-white/[0.06]', text: 'text-white/50',        border: 'border-white/10',        label: 'New' },
  routed:   { bg: 'bg-white/[0.05]', text: 'text-pod-ops',         border: 'border-white/10',        label: 'Routed' },
  actioned: { bg: 'bg-white/[0.05]', text: 'text-status-active',   border: 'border-white/10',        label: 'Actioned' },
  expired:  { bg: 'bg-white/[0.04]', text: 'text-white/30',        border: 'border-white/[0.06]',    label: 'Expired' },
}

export function signalStatusStyle(status?: string | null) {
  return SIGNAL_STATUS_STYLE[(status as SignalStatus) ?? 'received'] ?? SIGNAL_STATUS_STYLE.received
}

/** Safe initials from an agent name (1-2 letters). */
export function initialsOf(name: string): string {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}
