# Component Library

## Layout Components

### `App.tsx`

Root component handling:
- Responsive breakpoint detection (900px)
- Tab state management
- Keyboard shortcuts (Cmd+K for command palette)

```tsx
// Responsive detection
const narrow = window.innerWidth < 900

// Conditional rendering
{!narrow && <DesktopSidebar />}
{narrow && <BottomNav />}
```

### `SplitPane`

Master-detail layout for list views.

```tsx
<SplitPane 
  left={<TaskList />} 
  right={<TaskDetail />}
  hasSelection={!!selectedId}
  onBack={() => setSelectedId(null)}
/>
```

Props:
- `left`: List/master content
- `right`: Detail content
- `hasSelection`: Controls mobile detail view
- `onBack`: Mobile back button handler

### `ErrorBoundary`

Graceful error handling per tab.

```tsx
<ErrorBoundary label="Home">
  <DesktopHome />
</ErrorBoundary>
```

Displays:
- Error icon
- Tab name that failed
- Error message
- Retry button

## Navigation Components

### `DesktopSidebar`

Left sidebar for desktop (≥900px).

Features:
- Collapsible (hover to expand)
- System health indicator on "Systems" nav item
- MRR display in footer
- Active state highlighting

### `BottomNav`

Bottom navigation for mobile (<900px).

Features:
- Fixed position
- Icon + label for each tab
- Active state with accent color

### `CommandPalette`

Cmd+K quick actions overlay.

Features:
- Fuzzy search
- Tab navigation
- Keyboard-first interaction

## Shared Components

### `AgentAvatar`

Consistent agent avatar display.

```tsx
<AgentAvatar agent="arlo" size="sm" />
<AgentAvatar agent="agatha" size="md" />
```

Props:
- `agent`: Agent slug (determines color)
- `size`: `sm` (24px), `md` (32px), `lg` (40px)

### `StatusPill`

Status badge with semantic colors.

```tsx
<StatusPill status="active" />
<StatusPill status="blocked" />
<StatusPill status="needs_you" />
```

Colors:
- `active`: Green
- `in_progress`: Blue
- `waiting`/`needs_you`: Amber (pulsing)
- `blocked`: Red
- `done`: Gray

### `SectionHeader`

Section title with icon and optional count.

```tsx
<SectionHeader 
  icon={AlertTriangle} 
  label="Needs You" 
  count={11} 
/>
```

### `InlineActions`

Task action buttons that trigger Supabase updates.

```tsx
<InlineActions 
  taskId={task.id} 
  currentStatus={task.status} 
/>
```

Actions:
- **Done**: Sets `status: 'done'`, `completed_at`
- **Approve**: Sets `status: 'active'`, `krish_reviewed: true`
- **Reject**: Sets `status: 'blocked'`
- **Note**: Opens note input
- **Needs Revision**: Sets status for rework
- **Add to Tomorrow**: Schedules for next day

## Page Components

### `DesktopHome`

Command center dashboard with:
- Revenue Pulse (intelligence brief)
- Operational metrics (4 cards)
- Weekly Goals with progress bars
- Needs You (waiting tasks)
- Market Signals (BD signals feed)
- Aging Blockers (tasks blocked 3+ days)
- Venture Health (tasks per venture)
- Live Activity (audit log feed)

### `DesktopToday`

Today's priorities:
- Tasks with `status: 'waiting'` or `!krish_reviewed`
- Master-detail split pane
- Inline actions in detail view
- Document links section

### `DesktopPlans`

Full task backlog:
- Status filter pills
- Venture filter pills (when ventures exist)
- Task cards with external link icons
- Detail pane with notes, next step, documents

### `DesktopOrg`

Agent hierarchy:
- Grouped by pod (Executive, Operations, Growth)
- Agent cards with workload indicators
- Real-time task counts (active, waiting, blocked)

### `DesktopExec`

Strategic metrics:
- KPI cards (tracked, workflow runs, spend, active agents)
- Revenue & Pipeline chart
- Agent Economics (workflow costs)
- Intelligence Feed

### `DesktopFlows`

Workflow monitoring:
- N8N workflow table
- Pending proposals from agents

### `SystemsPanel`

Infrastructure health:
- Status summary (healthy, warning, down counts)
- System cards with status indicators
- Last check timestamps
- Refresh button

## Hooks

### `useRealtimeTasks`

Real-time task subscription with filtering.

```tsx
const { tasks, loading, refresh } = useRealtimeTasks({
  statusIn: ['waiting', 'blocked'],
  filter: (t) => t.agent !== 'bd-agent'
})
```

Options:
- `statusIn`: Filter by status values
- `filter`: Custom filter function

Returns:
- `tasks`: Array of TaskRow
- `loading`: Boolean loading state
- `refresh`: Manual refresh function

## Styling Patterns

### Colors

```css
/* Background */
bg-[#0a0a0b]           /* App background */
bg-white/[0.02]        /* Card background */
bg-white/[0.03]        /* Card hover */

/* Borders */
border-white/[0.06]    /* Default border */
border-white/[0.14]    /* Hover border */
border-violet-500/40   /* Selected border */

/* Text */
text-white             /* Primary text */
text-white/70          /* Secondary text */
text-white/45          /* Tertiary text */
text-white/25          /* Muted text */

/* Accents */
text-violet-400        /* Primary accent */
text-emerald-400       /* Success/active */
text-amber-400         /* Warning/waiting */
text-rose-400          /* Error/blocked */
text-cyan-300          /* Venture tags */
```

### Typography

```css
text-[10px]   /* Labels, metadata */
text-[11px]   /* Small text */
text-[12px]   /* Body small */
text-[13px]   /* Body */
text-[15px]   /* Large body */
text-xl       /* Headings */
text-2xl      /* Page titles */

font-mono     /* Numbers, IDs */
tabular-nums  /* Aligned numbers */
tracking-tight /* Headings */
tracking-[0.16em] /* Uppercase labels */
```

### Spacing

```css
gap-1.5       /* Tight spacing */
gap-2         /* Default spacing */
gap-3         /* Medium spacing */
gap-4         /* Section spacing */
gap-6         /* Large spacing */

p-3           /* Card padding */
p-4           /* Section padding */
px-6 py-6     /* Desktop content padding */
px-3 py-4     /* Mobile content padding */
```
