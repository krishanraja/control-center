# Contributing Guide

> **Scope.** How to work on the Control Center repo: setup, conventions,
> the standards that gate every PR. The OS-wide standards-registry rules
> (~167 of them) apply to the dashboard too, even though most are
> enforced for agent output rather than code — read
> [`AGENTS.md`](./AGENTS.md) for the broader context.

## Setup

### Prerequisites

- Node.js 18+
- npm 9+
- Git

### Clone and install

```bash
git clone https://github.com/krishanraja/control-center.git
cd control-center
npm install
```

### Environment

Copy `.env.example` to `.env` and fill in the values:

```bash
cp .env.example .env
```

The bare minimum for the dev server is `VITE_SUPABASE_URL` and
`VITE_SUPABASE_ANON_KEY`. Server-only secrets (`SUPABASE_SERVICE_ROLE_KEY`,
`SYNC_SECRET`, `N8N_API_KEY`, `OPENAI_API_KEY`, etc.) are only needed when
you run `vercel dev` to exercise the `/api/*` functions locally. See
[`SECURITY.md`](./SECURITY.md) for the full secrets inventory.

### Run

```bash
npm run dev      # vite dev server on http://localhost:5173
npm run build    # production bundle
npm run preview  # serve the built bundle
npm run lint     # eslint --max-warnings 0
npx tsc --noEmit # type check
```

To exercise the `api/*` routes locally:

```bash
npm i -g vercel
vercel dev
```

## Code standards

### TypeScript

- Strict mode is on.
- No `any` — use `unknown` if truly unknown, then narrow.
- Explicit return types on exported functions.
- Interface over type for object shapes.

```typescript
// Good
interface TaskRow {
  id: string
  title: string
  status: 'active' | 'in_progress' | 'waiting' | 'blocked' | 'done'
}

// Avoid
type TaskRow = {
  id: any
  title: any
}
```

### React

- Functional components only. No classes.
- Hooks for state and effects.
- Cleanup subscriptions in `useEffect` return — Supabase realtime
  channels leak otherwise.
- Memoize expensive computations (`useMemo`, `useCallback`) only when
  profiling shows it matters.

```typescript
// Subscription cleanup pattern
useEffect(() => {
  const channel = supabase
    .channel('tasks-rt-shared')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, handle)
    .subscribe()
  return () => {
    supabase.removeChannel(channel)
  }
}, [])
```

### Realtime subscriptions

**One shared channel per table per browser session.** Open it once, fan
it out via hooks or context. Opening a second `tasks` (or `leads`, or
`guests`) channel is a performance bug — Supabase charges per concurrent
connection. See [ADR-002](./DECISIONS/002-shared-realtime-channel.md).

### Slug-as-key

