# Nirvana state — what 10/10 looks like

> **Status: DRAFT pending Krish confirmation.** Once confirmed, every PR in `PLAN.md` must reference a job ID (J-NN). If a job isn't here, it isn't in scope.
>
> **Each job cites the principles (`P-N`) it serves.** Principles live in `PRINCIPLES.md`. The traceability runs: `PRINCIPLES.md` ← `NIRVANA.md` (J-NN) ← `PLAN.md` (P-Phase) ← PR.
>
> Two devices, two modes:
> - **Mobile = triage + fast iteration** ("barely move the mouse")
> - **Desktop = deep work + publish** (full focus, one piece at a time)

---

## J-00 — The mental model (the one thing Krish memorises)

> "Content has a backlog, a workbench, and a publisher. Mobile clears the backlog. Desktop runs the workbench and the publisher."

Every UI element should answer to one of those three roles. If it does two, it's a smell.

| Surface | Role | Where |
|---|---|---|
| Backlog | Triage. Drop noise, accept signal, advance one stage. | Mobile primary, desktop secondary |
| Workbench | Deep work. One piece, full screen, voice-grounded, materials-attached, iterate. | Desktop primary, mobile light-touch |
| Publisher | Save → Google Doc → Telegram → Krish reviews → Krish ships. | Both, identical UX |

---

## What I'm supposed to be able to do (current spec, baseline)

These are the jobs the system claims to support today. The rebuild keeps every one of them but makes them work.

### Inbox / capture
1. Auto-seed: customer voice + closed deals + content-grade signals show as "ready to seed" candidates. Krish clicks one → idea row created → Composer opens.
2. Manual capture: `⌘I` opens a quick-add. Server classifies into a lane.
3. Bulk capture: paste/Telegram → Cleo ingest → row appears.

### Triage
4. See an unbounded backlog as a manageable sequence (mobile triage deck, desktop overflow-into-deck).
5. Swipe left = drop (terminal). Swipe right = advance one stage. Tap = open.
6. Sweep: AI-bulk-drop off-vertical and too-technical cards with one click; Krish previews, applies. Vera clusters reasons.
7. Synthesize: pick 2-25 cards → fold into a single narrative.

### Composer (deep work)
8. Open any review/approved/drafting card full-screen with a draft canvas + side rail.
9. Rail tools: Cleo chat / Refine (lane preset / tone / length / zoom) / Materials / Research / Standards.
10. Inline edit any field (idea, thesis, distribution).
11. Span-level rewrite: select text → toolbar rewrites just that span.
12. Challenge / enrich: tiered (Perplexity counter-evidence + real Apify community scrape + optional NewsAPI) → steelman → counter → sharper take → hook.
13. Channel variants: per-idea toggle for each configured lane; spins child rows in that lane's voice.
14. Five Standards gate scores each draft (advisory, never blocks).
15. Materials: paste/link a research corpus; it grounds every generation; rides into the Doc.
16. Voice: em-dash kill on every write path; "Fix voice" one-click in the header.

### Save / publish
17. Save Draft → sanitises → calls the factory webhook → Google Doc in the right channel folder → Telegram alert to `@krish_approvals_bot` → row moves to `review`. Nothing auto-publishes.

### Calendar
18. See what's scheduled this month; click any day to drop an unscheduled draft onto it.

### Backburner
19. Manually bury or auto-bury low-priority items; collapse them out of the lanes.

### Multi-device
20. Mobile and desktop share state via Supabase Realtime; what I drop on mobile disappears on desktop instantly.

---

## What "10/10" actually looks like (the upgrades)

Jobs prefixed `J-` are the rebuild's targets. Each must be referenceable from a PR.

### J-01 — The state machine is honest  · [P-1, P-8]

A card's state reflects what's true about its body.

- `seeded` = raw idea, no body, no thesis enrichment.
- `researching` = Cleo has started enrichment OR Krish has attached materials.
- `drafting` = body is non-trivial (≥ ~200 chars or has been written into).
- `review` = body is substantial AND Krish has not yet approved.
- `approved` = Krish has explicitly approved (button click).
- `published` = factory confirms the post is live (already gated on `published_url`).

The transitions are explicit; no state changes silently on a timer. **Currently broken:** 11 cards live in `review` with `length(body)=0`.

### J-02 — Mobile triage is a single thumb gesture per card  · [P-2, P-6, P-11]

In the mobile triage deck:
- Left swipe = drop (terminal). Records reason ("not for me" / "off vertical" / "stale" — quick chips on the swipe-confirm).
- Right swipe = advance one stage (seeded→researching, researching→drafting, drafting→Composer-on-mobile).
- Down swipe = bury (`buried_at` set, reason recorded, can be unburied later).
- Tap = open Composer.
- Long-press = pin to top.

The deck always shows the next-best card based on a server-side priority (date, lane, fit, freshness).

### J-03 — Mobile is also good for fast iteration on existing drafts  · [P-2, P-6, P-11]

Opening a card on mobile lands on a **read-first** Composer view:
- Title, body, lane, score visible without scrolling.
- One row of magic chips: **Tighten · Sharper open · Harder ending · Make it ready · Fix voice**.
- Tap a chip → preview inline (server-rendered diff). Accept = body updated. Reject = nothing changed.
- Bottom: one big sticky **Save Draft** button (already present).

