# Component Library

> **Scope.** Component patterns and usage for the React UI. Not a complete
> API reference — for that, read the source. Use this doc to orient
> yourself: what lives where, what the layout primitives are, and what
> conventions to follow when adding a new surface.
>
> **Not in this document.** Per-tab data contracts live in
> [`PRODUCT.md`](./PRODUCT.md). Realtime subscription rules live in
> [`ARCHITECTURE.md`](./ARCHITECTURE.md) and [ADR-002](./DECISIONS/002-shared-realtime-channel.md).

## Layout

### `App.tsx`

Root component. Handles:
- Hash-based routing via `useHashRoute` (`#home`, `#today`, `#leads`, ...).
- Responsive breakpoint detection (`< 900px` → mobile, otherwise desktop).
- Keyboard shortcuts: Cmd+K (command palette), Esc (close palette).
- Per-tab `ErrorBoundary` wrapping.

```tsx
type TabId = 'home' | 'today' | 'leads' | 'customers' | 'guests'
           | 'content' | 'bets' | 'org' | 'exec' | 'workflows' | 'systems'
```

The `exec` and `workflows` tab IDs are routing-only — they're labelled
"Intel" and "Flows" in the UI for historical reasons (see
[`AGENTS.md`](./AGENTS.md)). Don't rename without a migration plan for
existing bookmarks.

### `DesktopSidebar`

Persistent left sidebar for `≥ 900px`. Renders tab nav with the system
health dot and the MRR footer.

### `BottomNav`

Persistent bottom nav for `< 900px`. Fixed position, icon + label per
tab, active state with accent.

### `SplitPane`

Master-detail layout primitive used by Today, Org. Mobile pushes a
detail view with a back button; desktop renders side-by-side.

```tsx
<SplitPane
  left={<TaskList />}
  right={<TaskDetail />}
  hasSelection={!!selectedId}
  onBack={() => setSelectedId(null)}
/>
```

### `AppFrame` — no-scroll app shell (2026-06-11)

`components/shared/AppFrame.tsx`. The whole app is a fixed-viewport, **no-scroll**
frame: the window never scrolls. `App.tsx` root is `h-[100dvh] overflow-hidden`
and `main` is `flex-1 overflow-hidden`; chrome (sidebar / bottom nav / tab header)
stays pinned and each tab owns its own inner scroll in a contained region. Desktop
non-content tabs render in a `h-full overflow-y-auto px-6 py-6` wrapper; the Content
tab uses `AppFrame` (fixed header / contained body / optional footer, `scroll='auto'|'none'`);
mobile uses each tab's `h-[100dvh]` `MobileShell` (which gained `scroll='none'` + a
`footer` slot for the triage deck). Do **not** reintroduce window scroll or `100vh`
height math at the tab root — size children with `h-full` / `flex-1 min-h-0` inside
the contained region.

```tsx
<AppFrame header={<TabHeader />} scroll="auto" padded>
  {content}
</AppFrame>
```

### `ErrorBoundary`

Per-tab catch-all. Renders an error icon + tab label + message + retry.
Every tab is wrapped, so a failure in one tab does not white-screen the
app.

```tsx
<ErrorBoundary label="Leads">
  <DesktopLeads ... />
</ErrorBoundary>
```

## Tab roots

Each tab has a `Desktop*` and `Mobile*` root. They share data hooks but
differ in layout density.

| Tab | Desktop root | Mobile root |
|---|---|---|
| Home | `DesktopHome` | `MobileHome` |
| Today | `DesktopToday` | `MobileToday` |
| Leads | `DesktopLeads` | `MobileLeads` |
| Customers | `DesktopCustomers` | `MobileCustomers` |
| Guests | `DesktopGuests` | `MobileGuests` |
| Content | `DesktopContent` | `MobileContent` |
| Bets | `DesktopBets` | `MobileBets` |
| Org | `DesktopOrg` | `MobileOrg` |
| Intel (exec) | `DesktopExec` | `MobileIntel` |
| Flows (workflows) | `DesktopFlows` | `MobileFlows` |
| Systems | `SystemsPanel` (desktop only) | `MobileSystems` |

Tab roots should be *layout-only* — pull data from hooks, render presentational components,
do not own business logic. Hand mutations down via props or read them from
a context (e.g. `AgentsContext` for agent lookups).

### Content tab — triage deck + composer

The Content tab is **mode-switched by active backlog size** (`useContentTriage`, hysteresis: enter triage > 30, exit ≤ 25):

