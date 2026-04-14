# Control Center UI Refactor — Separation of Concerns

## CRITICAL RULES
1. All active components live in `src/components/desktop/`. `App.tsx` imports from there. Do NOT touch files in `src/components/` root unless they are shared components (like `InlineActions` or `AgentAvatar`).
2. Run `npx tsc --noEmit` and `npm run build` after every file change. Fix all errors before continuing.
3. Commit and push the final working changes using Git author: `Krish Raja <hello@krishraja.com>`

## TAB-BY-TAB INSTRUCTIONS

### 1. HOME (`src/components/desktop/DesktopHome.tsx`)
- **Fix Goals:** In the Weekly Goals mapping, change `<span className="text-[12px] text-white/70 truncate">{g.title}</span>` to use `flex-1 whitespace-pre-wrap break-words leading-tight` instead of `truncate`. Add `flex-shrink-0` to the `{g.current}/{g.target}` span.
- **Remove Needs You Tasks:** Completely remove the "Needs You" task list (the `waiting.map(t => <NeedsYouCard ... />)` block) and the `NeedsYouCard` component definition.
- **Replace with Summary:** Instead of the task list, replace the middle column (`<section className="col-span-12 xl:col-span-6 space-y-3">...`) with a clean summary button: "X items need your attention. Open the Today tab to review and act on them." Make it visually distinct and professional. Don't use external missing components like `RevenuePulse` or `SignalTicker` unless you implement them locally in `src/components/desktop/`. For now, just make the summary card.

### 2. PLANS (`src/components/desktop/DesktopPlans.tsx`)
- **Filter Signals:** In the `useMemo` for `filtered`, explicitly exclude tasks where `agent` is 'Zara' or 'zara', OR `group_label` contains 'signal' (case-insensitive). BD signals should NOT appear as plans.
- **Keep everything else** exactly as it is (split pane, task detail, etc).

### 3. INTEL (`src/components/desktop/DesktopExec.tsx`)
- **Remove Tasks:** Completely remove the "Strategic Decisions" section (the right-most column showing tasks).
- **Adjust Layout:** Change the middle column (`col-span-12 xl:col-span-5`) to span more space (e.g. `xl:col-span-8`) to fill the gap left by removing the right column.

### 4. ORG (`src/components/desktop/DesktopOrg.tsx`)
- **Remove Current Tasks:** In the agent detail pane (the `rightPanel` variable), find the "Current Tasks" section and remove it completely. 
- **DO NOT TOUCH** the `tasks` fetching logic in `useEffect` if it breaks other things, but you can remove `tasks` from the `detail` state if it's unused.
- **Keep the Org Chart** and all other agent details (Mandate, Brief, Recent Activity, N8N Runs) exactly as they are.

### 5. TODAY & FLOWS
- DO NOT CHANGE `src/components/desktop/DesktopToday.tsx` or `DesktopFlows.tsx`. They are correct as-is.

## Final Step
Commit your changes with message "refactor: UI architecture separation of concerns" and push to main.

## VISUAL QUALITY BAR — CEO-READY DASHBOARD

After completing the structural changes above, do a SECOND PASS focused purely on visual polish. Ask yourself for every single tab: "Would a busy CEO look at this and think 'this is world-class'?"

### Quality Checklist (apply to ALL tabs you touch):
1. **Typography hierarchy** — Headers should feel commanding, not buried. Subtext should be clearly secondary. Numbers/metrics should POP.
2. **Whitespace & breathing room** — No cramped layouts. Cards should have generous padding. Sections should have clear visual separation.
3. **Visual weight** — The most important information on each tab should draw the eye FIRST. Use size, color intensity, and position to guide attention.
4. **Empty states** — If any section has no data, show a polished empty state (not just blank space or "No data").
5. **Color consistency** — Status colors (green=healthy, amber=needs attention, red=critical) should be consistent and meaningful, not decorative.
6. **Card design** — Rounded corners, subtle borders, hover states where clickable. Every card should feel intentional.
7. **Alignment** — Everything pixel-perfect aligned. No orphaned elements floating randomly.
8. **Information density** — Show enough to be useful at a glance, but don't overwhelm. A CEO scans, they don't read paragraphs.

### Per-Tab Visual Standards:
- **HOME**: This is the first thing Krish sees. It should feel like a command center — clean, authoritative, with the 3-4 most important signals front and center. Goals should show progress visually (not just "2/5" text). The attention summary should feel urgent but not alarming.
- **PLANS**: The roadmap should feel strategic and forward-looking. Filter chips should be visually clean. Selected plan detail should be easy to scan.
- **INTEL**: Strategic intelligence should feel premium. Think Bloomberg terminal meets Apple design. Clean data presentation, clear hierarchy.
- **ORG**: The pod chart should feel like a real org visualization. Agent cards should show health/status at a glance with clear visual indicators.

### What NOT to do:
- Don't add fake data or placeholder content
- Don't import components that don't exist
- Don't change the data fetching logic
- Don't touch DesktopToday.tsx or DesktopFlows.tsx
