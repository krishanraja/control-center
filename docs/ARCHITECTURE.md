# Architecture

## System Overview

Control Center is the human interface layer of MindMaker OS v3 — an event-driven autonomous organisation operating system. It provides real-time visibility into agent operations, task management, and system health.

## Core Principles

1. **Event-Driven**: All state changes flow through Supabase, triggering webhooks that wake N8N agents
2. **Realtime-First**: UI subscribes to `postgres_changes` for instant updates
3. **CEO-Optimized**: Every view is designed for quick executive decision-making
4. **Mobile + Desktop**: Single codebase, responsive breakpoint at 900px

## Component Architecture

```
src/
├── App.tsx                    # Root component, routing, responsive logic
├── components/
│   ├── DesktopSidebar.tsx    # Desktop navigation with system health indicator
│   ├── BottomNav.tsx         # Mobile navigation
│   ├── CommandPalette.tsx    # Cmd+K quick actions
│   ├── ErrorBoundary.tsx     # Graceful error handling per tab
│   ├── InlineActions.tsx     # Task action buttons (Approve, Reject, Done, etc.)
│   ├── SplitPane.tsx         # Master-detail layout
│   ├── SystemsPanel.tsx      # Infrastructure health monitoring
│   ├── shared/
│   │   ├── AgentAvatar.tsx   # Consistent agent avatars
│   │   ├── StatusPill.tsx    # Status badges
│   │   └── SectionHeader.tsx # Section titles with icons
│   └── desktop/
│       ├── DesktopHome.tsx   # Command center dashboard
│       ├── DesktopToday.tsx  # Today's priorities
│       ├── DesktopPlans.tsx  # Full task backlog
│       ├── DesktopOrg.tsx    # Agent hierarchy
│       ├── DesktopExec.tsx   # Strategic metrics
│       └── DesktopFlows.tsx  # Workflow monitoring
├── hooks/
│   └── useRealtimeTasks.ts   # Realtime task subscription hook
└── lib/
    └── supabase.ts           # Supabase client configuration
```

## Data Flow

### Read Path (UI → Data)

1. Component mounts
2. Initial data fetch via Supabase REST API
3. Subscribe to `postgres_changes` channel
4. UI updates on every INSERT/UPDATE/DELETE

### Write Path (UI → Agents)

1. User clicks action button (e.g., "Approve")
2. `InlineActions` calls `supabase.from('tasks').update({...})`
3. Supabase webhook (pg_net) fires
4. N8N workflow receives webhook payload
5. Agent processes task and updates Supabase
6. UI receives realtime update

```
User Action → Supabase Update → Webhook → N8N Agent → Supabase Update → UI Refresh
```

## Responsive Design

| Viewport | Layout | Navigation |
|----------|--------|------------|
| < 900px | Single column, stacked | Bottom nav bar |
| ≥ 900px | Multi-column, split pane | Left sidebar |

The breakpoint is controlled in `App.tsx`:

```typescript
function detectIsNarrow() {
  return window.innerWidth < 900
}
```

## State Management

- **Local State**: React `useState` for UI state (selected items, filters)
- **Server State**: Supabase realtime subscriptions (tasks, agents, etc.)
- **No Redux/Zustand**: Intentionally simple — data lives in Supabase

## Error Handling

Each tab is wrapped in `ErrorBoundary` with:
- Graceful fallback UI
- Retry button
- Error message display
- No cascading failures

## Performance Considerations

1. **Shared Realtime Channel**: `useRealtimeTasks` uses a single module-level Supabase channel (`tasks-rt-shared`) and a shared cache. Every mount subscribes through the cache and filters client-side — there is at most one `tasks` channel per browser session regardless of how many consumers.
2. **Memoization**: Heavy computations (filtering, grouping) use `useMemo`
3. **Lazy Loading**: Components render only when their tab is active
4. **Optimistic Updates**: Actions update UI immediately, then sync with server
