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
- Hash-based routing via `useHashRoute` (`#home`, `#people`, `#content`, ...).
- Responsive breakpoint detection (`< 900px` → mobile, otherwise desktop).
- Keyboard shortcuts: Cmd+K (command palette), Esc (close palette).
- Per-tab `ErrorBoundary` wrapping; each tab is its own lazy chunk.

Valid tab ids derive from the registry in `src/lib/tabs.ts`
(`VALID_TAB_IDS`). The simplified six-destination IA is committed
(`isSimplifiedIA()` returns `true`, no flag): `home`, `content`, `people`,
`growth`, `os`, `focus`, plus `customers` (labelled Subscriptions) in the
drawer. Legacy hashes (`#leads`, `#guests`, `#today`, `#bets`,
`#acquisition`, ...) resolve through the alias layer in `App.tsx`, so old
bookmarks and `navigate()` call sites keep working — never remove an alias
without a migration plan.

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

Destinations either share one root across device classes (passed `narrow` /
`variant`) or split into `Desktop*` / `Mobile*` roots sharing the data hooks.

| Destination | Root(s) |
|---|---|
| Home | `DesktopHome` / `MobileHome` |
| Content | `content-v2/ContentV2Tab` (both classes; v1 `DesktopContent` / `MobileContent` behind the flag) |
| People | `people/PeopleTab` → lanes Pipeline (`DesktopLeads` / `MobileLeads`), **Network** (`network/NetworkTab`, both classes — the default lane), Visibility (`DesktopGuests` / `MobileGuests`) |
| Growth | `growth/GrowthTab` (both classes, five sections) |
| OS | `os/OsTab` → Queue / Org / Intel / Flows / Systems subtabs (`DesktopOrg`, `DesktopExec`, `DesktopFlows`, `SystemsPanel`, ... as subtab bodies) |
| Focus | `focusPurpose/FocusPurposeTab` (`variant="desktop" \| "mobile"`) |
| Subscriptions | `DesktopCustomers` / `MobileCustomers` (drawer) |

The old standalone tab roots (`DesktopToday`, `MobileBets`, ...) survive only
as lane / subtab bodies or aliases behind these seven destinations.

Tab roots should be *layout-only* — pull data from hooks, render presentational components,
do not own business logic. Hand mutations down via props or read them from
a context (e.g. `AgentsContext` for agent lookups).

### Content tab — triage deck + composer

> **Live path: Content Engine v2.** With `VITE_CONTENT_V2_ENABLED` (ON in
> prod) the tab renders `content-v2/ContentV2Tab` instead: rooms **Built /
> Paid / Library**, and on mobile a **Queue** view first — the finite
> decision deck (`MobileDecisionDeck`) — with the rooms as sibling segments
> (test ids `content-room-<id>`). The v1 surface below still exists behind
> the flag; see [`CONTENT-ENGINE-V2-SPEC.md`](./CONTENT-ENGINE-V2-SPEC.md)
> and `MINDMAKER_OS_ARCHITECTURE.md` §5.8 for v2.

The v1 Content tab is **mode-switched by active backlog size** (`useContentTriage`, hysteresis: enter triage > 30, exit ≤ 25):

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
| `useHaptics` | — | Haptic vocabulary (Web Vibration API; no-op on iOS/desktop). `tap`/`select`/`success`/`warning`/`error`/`heavy` + impact family (`impactLight`/`impactMedium`/`impactRigid`/`soft`), `notifySuccess`, and the `press` primitive `usePressable` uses |
| `useHashRoute` | `window.location.hash` | Router |
| `useGoalCanon` | `goals` via `GET /api/goals/ladder` | Shared singleton + `goals` realtime; writes go through `src/lib/goalsApi.ts` only |
| `useKeyboardInset` | `window.visualViewport` | On-screen keyboard height in physical CSS px (0 when closed). Applied automatically by `ui/dialog` to bottom/responsive sheets; raw consumers divide by `var(--z, 1)` |

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

