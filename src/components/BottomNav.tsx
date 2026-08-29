import React, { useState } from 'react'
import { MoreHorizontal, type LucideIcon } from '@/lib/icons'
import { useHaptics } from '../hooks/useHaptics'
import { ThemeToggle } from './shared/ThemeToggle'
import { TimezoneToggle } from './shared/TimezoneToggle'
import { MOBILE_PRIMARY_TABS, MOBILE_DRAWER_TABS, type TabDef } from '../lib/tabs'
import { Dialog, DialogContent, DialogSrTitle } from '@/components/ui/dialog'

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

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 z-50">
        <div className="absolute inset-0 bg-base/80 backdrop-blur-2xl border-t border-white/[0.06]" />
        <div className="relative flex items-stretch pb-safe px-1">
          {MOBILE_PRIMARY_TABS.map(tab => (
            <NavButton
              key={tab.id}
              tab={tab}
              active={active === tab.id}
              ultraNarrow={ultraNarrow}
              onClick={() => { h.select(); onChange(tab.id) }}
            />
          ))}
          {MOBILE_DRAWER_TABS.length > 0 && (
            <button
              onClick={() => { h.select(); setDrawerOpen(true) }}
              aria-label="More"
              className="flex-1 min-w-0 flex flex-col items-center justify-center gap-1 px-0.5 pt-2 pb-1.5 transition-all duration-200 active:scale-95 min-h-[72px] sm:min-h-[76px] text-white/55"
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

function NavButton({ tab, active, ultraNarrow: _ultraNarrow, onClick }: { tab: TabDef; active: boolean; ultraNarrow?: boolean; onClick: () => void }) {
  const Icon: LucideIcon = tab.mobileIcon
  // Always prefer mobileShortLabel when set: at the 5-tab + More layout, even
  // a 390px iPhone truncates "Subscriptions" to "Subscripti...". The short
  // label ("Subs") fits cleanly without truncation.
  const label = tab.mobileShortLabel ?? tab.label
  return (
    <button
      onClick={onClick}
      aria-label={tab.label}
      className={`relative flex-1 min-w-0 flex flex-col items-center justify-center gap-1 px-0.5 pt-2 pb-1.5 transition-all duration-200 active:scale-95 min-h-[72px] sm:min-h-[76px] ${
        active ? 'text-white' : 'text-white/55'
      }`}
    >
      <div className={`relative transition-transform duration-200 ${active ? 'scale-110' : 'scale-100'}`}>
        {active && (
          <span aria-hidden className="absolute inset-0 rounded-full bg-violet-500/30 blur-md scale-[1.7]" />
        )}
        <Icon
          size={24}
          className={`relative transition-colors ${active ? 'text-violet-200' : ''}`}
          strokeWidth={active ? 2.25 : undefined}
        />
      </div>
      <span className={`w-full text-center text-label font-medium leading-none tracking-tight truncate transition-colors ${active ? 'text-violet-200' : ''}`}>
        {label}
      </span>
      {active && (
        <span aria-hidden className="absolute top-0 left-1/2 -translate-x-1/2 w-10 h-[2px] bg-gradient-to-r from-transparent via-violet-400 to-transparent rounded-full" />
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
