import {
  LayoutDashboard, Home, Calendar, Clock, UserPlus, DollarSign, Mic, Target, FileText,
  Users, GitBranch, Brain, Activity, Workflow, Zap, Server,
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

// Canonical 11-tab IA. URL ids preserved for bookmark compatibility; labels follow
// the rename pass (Leads -> Services, Customers -> Subscriptions, Guests -> Visibility).
// Content is the new tab.
export const TABS: TabDef[] = [
  { id: 'home',      label: 'Home',          desktopIcon: LayoutDashboard, mobileIcon: Home,       desktopPriority: 'primary', mobilePriority: 'primary' },
  { id: 'today',     label: 'Today',         desktopIcon: Calendar,        mobileIcon: Clock,      desktopPriority: 'primary', mobilePriority: 'primary' },
  { id: 'leads',     label: 'Services',      desktopIcon: UserPlus,        mobileIcon: UserPlus,   desktopPriority: 'primary', mobilePriority: 'primary' },
  { id: 'customers', label: 'Subscriptions', mobileShortLabel: 'Subs', desktopIcon: DollarSign, mobileIcon: DollarSign, desktopPriority: 'primary', mobilePriority: 'primary' },
  { id: 'guests',    label: 'Visibility',    mobileShortLabel: 'Vis',  desktopIcon: Mic,        mobileIcon: Mic,        desktopPriority: 'primary', mobilePriority: 'primary' },
  { id: 'content',   label: 'Content',       desktopIcon: FileText,        mobileIcon: FileText,   desktopPriority: 'primary', mobilePriority: 'drawer'  },
  { id: 'bets',      label: 'Bets',          desktopIcon: Target,          mobileIcon: Target,     desktopPriority: 'primary', mobilePriority: 'drawer'  },
  { id: 'org',       label: 'Org',           desktopIcon: Users,           mobileIcon: GitBranch,  desktopPriority: 'primary', mobilePriority: 'drawer'  },
  { id: 'exec',      label: 'Intel',         desktopIcon: Brain,           mobileIcon: Activity,   desktopPriority: 'primary', mobilePriority: 'drawer'  },
  { id: 'workflows', label: 'Flows',         desktopIcon: Workflow,        mobileIcon: Zap,        desktopPriority: 'primary', mobilePriority: 'drawer'  },
  { id: 'systems',   label: 'Systems',       desktopIcon: Server,          mobileIcon: Server,     desktopPriority: 'primary', mobilePriority: 'drawer'  },
]

export const DESKTOP_PRIMARY_TABS = TABS.filter(t => t.desktopPriority === 'primary')
export const DESKTOP_DRAWER_TABS  = TABS.filter(t => t.desktopPriority === 'drawer')
export const MOBILE_PRIMARY_TABS  = TABS.filter(t => t.mobilePriority === 'primary')
export const MOBILE_DRAWER_TABS   = TABS.filter(t => t.mobilePriority === 'drawer')

export const VALID_TAB_IDS = new Set(TABS.map(t => t.id))
