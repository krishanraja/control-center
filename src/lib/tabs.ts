import {
  LayoutDashboard, Home, Calendar, Clock, UserPlus, DollarSign, Mic, FileText,
  Users, GitBranch, Brain, Activity, Workflow, Zap, Server,
  HeartHandshake, Rocket, Compass,
  type LucideIcon,
} from '@/lib/icons'
import { isSimplifiedIA } from './iaV3'

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

// Canonical 11-tab IA. URL ids preserved for bookmark compatibility; labels follow
// the rename passes (id 'leads' -> Pipeline [deal pipeline, leads table],
// id 'relationships' -> Network [contact pool, contacts table],
// Customers -> Subscriptions, Guests -> Visibility).
//
// Order = actual importance (Krish, 2026-07-16): Home stays first (the
// finishable decisions anchor), then the three critical working surfaces —
// Content, Network, Growth — then the day queue and the watch/ambient tabs.
// The array order drives the desktop sidebar AND the mobile "More" drawer.
//
// Mobile primary set: Home + the three critical sections — Content, Network,
// Growth. Everything else (Today, Subscriptions, Pipeline, Visibility, Org,
// Intel, Flows, Systems) lives in the "More" drawer. Fewer primary tabs
// (4 + More) gives each thumb target more room. The bottom-bar order is set
// explicitly via MOBILE_PRIMARY_ORDER below so it can differ from the desktop
// sidebar order without disturbing it.
//
// Desktop drawer demotions: Intel (insight-only, no action), Flows and Systems
// (ops-ambient) stay out of the primary sidebar to reduce IA load; they remain
// accessible under the "More" drawer.
const LEGACY_TABS: TabDef[] = [
  { id: 'home',      label: 'Home',          desktopIcon: LayoutDashboard, mobileIcon: Home,       desktopPriority: 'primary', mobilePriority: 'primary' },
  { id: 'content',   label: 'Content',       desktopIcon: FileText,        mobileIcon: FileText,   desktopPriority: 'primary', mobilePriority: 'primary' },
  { id: 'relationships', label: 'Network',   desktopIcon: HeartHandshake,  mobileIcon: HeartHandshake, desktopPriority: 'primary', mobilePriority: 'primary' },
  // Growth: ONE tab, five sections in the order of the weekly loop (Map, Work,
  // Signals, Council, Governance). It used to be two tabs that both read as
  // "growth": id 'acquisition' labelled "Growth" (the outbound send deck) and
  // id 'growth' labelled "Growth map" (the strategy layer). They overlapped on
  // measurement and half the send deck served a retired motion, so they were
  // folded together on 2026-08-04. The id 'growth' is canonical; '#/acquisition'
  // still resolves here through the alias in App.tsx, so old bookmarks and every
  // navigate('acquisition', ...) call site keep working.
  { id: 'growth',    label: 'Growth',        desktopIcon: Rocket,          mobileIcon: Rocket,     desktopPriority: 'primary', mobilePriority: 'primary' },
  { id: 'today',     label: 'Today',         desktopIcon: Calendar,        mobileIcon: Clock,      desktopPriority: 'primary', mobilePriority: 'drawer'  },
  { id: 'customers', label: 'Subscriptions', mobileShortLabel: 'Subs', desktopIcon: DollarSign, mobileIcon: DollarSign, desktopPriority: 'primary', mobilePriority: 'drawer'  },
  { id: 'leads',     label: 'Pipeline',      desktopIcon: UserPlus,        mobileIcon: UserPlus,   desktopPriority: 'primary', mobilePriority: 'drawer'  },
  { id: 'guests',    label: 'Visibility',    mobileShortLabel: 'Vis',  desktopIcon: Mic,        mobileIcon: Mic,        desktopPriority: 'primary', mobilePriority: 'drawer'  },
  { id: 'org',       label: 'Org',           desktopIcon: Users,           mobileIcon: GitBranch,  desktopPriority: 'primary', mobilePriority: 'drawer'  },
  // Focus & Purpose: the operator's own hub (daily ask, steadying moves,
  // conversation scripts, the decision rules). Drawer priority on purpose: its
  // first-class doors are the morning check-in, the anxious-day auto-route,
  // and the Home entry card, not ambient nav presence.
  { id: 'focus',     label: 'Focus',         desktopIcon: Compass,         mobileIcon: Compass,    desktopPriority: 'drawer',  mobilePriority: 'drawer'  },
  { id: 'exec',      label: 'Intel',         desktopIcon: Brain,           mobileIcon: Activity,   desktopPriority: 'drawer',  mobilePriority: 'drawer'  },
  { id: 'workflows', label: 'Flows',         desktopIcon: Workflow,        mobileIcon: Zap,        desktopPriority: 'drawer',  mobilePriority: 'drawer'  },
  { id: 'systems',   label: 'Systems',       desktopIcon: Server,          mobileIcon: Server,     desktopPriority: 'drawer',  mobilePriority: 'drawer'  },
]

// Simplified IA (VITE_IA_V3_ENABLED): six destinations. Home absorbed Today's
// ruling queue; People = Pipeline + Network + Visibility as lanes; OS = Org +
// Intel + Flows + Systems as subtabs; Subscriptions watches from the drawer
// (the Home scoreboard carries its headline). Old hashes resolve through the
// App-level alias layer, so bookmarks and navigate() call sites keep working.
const SIMPLIFIED_TABS: TabDef[] = [
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

export const TABS: TabDef[] = isSimplifiedIA() ? SIMPLIFIED_TABS : LEGACY_TABS

// Explicit bottom-bar order: Home first, then the three critical sections in
// importance order (Content, People/Network, Growth). Decoupled from the
// desktop sidebar order. Keep in sync with the `mobilePriority: 'primary'`
// flags above.
const MOBILE_PRIMARY_ORDER: readonly string[] = isSimplifiedIA()
  ? ['home', 'content', 'people', 'growth']
  : ['home', 'content', 'relationships', 'growth']

export const DESKTOP_PRIMARY_TABS = TABS.filter(t => t.desktopPriority === 'primary')
export const DESKTOP_DRAWER_TABS  = TABS.filter(t => t.desktopPriority === 'drawer')
export const MOBILE_PRIMARY_TABS  = MOBILE_PRIMARY_ORDER.map(id => TABS.find(t => t.id === id)!)
export const MOBILE_DRAWER_TABS   = TABS.filter(t => !MOBILE_PRIMARY_ORDER.includes(t.id))

export const VALID_TAB_IDS = new Set(TABS.map(t => t.id))
