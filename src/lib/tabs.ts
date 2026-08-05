import {
  LayoutDashboard, Home, Calendar, Clock, UserPlus, DollarSign, Mic, FileText,
  Users, GitBranch, Brain, Activity, Workflow, Zap, Server,
  HeartHandshake, Rocket, Map as MapIcon,
  type LucideIcon,
} from 'lucide-react'
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

// Canonical 12-tab IA. URL ids preserved for bookmark compatibility; labels follow
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
  // Growth: the acquisition command deck (nurture funnel, send approvals,
  // autonomy ladder, profit governor). Subscriptions stays the read-only
  // revenue watch; Growth is where acquisition gets ACTED on.
  { id: 'acquisition', label: 'Growth', desktopIcon: Rocket, mobileIcon: Rocket, desktopPriority: 'primary', mobilePriority: 'primary' },
  // Growth map: the strategy layer under the Growth deck. The ICP touchpoint
  // map is the spine; the creative board, the weekly council and the GEO probe
  // results all hang off it. Kept as its own destination so the acquisition
  // deck (where sends get approved) stays a single-purpose surface. See the
  // note in App.tsx: these two surfaces are candidates to fold into one tab.
  { id: 'growth',    label: 'Growth map',    desktopIcon: MapIcon,         mobileIcon: MapIcon,    desktopPriority: 'primary', mobilePriority: 'drawer'  },
  { id: 'today',     label: 'Today',         desktopIcon: Calendar,        mobileIcon: Clock,      desktopPriority: 'primary', mobilePriority: 'drawer'  },
  { id: 'customers', label: 'Subscriptions', mobileShortLabel: 'Subs', desktopIcon: DollarSign, mobileIcon: DollarSign, desktopPriority: 'primary', mobilePriority: 'drawer'  },
  { id: 'leads',     label: 'Pipeline',      desktopIcon: UserPlus,        mobileIcon: UserPlus,   desktopPriority: 'primary', mobilePriority: 'drawer'  },
  { id: 'guests',    label: 'Visibility',    mobileShortLabel: 'Vis',  desktopIcon: Mic,        mobileIcon: Mic,        desktopPriority: 'primary', mobilePriority: 'drawer'  },
  { id: 'org',       label: 'Org',           desktopIcon: Users,           mobileIcon: GitBranch,  desktopPriority: 'primary', mobilePriority: 'drawer'  },
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
  { id: 'acquisition', label: 'Growth', desktopIcon: Rocket,         mobileIcon: Rocket,        desktopPriority: 'primary', mobilePriority: 'primary' },
  { id: 'os',        label: 'OS',      desktopIcon: Server,          mobileIcon: Server,        desktopPriority: 'primary', mobilePriority: 'drawer'  },
  { id: 'customers', label: 'Subscriptions', mobileShortLabel: 'Subs', desktopIcon: DollarSign, mobileIcon: DollarSign, desktopPriority: 'drawer', mobilePriority: 'drawer' },
  // Simplified IA keeps six destinations, so the map sits in the drawer next to
  // Subscriptions rather than taking a seventh primary slot.
  { id: 'growth',    label: 'Growth map', desktopIcon: MapIcon,       mobileIcon: MapIcon,       desktopPriority: 'drawer',  mobilePriority: 'drawer'  },
]

export const TABS: TabDef[] = isSimplifiedIA() ? SIMPLIFIED_TABS : LEGACY_TABS

// Explicit bottom-bar order: Home first, then the three critical sections in
// importance order (Content, People/Network, Growth). Decoupled from the
// desktop sidebar order. Keep in sync with the `mobilePriority: 'primary'`
// flags above.
const MOBILE_PRIMARY_ORDER: readonly string[] = isSimplifiedIA()
  ? ['home', 'content', 'people', 'acquisition']
  : ['home', 'content', 'relationships', 'acquisition']

export const DESKTOP_PRIMARY_TABS = TABS.filter(t => t.desktopPriority === 'primary')
export const DESKTOP_DRAWER_TABS  = TABS.filter(t => t.desktopPriority === 'drawer')
export const MOBILE_PRIMARY_TABS  = MOBILE_PRIMARY_ORDER.map(id => TABS.find(t => t.id === id)!)
export const MOBILE_DRAWER_TABS   = TABS.filter(t => !MOBILE_PRIMARY_ORDER.includes(t.id))

export const VALID_TAB_IDS = new Set(TABS.map(t => t.id))