### `ChipOverflow`

A chip group that does not grow without bound. The few options that matter
render inline; the rest go behind a `+N` into a content-height bottom sheet that
leaves the page visible behind it. Anything SELECTED stays inline regardless of
rank, because a filter you cannot see is a filter you forget is on.

Use it wherever a set of options outgrows one line on a phone: 72 countries in
the network filter, seven ventures on a contact. The three alternatives are all
worse — rendering everything pushes the content below the fold, wrapping to four
lines does the same more slowly, and truncating hides options with no way back
to them.

```tsx
<ChipOverflow
  items={[{ id: 'GB', label: 'UK', fullLabel: 'United Kingdom', meta: '382' }]}
  selected={countries} onToggle={toggle}
  inline={3} title="Countries" testIdPrefix="network-geo"
  emptyNote="6,392 people have no location on file."
/>
```

`single` makes it one-at-a-time (radio rows, sheet closes on pick), `busy`
disables everything while a write is in flight, `emptyNote` states what the
options do NOT cover. Deliberately not a `<select>`: a native picker cannot show
counts, cannot multi-select on iOS without a modal anyway, and opens at the top
of the screen rather than under the thumb.

### `ContactEditChips`

Every edit you can make to a person, in one component, used by both the network
person sheet (live) and `LeadSheet` (only rendered when `isUiV2()` is false).
Venture and status, optimistic, reverting the chip on a failed write.

Adding an editable field here is a line in a list rather than a layout decision
taken twice. It replaced a native `<select>` carrying seven options at 12px,
which is why there had only ever been one editable field.

`status: 'do_not_contact'` is the one with teeth — `network_search` hard-filters
it and `networkScore` drops them — so the UI states the consequence. Nothing
could set it per person before: `api/contacts/bulk.ts` and the desktop leads
table were the only routes, which is why all 10,767 contacts are `active`.

### `CreateSheet` — the one + button (2026-08-21)

The single mobile create system: a violet + FAB bottom-right on every tab,
opening a bottom sheet of the current tab's create actions first, then the
global captures (task, idea). Tab-owned actions are reached over the
`src/lib/quickCreate.ts` bus — `requestCreate(kind)` fires the matching
`useQuickCreateListener(kind, fn)` (kinds: `goal:os`, `goal:weekly`, `ask`,
`touchpoint`); self-contained flows (research, add a person, the captures)
mount their modal from the sheet itself. Mounted from `App.tsx` on the same
`narrow` state as the mobile shell; hidden while a full-screen overlay owns
the screen. **Never add an inline create button to a narrow viewport** — add
an action row here plus a listener in the owning component.

### `FocusedEditor` — editing text on a phone (2026-08-22)

`shared/FocusedEditor`: the write-side primitive. A BottomSheet with an
`Eyebrow` label, `VoiceField` (voice beside the keyboard), one full-width
Save that rides above the keyboard (the dialog layer applies
`useKeyboardInset` for it), and an optional destructive action behind "…"
that arms on the first tap and runs on the second. Mobile only — desktop
edits inline. `GoalLadder` uses it; every future mobile text edit should.

### `GoalPickers` — chips over dropdowns

`components/goals/GoalPickers.tsx`: `ServesPicker` (the parent OS goal as
full-width readable rows), `VentureChips`, and the general-purpose
`OptionChips` — the house replacement for any small-set `<select>` (adopted
by the ritual, the goal composer, add-person, touchpoints, the council card,
the creative board). Long dynamic chip labels are `text-left` + `truncate`;
a chip never wraps or centres. See DESIGN_SYSTEM.md "The write side".

### `IconTile` / `Eyebrow`

The two smallest primitives with the biggest drift history. `IconTile`
(sm / md / lg, neutral / accent) is THE circled icon; `Eyebrow` is THE
small-caps section label. Never hand-roll either — `scripts/check-icons.mts`
and `scripts/check-type-tokens.mts` fail the recognisable fakes in CI.

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

