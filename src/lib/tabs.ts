import {
  LayoutDashboard, Home, Calendar, Clock, UserPlus, DollarSign, Mic, FileText,
  Users, GitBranch, Brain, Activity, Workflow, Zap, Server,
  HeartHandshake, TrendingUp,
  type LucideIcon,
} from 'lucide-react'

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
// Mobile primary set: Home + the three high-value sections the phone is actually
// used for — Content, Visibility, Leads (relationships). Everything else (Today,
// Triage, Services, Subscriptions, Bets, Org, Intel, Flows, Systems) lives in the
// "More" drawer. Fewer primary tabs (4 + More) gives each thumb target more room.
// The bottom-bar order is set explicitly via MOBILE_PRIMARY_ORDER below so it can
// differ from the desktop sidebar order without disturbing it.
//
// Desktop drawer demotions: Bets (read-mostly, low action density) and Intel
// (insight-only, no action) move out of the primary sidebar to reduce IA load;
// they remain accessible under the "More" drawer.
//
// Growth (the ICP touchpoint map, creative board, council and GEO probes) is a
// desk surface: dense tables, a kanban and inline editing. It sits in the
// desktop sidebar next to Content and in the mobile "More" drawer, since the
// phone is not where the map gets rescored.
export const TABS: TabDef[] = [
  { id: 'home',      label: 'Home',          desktopIcon: LayoutDashboard, mobileIcon: Home,       desktopPriority: 'primary', mobilePriority: 'primary' },
  { id: 'today',     label: 'Today',         desktopIcon: Calendar,        mobileIcon: Clock,      desktopPriority: 'primary', mobilePriority: 'drawer'  },
  { id: 'leads',     label: 'Pipeline',      desktopIcon: UserPlus,        mobileIcon: UserPlus,   desktopPriority: 'primary', mobilePriority: 'drawer'  },
  { id: 'relationships', label: 'Network',   desktopIcon: HeartHandshake,  mobileIcon: HeartHandshake, desktopPriority: 'primary', mobilePriority: 'primary' },
  { id: 'customers', label: 'Subscriptions', mobileShortLabel: 'Subs', desktopIcon: DollarSign, mobileIcon: DollarSign, desktopPriority: 'primary', mobilePriority: 'drawer'  },
  { id: 'guests',    label: 'Visibility',    mobileShortLabel: 'Vis',  desktopIcon: Mic,        mobileIcon: Mic,        desktopPriority: 'primary', mobilePriority: 'primary' },
  { id: 'content',   label: 'Content',       desktopIcon: FileText,        mobileIcon: FileText,   desktopPriority: 'primary', mobilePriority: 'primary' },
  { id: 'growth',    label: 'Growth',        desktopIcon: TrendingUp,      mobileIcon: TrendingUp, desktopPriority: 'primary', mobilePriority: 'drawer'  },
  { id: 'org',       label: 'Org',           desktopIcon: Users,           mobileIcon: GitBranch,  desktopPriority: 'primary', mobilePriority: 'drawer'  },
  { id: 'exec',      label: 'Intel',         desktopIcon: Brain,           mobileIcon: Activity,   desktopPriority: 'drawer',  mobilePriority: 'drawer'  },
  { id: 'workflows', label: 'Flows',         desktopIcon: Workflow,        mobileIcon: Zap,        desktopPriority: 'drawer',  mobilePriority: 'drawer'  },
  { id: 'systems',   label: 'Systems',       desktopIcon: Server,          mobileIcon: Server,     desktopPriority: 'drawer',  mobilePriority: 'drawer'  },
]

// Explicit bottom-bar order: Home first, then the three sections in the order the
// user reads them. Decoupled from the TABS array order so the desktop sidebar is
// untouched. Keep in sync with the `mobilePriority: 'primary'` flags above.
const MOBILE_PRIMARY_ORDER = ['home', 'content', 'guests', 'relationships'] as const

export const DESKTOP_PRIMARY_TABS = TABS.filter(t => t.desktopPriority === 'primary')
export const DESKTOP_DRAWER_TABS  = TABS.filter(t => t.desktopPriority === 'drawer')
export const MOBILE_PRIMARY_TABS  = MOBILE_PRIMARY_ORDER.map(id => TABS.find(t => t.id === id)!)
export const MOBILE_DRAWER_TABS   = TABS.filter(t => !MOBILE_PRIMARY_ORDER.includes(t.id as typeof MOBILE_PRIMARY_ORDER[number]))

export const VALID_TAB_IDS = new Set(TABS.map(t => t.id))