Every cross-table reference to an agent uses the lowercase slug stored
in `agents.id`. Writers must lowercase before insert; readers expand
tolerantly. See [`AGENTS.md`](./AGENTS.md#slug-as-key) for the canonical
pattern.

### ESM imports in `api/`

Because `package.json` declares `"type": "module"`, every relative
import inside `api/` must include the `.js` extension:

```typescript
// Good
import { supabase } from './_supabase.js'

// Bad — Vercel returns silent 500 on the deployed function
import { supabase } from './_supabase'
```

### Tailwind CSS

- Use the design tokens defined in [`COMPONENTS.md`](./COMPONENTS.md).
- Mobile-first responsive.
- Avoid arbitrary values when a token applies.

```tsx
// Good
<div className="px-3 py-4 md:px-6 md:py-6">

// Avoid
<div className="px-[13px] py-[17px]">
```

### File organisation

```
src/
  components/
    desktop/        # Desktop tab roots (Desktop<Tab>.tsx)
    mobile/         # Mobile tab roots (Mobile<Tab>.tsx)
    flows/          # Flow widgets (per-tab building blocks)
    shared/         # Shared primitives (Toast, ErrorBoundary, ...)
    *.tsx           # Layout primitives (DesktopSidebar, BottomNav, ...)
  contexts/         # React contexts (AgentsContext)
  hooks/            # Custom hooks (useRealtime*, useCustomers, ...)
  lib/              # Browser Supabase client, route helpers, design helpers
  services/         # Data services (agentBriefs, agentData)
  types/            # Shared TypeScript types
  utils/            # Helpers
  App.tsx           # Root + tab router
  main.tsx          # ReactDOM entry
api/
  _supabase.ts      # Server-side Supabase client (service role)
  _skill-prompt.ts  # OpenAI prompt for Skill Forge
  <resource>.ts     # Top-level endpoints
  <resource>/*.ts   # Resource-scoped endpoints
```

### Naming conventions

| Type | Convention | Example |
|---|---|---|
| Components | PascalCase | `LeadCard.tsx` |
| Hooks | camelCase with `use` | `useRealtimeLeads.ts` |
| Utilities | camelCase | `formatDate.ts` |
| Constants | SCREAMING_SNAKE | `const MAX_ITEMS = 50` |
| CSS classes | kebab-case (when not Tailwind) | `task-card-selected` |

## Voice and copy (standards V-001 … V-007)

UI copy must match Krish's voice. The OS-wide standards-registry rules
apply:

- **Zero em dashes.** Use `-`, `;`, or `()` instead. PR #61 surfaced 201
  violations across 67 source files; new code should not add to that
  count. (Use a `--` ASCII pair when you really need one.)
- **No standard AI pacing.** Empty states are short, declarative
  sentences. "Nothing waiting. Clear mind." beats "It looks like you
  don't have anything to review right now."
- **No corporate filler.** "Game-changer", "leverage", "unlock",
  "delve into", "in today's…", "let's dive in" — all banned.
- **Specificity over abstraction.** Empty states use exact names where
  possible. "No Mindmaker leads yet" beats "No leads."

Read the `krish-voice` SKILL.md on the VPS workspace for the full
list. The standards apply to any user-facing string: empty states,
toasts, button labels, error messages.

## Git workflow

### Branch naming

```
claude/<purpose>-<short-id>
feature/add-venture-filter
fix/realtime-subscription-error
refactor/split-pane-component
docs/<scope>
```

Claude-driven branches use the `claude/<purpose>-<short-id>` form.

### Commit messages

Lowercase verb-first. Single-sentence subject when possible; multi-line
body for the why.

```
docs: realign README and core docs with post-rebuild reality
fix(leads): preserve assignee_agent on reassign
feat(home): unify decisions panel onto decisions_waiting view
refactor(realtime): collapse three tasks channels into the shared one
```

Standards G-IT-001 / V-004: every commit author must be
`Krish Raja <hello@krishraja.com>`.

### Pre-commit checklist

```bash
npx tsc --noEmit      # must pass
npm run lint          # must pass with --max-warnings 0
npm run build         # must complete
```

CI (`.github/workflows/ci.yml`) runs `npm ci` + `npm run lint` +
`npx tsc --noEmit` on every PR. A lint warning fails CI.

### Pull request template

```markdown
## Summary
<1-3 bullet points of what changed>

## Why
<why this change matters>

## Test plan
- [ ] tsc --noEmit clean
- [ ] lint clean
- [ ] Tested on desktop (≥ 900px)
- [ ] Tested on mobile (< 900px)
- [ ] Realtime updates verified
- [ ] No new mixed-case writes to slug-keyed columns
- [ ] If this changed a tab, PRODUCT.md is updated
- [ ] If this changed schema, DATABASE.md is updated
- [ ] If this added a "waiting on Krish" surface, decisions_waiting has a new UNION branch
```

## Testing

### Manual checklist

**Desktop (≥ 900px)**
- [ ] Sidebar navigation works for every tab
- [ ] All 11 tabs load without errors
- [ ] Split-pane layouts (Today, Org) work
- [ ] Inline actions update Supabase
- [ ] Realtime updates appear within one tick
- [ ] Cmd+K opens the command palette
- [ ] Cmd+I opens Quick Capture Idea

**Mobile (< 900px)**
- [ ] Bottom nav visible
- [ ] Single column layout, no horizontal scroll
- [ ] Touch targets ≥ 44px
- [ ] Detail views push and back-button works
- [ ] Haptic feedback on swipe actions

**Data**
- [ ] Empty states render distinctly from loading states
- [ ] ErrorBoundary catches per-tab failures
- [ ] Timestamps humanise (`date-fns`)
- [ ] No "undefined" or "[object Object]" leaking to the UI

### Browser matrix

Test in: Chrome (primary), Safari, Firefox, Mobile Safari (iOS),
Chrome Mobile (Android). Realtime WebSocket connection is the most
common cross-browser failure point.

## Adding new things

### A new tab

1. Decide tab id; add to `TabId` union and `VALID_TABS` in `App.tsx`.
2. Create `Desktop<Tab>.tsx` and `Mobile<Tab>.tsx`.
3. Wire the route in `App.tsx` with an `ErrorBoundary` wrapper.
4. Add nav entries to `DesktopSidebar` and `BottomNav`.
5. Add actions to `CommandPalette`.
6. Document the tab in [`PRODUCT.md`](./PRODUCT.md): purpose, inputs,
   writes, behaviour rules, states, SLAs.
7. If the tab surfaces decisions awaiting Krish, add a `UNION ALL`
   branch to `decisions_waiting` rather than a sibling Home panel.

### A new Supabase table

1. Write the migration in `supabase/migrations/`.
2. Enable RLS and write the `anon` SELECT + `service_role` write
   policies.
3. Add the TypeScript interface in `src/types/`.
4. Create a realtime hook if the table is live (`useRealtime<Table>.ts`)
   with the shared-channel pattern.
5. Document in [`DATABASE.md`](./DATABASE.md).
6. If the new table feeds Home decisions, add it to `decisions_waiting`.

### A new component

1. Place in the appropriate `src/components/` subfolder.
2. Add a TypeScript props interface.
3. Document usage in [`COMPONENTS.md`](./COMPONENTS.md) if it's
   reusable.
4. Verify mobile parity.

## Debugging

### Supabase realtime

```typescript
// Enable verbose realtime logging in dev
const supabase = createClient(url, key, {
  realtime: { logger: console.log }
})
```

Common issues:
- **Channel stays in `joining` state forever** → RLS denies the SELECT;
  check the table's anon policy.
- **No `postgres_changes` events** → Realtime is disabled on the table
  in Supabase Studio.
- **Events arrive but UI doesn't update** → State setter inside the
  callback is referencing stale closure; use functional updater.

### React DevTools

The React DevTools browser extension is the fastest path to debugging
re-render storms or stale context.

### Network

DevTools Network tab → filter by `supabase` to see HTTP, or `ws` to see
the Realtime WebSocket.

## Getting help

- Check existing documentation in `docs/`.
- Read the canonical OS architecture: `MINDMAKER_OS_ARCHITECTURE.md` on
  the VPS workspace root.
- Search closed issues / PRs.
- For bugs, file a GitHub issue.