### Tactile interaction — `Pressable` / `usePressable` / `DrawnCheck`

The one place press feedback, haptics, and async-action choreography live,
so every interactive surface inherits them instead of re-implementing (or
skipping) them per call site. This is the "more haptic / more magical"
layer of the Calm & Anticipatory language, expressed as reusable code.

**Why a primitive at all.** Before this, a one-tap action button only shifted
colour on `:active`. It did not disable while its request was in flight, gave
no progress signal, and no earned confirmation — the toast was the only proof
anything happened. And haptics were wired by hand, so they drifted (present on
swipe decks, missing on pull-to-refresh, sheet dismiss, toggles, menus). One
primitive fixes the whole class of gaps at once.

`usePressable({ onPress, haptic='press', successHold=900, disabled })`
→ `{ state, bind, pressClass }` — the brain:
- Fires the haptic on **`pointerdown`**, not click — native controls buzz the
  instant your finger lands, before the click resolves.
- If `onPress` returns a **Promise**, runs the state machine
  `idle → pending → success | error`: the control is `disabled` + `aria-busy`
  in flight (no double-submit), then fires `success()` / `error()` haptics and
  settles back after `successHold`. The button — not the API helper — owns the
  tactile outcome, so haptics fire exactly once.
- `pressClass` is `press-effect` (active:scale-95), dropped under
  `useReducedMotion()`. Haptics still fire under reduced motion (haptics ≠
  motion).

`<Pressable variant onPress>` — the body. Renders the button and swaps content
by state: `pending` → the honest `.animate-indeterminate` rail; `success` →
`<DrawnCheck>` drawing itself over the label. Reads `useDeviceClass()` so the
device deltas live in one place: mobile keeps thumb-sized padding; desktop
tightens it and adds a `focus-visible` violet ring for keyboard nav. Variant
class strings are a superset of the old inline sheet buttons, so adoption is
behaviour-preserving.

`<DrawnCheck size stroke ring?>` — the shared self-drawing check (the
`.draw-check` keyframe), used by both `AllClear` (empty-state celebration) and
`Pressable` (post-action success).

Adopted by: `DetailSheet` and `DecisionDetail` action footers (the
`buildDecisionActions` registry — `src/lib/decisionActions.ts`, whose `run()`
now resolves/rejects so the button can choreograph), `FeedRow`, `HeroCard`,
`SidebarButton`. New tactile buttons should use `Pressable` rather than a raw
`<button>`; gesture handlers that aren't buttons (pull-to-refresh, sheet drag)
call the `useHaptics` methods directly.

### `AmbientField` (2026-07-01)

The Obsidian Aurora "presence" layer — a fixed aurora field + fine grain painted
behind all content. Mounted once at the App root. Hue reacts to OS state via
`useMoodSource(id, mood, priority)` (no new realtime channels); goes static under
reduced-motion and disappears when ambient is toggled off. See
[`DESIGN_SYSTEM.md`](./DESIGN_SYSTEM.md).

### `ThemeToggle` (2026-07-01)

The "at will" theme control: cycles System → Light → Dark and toggles the
experimental ambient layer. Backed by `useTheme()` / `src/lib/theme.ts`
(persisted, applied as `<html data-theme>` / `data-ambient`). Rendered in the
desktop sidebar footer, the mobile "More" drawer, and as ⌘K → Appearance actions.

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

