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

/** Pod color — matches tailwind.config.js `pod.*` tokens. */
const POD_COLOR: Record<Pod, { ring: string; text: string; bg: string; hex: string }> = {
  ops:     { ring: 'ring-pod-ops/50',     text: 'text-pod-ops',     bg: 'bg-pod-ops/15',     hex: '#22d3ee' },
  revenue: { ring: 'ring-pod-revenue/50', text: 'text-pod-revenue', bg: 'bg-pod-revenue/15', hex: '#34d399' },
  growth:  { ring: 'ring-pod-growth/50',  text: 'text-pod-growth',  bg: 'bg-pod-growth/15',  hex: '#a78bfa' },
  unknown: { ring: 'ring-white/20',       text: 'text-white/60',    bg: 'bg-white/10',       hex: '#94a3b8' },
}

export function podColor(pod?: string) {
  return POD_COLOR[(pod as Pod) ?? 'unknown'] ?? POD_COLOR.unknown
}

export function podLabel(pod?: string) {
  const map: Record<string, string> = { ops: 'Ops', revenue: 'Revenue', growth: 'Growth' }
  return pod ? map[pod] ?? pod : ''
}

/** Status semantic styling. */
const STATUS_STYLE: Record<string, { dot: string; bg: string; text: string; label: string }> = {
  needs_you:   { dot: 'bg-status-needsYou',  bg: 'bg-status-needsYou/15',  text: 'text-status-needsYou',  label: 'Needs you' },
  blocked:     { dot: 'bg-status-blocked',   bg: 'bg-status-blocked/15',   text: 'text-status-blocked',   label: 'Blocked' },
  active:      { dot: 'bg-status-active',    bg: 'bg-status-active/15',    text: 'text-status-active',    label: 'Active' },
  running:     { dot: 'bg-status-active',    bg: 'bg-status-active/15',    text: 'text-status-active',    label: 'Running' },
  waiting:     { dot: 'bg-status-waiting',   bg: 'bg-status-waiting/15',   text: 'text-status-waiting',   label: 'Waiting' },
  pending:     { dot: 'bg-status-waiting',   bg: 'bg-status-waiting/15',   text: 'text-status-waiting',   label: 'Pending' },
  done:        { dot: 'bg-status-done',      bg: 'bg-status-done/12',      text: 'text-status-done',      label: 'Done' },
  complete:    { dot: 'bg-status-done',      bg: 'bg-status-done/12',      text: 'text-status-done',      label: 'Complete' },
  at_risk:     { dot: 'bg-status-needsYou',  bg: 'bg-status-needsYou/15',  text: 'text-status-needsYou',  label: 'At risk' },
  in_progress: { dot: 'bg-status-active',    bg: 'bg-status-active/15',    text: 'text-status-active',    label: 'In progress' },
  on_track:    { dot: 'bg-status-active',    bg: 'bg-status-active/15',    text: 'text-status-active',    label: 'On track' },
  ahead:       { dot: 'bg-status-active',    bg: 'bg-status-active/15',    text: 'text-status-active',    label: 'Ahead' },
  error:       { dot: 'bg-status-blocked',   bg: 'bg-status-blocked/15',   text: 'text-status-blocked',   label: 'Error' },
  success:     { dot: 'bg-status-active',    bg: 'bg-status-active/15',    text: 'text-status-active',    label: 'Success' },
  green:       { dot: 'bg-status-active',    bg: 'bg-status-active/15',    text: 'text-status-active',    label: 'Green' },
  amber:       { dot: 'bg-status-needsYou',  bg: 'bg-status-needsYou/15',  text: 'text-status-needsYou',  label: 'Amber' },
  red:         { dot: 'bg-status-blocked',   bg: 'bg-status-blocked/15',   text: 'text-status-blocked',   label: 'Red' },
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
  received: { bg: 'bg-white/[0.06]',      text: 'text-white/50',      border: 'border-white/10',         label: 'New' },
  routed:   { bg: 'bg-blue-500/10',       text: 'text-blue-300',      border: 'border-blue-500/25',      label: 'Routed' },
  actioned: { bg: 'bg-emerald-500/10',    text: 'text-emerald-300',   border: 'border-emerald-500/25',   label: 'Actioned' },
  expired:  { bg: 'bg-white/[0.04]',      text: 'text-white/30',      border: 'border-white/[0.06]',     label: 'Expired' },
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
