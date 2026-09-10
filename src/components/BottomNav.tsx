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
  const drawerActive = MOBILE_DRAWER_TABS.some(t => t.id === active)

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
              aria-current={drawerActive ? 'page' : undefined}
              className={`${NAV_BUTTON_CLS} ${
                reducedMotion ? '' : 'transition-all duration-200 active:scale-95'
              } ${drawerActive ? 'text-accent' : 'text-muted'}`}
            >
              {/* More is a real tab button now. It used to be the one control in
                  the bar with no active treatment, so opening OS, Focus or
                  Subscriptions left the whole bar looking as though nothing was
                  selected. */}
              <NavIndicator active={drawerActive} reducedMotion={reducedMotion} />
              <div className={`relative ${reducedMotion ? '' : `transition-transform duration-200 ${drawerActive ? 'scale-110' : 'scale-100'}`}`}>
                <MoreHorizontal size={24} strokeWidth={drawerActive ? 2.25 : undefined} />
              </div>
              <span className="relative w-full text-center text-label font-medium leading-none tracking-tight truncate">More</span>
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

/**
 * The one active indicator: a pill behind the whole icon-and-label column.
 *
 * It used to be two unrelated marks. A pill lived INSIDE the icon wrapper that
 * carries `scale-110`, so it was itself scaled: an 8px radius became ~8.8px and
 * its hairline border blurred to ~1.1px, and it animated its own size on every
 * change. A separate 40px top line was positioned on the BUTTON, so the two
 * were centred on different boxes and disagreed by a fraction of a pixel as you
 * moved across the bar. Both mounted with a bare `{active && …}` and no
 * transition while the colour and scale around them eased over 200ms, so the
 * marks popped while everything else glided. On the first tab the top line ran
 * into the container's own 16px `rounded-2xl overflow-hidden` corner and was
 * clipped, so Home never looked like the other four.
 *
 * Now: one pill, always mounted so it can fade rather than pop, inset far
 * enough that it never reaches the container's corner radius, outside the
 * scaled wrapper, and drawn in `accent` — the theme-aware channel — instead of
 * `violet-500` plus `text-accent` plus a hardcoded mint glow that stayed mint
 * on paper while the ramp around it flipped to deep green.
 */
function NavIndicator({ active, reducedMotion }: { active: boolean; reducedMotion: boolean }) {
  return (
    <span
      aria-hidden
      className={`absolute inset-x-2 inset-y-1.5 rounded-xl border border-accent/25 bg-accent/10 ${
        reducedMotion ? '' : 'transition-opacity duration-200'
      } ${active ? 'opacity-100' : 'opacity-0'}`}
    />
  )
}

const NAV_BUTTON_CLS =
  'relative flex-1 min-w-0 flex flex-col items-center justify-center gap-1 px-0.5 pt-2 pb-1.5 min-h-[68px] sm:min-h-[72px]'

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
      className={`${NAV_BUTTON_CLS} ${
        reducedMotion ? '' : 'transition-all duration-200 active:scale-95'
      } ${active ? 'text-accent' : 'text-muted'}`}
    >
      <NavIndicator active={active} reducedMotion={reducedMotion} />
      <div className={`relative ${reducedMotion ? '' : `transition-transform duration-200 ${active ? 'scale-110' : 'scale-100'}`}`}>
        <Icon
          size={24}
          className={reducedMotion ? '' : 'transition-colors'}
          strokeWidth={active ? 2.25 : undefined}
        />
      </div>
      <span className={`relative w-full text-center text-label font-medium leading-none tracking-tight truncate ${reducedMotion ? '' : 'transition-colors'}`}>
        {label}
      </span>
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
