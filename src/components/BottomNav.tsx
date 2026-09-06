import React, { useState } from 'react'
import { MoreHorizontal, type LucideIcon } from '@/lib/icons'
import { useHaptics } from '../hooks/useHaptics'
import { ThemeToggle } from './shared/ThemeToggle'
import { TimezoneToggle } from './shared/TimezoneToggle'
import { MOBILE_PRIMARY_TABS, MOBILE_DRAWER_TABS, type TabDef } from '../lib/tabs'
import { Dialog, DialogContent, DialogSrTitle } from '@/components/ui/dialog'
import { useReducedMotion } from './shared/motion'

interface Props {
  active: string
  onChange: (tab: string) => void
}

function useNarrowViewport(maxWidth: number) {
  const get = () => typeof window !== 'undefined' && window.innerWidth < maxWidth
  const [narrow, setNarrow] = useState<boolean>(get)
  React.useEffect(() => {
    const onResize = () => setNarrow(get())
    window.addEventListener('resize', onResize)
    window.addEventListener('orientationchange', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('orientationchange', onResize)
    }
  }, [maxWidth])
  return narrow
}

export function BottomNav({ active, onChange }: Props) {
  const h = useHaptics()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const ultraNarrow = useNarrowViewport(360)
  const reducedMotion = useReducedMotion()

  return (
    <>
      <nav aria-label="Primary" className="fixed bottom-0 left-0 right-0 z-50 px-3 pb-[max(10px,env(safe-area-inset-bottom))] pointer-events-none">
        <div className="relative flex items-stretch overflow-hidden rounded-2xl border border-white/[0.10] bg-command-surface shadow-e3 pointer-events-auto">
          {MOBILE_PRIMARY_TABS.map(tab => (
            <NavButton
              key={tab.id}
              tab={tab}
              active={active === tab.id}
              ultraNarrow={ultraNarrow}
              reducedMotion={reducedMotion}
              onClick={() => { h.select(); onChange(tab.id) }}
            />
          ))}
          {MOBILE_DRAWER_TABS.length > 0 && (
            <button
              onClick={() => { h.select(); setDrawerOpen(true) }}
              aria-label="More"
              className={`flex-1 min-w-0 flex flex-col items-center justify-center gap-1 px-0.5 pt-2 pb-1.5 min-h-[68px] sm:min-h-[72px] text-muted ${reducedMotion ? '' : 'transition-all duration-200 active:scale-95'}`}
            >
              <MoreHorizontal size={24} />
              <span className="text-label font-medium leading-none tracking-tight">More</span>
            </button>
          )}
        </div>
      </nav>
      {drawerOpen && (
        <MobileMoreDrawer
          tabs={MOBILE_DRAWER_TABS}
          active={active}
          onSelect={(id) => { h.select(); onChange(id); setDrawerOpen(false) }}
          onClose={() => setDrawerOpen(false)}
        />
      )}
    </>
  )
}

function NavButton({ tab, active, ultraNarrow: _ultraNarrow, reducedMotion, onClick }: { tab: TabDef; active: boolean; ultraNarrow?: boolean; reducedMotion: boolean; onClick: () => void }) {
  const Icon: LucideIcon = tab.mobileIcon
  // Always prefer mobileShortLabel when set: at the 5-tab + More layout, even
  // a 390px iPhone truncates "Subscriptions" to "Subscripti...". The short
  // label ("Subs") fits cleanly without truncation.
  const label = tab.mobileShortLabel ?? tab.label
  return (
    <button
      onClick={onClick}
      aria-label={tab.label}
      aria-current={active ? 'page' : undefined}
      className={`relative flex-1 min-w-0 flex flex-col items-center justify-center gap-1 px-0.5 pt-2 pb-1.5 min-h-[68px] sm:min-h-[72px] ${
        reducedMotion ? '' : 'transition-all duration-200 active:scale-95'
      } ${active ? 'text-accent' : 'text-muted'}`}
    >
      <div className={`relative ${reducedMotion ? '' : `transition-transform duration-200 ${active ? 'scale-110' : 'scale-100'}`}`}>
        {active && (
          <span aria-hidden className="absolute -inset-2 rounded-lg border border-violet-400/15 bg-violet-500/[0.12]" />
        )}
        <Icon
          size={24}
          className={`relative ${reducedMotion ? '' : 'transition-colors'} ${active ? 'text-accent' : ''}`}
          strokeWidth={active ? 2.25 : undefined}
        />
      </div>
      <span className={`w-full text-center text-label font-medium leading-none tracking-tight truncate ${reducedMotion ? '' : 'transition-colors'} ${active ? 'text-accent' : ''}`}>
        {label}
      </span>
      {active && (
        <span aria-hidden className="absolute top-0 left-1/2 -translate-x-1/2 w-10 h-[2px] bg-violet-400 rounded-full shadow-[0_0_14px_rgba(127,227,180,.34)]" />
      )}
    </button>
  )
}

function MobileMoreDrawer({
  tabs, active, onSelect, onClose,
}: {
  tabs: TabDef[]
  active: string
  onSelect: (id: string) => void
  onClose: () => void
}) {
  return (
    // The More drawer dims the page and has to be dismissed before anything
    // else can be used, which makes it a modal whatever it is called. It had a
    // scrim and a click handler and no role, so a screen reader never learned
    // it opened and Tab walked behind it into the nav it was covering.
    <Dialog open onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent
        position="bottom"
        showClose={false}
        overlayClassName="bg-black/60 backdrop-blur-sm"
        aria-label="More"
        className="z-[60] pb-safe"
      >
        <DialogSrTitle>More</DialogSrTitle>
        <div className="flex items-center justify-center pt-3 pb-2">
          <div className="w-10 h-1 bg-white/20 rounded-full" />
        </div>
        <div className="px-4 pb-3 flex items-center gap-3">
          <span className="text-micro font-display font-semibold uppercase tracking-[0.14em] text-white/40 flex-shrink-0">Appearance</span>
          <div className="flex-1 min-w-0"><ThemeToggle expanded /></div>
          <div className="flex-1 min-w-0"><TimezoneToggle expanded /></div>
        </div>
        <div className="grid grid-cols-3 gap-2 p-4 pt-1">
          {tabs.map(({ id, label, mobileIcon: Icon }) => (
            <button
              key={id}
              onClick={() => onSelect(id)}
              className={`flex flex-col items-center gap-2 py-4 rounded-xl border transition-colors ${
                active === id
                  ? 'border-violet-400/40 bg-violet-500/10 text-white'
                  : 'border-white/[0.06] text-white/70 hover:bg-white/[0.04]'
              }`}
            >
              <Icon size={24} />
              <span className="text-body font-medium">{label}</span>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
