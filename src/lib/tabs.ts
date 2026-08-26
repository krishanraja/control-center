import {
  LayoutDashboard, Home, DollarSign, FileText, Server,
  HeartHandshake, Rocket, Compass,
  type LucideIcon,
} from '@/lib/icons'

export interface TabDef {
  id: string
  label: string
  /** Optional shorter label used when the BottomNav can't fit the full label (sub-360px viewports). */
  mobileShortLabel?: string
  desktopIcon: LucideIcon
  mobileIcon: LucideIcon
  desktopPriority: 'primary' | 'drawer'
  mobilePriority: 'primary' | 'drawer'
}

// The IA: six destinations. Home absorbed Today's ruling queue (it lives at
// OS → Queue); People = Pipeline + Network + Visibility as lanes; OS = Org +
// Intel + Flows + Systems as subtabs; Subscriptions watches from the drawer
// (the Home scoreboard carries its headline). Old hashes resolve through the
// App-level alias layer, so bookmarks and navigate() call sites keep working.
//
// The legacy 11-tab array lived beside this one behind isSimplifiedIA() until
// 2026-08-26. That function has returned a hardcoded true since the queue's
// only host became the OS tab, so the legacy branch was unreachable in every
// build — and its render branches in App.tsx were dead ahead of the alias
// layer. Both are gone; git history holds them.
export const TABS: TabDef[] = [
  { id: 'home',      label: 'Home',    desktopIcon: LayoutDashboard, mobileIcon: Home,          desktopPriority: 'primary', mobilePriority: 'primary' },
  { id: 'content',   label: 'Content', desktopIcon: FileText,        mobileIcon: FileText,      desktopPriority: 'primary', mobilePriority: 'primary' },
  { id: 'people',    label: 'People',  desktopIcon: HeartHandshake,  mobileIcon: HeartHandshake, desktopPriority: 'primary', mobilePriority: 'primary' },
  // Same single Growth destination as the legacy IA, same five sections.
  { id: 'growth',    label: 'Growth',  desktopIcon: Rocket,          mobileIcon: Rocket,        desktopPriority: 'primary', mobilePriority: 'primary' },
  { id: 'os',        label: 'OS',      desktopIcon: Server,          mobileIcon: Server,        desktopPriority: 'primary', mobilePriority: 'drawer'  },
  // Same drawer posture as the legacy IA: reached through the check-in, the
  // anxious-day route, and Home, with the drawer as the fallback door.
  { id: 'focus',     label: 'Focus',   desktopIcon: Compass,         mobileIcon: Compass,       desktopPriority: 'drawer',  mobilePriority: 'drawer'  },
  { id: 'customers', label: 'Subscriptions', mobileShortLabel: 'Subs', desktopIcon: DollarSign, mobileIcon: DollarSign, desktopPriority: 'drawer', mobilePriority: 'drawer' },
]

// Explicit bottom-bar order: Home first, then the three critical sections in
// importance order (Content, People/Network, Growth). Decoupled from the
// desktop sidebar order. Keep in sync with the `mobilePriority: 'primary'`
// flags above.
const MOBILE_PRIMARY_ORDER: readonly string[] = ['home', 'content', 'people', 'growth']

export const DESKTOP_PRIMARY_TABS = TABS.filter(t => t.desktopPriority === 'primary')
export const DESKTOP_DRAWER_TABS  = TABS.filter(t => t.desktopPriority === 'drawer')
export const MOBILE_PRIMARY_TABS  = MOBILE_PRIMARY_ORDER.map(id => TABS.find(t => t.id === id)!)
export const MOBILE_DRAWER_TABS   = TABS.filter(t => !MOBILE_PRIMARY_ORDER.includes(t.id))

export const VALID_TAB_IDS = new Set(TABS.map(t => t.id))