> **Canonical source: [`DESIGN_SYSTEM.md`](./DESIGN_SYSTEM.md)** ("Obsidian
> Aurora"). The app is **adaptive light/dark** — everything below is a token,
> never a hardcoded hue.

### Colours (adaptive tokens)

```css
/* Surfaces — follow the theme (obsidian by night, paper by day) */
bg-base / bg-sunk       /* App / recessed background */
.glass-card / .surface  /* Lit card material (per-theme) */

/* Foreground — `white` is remapped to --fg, so these adapt automatically */
text-white              /* Primary text (ink on paper by day) */
text-white/70 · /45 · /25   /* Secondary · tertiary · muted */
border-white/[0.08]     /* Default hairline */
text-[#fff]             /* Pure white ON a coloured fill (does NOT adapt) */

/* Accent — aurora (violet ramp = brand anchor) */
text-accent · .aurora-btn · .aurora-text   /* focus / primary / hero number */
text-violet-400         /* brand accent (mapped to the aurora anchor) */

/* Semantics (meaning is fixed — never repurpose) */
text-emerald-400 /* active */  text-amber-400 /* waiting */
text-rose-400 /* blocked */    pod-ops/revenue/growth · status-* tokens
```

### Iconography

Icons import from `@/lib/icons` (never `lucide-react` directly — CI-guarded): a
wrapper pinning a constant 1.75px physical stroke and snapping sizes to
12/14/16/20/24/32. Circled icons use `shared/IconTile` (sm/md/lg,
neutral/accent). Active nav icons carry `strokeWidth={2.25}`.

### Typography

```css
font-display  /* Bricolage Grotesque — headings, hero titles, big numbers (auto on h1-h6) */
font-serif    /* Fraunces — the "partner's voice": OS mission, Marcus brief, AllClear */
font-sans     /* Geist — body, labels (default) */
font-mono tabular-nums  /* Geist Mono — live/tabular numbers */
/* Scale: 11/12/13/14/16/20/28/40/56 (role tokens text-micro…text-hero; bracket-literal px sizes retired 2026-08-21, guarded by scripts/check-type-tokens.mts) · tracking-tight headings · eyebrows are the <Eyebrow> primitive at tracking-[0.14em] */
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

---

## The primitive layer (`src/components/ui/`)

Vendored from Relume, re-skinned to Obsidian Aurora, owned here. See
[ADR-010](./DECISIONS/010-vendored-primitive-layer.md) for why the Relume
Tailwind preset, icon set and animation library are deliberately absent.

`ui/` sits **beneath** `shared/`. It is the implementation layer; `shared/` is
the product layer. Reach for `shared/` at a call site.

| Primitive | Notes |
|---|---|
| `Button` / `buttonVariants` | 8 variants, 6 sizes. The single definition of button colour; `Pressable` composes it. |
| `Card` | Variants map onto `.surface` / `.surface-2` / `.glass-card`, not re-invented with utilities. |
| `Input`, `Textarea` | The 16px floor on coarse pointers is enforced globally in `index.css`; do not fight it. `Input` forwards its ref to the `<input>`, not to the icon wrapper, so a caller owning a clear button can restore focus. |
| `Badge` | Neutral pill, colour in the text. Foregrounds are shade **200**. |
| `Dialog` | 4 positions: `center`, `right`, `bottom`, `responsive`. Portals into `.mobile-zoom-root`. |
| `DropdownMenu`, `Popover`, `Tooltip` | Same portal rule. |
| `Tabs` | Radix tabs, for surfaces whose panels can live inside one root. |

### The mobile zoom contract

`App.tsx` renders the whole mobile tree inside `.mobile-zoom-root`
(`zoom: 1.2`), which publishes `--z`. Radix portals to `document.body` by
default, which is **outside** that wrapper, so a menu would render at native
scale beside a 1.2x trigger.

Every portalled primitive here resolves `.mobile-zoom-root` and portals into it
when present, and sizes against `calc(100dvh / var(--z, 1))`. On desktop there
is no zoom root and `--z` is unset, so both fall back with no special-casing.

**If you add a portalled primitive, copy that.**

## `shared/Modal`: never hand-roll an overlay

Eleven surfaces used to hand-roll `<div className="fixed inset-0 ...">` with
their own scrim, centring and close path. Nine had no dialog role: nothing
announced them, Tab walked out into the page behind, the body kept scrolling,
focus was never returned.

Every **modal** now goes through this. The `fixed inset-0`s that remain are
deliberate non-modals (DesktopToday's and CreativeBoard's click-away scrims)
or full-screen takeovers carrying their own dialog role (the Focus ritual,
the composer shells), plus a few legacy dialogs that predate the primitive
(DesktopContent's schedule and sweep, `IdeaCaptureModal`) — migrate those
when you touch them; never copy them. `CaptureSpeedDial`, the old two-item
+ menu, is gone: `CreateSheet` replaced it (2026-08-21).

```tsx
<Modal open={open} onClose={close} title="Flag firing soon" variant="responsive">
  {/* your existing body markup, unchanged */}
</Modal>
```

| Prop | Purpose |
|---|---|
| `variant` | `responsive` (default: sheet on a phone, centred card on the desk), `center`, `full` |
| `hideTitle` | Keep the title for screen readers when the surface draws its own header |
| `dismissible={false}` | Escape and outside-press are prevented. For a decision that must actually be made. |
| `overlayClassName` | Scrim override, for surfaces that dim with the theme base rather than black |

`SlideOver` (right panel) and `BottomSheet` (draggable sheet) are the other two
shells. `DetailSheet` composes `BottomSheet`.

## `shared/SegmentedNav`: never hand-roll a tab switcher

Four tabs used to. Two had no tab semantics at all; none had roving focus.

```tsx
<SegmentedNav<LaneId>
  segments={LANES} value={lane} onChange={setLane}
  label="People lanes" variant="segmented" testIdPrefix="people-lane"
/>
```

Gives `role="tablist"`, `aria-selected`, roving `tabIndex` (only the active tab
is in the Tab order), arrow keys with wrap, Home/End, and a stable test id per
tab. Variants: `pill`, `bordered`, `segmented`.

**Always pass `testIdPrefix`.** The e2e suite selects on it. It used to select
on visible labels, and a rename took 7 of 9 specs out silently.

## Network surface (`src/components/network/`)

| Component | Renders |
|---|---|
| `NetworkTab` | Composes the surface. Both device classes. |
| `NetworkSearchBar` | The one input. Text plus mic. Shows `Heard` then `Understood` then results. Owns the clear affordance. |
| `NetworkResultRow` | One person: score ring, judgment, hook, risk, tier and thin-evidence badges. |
| `ScoreBreakdown` | Popover over the score ring. Five bars, one per scoring term. |
| `NetworkFilters` | Close matches shown by default; one toggle flips "Matches first" / "Matches only". Collapses on narrow. |
| `VentureRecommender` | Venture, then intent, then one verb. Not a cross-product. |

Three rules this surface holds and future work should keep:

1. **`thin_evidence` is a visible badge, never a filter.** `rules_v1` means
   nobody read a profile. Saying so is the difference between a ranked list and
   a confident wrong answer.
2. **Weak is not empty.** When the query signal is noise the strongest people
   are still returned, with a banner saying they are ranked by relationship
   rather than by the question.
3. **Clearing means clearing.** The X inside the field, and Escape, drop the
   query, the results, the interpretation and the filters in one action, then
   put focus back in the field. Three details matter:
   - It drops the **results**, not just the text. Emptying the field and
     leaving twenty rows underneath reads as a broken search, and it hides the
     examples and the venture picker behind a query that is no longer there.
   - It resets the **filters**. A tier chip left lit over an empty field is how
     the next question comes back quietly narrowed by something set two
     questions ago.
   - It appears whenever there is anything to clear, which includes a voice
     search or a recommendation where nothing was ever typed. `hasResults`
     exists for exactly that case, since the input value is empty.

   `useNetworkSearch.reset` bumps the request sequence, so clearing also
   abandons a search still in flight rather than letting it repopulate the list
   a second later. That makes the X the escape hatch from a slow query as well
   as the way to start a new one.

4. **The example chips mirror the live thesis.** The four examples in
   `NetworkSearchBar` are drawn from [`ICP.md`](./ICP.md) (currently: heads
   of AI / transformation at non-tech companies, mid-market CEOs getting
   serious about AI). When the ICP moves, update the examples in the same
   change — stale examples steer every search from the tool's front door.