- **Triage mode (> 30) —** `components/content/TriageDeck.tsx` + `TriageCard.tsx`: a one-card-at-a-time swipe deck over the whole active backlog. **Left = Drop** (undoable), **right = Advance one stage** (`seeded→researching→drafting→review`; `review`/`approved` open the Composer — human gates, never auto-crossed), **tap/↑ = open Composer**. Pointer swipe (`useCardDeck`, deferred capture so vertical scroll isn't hijacked) + on-screen buttons + arrow keys, identical on phone and desktop; only ~3 cards mount at once (the fix for the ~218-card crash). Drop is undoable (toast action + `U` key); commits are optimistic via a session committed-id set, keyed by `idea.id`.
- **Action mode (≤ 30) —** desktop lanes (`ContentIdeaCardActionable`, **bounded** per state by `LANE_CAP`, overflow → triage); `MobileContent` shows a **Ready for you** tier + a **Drafts** tier + an **upstream count** entry; the all-clear empty state is gated on `activeCount === 0` (no more false "You're clear").

The detail surface is a **full-screen takeover**, not a master-detail panel: `ContentComposer` (`components/content/ContentComposer.tsx`) mounts as a fixed overlay from `App.tsx` whenever `tab === 'content'` and `route.params.idea` is set (cards/deck open it by setting `#/content?idea=<id>`; Esc clears the param; the deck freezes its keyboard while the Composer is open). It owns one piece of content: a draft canvas plus a single-panel rail (Cleo chat · Refine · Materials · Research · Standards), one **Save Draft** CTA, and draft autosave via the API (never the anon client — RLS blocks anon writes to `content_ideas`). The retired `ContentEnginePanel` / `ResearchAndTransform` inline stack is gone. On `narrow`, the composer renders a **review-first** body (read mode + one-tap magic adjustments + sticky Save Draft). See `MINDMAKER_OS_ARCHITECTURE.md` §5.7.

## Hooks

Realtime data hooks open one shared channel per table (ADR-002). Open it
once per browser session and fan out via context if needed.

| Hook | Source | Channel |
|---|---|---|
| `useRealtimeTasks` | `tasks` | `tasks-rt-shared` |
| `useRealtimeLeads` | `leads` | `leads-rt-shared` |
| `useRealtimeGuests` | `guests` | `guests-rt-shared` |
| `useRealtimeContentIdeas` | `content_ideas` | `content-ideas-rt-shared` |
| `useRealtimeDecisionsWaiting` | `decisions_waiting` view | `decisions-rt-shared` |
| `useVisibilityTargets` | `visibility_targets` | `visibility-rt-shared` |
| `useCustomers` | `customers` | `customers-rt-shared` |
| `useCustomerContacts` | `customer_contacts` | `customer-contacts-rt-shared` |
| `useBets` | `bets` | `bets-rt-shared` |
| `useCriticalAlerts` | `silent_failures` tier 3 | `critical-alerts` |
| `useHomeIntelligence` | `home_intelligence` | `home-intelligence-rt-shared` |
| `useAgents` | `agents` (cached, low-volume) | One-shot + 60s refresh |
| `useVentureRegistry` | `venture_registry` | One-shot + 60s refresh |
| `useNovaConferences` | `nova_target_conferences` (legacy, kept for safety) | Polled |
| `useLiveStatus` | `/api/status` | 60s poll |
| `usePendingCorrections` | `corrections` | Polled |
| `useRevenueAttribution` | `customers` aggregated | Derived |
| `useStreaks` | `tasks` + `leads` + `content_ideas` | Derived |
| `useSwipeActions` | — | Touch gesture handler (legacy, touch-only) |
| `useCardDeck` | — | Pointer/keyboard swipe deck (touch+mouse+pen, deferred capture, fly-out) |
| `useContentTriage` | `content_ideas` (via `useRealtimeContentIdeas`) | Content tab mode + triage deck state (advance/drop/undo) |
| `useHaptics` | — | Mobile haptic feedback |
| `useHashRoute` | `window.location.hash` | Router |

### Shape

```tsx
const { tasks, loading, refresh } = useRealtimeTasks({
  statusIn: ['waiting', 'blocked'],
  filter: (t) => t.agent !== 'system'
})
```

Return shape is consistent: `{ <items>, loading, refresh }`. Hooks that
don't fetch a list (e.g. `useCriticalAlerts`) return the same shape with
appropriate field names.

## Shared primitives

### `AgentAvatar`

Consistent agent avatar with deterministic colour from the slug.

```tsx
<AgentAvatar agent="cleo" size="md" />
```

Sizes: `sm` (24px), `md` (32px), `lg` (40px). Reads from
`AgentsContext` to look up the display name.

### `StatusPill`

Status badge with semantic colour.

```tsx
<StatusPill status="active" />
<StatusPill status="blocked" />
<StatusPill status="waiting" />
```

Colour map:
- `active` / `in_progress` → emerald
- `waiting` / `needs_you` → amber (pulsing)
- `blocked` → rose
- `done` → muted gray
- `pending-agatha-review` / `pending-review` → violet

### `SectionHeader`

Section title with icon + optional count.

```tsx
<SectionHeader icon={AlertTriangle} label="Needs You" count={11} />
```

### `InlineActions`

Task action buttons that mutate Supabase. Used in Today, Plans, Leads
detail panes, the LeadCard, the GuestCard, and Intel.

Action vocabulary (do not invent synonyms):
- **Approve** → `status='in_progress'` (or content-specific accept path), `krish_reviewed=true`
- **Reject** → `status='blocked'`, `feedback_text=<text>`
- **Done** → `status='done'` (DB trigger stamps `completed_at`)
- **Note** → opens note input → `krish_notes=<text>`
- **Flag** → opens `FlagAgentModal`
- **Defer** → updates `due_date`
- **Kill** → `status='superseded'` (Home KillListModal only)

Every action writes an `audit_log` row via `logKrishAction` (standard:
action provenance).

### `Toast` / `ToastProvider`

Wraps the app at root. Toast on action success/failure, never on routine
reads.

```tsx
const toast = useToast()
toast.success('Lead promoted')
toast.error('Promote failed — check console')
```

### `CommandPalette`

Cmd+K overlay. Fuzzy search over actions + agents + tasks.

### `QuickCaptureIdea`

Cmd+I overlay. Always available; rendered at App root. POSTs to the Cleo
idea-capture webhook. Hard contract on insert: `is_idea=true`,
`confidence >= 0.5`.

### `PendingFlagModal`

Renders at App root. Surfaces unresolved Krish flags on session start.
Cannot be silently dismissed — flag must be acknowledged or resolved.

### `KillListModal`

Auto-opens on Home when ≥ 5 tasks are untouched for 21+ days. Krish
either revives them (resets `updated_at`) or kills them
(`status='superseded'`).

### `FeedbackButton`

Reject + reason button on tasks / leads / guests / visibility / ideas.
Writes to `feedback_queue`. Consumed by Vera Feedback Aggregation
(Sun 06:00 UTC) → `corrections` → Agatha brief edits.

## Lane components

Each pipeline tab uses lane components to group rows.

| Component | Tab | Groups by |
|---|---|---|
| `LeadVentureLane` | Leads | `primary_venture` from `venture_registry` |
| `LeadSourceLane` | Leads (alt view) | Lead source / channel |
| `GuestStatusLane` | Guests | `status` enum (`new` / `enriched` / `confirmed` / `skipped` / `done`) |
| `VisibilityTargetLane` | Guests (visibility view) | `status` enum |
| `PipelineLane` | Home (legacy) | Workstream classification |
| `PipelineQueue` | Home (legacy) | Workstream classification |
| `OsHealthStrip` | Home | — (rolls up plans/today/systems/running/errors) |

## Styling

### Colours

```css
/* Background */
bg-[#0a0a0b]           /* App background (near-black) */
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
text-violet-400        /* Primary accent (Krish actions, selection) */
text-emerald-400       /* Success / active */
text-amber-400         /* Warning / waiting */
text-rose-400          /* Error / blocked / critical */
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

font-mono     /* Numbers, IDs, hashes */
tabular-nums  /* Aligned numbers in tables */
tracking-tight /* Headings */
tracking-[0.16em] /* Uppercase section labels */
```

### Spacing

```css
gap-1.5       /* Tight (chip rows) */
gap-2         /* Default */
gap-3         /* Medium (card content) */
gap-4         /* Section */
gap-6         /* Large (between major regions) */

p-3           /* Card padding */
p-4           /* Section padding */
px-6 py-6     /* Desktop content padding */
px-3 py-4     /* Mobile content padding */
```

## Conventions for new components

1. **Functional + hooks only.** No class components.
2. **Subscriptions cleaned up in `useEffect` return.** Otherwise channels
   leak and Supabase concurrency limits hit.
3. **Use shared realtime channels.** Do not open a second `tasks`
   channel for a new component — pull from `useRealtimeTasks` and filter
   client-side.
4. **Mobile parity.** A new tab needs both a `Desktop*` and `Mobile*`
   root. Below 900px the same primary information must surface.
5. **Empty ≠ broken.** Distinguish "nothing happened yet" from "failed to
   load." Calm phrases, not spinners.
6. **Audit-log every Krish action.** `actor='krish'`, meaningful
   `event_type`.
7. **No `any`.** TypeScript strict mode is on; use `unknown` if truly
   unknown.
8. **Document data flow in PRODUCT.md.** When you add a new component to
   a tab, update [`PRODUCT.md`](./PRODUCT.md) so the data feeding it is
   documented.