No deep typing on mobile. Krish never has to write more than a one-sentence chat with Cleo on a phone.

### J-04 — Desktop is the workbench, not a feed reader  · [P-2, P-5, P-6, P-7]

The lane column + by-state aside is the wrong shape for a writer. Replace the desktop Content tab body with a **two-pane workbench**:

- **Left rail (320px):** the next-best card stack (the deck, vertical), filterable by lane and state. Cards are small, dense, action-rich.
- **Right pane (rest):** the Composer, always open. No overlay/modal — the Composer is the page.

Picking a card on the left switches the right pane. State updates land in place. **No swipe-deck cards on the desktop main view ever.** The deck primitive exists only inside the left rail and the mobile main.

### J-05 — Calendar lives on desktop, not buried behind a toggle  · [P-12, P-16]

The current `view: 'lanes' | 'calendar'` toggle hides the calendar. Promote calendar to a top-level entry in the workbench so Krish always knows what's queued for which day.

### J-06 — Auto-classification works AND is honest about its confidence  · [P-1, P-8]

Server-side classifier (Haiku) labels each idea with: `confidence_lane`, `confidence_state`, `confidence_quality`. If `confidence < 0.7`, the card carries a small `?` badge that says "Cleo is unsure" — Krish can confirm in 1 click. Today the classification is opaque and unbacked, so when it's wrong (as with the empty review rows), Krish has no signal it's wrong.

### J-07 — One Save Draft path, not three  · [P-4]

The user-visible action is always `Save Draft`. The buttons "Push to Cleo" / "Send to Cleo" / "Approve" / "Mark Ready" all collapse into Save Draft. The state transitions happen server-side. (Today: spec mentions Save Draft replaces Push-to-Cleo for back-compat, but the back-compat is itself confusing — finish the migration.)

### J-08 — Materials are first-class  · [P-10, P-16]

Attach a corpus (paste, link, drop) → it grounds every generation AND rides into the Google Doc. Already specced. Verify it's actually wired into save-draft (not just chat/revise).

### J-09 — Em-dash discipline is enforced at rest  · [P-14, P-1]

Every existing body in `content_ideas` is re-sanitised with `sanitizeVoice()` (one-off migration). New writes already sanitise; old data is the leak. After this, the inconsistent `⚠ em dash` chip becomes unnecessary because no card has one.

### J-10 — Inline actions on every list card, on every device  · [P-3, P-6, P-11]

Every card surface (mobile list, desktop left rail, desktop calendar cell preview) exposes the same 4 inline actions: **Open · Approve · Schedule · Drop**. No "Open → maybe approve" round trips.

### J-11 — Sweep is the default action above a backlog of 30  · [P-5, P-7, P-15]

When `activeCount > 30`, the primary CTA at top of the tab is "Sweep to 30" (preview then apply). The triage deck is the secondary CTA. Today they're co-equal buttons; users default to scrolling.

### J-12 — The Composer remembers what I was doing  · [P-6, P-12]

Reload restores the last open card. Browser back navigates between the last 5 Composer-opened pieces. Mobile keyboard doesn't push the Save Draft button off-screen.

### J-13 — One "what's next" line at the top of every device  · [P-3, P-5, P-15]

Mobile and desktop both show the single highest-priority card at the very top of the tab as a "Next" pill (the spec's `NextActionStrip` shape). One tap opens the workbench / Composer with that card. Today this exists on desktop only.

### J-14 — No horizontal scroll, anywhere, ever  · [P-13]

Verified by the `RUNBOOK.md` detector. Includes the MultiSelectBar, the seed rail, the by-state aside, the calendar header.

### J-15 — The seed rail is a tier, not a popup  · [P-9, P-16]

Promote the seed rail to a permanent "Incoming" lane in the workbench's left rail. One-click seeds an idea; it appears in `seeded` state with the source ref attached. Today it's an opt-in collapsible bar that's easy to ignore.

### J-16 — Telemetry every action  · [P-18]

Every swipe, tap, accept, reject, Save Draft writes a `feedback_queue` row. Vera's Sunday aggregation already runs. The rebuild just guarantees nothing is silent.

---

## What is explicitly NOT a job (resist scope creep)

- A WYSIWYG rich-text editor. Body is markdown; `RichText` renders. We are not Notion.
- Multi-user collaboration. One user (Krish), one device-pair.
- Direct auto-publish. PUB-001 stays.
- AI-generated headlines without Krish-voice grounding. Every generation goes through the corpus.
- A search bar. Lane/state filters cover 95%; if Krish needs search, that's a separate scoped feature.
- Reordering cards by drag. Sweep + state advances + scheduling cover it.

---

## What Krish needs to confirm before this becomes canonical

- [ ] J-01 thresholds (200 chars for review? different by lane?)
- [ ] J-04 workbench shape (two-pane vs current overlay Composer — is the overlay actually working for you?)
- [ ] J-05 calendar promotion (do you actually use calendar today?)
- [ ] J-10 inline actions (which four are non-negotiable?)
- [ ] J-11 sweep-as-default (do you want it auto-applied or always preview?)
- [ ] Any J-NN missing? What's the iteration loop you wish you had?
