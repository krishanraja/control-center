import React from 'react'
import { Activity as ActivityIcon, Target, CheckSquare, Server, Workflow as WorkflowIcon } from 'lucide-react'
import type { LiveStatus } from '../../hooks/useLiveStatus'

type NavigateFn = (tab: string, params?: Record<string, string>) => void

interface Props {
  onNavigate?: NavigateFn
  planCount: number | null
  approvalCount: number
  live: LiveStatus
}

/**
 * Replaces the 5-tile PulseStrip. Same data sources, one row, ~44px tall —
 * OS observability stays present but no longer competes with pipeline state
 * for visual weight. Each metric is a button that deep-links to its tab.
 */
export function OsHealthStrip({ onNavigate, planCount, approvalCount, live }: Props) {
  const systemsStatus =
    live.error ? 'offline' :
    live.loading ? 'syncing' :
    live.workflows.errors > 0 ? 'warning' : 'healthy'

  const systemsConfig = {
    healthy: { dot: 'bg-emerald-400',              label: 'Healthy' },
    warning: { dot: 'bg-amber-400',                label: `${live.workflows.errors} errors` },
    offline: { dot: 'bg-red-400',                  label: 'Offline' },
    syncing: { dot: 'bg-blue-400 animate-pulse',   label: 'Syncing' },
  }[systemsStatus]

  // Hide zero-state metrics — the strip is meant to surface attention-worthy
  // numbers. "0 errors" doesn't deserve a tile; if you need it you can deep-link
  // from the Running tile or the sidebar health dot.
  const cells: Array<{
    key: string
    icon: React.ReactNode
    label: string
    value: string
    tone?: string
    dot?: string
    tab: string
  }> = [
    {
      key: 'plans',
      icon: <Target size={11} className="text-violet-400" />,
      label: 'Plans',
      value: planCount === null ? '—' : String(planCount),
      tab: 'plans',
    },
    {
      key: 'today',
      icon: <CheckSquare size={11} className="text-amber-400" />,
      label: 'Today',
      value: String(approvalCount),
      tone: approvalCount > 0 ? 'text-amber-300' : undefined,
      tab: 'today',
    },
    {
      key: 'systems',
      icon: <Server size={11} className="text-emerald-400" />,
      label: 'Systems',
      value: live.loading ? '—' : `${live.workflows.active}/${live.workflows.total}`,
      dot: systemsConfig.dot,
      tone: systemsConfig.label,
      tab: 'systems',
    },
    ...(live.workflows.running > 0 || live.loading ? [{
      key: 'workflows',
      icon: <WorkflowIcon size={11} className="text-blue-400" />,
      label: 'Running',
      value: live.loading ? '—' : String(live.workflows.running),
      tab: 'workflows',
    }] : []),
    ...(live.workflows.errors > 0 ? [{
      key: 'errors',
      icon: <ActivityIcon size={11} className="text-rose-400" />,
      label: 'Errors',
      value: String(live.workflows.errors),
      tone: 'text-rose-300',
      tab: 'workflows',
    }] : []),
  ]

  return (
    <div
      role="region"
      aria-label="OS health"
      className="flex items-center gap-1 rounded-xl border border-white/[0.06] bg-white/[0.015] px-2 py-1.5 overflow-x-auto"
    >
      {cells.map((c, i) => (
        <React.Fragment key={c.key}>
          {i > 0 && <span className="h-4 w-px bg-white/[0.06] mx-1 flex-shrink-0" aria-hidden />}
          <button
            type="button"
            onClick={() => onNavigate?.(c.tab)}
            className="flex items-center gap-2 px-2 py-1 rounded-md hover:bg-white/[0.04] transition-colors flex-shrink-0"
          >
            {c.icon}
            <span className="text-[10px] uppercase tracking-[0.14em] text-white/40 font-semibold">{c.label}</span>
            <span className="text-[12px] text-white tabular-nums font-semibold">{c.value}</span>
            {c.dot && <span className={`w-1.5 h-1.5 rounded-full ${c.dot} flex-shrink-0`} aria-hidden />}
            {c.tone && c.label === 'Systems' && (
              <span className="text-[10px] text-white/40 hidden lg:inline">{c.tone}</span>
            )}
          </button>
        </React.Fragment>
      ))}
    </div>
  )
}
