import React, { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, MoreHorizontal, type LucideIcon } from '@/lib/icons'
import { supabase } from '../lib/supabase'
import { DESKTOP_PRIMARY_TABS, DESKTOP_DRAWER_TABS } from '../lib/tabs'
import { formatMrr } from '../lib/mrrDisplay'
import { useRevenue } from '../hooks/useRevenue'
import { usePressable } from './shared/usePressable'
import { ThemeToggle } from './shared/ThemeToggle'
import { TimezoneToggle } from './shared/TimezoneToggle'
import { MindmakeIdentity } from './shared/MindmakeIdentity'

interface Props {
  active: string
  onChange: (tab: string) => void
}

export function DesktopSidebar({ active, onChange }: Props) {
  const [pinnedExpanded, setPinnedExpanded] = useState(true)
  const [hoverExpanded, setHoverExpanded] = useState(false)
  const [hoverSuppressed, setHoverSuppressed] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [badge, setBadge] = useState<'green' | 'amber' | 'red' | 'unknown'>('unknown')
  const [badgeStatus, setBadgeStatus] = useState<string>('unknown')
  const [alertCount, setAlertCount] = useState(0)
  const [unhealthyCount, setUnhealthyCount] = useState(0)
  // The sidebar used to run its OWN sum over customers.mrr_usd: any non-churned
  // row of any kind, no test-row filter, no limit. One of five incompatible
  // definitions. It reads the shared figure now.
  const { revenue } = useRevenue()
  const mrr = revenue && revenue.committed_mrr_usd_cents > 0
    ? `${formatMrr(revenue.committed_mrr_usd_cents / 100)}/mo`
    : null

  useEffect(() => {
    const loadSys = async () => {
      const healthRes = await supabase.from('system_health').select('status')
      const health = (healthRes.data as Array<{ status?: string }> | null) || []
      setUnhealthyCount(health.filter(r => r.status === 'critical' || r.status === 'warning').length)
    }
    loadSys()
    const ch = supabase
      .channel('sidebar-health')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'system_health' }, loadSys)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [])

  useEffect(() => {
    let alive = true
    const loadBadge = async () => {
      try {
        const res = await fetch('/api/health', { cache: 'no-cache' })
        if (!res.ok) throw new Error(String(res.status))
        const data = await res.json()
        if (!alive) return
        setBadge(data.badge || 'unknown')
        setBadgeStatus(data.status || 'unknown')
        setAlertCount(Array.isArray(data.alerts) ? data.alerts.length : 0)
      } catch {
        if (alive) { setBadge('unknown'); setBadgeStatus('unreachable') }
      }
    }
    loadBadge()
    const iv = setInterval(loadBadge, 30_000)
    return () => { alive = false; clearInterval(iv) }
  }, [])

  const dotColor =
    badge === 'green' ? 'bg-emerald-400' :
    badge === 'amber' ? 'bg-amber-400'   :
    badge === 'red'   ? 'bg-rose-500'    :
                        'bg-white/20'

  const dotTitle = alertCount > 0 ? `${badgeStatus} (${alertCount} alert${alertCount === 1 ? '' : 's'})` : badgeStatus

  const expanded = pinnedExpanded || (!hoverSuppressed && hoverExpanded)
  const w = expanded ? 'w-60' : 'w-[72px]'
  const toggleLabel = pinnedExpanded
    ? 'Collapse sidebar'
    : expanded
      ? 'Keep sidebar open'
      : 'Expand sidebar'

  const toggleSidebar = () => {
    if (pinnedExpanded) {
      setPinnedExpanded(false)
      setHoverExpanded(false)
      // Collapsing changes the sidebar's geometry under the pointer. Do not
      // let that synthetic re-entry immediately undo the explicit action.
      setHoverSuppressed(true)
      setDrawerOpen(false)
      return
    }
    setPinnedExpanded(true)
    setHoverSuppressed(false)
  }

  return (
    <aside
      id="desktop-sidebar"
      data-testid="desktop-sidebar"
      data-expanded={expanded ? 'true' : 'false'}
      className={`${w} flex-shrink-0 border-r border-white/[0.08] bg-base/95 flex flex-col h-[100dvh] transition-[width] duration-200 ease-out-soft motion-reduce:transition-none shadow-[12px_0_48px_-36px_rgba(0,0,0,.9)]`}
      onMouseEnter={() => { if (!pinnedExpanded && !hoverSuppressed) setHoverExpanded(true) }}
      onMouseLeave={() => { setHoverExpanded(false); setHoverSuppressed(false); setDrawerOpen(false) }}
    >
      <div className={`h-16 flex items-center border-b border-white/[0.07] ${expanded ? 'px-4' : 'justify-center px-0'}`}>
        {expanded ? (
          <div className="flex w-full min-w-0 items-center gap-2">
            <MindmakeIdentity variant="expanded" size={36} testId="desktop-sidebar-identity" />
            <span className={`ml-auto h-2 w-2 flex-none rounded-full ${dotColor}`} title={dotTitle} />
          </div>
        ) : (
          <MindmakeIdentity size={36} testId="desktop-sidebar-identity" />
        )}
      </div>

      <nav className="flex-1 py-4 px-2 space-y-1.5 overflow-y-auto">
        {DESKTOP_PRIMARY_TABS.map(({ id, label, desktopIcon }) => (
          <SidebarButton
            key={id}
            id={id}
            label={label}
            Icon={desktopIcon}
            active={active === id}
            onClick={() => onChange(id)}
            expanded={expanded}
            showHealthBadge={id === 'os' && unhealthyCount > 0}
            unhealthyCount={unhealthyCount}
            badge={badge}
          />
        ))}

        {DESKTOP_DRAWER_TABS.length > 0 && (
          <>
            <button
              type="button"
              onClick={() => setDrawerOpen(o => !o)}
              aria-label="More tabs"
              className={`w-full min-h-[42px] flex items-center gap-3 px-3 py-2 rounded-lg text-body font-medium transition-all motion-reduce:transition-none border ${
                drawerOpen
                  ? 'bg-white/[0.04] text-white/80 border-white/10'
                  : 'text-white/60 hover:text-white/80 hover:bg-white/[0.04] border-transparent'
              }`}
              title={!expanded ? 'More' : undefined}
            >
              <MoreHorizontal size={16} className="flex-shrink-0" />
              {expanded && <span className="truncate flex-1">More</span>}
            </button>

            {drawerOpen && (
              <div className="border-t border-white/[0.06] pt-2 mt-2 space-y-1">
                {DESKTOP_DRAWER_TABS.map(({ id, label, desktopIcon }) => (
                  <SidebarButton
                    key={id}
                    id={id}
                    label={label}
                    Icon={desktopIcon}
                    active={active === id}
                    onClick={() => { onChange(id); setDrawerOpen(false) }}
                    expanded={expanded}
                    showHealthBadge={false}
                    unhealthyCount={0}
                    badge={badge}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </nav>

      <div className="border-t border-white/[0.07] p-3 space-y-2">
        <button
          type="button"
          onClick={toggleSidebar}
          aria-label={toggleLabel}
          aria-controls="desktop-sidebar"
          aria-expanded={expanded}
          aria-pressed={pinnedExpanded}
          data-testid="desktop-sidebar-toggle"
          className={`flex min-h-[42px] w-full items-center rounded-lg border border-white/[0.07] text-white/55 transition-colors motion-reduce:transition-none hover:bg-white/[0.05] hover:text-white/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/50 ${expanded ? 'gap-2 px-2.5' : 'justify-center'}`}
        >
          {pinnedExpanded ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
          {expanded && <span className="truncate text-label font-medium">{toggleLabel}</span>}
        </button>
        {expanded ? (
          <>
            <div>
              <p className="text-micro uppercase tracking-[0.14em] text-white/40 font-semibold">MRR</p>
              {mrr ? (
                <p className="text-ui font-mono font-semibold text-emerald-400 tabular-nums mt-0.5">{mrr}</p>
              ) : (
                <p className="text-label text-white/30 mt-1 leading-snug">Not reported yet</p>
              )}
            </div>
            <ThemeToggle expanded />
            <TimezoneToggle expanded />
            <div className="pt-2 border-t border-white/[0.05] flex items-center justify-between">
              <span className="text-micro uppercase tracking-[0.14em] text-white/30 font-medium">Command</span>
              <kbd className="text-micro font-mono text-white/60 border border-white/10 rounded px-1.5 py-0.5 bg-white/[0.03]">⌘K</kbd>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <ThemeToggle expanded={false} />
            <TimezoneToggle expanded={false} />
            <div className={`w-2 h-2 rounded-full ${dotColor}`} title={dotTitle} />
          </div>
        )}
      </div>
    </aside>
  )
}

interface SidebarButtonProps {
  id: string
  label: string
  Icon: LucideIcon
  active: boolean
  onClick: () => void
  expanded: boolean
  showHealthBadge: boolean
  unhealthyCount: number
  badge: 'green' | 'amber' | 'red' | 'unknown'
}

function SidebarButton({ id, label, Icon, active, onClick, expanded, showHealthBadge, unhealthyCount, badge }: SidebarButtonProps) {
  // Shared press primitive: a no-op haptic on desktop, but it gives us the
  // touch-down feel on hybrid/touch laptops for free and keeps nav consistent
  // with the rest of the app. The focus ring is the real desktop win here.
  const { bind } = usePressable({ onPress: onClick, haptic: 'select' })
  return (
    <button
      onClick={bind.onClick}
      onPointerDown={bind.onPointerDown}
      aria-label={!expanded ? (showHealthBadge ? `${label}, ${unhealthyCount} issues` : label) : undefined}
      className={`w-full min-h-[42px] flex items-center gap-3 px-3 py-2 rounded-xl text-body font-medium transition-all duration-200 motion-reduce:transition-none relative overflow-hidden
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/50
        ${active
          ? 'bg-violet-500/10 text-white border border-violet-500/25 shadow-[inset_3px_0_0_#7fe3b4]'
          : 'text-white/60 hover:text-white/80 hover:bg-white/[0.04] border border-transparent'}`}
      title={!expanded ? (showHealthBadge ? `${label} (${unhealthyCount} issues)` : label) : undefined}
    >
      <div className="relative">
        <Icon size={16} className="flex-shrink-0" strokeWidth={active ? 2.25 : undefined} />
        {showHealthBadge && (
          <span
            className={`absolute -top-1 -right-1 w-2 h-2 rounded-full ${badge === 'red' ? 'bg-rose-500' : 'bg-amber-400'} animate-pulse motion-reduce:animate-none`}
            title={`${unhealthyCount} system${unhealthyCount > 1 ? 's' : ''} need attention`}
          />
        )}
      </div>
      {expanded && <span className="truncate flex-1">{label}</span>}
      {expanded && showHealthBadge && (
        <span className={`text-micro px-1.5 py-0.5 rounded font-mono ${badge === 'red' ? 'bg-rose-500/20 text-rose-400' : 'bg-amber-500/20 text-amber-400'}`}>
          {unhealthyCount}
        </span>
      )}
    </button>
  )
}
