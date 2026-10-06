# mind/make OS: architecture and operating canon

> **What this is.** The one document that tells any AI agent, and any person, what Krish Raja is building, what is true right now, which rules hold, and where the live source for every fact lives. It covers the whole OS: the agents, the database, Control Center, the schedules, the money and the portfolio.
>
> **Who reads it.** Every AI tool Krish uses (Claude Code, Codex, Cursor, the agents on the VPS, n8n model nodes, Control Center's own model calls) and anyone working on his products. Read section 0 first. It is written to be enough on its own for most tasks.
>
> **How it stays true.** Facts that change by the day (revenue, counts, rows, run results) are not copied here; each section names the table, file or API that holds them. Where a measured number is quoted, it carries the date it was measured. If this document and a live source disagree, the live source wins and this document is stale: fix it.
>
> **One surface.** This file, on `main` of `github.com/krishanraja/control-center`, is the only copy (ruling, Krish, 2026-09-07). Read it from a checkout after `git pull`, or from `https://raw.githubusercontent.com/krishanraja/control-center/main/docs/MINDMAKE_OS_ARCHITECTURE.md`. Any other copy is stale by definition.
>
> **Kept current by the engine.** `api/architecture/weekly.ts` (Vercel cron, Sunday 13:00 UTC) writes one dated entry at the top of section 20 from the week's build signals and stamps the line below. The Monday note reads that stamp back and calls it stale when it is more than ten days old. People write rulings (section 0a); the engine writes the record (section 20).
>
> **Last engine refresh:** 2026-10-04
>
> **Last rebuilt by hand:** 2026-10-05, against the live Supabase schema, the Stripe organisation, the repository at `f31af50a` and Krish's rulings of that day. The text it replaced is kept in `docs/history/` (see section 21). Not rebuilt since: on 2026-10-06 sections 0.2, 0.3, 0.5, 0a and 0b (and one line each in sections 15 and 17) were edited by hand to record Krish's rulings of that day, and nothing else was re-checked.
>
> **No secrets, no private people.** This repository is public. Nothing here is a credential, a secret's name, an infrastructure identifier (project ids, cron secrets, keys) or another person's personal details. Company names are fine.

---

## 0. Start here

### 0.1 Who Krish is and what he is trying to do

Krish Raja runs a small portfolio of AI businesses, mostly on his own, with a fleet of AI agents doing the operational work. His ikigai (version 4, 5 September 2026, built from 138 ranked answers) locks his purpose as: "I see what is coming before it is obvious and make it legible to people while it still counts." The person he serves: "A senior leader who will not admit to anyone that they are not ready for what is happening." His word is "Edge." The enemy is "Fear and noise that stop capable people acting on what is already happening." His working mission, not yet locked: "Build the company that gives leaders their edge back before what is coming takes it, and sell it at scale with my name on it." That company is Mindmake.

The full picture of Krish (his ikigai in full, his eight decision rules, how he works) is in [`docs/KRISH.md`](./KRISH.md) and [`docs/krish/IKIGAI_v4.md`](./krish/IKIGAI_v4.md). Those files are written and owned separately; this document only summarises them.

### 0.2 What exists, in what order, and what it earns

**Mindmake is the mission, and the products roll into it** (Ruling, Krish, 2026-10-06, superseding the 2026-10-05 split). The products are parts of the one company, ordered by a ladder; the OS grows them. Section 0.3 says how they relate. The single code source of the product ranking is [`src/lib/portfolio.ts`](../src/lib/portfolio.ts). The full portfolio, with each product's objectives, is in [`docs/PORTFOLIO.md`](./PORTFOLIO.md).

| Name | What it is | Role | Priority | Status (2026-10-05) | Money, and where the live number is |
|---|---|---|---|---|---|
| **Mindmake** | Krish's principal-led AI and commercial strategy practice at mindmake.co. Two doors, "Build your AI brain" and "Build your AI GTM", lead into one privately scoped paid proof. Canon: `github.com/krishanraja/mindmake` | The mission | Not ranked against products (0.3) | Live | Privately agreed fee, billed through the mind/make Stripe account. How the account's 9 lifetime payments split between advisory, the Substack and Maven was not measured (`scripts/stripe-reconcile.mts` can settle it) |
| **The publication** (makeyourmindup, on Substack at home.makeyourmindup.ai) | Mindmake's publication. Three channels, by ruling (Krish, 2026-10-06) and enforced by the database: mind.the.gap (Fridays, the hero), follow.the.money (Mondays), under.the.hood (Wednesdays); mandates live in `venture_formats`. The business canon's "exactly two channels" is stale (0b) | Part of the mission | Runs alongside | Live | **The only live recurring revenue in the whole portfolio**: 2 founding members, $13.51 a month combined. Stripe, mind/make account, on plans Substack owns |
| **Heartside** | A Shopify store at heartside.io selling gifts written in your dog's voice. Brand line "Your dog has notes." Repo `krishanraja/heartside` | Product, inside the mission | **1** | Pre-launch, opens **2026-10-20**. 0 orders, 0 customers | Shopify Payments, not Stripe. Measured in USD as one-off orders, never MRR. Read in the Shopify admin analytics, which Control Center links to |
| **Full Time** | A B2C monetisation experiment app (Ruling, Krish, 2026-10-06; never a job-search asset): AI football audio, six AI pundits recap one match a day, at fulltime.fm. Free, with Full Time Pro at $4.99 a month | Product, inside the mission | **1** | Live beta | $0: it has never collected a payment, though checkout is wired. Stripe, Full Time account |
| **Legibility** | An API that gives AI agents typed product data, over REST and MCP, at legibility.io. Starter $29 and Growth $199 a month | Product, inside the mission | **2** | Private beta | $0 (every past "customer" was a QA bot or Krish). Stripe, Legibility account |
| **CTRL** | An AI briefing and decision app for founders and small-team CEOs, at ctrl.mindmake.co. Sells one thing, CTRL Pro at $49 a month (renamed from Edge Pro on 2026-10-05), charged by Supabase edge functions in repo `mm-ctrl`. Being priced is fine (Ruling, Krish, 2026-10-06) | Product, inside the mission | **3** | Live | **$0: zero paying customers.** Stripe, mind/make account |
| **Pulse** | A free public index of demand for fractional executives, at pulse.fractionl.ai. Pulse Pro $99 a month or $948 a year, kept as the data feed licence | Product, inside the mission | **3** | Live, but **cannot take a payment**: no button in the app calls `startCheckout()` | $0. Stripe, Fractionl account |
| **Circle** | Personal contact memory for independent operators, at circle.fractionl.ai | Product, inside the mission | **Dormant** | Preserved, never purged, not worked | $0. Stripe, Fractionl account |
| **Control Center** | This repository: the dashboard and crons of the OS | Infrastructure | Not sold | Live at controlcenter.krishraja.com | None |

**Money across the whole portfolio, measured 2026-10-05:** $842.56 net lifetime revenue from 9 real payments, all in the mind/make account, the last on 2026-08-18 (gross settled $911.45; the gap is fees). An earlier figure of "$1,244 across 20 charges" was wrong: it counted 11 failed charges and added Australian cents to US cents. Never repeat it. To re-measure, run `scripts/stripe-reconcile.mts`, which reconciles all five Stripe accounts exactly.

### 0.3 Mission and portfolio: the portfolio rolls into the mission

**The ruling (Krish, 2026-10-06): "portfolio rolls in to mission."** Mindmake is the one company and the one swing. Heartside, Full Time, Legibility, CTRL and Pulse are parts of it, not a separate lane competing for his time; Circle is dormant. There is one queue, and the mission is the parent. When a surface can show only one "do this next", the mission leads; product work is ordered beneath it by the ladder in `src/lib/portfolio.ts` (Heartside and Full Time 1, Legibility 2, CTRL and Pulse 3, Circle dormant).

**What it superseded.** On 2026-10-05 Krish ruled "both, explicitly split": Mindmake as the mission and the products as a separate portfolio, with a seven-point rule in `docs/KRISH.md` telling agents never to choose between the two and to put both in front of him side by side. That ruling and its seven-point rule are retired. The current rule for agents is in [`docs/KRISH.md`, "Mission versus portfolio"](./KRISH.md#mission-versus-portfolio); this document does not restate a second version.

**The tension, resolved by ruling.** The ikigai's Rule 7 says "if it does not put a leader's edge back, it is off mission", and Rule 8 says "music and football are protected". Full Time, a football app, and Heartside, a retail gift shop, sit at priority 1, and the one-swing charter (`docs/plans/one-swing/CHARTER.md`, ADR-016) says "Portfolio is the avoidance pattern." Krish resolved this by placing the portfolio inside the mission on 2026-10-06, not by rewriting the rules: the ikigai stays verbatim, and neither rule may be used to veto or demote a product on the ladder.

**The ikigai commitment is ongoing (Ruling, Krish, 2026-10-06: "its ongoing").** The twelve month commitment (7 Sep 2026 to 6 Sep 2027) continues. Its stop rule (fewer than 2 of 25 leaders take a call, or no paid room by 5 October 2026) fell due on 2026-10-05 and was not met; Krish chose to continue, and no new stop date has been set. On 2026-10-05 this was written as "PAUSED, being reset"; that status is superseded. The ninety day plan's dated steps (5 Sep to 5 Dec 2026) are history from the original plan, and the day 90 review date of 5 Dec 2026 was not restated, so it is unconfirmed, not live. Agents must not invent a new stop date, targets or plan dates. ("Ongoing" is the coordinator's reading of Krish's two words.) The full status is in [`docs/KRISH.md`, "The ikigai commitment: ongoing"](./KRISH.md#the-ikigai-commitment-ongoing). The Monday scorecard code still carries the original stop rule and day 90 date; see 0b.

### 0.4 What the OS is for, and its shape

The OS exists so Krish spends his hours on decisions, not admin, while a fleet of agents does the operational work of growing his products and his publication. Its shape:

```
Krish ── reads and decides in ──> Control Center (React app on Vercel, this repo)
                                        │  reads Supabase directly; writes through /api/* when it needs the service role
                                        ▼
                         Supabase (Postgres): the single source of truth for every piece of OS state
                          ▲            ▲              ▲                 ▲
     n8n Cloud workflows  │   OpenClaw on the VPS     │   Vercel crons    │   GitHub Actions
     (agent jobs on cron  │   (Claude Code agents,    │   in this repo    │   (Hunter, the AEO engine,
      or webhook)         │    their crons, scripts)  │   (health, money, │    the docs steward)
                          │                           │    events, goals) │
     Sibling repos: krishanraja/content-engine (the content control plane), krishanraja/ai-harness
     (the skills and doctrine every AI tool loads), krishanraja/mindmake (business canon),
     krishanraja/makeyourmindup (publication canon), and one repo per product.
```

Everything an agent does ends as a row Control Center can read. Control Center never talks to the VPS or n8n directly; every hand-off goes through Supabase.

### 0.5 The rules every agent follows

These are the short form. Section 0a holds each one in full, with the date it was set.

1. **Pull-only.** The OS never contacts Krish. He goes to Control Center; nothing comes to him. No Telegram, no push, no "ping Krish when X" (2026-09-06). Two bounded exceptions, both email to Krish only and both his call: the weekly slate link (2026-09-19) and a money-line alert when a prepaid allowance is crossed or a unit's spend spikes (`api/_moneyAlerts.ts`).
2. **Draft for approval.** Nothing external goes out without Krish. Agents draft; he sends or publishes. Gmail is drafts only.
3. **Control Center never sends.** No route sends an email, a message or a post on its own. Enforced by the CI guard `check-bridges-never-send`. Publishing to LinkedIn is a manual act (2026-10-05).
4. **Agents report to Control Center, never into Drive.** Runs, status and output go to Supabase tables Control Center reads. No agent creates or edits a Google Doc in Krish's Drive (2026-10-05). Krish pressing "Send to Google Docs" on the Content tab is fine: he started it.
5. **No cold outbound.** No cold email, cold DM or bought list (ikigai Rule 2; Acquisition OS v1.1, 2026-07-06). Warm intros, the room and published thinking only, drafted for Krish. Whether a plan may lean on his own name or face is an open decision: ask him (0b).
6. **Nothing secret or private in public.** No credentials, secret names or infrastructure identifiers in docs, commits, PRs or logs; no other people's personal details (named leads, customers, contacts, private individuals). Company names are fine (2026-10-05).
7. **Live source over documentation, documentation over memory.** Cite where a fact came from. If it is not in a live source, say "unknown" and where it would be found. Never invent a number.
8. **One place per thing.** Every kind of fact has exactly one home and one table (2026-08-06). Read the existing one; never build a parallel copy.
9. **A product with no buyer definition is blocked, not guessed.** Who a product is for lives only in `product_icp`. With no row, prospecting for that product stops and says why (2026-10-05).
10. **One queue, the mission first.** The products roll into the mission; when a surface can show only one thing the mission leads and products follow the ladder. The ikigai commitment is ongoing: never invent a stop date, target or plan date Krish has not set (2026-10-06; replaces "the ninety day plan is paused" of 2026-10-05).

### 0.6 Where to look next

| You need | Read |
|---|---|
| Every rule in force, with its date | Section 0a below |
| What is broken or contradictory right now | Section 0b |
| Whether something is retired | Section 0c, the only list of retired things |
| Krish himself, his ikigai and decision rules | [`docs/KRISH.md`](./KRISH.md), [`docs/krish/IKIGAI_v4.md`](./krish/IKIGAI_v4.md) |
| Each product's objectives and detail | [`docs/PORTFOLIO.md`](./PORTFOLIO.md) |
| What the business sells and how it talks | `github.com/krishanraja/mindmake`, `project-documentation/00_NORTH_STAR.md` then `01_CANON.md` (canon wins on the business) |
| What Control Center is right now, and what changed this month | [`NOW.md`](../NOW.md) |
| Each tab of Control Center | [`docs/PRODUCT.md`](./PRODUCT.md), and [`docs/ARCHITECTURE.md`](./ARCHITECTURE.md) for the engineering contract |
| The agents, one by one | Section 3 and [`docs/AGENTS.md`](./AGENTS.md) |
| Words and table names | [`docs/GLOSSARY.md`](./GLOSSARY.md) |
| Deep detail behind any section | [`docs/architecture/`](./architecture/) (section 21 lists the files) |
| Why something is the way it is | [`docs/DECISIONS/`](./DECISIONS/) |
| How to work in this repo | [`AGENTS.md`](../AGENTS.md) (house systems, tests, CI) |

---

## 0a. CANON: the rules in force

> One list. It folds the four dated canon blocks this document used to carry (2026-08-06, 2026-09-06, 2026-09-07, 2026-10-05; kept verbatim in `docs/history/2026-10-05-MINDMAKE_OS_ARCHITECTURE-superseded-sections.md`) and the rulings Krish made on 2026-10-05 and 2026-10-06. Each rule carries the date it was set. Where an older rule and a newer one disagreed, the newer one is the one written here. A new ruling is added here by a person, never by the engine.

### 0a.1 Content: venture, format, channel

- **One source of truth for everything (2026-08-06).** There is exactly one place to enter any given thing, and exactly one table behind it. Many surfaces may read a table and show different slices; none may invent a parallel concept for something that already has a home. Two surfaces disagreeing about what a table means is the bug.
- **Three layers, never two (2026-08-06).** Venture (what am I working on, `venture_registry`), then format (what shape is this, `venture_formats`), then channel (where does it go, `media_channels` into `content_ideas.distribution`). A channel is never a venture.
- **The publication has three subchannels and the database enforces it (2026-09-19; final names 2026-09-25; days swapped 2026-10-05; confirmed by ruling 2026-10-06).** mind.the.gap is the hero and is due on Fridays; follow.the.money is due on Mondays; under.the.hood on Wednesdays. The publication lives at home.makeyourmindup.ai (2026-10-05). Any line saying "exactly two channels" is stale. `venture_formats.mandate` is the only source of what each one is for. Read it live; never restate a mandate in a file. The earlier two formats, The Money of AI and Built with AI (and before them Paid and Built), are retired (2026-09-17).
- **The question decides the subchannel, never the surface (2026-09-19).** If the reader would change a price, budget or contract next, it is follow.the.money; what they build or buy, under.the.hood; how they think or what they expect, mind.the.gap. Each piece ends with one dated, checkable prediction, and only Krish sets the confidence number.
- **Not us (2026-09-19).** No subchannel's subject is ever Krish, Mindmake, CTRL or his own builds.
- **Content work lives in Control Center and the content engine (2026-09-08, ADR-019).** The editorial routes, Composer routes, content crons and the video control plane run from `krishanraja/content-engine`, reached through `vercel.json` rewrites. This repo keeps the Content tab.

### 0a.2 Goals: one ladder

- **One table, four horizons (2026-08-06).** `goals` holds `os` (stale after 90 days), `mid_term` (45), `weekly` (10) and `venture_objective` (30), laddered by `parent_id`. One version of each goal, enforced by a unique index. A non-OS goal cannot be saved without naming its parent. Retiring a goal sets `dropped`; it is never deleted.
- **One editor (2026-08-06).** `GoalLadder` is the only place a goal is entered; reads and writes go through `useGoalCanon` and `src/lib/goalsApi.ts`. Guarded by `check-goal-ladder` and `check-goal-gate`.
- **The week label is derived, never stored (2026-08-06).** `api/_week.ts`.
- **Weekly cadence (2026-09-08, ADR-018).** A weekly objective carries `goals.week_start`. A Saturday 05:00 UTC cron (`/api/goals/week-close`) closes the week: done stays done, still-active becomes `missed`, nothing is deleted. Today's three are manual first; the evening shutdown writes tomorrow's three through `api/_dailyFocus.ts`.
- **The strategist proposes only (2026-09-27, ADR-026; daily move 2026-10-03, ADR-028).** A goal or Krish's own words go in; a read and one outward move come out. Nothing becomes a goal or an ask until he taps it.
- **Energy and anxiety never change goal content (2026-08-06).** They change sequencing only.

### 0a.3 Events: the attend lane

- **`events` is the one event table (2026-08-06).** `visibility_targets` is a press, podcast and speaking register, not an event table.
- **Nothing dead is displayed; archiving is only for the dead (2026-08-06).** An away-city event is unactionable, not dead. Actionability is decided at query time (`events_for(home_city)`), never by deleting.
- **An unverified date is never recommended (2026-08-06).** Enforced by the `events_recommendable` view and `scripts/check-events-honesty.mts`.
- **Two axes (2026-08-06; Draw redefined 2026-09-24, ADR-025).** Draw is peer density: founders, owners and CEOs running a business with real revenue. Demand is buyer density. Practitioner and vendor density are penalties. Weights live in `api/_eventScore.ts`.
- **Home city is a setting Krish presses, never a device guess (2026-08-06).** London or New York; Sydney is temporary and only on a button press. `system_config.operator_home_city`, read by `api/_homeCity.ts`, `src/lib/homeCity.ts` and `public.operator_home_city()`.
- **Sources (2026-09-24).** Luma and Meetup are read by `api/events/discover.ts`; scrub, discover and score run as Vercel crons each morning and each writes a `workflow_runs` row. Skyvern is never used for scheduled scraping.

### 0a.4 Contact, sending and approval

- **Pull-only (2026-09-06).** The OS never initiates contact with Krish. All six layers that could reach him were closed: OpenClaw cron delivery, OpenClaw agent templates, n8n Telegram nodes, Control Center's own API (`notifyOps()` in `api/_alert.ts` records to `audit_log` and returns `sent: false`; it is kept as the one choke point), the VPS root crontab, and archived n8n workflows. Telegram is retired in the database too (migration `20261003220000_telegram_is_retired`).
- **Two exceptions, each bounded.** (1) The weekly slate (2026-09-19): one email a week to Krish's own address, carrying the link to the slate he asked for. (2) Money lines (`api/_moneyAlerts.ts`, run from the hourly Apify meter sync): one email to Krish when a plan's prepaid allowance is crossed or one unit's weekly spend jumps to several times its normal, each alert keyed and recorded before it is sent so it fires once. The code records it as his explicit choice of email over Telegram; the date of that choice is not recorded. Widening the recipient, payload or trigger of either is a new decision.
- **Personal bots for other people are outside this rule.** Personal agents that message members of Krish's family on their own bot accounts are not the OS contacting Krish.
- **Any cron that sends a message names its channel, account and target explicitly, and never claims delivery the tool did not confirm (2026-09-06).**
- **Draft for approval (standing; PUB-001, PUB-005).** Nothing publishes or sends without Krish. Email is Gmail drafts only.
- **Control Center never sends (2026-09-06; LinkedIn path removed 2026-10-05).** Guarded by `check-bridges-never-send`. Cleo's `LinkedIn Distribution` workflow, the only automatic LinkedIn path, had zero executions ever and was retired; publishing to LinkedIn is manual by design.
- **No cold outbound (ikigai Rule 2; 2026-07-06, Acquisition OS v1.1 Gate 1).** No cold email, cold DM or bought list; warm intros, the room and published thinking only. Paid tests are capped at $500 a month across all products and start only after revenue flows through owned or earned channels (Gate 4); agents never spend money. The outbound send surfaces were unmounted on 2026-08-04. The full acquisition doctrine is in [`docs/KRISH.md`](./KRISH.md#acquisition-doctrine).
- **Krish's name or face in public is an open decision, not a rule.** The 2026-07-06 ruling said no motion may require his personal brand; the ikigai's mission says "with my name on it". Do not settle it: when a plan depends on his name or face, ask (0b).

### 0a.5 Reporting: agents report to Control Center

- **Control Center is the one place agents report (2026-10-05).** An agent writes its runs, status and output to tables Control Center reads (`workflow_runs`, `tasks`, `agents.last_run` and `last_output`, and the output tables it owns). A VPS file nothing reads is not a report.
- **No agent writes into Krish's Drive (2026-10-05).** Retired that day: `sync-to-drive.py` (the per-agent Identity and Action Doc mirrors; all `google_drive_sync` rows deleted), `cc-doc-creator.sh` (turned tasks into Google Docs) and the broken `arlo-daily-contradiction-audit.sh`. OpenClaw jobs `Hunter - Daily Sourcing`, `product-agent` and `newsletter-draft` were disabled. Krish pressing "Send to Google Docs" on the Content tab stays: he started it.
- **OpenClaw runs reach Control Center (2026-10-05).** `openclaw-runs-to-cc.py` (VPS, every 15 minutes) copies finished OpenClaw cron runs into `workflow_runs` as `openclaw:<jobId>`, so they show in OS > Org.
- **Agent briefs live in Supabase only (2026-10-05).** `agents.brief_content` is canonical, rendered to each agent's SKILL.md by `render-identity.py`. Never run `sync-briefs-to-skills.sh`: its Google Doc sources are gone and a run would gut every brief.
- **Every active brief and template carries the priority and reporting block (2026-10-05):** 1. Heartside and Full Time. 2. Legibility. 3. CTRL and Pulse. Mindmake and its publication run alongside.
- **The guest briefing lives in Control Center (2026-10-05).** Nell's n8n workflow still researches, verifies quotes and writes the briefing; the markdown now lands in `guests.briefing_md` and opens in `GuestCard`. Older guests keep their old Doc link, labelled as the old Doc.

### 0a.6 Money and the portfolio

- **The priority ladder (2026-10-05).** 1: Heartside and Full Time. 2: Legibility. 3: CTRL and Pulse. Circle is dormant: preserved, never purged, not worked. The one code source is `src/lib/portfolio.ts`; Growth, Subscriptions and the Sunday growth review all read it.
- **The portfolio rolls into the mission (2026-10-06).** Krish: "portfolio rolls in to mission." One queue, the mission as the parent; when a surface can show only one thing the mission leads and products are ordered beneath it by the ladder. This supersedes "both, explicitly split" (2026-10-05) and its seven-point rule. See 0.3.
- **Full Time is a B2C monetisation experiment app, not a job-search asset (2026-10-06).** Krish: "fulltime is not a job search thing, its a b2c monetization experiment app." Both venture tables were corrected the same day (`venture_registry` kind `product`; `ventures` description).
- **CTRL being priced is fine (2026-10-06).** Krish: "CTRL is fine priced." CTRL Pro at $49 a month stands; any line saying CTRL is never priced is wrong for CTRL itself (the business canon's wording is a recorded conflict, 0b).
- **Stripe is one organisation with five accounts (2026-10-05):** mind/make (AI Brain, AI GTM, the makeyourmindup Substack, Maven teaching, CTRL), Full Time, Legibility, Heartside (empty and redundant; closing it is Krish's call), and Fractionl (Pulse and Circle). Control Center reads all five with one read-only organisation key (`api/_stripe.ts`, `api/revenue/sync.ts`, daily 08:00 UTC). The retired offer ladder was archived in Stripe the same day.
- **Substack revenue is the publication's, not CTRL's (2026-10-05).** Substack creates and owns its plans (named "$81 a year", "A$115 a year", "$8 a month"; never rename them) and bills through the mind/make account. Migration `20261005140000` moved them to `publication`.
- **A Stripe webhook with no signing secret is refused, never trusted (2026-10-05).** The verified route is `POST /api/revenue/webhook`.
- **Heartside takes payment through Shopify Payments, not Stripe (2026-10-05).** Report it in USD, as one-off orders (orders, revenue, average order value, repeat customers), never as MRR or paying subscribers. For now Krish reads its numbers in Shopify, and Control Center links out to its analytics.
- **Pulse keeps its existing pricing as the data feed licence (2026-10-05):** $99 a month, $948 a year.
- **An unwired number is never a zero (2026-10-05).** A metric nothing reads says what is missing; a product that cannot charge is not "$0 revenue". `src/lib/portfolio.ts` names every metric's source or gap.
- **The connections sweep watches the keys revenue actually uses, strictly (2026-10-05).** `/api/health/connections-sweep` (every 6 hours) checks the Stripe organisation key and Heartside's Shopify credential with strict checks, so a rejected credential reads as failed, never as green.
- **Who a product is for lives only in `product_icp` (2026-10-05).** One row per `venture_registry.slug`, edited on Growth > Buyers, read through `src/lib/icp.ts` and `api/icp.ts`. A product with no row is blocked, never defaulted to another product's buyer.
- **Advisory (2026-08-05 reopened; 2026-08-29 reshaped).** Mindmake's advisory sells two doors into one privately scoped thirty-day paid proof. There is no offer ladder and no public price for it.

### 0a.7 Truth, publication and secrets

- **Publication ruling (Krish, 2026-10-05).** After an explicit warning that the repos are public and indexed permanently, Krish chose to publish his full ikigai, venture objectives, pricing and revenue in `krishanraja/control-center` and `krishanraja/ai-harness`. The `krishanraja/mindmake` repo is excluded ("just one product focused on one thing"). Two boundaries still hold because they are not his to give away: no credentials, secret names or infrastructure identifiers; no other people's personal details.
- **Live state beats documentation; documentation beats memory (standing canon).** When two sources disagree, stop destructive work and report the conflict.
- **Numbers are computed, never emitted by a model (standing; 15.5).** A model judges; code does arithmetic.
- **The mindmake repo stays out of the canon rollout (2026-10-06).** Krish closed its canon pull request; it must not be reopened by a nightly run. Where a ruling conflicts with that repo's canon (three channels, CTRL priced), the conflict is recorded here (0b) and the repo is not edited.
- **Canon wins on the business; this document wins on the machine.** If this document makes a business claim that contradicts `github.com/krishanraja/mindmake`, canon is right and this document is stale.

### 0a.8 Agents and engineering

- **The Growth tab is the UI gold standard, and every tab now meets it (2026-10-05).** Five rules: numbers compressed to a glance; insight only when asked; one action at a time, with the verdict landing where he pressed; honest emptiness, said once; recomposed per layout, not shrunk. Each surface's one move is chosen by `src/lib/surfaceMoves.ts`.
- **Nova's standard (2026-10-05).** A visibility target must be true on three conditions at once: the room (someone who can move a decision is in it), standing (naming the platform later helps him), and only-him (the angle rests on his own operating record). The score is the minimum of the three, not the mean. A refusal is written with its reason and shown. `api/_visibilityScore.ts`.
- **Hunter is active (2026-09-07 un-parked; confirmed 2026-10-05; ruled 2026-10-06: "Hunter is active yes").** The ikigai's park on the job search stays as written; the two are not a conflict to fix. It runs from GitHub Actions and the `hunter/tick` Vercel cron and reports into Control Center.
- **Arlo cannot push to `main` (2026-10-05).** Enforced: the VPS clone's push URL is anonymous, so a fetch works and a push fails. Arlo diagnoses a failed build and writes the cause into `workflow_runs`; it changes nothing.
- **Retirement is a status, never a delete.** Agents are set `active = false`; goals `dropped`; concepts closed through `close_concept`.
- **One capability, one system (2026-08-22, ADR-013).** Extend the house primitive; never fork it. The list and its guards are in `AGENTS.md`.
- **The VPS n8n governor warns and never acts (2026-09-09).** Nothing caps n8n spend except n8n's own monthly limit; that is a known, accepted gap.
- **Model routing (2026-09-20, 2026-09-24, ADR-024).** Anthropic is the primary provider; OpenRouter is the rescue provider only; n8n's Gemini fallbacks are flash-only because the Google key is free tier. Guarded by `check-anthropic-fallback` and `check-model-routing`.

### 0a.9 This document

- **One surface (2026-09-07).** This file on GitHub `main`. The VPS workspace copy, three skill bodies and the Google Drive mirror were deleted; the `mindmake-os` skill on every client is a thin router with no body.
- **The engine writes section 20; people write the rest (2026-09-07).**
- **Lean core plus linked detail (2026-10-05).** This file is the authoritative core; deep reference text lives in `docs/architecture/`, and superseded text in `docs/history/`.

---

## 0b. Open issues agents must not paper over

Each is real as of 2026-10-06. Do not work around one silently: name it when it touches your task.

| Issue | Where | Why it matters |
|---|---|---|
| The mission text the agents read is stale. `api/_mission.ts` still says "a paid three week pilot" and one door; canon is the thirty-day proof and two doors. It feeds Home's daily move | `api/_mission.ts` | Every daily move is grounded in the wrong offer until it is fixed |
| `api/_venturePositioning.ts` still offers the retired Strategy Day and lists `builder_economy` as live | `api/_venturePositioning.ts` | Agents grounded on it can propose a retired offer |
| The Monday scorecard still encodes the original ikigai plan: `STOP_RULE` and `DAY_90` (2026-12-05). The commitment is ongoing (0.3), but that stop rule fell unmet and Krish chose to continue, and the 5 Dec day 90 date is unconfirmed | `api/_scorecard.ts`, `api/scorecard/monday.ts` | Its "gap to day 90" lines present an unconfirmed date and a spent stop rule as live |
| Five of six products have no buyer definition: Heartside, Full Time, Legibility, CTRL and Pulse are undefined in `product_icp` (only `mindmake` is defined, read 2026-10-05). Maya's prospecting lane is visibly blocked for them | Growth > Buyers | Nothing prospects for the portfolio until Krish fills them |
| Pulse cannot take a payment: the server checkout is live, but nothing in the app calls `startCheckout()` | `krishanraja/fractionl-pulse`, `src/lib/checkout.ts` | Priority 3 product with no way to buy |
| `hasAccess()` fails open when its access code is unset | `api/_auth.ts` | A misconfigured deploy would open every guarded route |
| Six migration version collisions on `main`: `20260908090000`, `20260909110000`, `20260915250000`, `20261003120000`, `20261003210000`, `20261003220000` (two files each) | `supabase/migrations/` | A fresh database build can apply them in an undefined order |
| The n8n `Stripe \| Revenue Intake` mirror now fails closed, but that version is not pushed to n8n Cloud; its code nodes stay disabled | `scripts/n8n/` mirror | Re-enabling the cloud nodes without the push would reopen a forgeable path |
| The architecture engine's own entry text still names the two retired content lenses ("Built with AI", "The Money of AI") | `api/_architectureDoc.ts` | Section 20 entries carry retired vocabulary |
| Known debt, deliberately not bundled: two venture key spaces. The Growth tables key on product slugs (`full-time`, `circle`), the acquisition lanes and `maya_striking_distance` on lane slugs. `LANE_SLUG` in `api/_growth.ts` is the one map between them | `api/_growth.ts`, `src/lib/portfolio.ts` | Never write a lane slug into a growth table |
| Canon conflict in the business repo, to record not fix: `00_NORTH_STAR.md` still carries an older homepage promise ("Build the business that can think with you"), while `NOW.md` and `01_CANON.md` carry "Build the human + AI business that augments your vision", and 00 outranks 01 | `krishanraja/mindmake` | Quote the headline from `01_CANON.md` only after Krish settles it |
| Heartside's own store notes say the sling is priced below landed cost once the 30% discount applies | `krishanraja/heartside`, `docs/STORE-STATE.md` | Launch is 2026-10-20 |
| Credentials owed a rotation, listed by name in the one-swing ledger (not here) | `docs/plans/one-swing/STATE.md` | Several were pasted into chat or found inline in n8n history |
| Canon conflicts with Krish's rulings of 2026-10-06, recorded not fixed (the mindmake repo is out of the canon rollout): `02_PUBLICATION.md` (reviewed 2026-09-24) still says exactly two channels, The Money of AI and Built with AI, where the ruling and the database say three; and the canon says CTRL is "never priced", where the ruling says CTRL being priced is fine | `krishanraja/mindmake`, `venture_formats` | Write to the three subchannels and treat CTRL Pro as priced; the canon files are Krish's to edit |
| Krish's name or face in public: the 2026-07-06 Acquisition OS ruling says no motion may require it; the ikigai mission says "with my name on it"; the canon speaks as "we" | `docs/KRISH.md`, "Acquisition doctrine" | Open for Krish, and still not ruled on 2026-10-06. Ask whenever a plan depends on it |
| Mindmake's price: the 2026-10-05 publication ruling covers pricing in this repo, but the canon keeps Mindmake's rate card private ("no number appears anywhere public") | `docs/PORTFOLIO.md`, Mindmake | Do not publish the rate card until Krish says the ruling covers it |
| The venture tables still lag the 2026-10-05 ladder for Pulse and Circle: `ventures` calls them build experiments "never a product for sale", and Circle is marked active in both tables. (Full Time's rows in both tables were corrected on 2026-10-06 by ruling.) | Supabase `venture_registry`, `ventures` | Read priority and status from `src/lib/portfolio.ts` and `docs/PORTFOLIO.md`, never from those rows |
| Mindmake has two buyer definitions: its `product_icp` row (seeded from the canon) and the `pilot_face` lane in `docs/ICP.md` (ADR-016) | `product_icp`, `docs/ICP.md` | `product_icp` is the product's buyer; the lane scores inbound people |
| The full list of 24 source conflicts found while writing the portfolio | [`docs/PORTFOLIO.md`, "Inconsistencies found"](./PORTFOLIO.md#inconsistencies-found) | Check it before quoting a product's name, domain, buyer or price |

**Closed on 2026-10-06, kept here so nobody reopens them:** `src/lib/portfolio.ts` now names CTRL's tier "CTRL Pro" and counts paid Substack members under the publication (`SUBSTACK.paidCountedUnder` is `publication`, pinned by `tests/api/portfolio.test.ts`); Full Time's rows in `venture_registry` and `ventures` no longer frame it as a job-search asset; and Hunter being active alongside the ikigai's parked job search is ruled ("Hunter is active yes"), not a conflict.

---

## 0c. Retired: the only list of retired things

Anything named here is retired. Do not describe it as current, do not propose it, and do not resurrect it without a new ruling from Krish. Historical rows stay in the database so old records resolve.

| Retired | When | What replaced it, if anything |
|---|---|---|
| **Brands and ventures:** AdFixus, Meliora, Amperity, Techonomic | 2026-07 to 2026-08-06 | Nothing. Purged from the OS |
| Builder Economy (feed and back catalogue) | 2026-08-11 | Its thesis lived on as Built, now also retired |
| Mindmaker (the old brand), Mindmaker Live, MYMU as a content brand | 2026-08-29 | Mindmake; the publication |
| Signal & Noise as a venture | 2026-08-11 | Kept as a podcast distribution channel only; nothing is commissioned for it |
| Plinth (renamed Legibility 2026-08-07, then retired 2026-08-11) | 2026-08-11 | **Legibility is active again** (priority 2, 2026-10-05) |
| Products OnAlert, Gutted, Merciless | 2026-07-06 | Nothing; the apps await Krish's manual sunset |
| **Offers:** the offer ladder (The Handover, The Teardown, the 21-day Sprint, AI Immersion, Revenue Architecture, Signal Session, AI-Fluent Executive, workshops, Alumni Pass, deposits, Strategy Day) | 2026-08-29; archived in Stripe 2026-10-05 | Two doors into one privately scoped paid proof |
| **Content formats:** Paid and Built; then The Money of AI and Built with AI; the "This Week" room; the Content rooms model | 2026-08-11 to 2026-10-04 | Three subchannels; Content is "today's calls" (2026-10-04) |
| **Agents:** Felix | 2026-07-10 | Nothing (advisory sales then dropped) |
| Kai | 2026-09-07 | `/api/health/fleet-reconcile` and `/api/health/connections-sweep` |
| Priya | 2026-09-14 | Fleet reconcile and Vercel deploy checks |
| **Workflows and jobs:** Cleo `Draft Post on Demand` and `LinkedIn Distribution` | 2026-10-05 | Drafting in the Content tab; LinkedIn is manual |
| `Fleet \| Attribution & Product-Truth Health` | 2026-10-04 | Nothing; the apps' own emits still feed `attribution_app_health` |
| OpenClaw `Hunter - Daily Sourcing`, `product-agent`, `newsletter-draft` | 2026-10-05 | Hunter runs from GitHub Actions; the others are not replaced |
| VPS `sync-to-drive.py`, `cc-doc-creator.sh`, `arlo-daily-contradiction-audit.sh` | 2026-10-05 | `openclaw-runs-to-cc.py` into `workflow_runs` |
| `sync-briefs-to-skills.sh` (do not run) | 2026-10-05 | `render-identity.py` from `agents.brief_content` |
| The three "Weekly Documentation Refresh" Routines | 2026-09-07 | The architecture engine and the docs steward |
| **Surfaces:** Telegram alerting to Krish (all six layers) | 2026-09-06 | Control Center, read when he chooses |
| The OS Queue | 2026-10-04 | Each ruling is decided in the tab that owns it |
| Today, Bets, Plans and Leads as tabs; the 11-tab layout | 2026-08-20 to 2026-08-26 | Six destinations and a drawer (`src/lib/tabs.ts`) |
| The outbound send surfaces (Send Approval Deck, Reply Inbox, Sequence Review) | 2026-08-04 | Nothing; cold outbound is not done |
| `VITE_BRIDGES_LANE_ENABLED` | 2026-09-15 | The Hunt lane is always on |
| **Copies of this document:** VPS workspace copy, three VPS skill bodies, the Google Drive mirror, `sync-architecture-surfaces.py` | 2026-09-07 | This file |
| The `compound/` app inside this repo | 2026-09-21 | Its own repo, `krishanraja/compound` |
| Apollo for sourcing; Instantly senders | 2026-07-10 | Paused by design |

Circle is **dormant, not retired**: preserved, never purged, not worked (2026-10-05). The words mean different things and must not collapse into each other.

---

## 1. Outcomes: what the OS is for

The OS is judged by outcomes, not activity. Each outcome names where its live measure is.

| # | Outcome | Live measure |
|---|---|---|
| O-1 | Krish spends his hours on decisions, not operations | Home's waiting count (fresh rulings only, `src/lib/freshDecisions.ts`) and the `decisions_waiting` view |
| O-2 | The portfolio grows in ladder order, and the publication's audience grows | The portfolio board on Growth and Subscriptions (`src/lib/portfolioBoard.ts`); revenue from `api/revenue/*`; Heartside in the Shopify admin |
| O-3 | One person runs what normally takes a team of fifteen to thirty | Active workflows and their success, `workflow_runs`; OS > Flows |
| O-4 | The same mistake does not survive four occurrences, and a repeated win becomes a skill | `feedback_queue` into `corrections`; `skill_proposals`; `suggestions` and `suggestion_verdicts` |
| O-5 | The same silent failure does not survive a week | `silent_failures` and the weekly pattern sweep |
| O-6 | Nothing external goes out without Krish | `check-bridges-never-send` in CI; `email_drafts` records every draft, and Gmail sends only when he presses send |
| O-7 | Decisions wait less than a day on enriched surfaces | Age of rows in `decisions_waiting` |
| O-8 | A closed concept does not come back | `concept_decisions`; `audit_log` events `concept_closed` and `concept_reopened` |

If a workflow, table or surface cannot be traced to one of these in one sentence, it is suspect.

---

## 2. What is in the box

| Component | Role | Where the live truth is |
|---|---|---|
| **Supabase (the OS project)** | Postgres, the single source of truth for every piece of OS state; PostgREST, Realtime, edge functions | The schema itself (`information_schema`); migrations in `supabase/migrations/` |
| Product databases (read only from the OS) | CTRL's corroborated headlines pool and audience capture, read by the content corpus and the audience bridge | Each product's own repo. The OS never writes to a product database |
| **Control Center** | The dashboard and its `/api/*` serverless routes and Vercel crons | This repo; Vercel project `control-center`; `vercel.json` |
| **The content engine** | The content control plane: editorial and Composer routes, content crons, the video and carousel plane | `krishanraja/content-engine` (ADR-019) |
| **n8n Cloud** | Agent jobs on cron or webhook, each writing back to Supabase | The n8n API; mirrors in `scripts/n8n/` and `n8n/workflows/` (direction of truth is per workflow; see `AGENTS.md`) |
| **The VPS (OpenClaw)** | Claude Code agents with workspaces, the OpenClaw cron registry, zero-AI shell and Python crons | `/root/.openclaw/` on the VPS; read with one-shot `ssh` commands |
| **GitHub Actions** | Hunter, the AEO engine (`krishanraja/AEO-Engine`, Sunday 04:00 UTC), the docs steward, CI | `.github/workflows/` in each repo |
| **Stripe** | One organisation, five accounts; read only from Control Center with one organisation key | Stripe API; `scripts/stripe-reconcile.mts` |
| **Shopify** | Heartside's store and payments | The Shopify admin; Control Center only checks the credential |
| **Google Workspace** | Gmail drafts (never sends); "Send to Google Docs" on the Content tab when Krish presses it | Gmail and Drive |
| **Model providers** | Anthropic primary; OpenRouter rescue only; Gemini flash fallbacks in n8n | `docs/MODEL_ROUTING_AUDIT.md`; `scripts/check-model-routing.mts` |
| **ai-harness** | The skills, operating contract and canon every AI tool loads; the canon block in `AGENTS.md` is rendered from it | `krishanraja/ai-harness` |

Credentials are never named here. Agents retrieve them at run time from the managed secret stores of each platform.

---

## 3. The agent fleet

The roster is the Supabase `agents` table (`active = true`), read live on 2026-10-05: **11 active of 14**. Detail on each agent's workflows and history: [`docs/architecture/03-agent-fleet.md`](./architecture/03-agent-fleet.md). The rules for agent identity (slug as key, lifecycle, briefs): [`docs/AGENTS.md`](./AGENTS.md).

| Agent | Pod | What it does now |
|---|---|---|
| Agatha | Executive | Chief operating officer: the strategic chat, weekly plan refresh, decomposing objectives |
| Marcus | Executive | Synthesis: the daily brief and `home_intelligence`, Friday retro, Monday pre-mortem |
| Vera | Operations | Quality and standards: audits, feedback aggregation into `corrections`, the gap-closure loop, skill induction from wins |
| Leo | Operations | Revenue reporting, weekly |
| Arlo | Operations | Mechanical liveness of the VPS and the build. Diagnoses a failed build into `workflow_runs`; cannot push (0a.8) |
| Cleo | Growth | Content production and voice. Its last two n8n workflows were retired on 2026-10-05; the work happens in the Content tab and the content engine |
| Maya | Growth | Customer acquisition and SEO. Its B2B prospecting reads `product_icp` and is blocked for any product with no row |
| Nell | Growth | Podcast guest booking and briefings (into `guests.briefing_md`) |
| Nova | Growth | Visibility and speaking, held to the three-condition standard (0a.8) |
| Zara | Growth | Signal intelligence and market research |
| Hunter | Growth | Job sourcing, packages and warm intros; the Hunt lane on People. Runs from GitHub Actions and `/api/hunter/tick` |

**Retired, rows kept:** Felix (2026-07-10), Kai (2026-09-07), Priya (2026-09-14). **Outside the business:** four personal-life agents live only in the VPS OpenClaw config; they are not in `agents` and never appear in Control Center.

**Two shapes.** Claude Code agents run inside OpenClaw on the VPS with a workspace and conversational memory; n8n workflow agents wake on cron or webhook, do one job, write to Supabase and stop. Some agents have both.

**Health without an agent.** Two Vercel crons replaced Kai, because an n8n workflow monitoring n8n shares the blind spot it exists to close: `/api/health/fleet-reconcile` (every workflow against the n8n API) and `/api/health/connections-sweep` (the cheapest live probe of every key Vercel holds, strict for the Stripe organisation key and Heartside's Shopify credential). Note the boundary: the sweep probes keys Vercel holds; n8n holds its own credentials, and n8n-side rot shows in fleet reconcile instead.

---

## 4. Supabase: the single source of truth

Every piece of OS state lives in one Postgres database. The live schema held **241 tables and 38 views** on 2026-10-05; count it from `information_schema.tables`, never from a document. Full table-by-table detail, keeping the subsection numbers below: [`docs/architecture/04-supabase.md`](./architecture/04-supabase.md). Engineering notes: [`docs/DATABASE.md`](./DATABASE.md), [`docs/DB_HEALTH.md`](./DB_HEALTH.md).

**Rules that hold for every table.** RLS is on, always. The browser reads with the anon key where a policy allows; anything needing the service role goes through an `/api/*` route, never through a service key in browser code. Some tables are deliberately service-role only (for example `product_icp`, `agent_plans`, `strategist_reads`), so the browser sees them only through an API route. Local JSON for state is banned. Renames read both old and new columns until the old one is dropped.

- **4.1 Identity and rules.** `agents` (identity and `brief_content`), `standards_registry`, `venture_registry` and `ventures` (two venture tables; update both), `venture_formats`, `product_icp`, `completeness_contracts`.
- **4.2 Plans and work in flight.** `goals` (the ladder), `daily_focus`, `tasks`, `agent_plans`, `leads`, `guests`, `visibility_targets`, `events`, `content_ideas`, `intake_items`, the Growth tables (`growth_*`, including the AEO tables `growth_aeo_subjects`, `growth_aeo_queries`, `growth_aeo_digests` and the probes in `growth_geo_probes`), `pilot_deals`.
- **4.3 Customers, revenue and bets.** `customers` (cross-product ledger; Stripe is its ground truth), the `revenue_*` tables written by `api/revenue/sync.ts`, `customer_contacts`, `acquisition_sends` (the dormant outbound ledger), `bets`.
- **4.4 Operational firehose.** `workflow_runs` (every run, n8n and OpenClaw), `audit_log` (append only), `feedback_queue`, `corrections`, `silent_failures`, `suggestions` and `suggestion_verdicts`, `system_health`, `home_intelligence`, `email_drafts`.
- **4.5 to 4.6 Scratchpads and plumbing.** Per-agent tables and `system_config`. See the detail file.
- **4.7 `decisions_waiting`.** One view unioning everything waiting on Krish into one shape. A new kind of waiting thing adds a branch to the view; it never adds a sibling panel. Its latest definition is in `supabase/migrations/`.
- **4.8 RPCs worth knowing.** `close_concept` and `reopen_concept`, `merge_contacts`, `route_vera_gaps` and `reconcile_vera_gaps`, `sync_audience_contact`, `operator_home_city`. Detail file for the rest.
- **4.9 RLS posture.** Above.
- **4.10 Closure architecture.** Closing a concept, not just a row: `concept_id` on the closeable tables, the `concept_decisions` ledger, the `status_change_log` trigger trail, and the cascading `close_concept` RPC. "We are done with X" is always `close_concept`, never a row patch (standards CLO-001 to CLO-003). What is live and what is not yet built is in [`docs/architecture/17-roadmap-and-closure.md`](./architecture/17-roadmap-and-closure.md) (17.7).
- **4.11 The unified audience pipeline.** Every capture source feeds one audience list; payment is the only switch between a lead and a customer, never both. Detail file.

---

## 5. Control Center

Live at `controlcenter.krishraja.com`, behind an access code, auto-deployed from `main` on Vercel. React 18, TypeScript, Vite and Tailwind; Supabase JS for reads and Realtime; thin Vercel functions in `api/`. Full per-tab spec: [`docs/PRODUCT.md`](./PRODUCT.md). Engineering contract: [`docs/ARCHITECTURE.md`](./ARCHITECTURE.md). Design system: [`docs/DESIGN_SYSTEM.md`](./DESIGN_SYSTEM.md). Older detail: [`docs/architecture/05-control-center.md`](./architecture/05-control-center.md).

**The tabs (live registry `src/lib/tabs.ts`):**

| Tab | What it answers |
|---|---|
| Home | Today on one screen that never scrolls: the goal ladder, today's three, today's proposed move, and the waiting count |
| Content | Today's calls on the publication's three subchannels, the Composer and the capture of ideas |
| People | Network (the default lane), Hunt, Visibility and Advisory: who to talk to and why |
| Growth | Is anyone finding the products, and the one thing to do now. Views: next, week, numbers, places, buyers |
| OS | Org, Intel, Flows and Systems: the agents, the spend and the machine's health |
| Focus (drawer) | Krish's own operating theory on tap: the daily ask, steadying moves, decision rules |
| Board (drawer) | Work Claude and Codex sessions wrote for Krish: waiting, in progress, done |
| Subscriptions (drawer) | Money: tiles, the Substack line, the ranked portfolio board and what to wire next |

**The standard every tab meets (2026-10-05):** numbers at a glance, insight only when asked, one move at a time, honest emptiness, recomposed per layout (0a.8). The window never scrolls; each tab owns one bounded scroller (`shared/AppFrame`), and Home may not scroll at all. These are guarded by Playwright specs that CI runs; see `AGENTS.md`.

**How Krish's actions reach the OS.** A click writes Supabase (directly where RLS allows, or through `/api/*`); a trigger or the route posts to the n8n Orchestrator or a workflow's own webhook; the workflow writes back; Realtime updates the screen. Nothing in that chain sends anything external.

---

## 6. Workspace architecture (the VPS)

OpenClaw on the VPS hosts the Claude Code agents, each with a workspace under `/root/.openclaw/`, the OpenClaw cron registry, and zero-AI scripts on the root crontab. The VPS has its own checkout of this repo at `/root/Projects/control-center`; it is a checkout that follows `main`, never a separate copy, and it cannot push. Access is by one-shot `ssh` commands. Detail: [`docs/architecture/06-07-workspace-and-agent-contract.md`](./architecture/06-07-workspace-and-agent-contract.md).

Two VPS scripts key off this document's path: `os-autonomous-diagnostics.py` checks the file exists in the VPS checkout (its `CRITICAL_PATHS`) and names the GitHub URL in its repair prompt; `regen-arch-section-4.py` writes a schema table to its own output file and never edits this document. Neither depends on a heading.

---

## 7. The agent operating contract

Every agent, on every wake: load its brief from `agents.brief_content` (rendered to SKILL.md), load the standards digest rendered from `standards_registry`, load the goal canon, do the work, pass the output gate, and write the result to Supabase where Control Center reads it. It never pings Krish, never writes into Drive, never sends, never publishes, and never works on retired or dormant things. The priority and reporting block at the top of every brief carries the ladder (0a.5). Detail: [`docs/architecture/06-07-workspace-and-agent-contract.md`](./architecture/06-07-workspace-and-agent-contract.md).

---

## 8. Data flows that matter

Each flow ends as rows Control Center reads. Detail for the older flows (leads, guests, visibility, email drafts, learning loop, self-healing, synthesis, identity rendering, closure): [`docs/architecture/08-data-flows.md`](./architecture/08-data-flows.md).

- **Money.** Stripe organisation key (five accounts) into `api/revenue/sync.ts` (daily 08:00 UTC) into the `revenue_*` tables and `customers`; the verified webhook `POST /api/revenue/webhook`; `system_config.stripe_price_product_map` files each price under a product. Heartside is read in Shopify, by link. Re-measure with `scripts/stripe-reconcile.mts`.
- **Audience.** Product and site captures into one audience list, bridged into the OS; paid becomes a `customers` row, free becomes a `leads` row, never both (4.11). Free Substack readers arrive only from the CSV dropped on Subscriptions, because Substack has no API.
- **Intake to content.** Every arrival from any source becomes one `intake_items` row; ideas flow to the content engine and to Content's calls; Krish decides; publishing is manual.
- **Build signals.** Each Saturday the content engine reads the week's commits in Krish's repos into `content_ideas` as build signals (`docs/CONTENT-ENGINE-BUILD-SIGNALS.md`); on Sunday this repo's engine writes section 20 from them.
- **Agent runs.** n8n workflows write a `workflow_runs` heartbeat per run; OpenClaw runs arrive through `openclaw-runs-to-cc.py`; Control Center measures staleness from the absence of rows, so a dead recorder reads as stale, never as healthy.
- **Learning.** Krish's rejections go to `feedback_queue`; Vera groups them into `corrections`; approved corrections edit briefs or standards. Every machine output that proposes is a `suggestions` row with a reason, and the verdict bank learns from his answers.
- **Goals to moves.** The goal ladder feeds the strategist and today's move; Krish takes or ignores it.
- **People.** The network (`contacts`, `contact_identities`, `contact_intelligence`) feeds Network, Hunt, Visibility and Advisory. Two rows that are one person merge only through `merge_contacts`.

---

## 9. Cron and scheduling

Five schedulers, each with one live list. Never trust a copied schedule; read the list. Detail and history: [`docs/architecture/09-scheduling.md`](./architecture/09-scheduling.md).

| Scheduler | Live list | Notes |
|---|---|---|
| Vercel crons (this repo) | `vercel.json` | Health every 6 hours, revenue daily, events each morning, goals week-close Saturday 05:00 UTC, the architecture engine Sunday 13:00 UTC, the strategist and Hunter hourly. No n8n cost |
| Vercel crons (content engine) | `vercel.json` in `krishanraja/content-engine` | Content and build-signal jobs |
| n8n Cloud | The n8n API (`node scripts/n8n/audit.mjs --verbose`) | The plan cap is 10,000 executions a month and n8n enforces it by stopping every workflow. The VPS governor only warns (0a.8) |
| OpenClaw cron | `openclaw cron list` on the VPS | Spawns Claude Code sessions; costs model tokens |
| VPS root crontab | `crontab -l` as root on the VPS | Zero-AI scripts: sync engine, identity render, OpenClaw runs to Control Center, standards digest |
| GitHub Actions | `.github/workflows/` per repo | CI, the docs steward (nightly), Hunter, the AEO engine |

Retired on 2026-10-05: `sync-to-drive.py`, `cc-doc-creator.sh`, `arlo-daily-contradiction-audit.sh`, and the OpenClaw jobs `Hunter - Daily Sourcing`, `product-agent` and `newsletter-draft` (0c).

**Cost discipline.** Pick the cheapest tier that can do the job: no model at all on the crontab; a cheap model for classification; Sonnet-class for real work. Every n8n cron tick is a billable execution.

---

## 10. Google Drive

**Agents never write into Krish's Drive** (0a.5). Drive holds Krish's own documents. The one OS path that creates a Google Doc is the Content tab's "Send to Google Docs", which runs only when he presses it. The old folder map of agent destinations is history: `docs/history/2026-10-05-MINDMAKE_OS_ARCHITECTURE-superseded-sections.md`.

---

## 11. Portfolio context

The canonical ranking is `src/lib/portfolio.ts`; each product's objectives and detail are in [`docs/PORTFOLIO.md`](./PORTFOLIO.md). This section records only what the OS needs to know to work.

### 11.1 Mindmake and the publication

Mindmake (mindmake.co) is the business and the mission. Its one sentence, from canon: "Every AI a leader buys already knows the market. None of them know the leader. Mindmake builds the one that does, so the leader keeps their edge as the market moves." Its headline in `01_CANON.md`: "Build the human + AI business that augments your vision" (see the canon conflict in 0b). Two doors, Build your AI brain and Build your AI GTM, lead into one privately scoped paid proof. It sells instruments, not oracles. Mindmaker LLC remains the legal entity. Canon, voice and every customer-facing claim come from `github.com/krishanraja/mindmake`, not from this document.

The publication runs on Substack at home.makeyourmindup.ai, its address since 2026-10-05, with three subchannels (0a.1); its canon is `github.com/krishanraja/makeyourmindup`. It carries paid tiers, so it is never described as free. Signal & Noise is a podcast distribution channel only.

### 11.2 The product ladder

Priority 1 Heartside and Full Time; priority 2 Legibility; priority 3 CTRL and Pulse; Circle dormant (0a.6). Every product has its own repo and its own database; the OS reads them, never writes them. The slug spellings a product carries in each table (`venture_registry`, `growth_*`, the `customer_product` enum, the web and metrics keys) are recorded in one row each in `src/lib/portfolio.ts`; they are not unified, because each is a live key somewhere.

### 11.3 Money, as measured

See 0.2 for the figures measured on 2026-10-05 and 0a.6 for the rules. The live sources: Stripe (five accounts through the organisation key), the `revenue_*` and `customers` tables, `/api/revenue`, and Heartside's Shopify admin. Re-measure before quoting.

### 11.4 The fleet attribution warehouse

An `attribution` schema in the OS database, fed by one secret-gated ingest edge function, gives funnel and revenue views by app and campaign. CTRL, Pulse and Circle emit; Heartside, Full Time and Legibility are not wired. The monitoring workflow was archived on 2026-10-04; `attribution_app_health` is still written by the apps' own emits and read by `api/fleet-funnel.ts`. The warehouse source lives in `warehouse/` in this repo. Detail: [`docs/architecture/11-warehouse-and-acquisition.md`](./architecture/11-warehouse-and-acquisition.md).

### 11.5 The Acquisition OS

One engine and per-lane control plane over `leads`, `customers` and `venture_registry`: a profit governor, an autonomy ladder (L1 every send approved, L2 sampled, L3 exception only; all lanes are L1), a direction studio and a tool registry, on Growth's numbers view. No cold email; the send surfaces are unmounted. Who each product is for now comes from `product_icp`. Detail: [`docs/architecture/11-warehouse-and-acquisition.md`](./architecture/11-warehouse-and-acquisition.md).

---

## 12. Standards

Two rulebooks. **For agents:** `standards_registry` (count it live), rendered nightly to the standards digest every agent loads, enforced by the output gate and audited by Vera. Families include brand voice, Git author identity, publishing approval (PUB-001, PUB-005), model tiering, n8n discipline, closure (CLO-001 to CLO-006), cost and attribution (ATTR-001, PRODTRUTH-001). **For code in this repo:** the house systems and the CI guards listed in [`AGENTS.md`](../AGENTS.md); each guard encodes an invariant that already shipped broken once. Detail: [`docs/architecture/12-15-standards-failures-lookup-decisions.md`](./architecture/12-15-standards-failures-lookup-decisions.md).

---

## 13. Failure modes and how the OS heals

The most expensive failures in this OS have been **silent successes**: a run that reads green and moved nothing. The tell is always the same: a non-zero "scanned" count beside a zero "written" count. Never trust a heartbeat that does not prove the destination moved. Recurring shapes: an upsert whose conflict target cannot be inferred, swallowed by `continueRegularOutput`; a refactor leaving a downstream node reading a dead field; a pipeline wired through a notification node that was later disabled; a watermark stamped on failure; a fallback model that 404s behind `neverError`; a monitor that shares a dependency with the thing it monitors.

Healers: completeness contracts and the Silent Success Detector (`silent_failures`), fleet reconcile and the connections sweep (Vercel, every 6 hours), `write-system-health.py` and the critical infrastructure monitor (VPS), Vera's weekly sweeps. A first debugging pass: `workflow_runs` for the workflow, then `silent_failures`, then `audit_log` by actor, then the failing execution in the n8n API, then the mirror against the live workflow. Detail: [`docs/architecture/12-15-standards-failures-lookup-decisions.md`](./architecture/12-15-standards-failures-lookup-decisions.md).

---

## 14. Operational lookup

| You need | Look at |
|---|---|
| This document | GitHub `main`, `docs/MINDMAKE_OS_ARCHITECTURE.md` |
| What an agent is and does | `agents.brief_content` |
| What an agent ran and when | `workflow_runs`, `audit_log`; OS > Org and Flows |
| Everything waiting on Krish | `decisions_waiting`; Home's waiting count |
| The product ranking and slug map | `src/lib/portfolio.ts` |
| Who a product is for | `product_icp`; Growth > Buyers |
| What a subchannel is for | `venture_formats.mandate` |
| Revenue | `api/revenue/*`, the `revenue_*` tables; `scripts/stripe-reconcile.mts` |
| Heartside's orders | The Shopify admin analytics |
| Whether a concept is closed | `concept_decisions` where `decision = 'closed'` and `superseded_at` is null |
| The current schema | `information_schema`; `supabase/migrations/` |
| The n8n workflows | The n8n API; mirrors in `scripts/n8n/` |
| What changed recently | `git log`, [`NOW.md`](../NOW.md), section 20 |
| A credential | The platform's own secret store, never a document |

---

## 15. Architectural decisions worth knowing

Each is recorded in full in [`docs/DECISIONS/`](./DECISIONS/) or the detail file [`docs/architecture/12-15-standards-failures-lookup-decisions.md`](./architecture/12-15-standards-failures-lookup-decisions.md) (which keeps the numbers 15.1 to 15.17).

- **15.1** Supabase is canonical; files are rendered from it and never edited in place.
- **15.2** Identity, plan, objective and decision are four different things in four different places.
- **15.3** Approval is a wall, not a step.
- **15.5** Numbers are computed, never emitted by a model.
- **15.6** RLS on every table, always.
- **15.11** One `decisions_waiting` view; never a sibling panel.
- **15.13** Drafts, never sends.
- **15.14** `/api/*` is the only service-role path from the browser.
- **15.16** Closure is concept-level, not row-level.
- **15.17** Harness learning uses one remote inbox (ADR-020).
- ADR-013 one system per job; ADR-016 the one swing (its commitment ongoing by ruling 2026-10-06, its original dates history, 0.3); ADR-019 the content engine owns the control plane; ADR-024 OpenRouter is the rescue provider only; ADR-025 Draw is peer density; ADR-026 the strategist; ADR-028 the daily move and the cheap lane.

---

## 16. What a working week looks like

Krish opens Control Center when he chooses. Nothing comes to him. Home shows today's three, today's proposed move and how much waits; each tab leads with its one move.

- **Monday:** the Monday scorecard note is recorded (10:30 UTC); follow.the.money is due; the Advisory lane's Monday run.
- **Wednesday:** under.the.hood is due.
- **Friday:** mind.the.gap is due.
- **Saturday:** the GitHub read for the scorecard (04:00 UTC), the Friday variance note (04:30 UTC), goals week-close (05:00 UTC) and the content engine's build-signal ingest (05:00 UTC).
- **Sunday:** the AEO engine (04:00 UTC), the growth review per product (17:00 UTC), and the architecture engine writes section 20 (13:00 UTC).
- **Every few hours, unasked:** fleet reconcile, the connections sweep, revenue sync (daily), events (each morning), Hunter and the strategist (hourly).

---

## 17. Where this is going

The live plans are Krish's, not this document's: the ladder in `src/lib/portfolio.ts`, the objectives in `goals`, and each product's objectives in [`docs/PORTFOLIO.md`](./PORTFOLIO.md). The ikigai commitment is ongoing; its original dated plan is history and no new dates are set (0.3). Two older aspirations stay as reference only: the remaining closure work (generator guards, a synthesis-time join on `concept_decisions`, a reopen route) and the ideas around multi-channel waiting items. Neither changes the rule that Control Center never sends. Detail: [`docs/architecture/17-roadmap-and-closure.md`](./architecture/17-roadmap-and-closure.md).

---

## 18. Glossary

Every term, table and product noun is defined once in [`docs/GLOSSARY.md`](./GLOSSARY.md). Where it and this document disagree, this document wins and the glossary is fixed.

---

## 19. Quick reference

```
# This repo (krishanraja/control-center)
docs/MINDMAKE_OS_ARCHITECTURE.md   this file, the one surface
docs/architecture/                 deep reference detail behind this file
docs/history/                      superseded text, verbatim, with banners; LOG.md is the index
NOW.md                             where Control Center is right now (kept by the docs steward)
src/lib/portfolio.ts               the product ranking and every slug spelling
src/lib/tabs.ts                    the tab registry
src/lib/surfaceMoves.ts            each surface's one move
api/_architectureDoc.ts            the engine's parser for section 20 and the refresh stamp
api/architecture/weekly.ts         the Sunday engine run
api/revenue/                       the money read; scripts/stripe-reconcile.mts re-measures it
scripts/check-*.mts                the CI guards (list in AGENTS.md)
scripts/n8n/                       n8n mirrors and the audit
supabase/migrations/               the schema history

# The VPS (read with one-shot ssh)
/root/.openclaw/                   OpenClaw config, cron registry, agent workspaces, scripts
/root/Projects/control-center      a checkout of this repo that follows main and cannot push
```

---

## 20. Recent architectural changes - rolling changelog

### 2026-10-04: the week's builds, written by the engine <!-- engine-week:2026-10-02 -->

Week ending Friday 2026-10-02. Written by `api/architecture/weekly.ts` from the `build_signal` rows the Saturday ingest wrote (`docs/CONTENT-ENGINE-BUILD-SIGNALS.md`). Named products are named; every other repo folds into one line because this document is public. This entry is the engine's record, not a ruling: a ruling goes in section 0a, by a person.

- No build signals were recorded for this week. Either nothing was built, or the Saturday ingest did not run; the Monday note says which.

### 2026-09-13: the week's builds, written by the engine <!-- engine-week:2026-09-11 -->

Week ending Friday 2026-09-11. Written by `api/architecture/weekly.ts` from the `build_signal` rows the Saturday ingest wrote (`docs/CONTENT-ENGINE-BUILD-SIGNALS.md`). Named products are named; every other repo folds into one line because this document is public. This entry is the engine's record, not a ruling: a ruling goes in section 0a, by a person.

- **Control Center**: 94 commits, 43 merged PRs, 300 files, +5652 -12358. Merged: The detector for silent failures was itself failing silently | Guard the write routes. The API was open to the internet | Content tab: stop the two halves fighting, and filter the noise | Close the anonymous write holes, and stop the alarm writing into a void | Run again: make the obligation strip actionable | Sync the canon block | The outermost clock, outside the thing it watches | An advisory that remembers to re-measure, and the measurement itself | Make prompt-cache spend visible, and guard it | Sync the canon block | A push is a validation run, not a Claude run | Point Control Center at the Content Engine and stop hosting it and 31 more. Content radar: Built with AI not judged yet, The Money of AI not judged yet.
- **the Mindmake site**: 23 commits, 13 merged PRs, 76 files, +4569 -2985. Merged: Sync the canon block | Sync the canon block | Repair the four answer files that broke the build | Answer: how do adtech companies compete once AI can build targeting models without them | Answer: how do I build an AI center of excellence without a dedicated engineering budget | Answer: how do I calculate the total addressable revenue opportunity for AI products in publishing | Publish /answers, the surface written to be quoted | Sync the canon block | Carry the shared canon block in AGENTS.md | Swap the media CRO's story for one that fits the quote | The testimonials as revised, on the rail and in the story deck | Record the promotion, the function deploys and the synthetic lead and 1 more. Content radar: Built with AI not judged yet, The Money of AI not judged yet.

### About this section, and the entries before 2026-09-11

This section is the engine's. `api/architecture/weekly.ts` writes one entry per week directly under the section heading, marked `<!-- engine-week:... -->`, so the newest week is always first; a re-run replaces its own week rather than duplicating it. Do not hand-edit an entry that carries the mark, and keep this heading as the last one in the section: the engine ends a replaced entry at the next `### ` heading, so without it a re-run of the oldest week would cut the rest of the file. A ruling goes in section 0a, by a person. The hand-written changelog that used to live here (2026-05-21 to 2026-09-09) is in `docs/history/2026-10-05-MINDMAKE_OS_ARCHITECTURE-changelog.md`; what changed day to day in Control Center is in `NOW.md` and `docs/history/LOG.md`.

---

## 21. Update protocol

**Edit this file when the architecture or a rule genuinely changes:** a new agent, a retired component, a new source-of-truth table, a ruling. Do not edit it for a transient incident (that goes in `audit_log` and a task). Never paste a credential, a secret's name, an infrastructure identifier or another person's details. When in doubt: will this still be true in a week? If not, it belongs in a live table, `NOW.md` or a task.

**How to change it.** An ordinary pull request on `krishanraja/control-center`, following `AGENTS.md`. Afterwards, verify by fetching the raw URL, not by reading your checkout. There is nothing to sync.

**Where things go.**

- A ruling: section 0a, with its date, written by a person (record it in the commit body as `Ruling (Krish, YYYY-MM-DD): ...`).
- Something broken or contradictory that cannot be fixed now: section 0b.
- Something retired: section 0c, the only retired list.
- Deep reference detail: a file in `docs/architecture/`, linked from the section it serves.
- Text that is no longer true: moved to `docs/history/` with a Historical banner and a line in `docs/history/LOG.md`; never deleted.
- The weekly build record: section 20, written by the engine only.

**Anchors that code and tools depend on. Do not change them without changing the dependency in the same pull request:**

| Anchor | Who depends on it |
|---|---|
| The path `docs/MINDMAKE_OS_ARCHITECTURE.md` on `main` of `krishanraja/control-center` | `api/_architectureDoc.ts` (`ARCHITECTURE_DOC_PATH`), `api/architecture/weekly.ts`, `api/scorecard/monday.ts` (raw URL), the VPS `os-autonomous-diagnostics.py` (`CRITICAL_PATHS` and its repair prompt), the `mindmake-os` router skill in `krishanraja/ai-harness` |
| Section 20's heading, byte for byte (the `## 20.` line above, as written; this table deliberately does not repeat it, so the engine's search finds exactly one) | `CHANGELOG_HEADING` in `api/_architectureDoc.ts`: the engine inserts each week directly under it, and throws if it is missing |
| `<!-- engine-week:YYYY-MM-DD -->` marks | `entryMark()` in `api/_architectureDoc.ts`: a re-run replaces the marked entry |
| A `### ` heading after the last engine entry (today "About this section, and the entries before 2026-09-11") | `applyWeekEntry()` ends a replaced entry at the next `\n### `; with no heading after it, replacing the oldest entry would cut everything to the end of the file |
| The line `**Last engine refresh:** YYYY-MM-DD`, within the first 20,000 bytes | `REFRESH_MARK` in `api/_architectureDoc.ts` (stamped weekly) and `architectureDocLine()` in `api/scorecard/monday.ts` (reads only the first 20,000 bytes) |
| The section numbers 0 to 21, `## 0a.` to `## 0c.`, and the subsection numbers 0a.3, 4.2, 4.3, 4.8, 4.10, 11.4, 11.5 | The `mindmake-os` router's section map, and comments in `api/`, `src/`, `warehouse/` and migrations that cite them |

**The detail files** behind this core, each keeping its old subsection numbers:

| File | Serves |
|---|---|
| [`docs/architecture/03-agent-fleet.md`](./architecture/03-agent-fleet.md) | Section 3 |
| [`docs/architecture/04-supabase.md`](./architecture/04-supabase.md) | Section 4 (4.1 to 4.11) |
| [`docs/architecture/05-control-center.md`](./architecture/05-control-center.md) | Section 5 |
| [`docs/architecture/06-07-workspace-and-agent-contract.md`](./architecture/06-07-workspace-and-agent-contract.md) | Sections 6 and 7 |
| [`docs/architecture/08-data-flows.md`](./architecture/08-data-flows.md) | Section 8 |
| [`docs/architecture/09-scheduling.md`](./architecture/09-scheduling.md) | Section 9 |
| [`docs/architecture/11-warehouse-and-acquisition.md`](./architecture/11-warehouse-and-acquisition.md) | Sections 11.4 and 11.5 |
| [`docs/architecture/12-15-standards-failures-lookup-decisions.md`](./architecture/12-15-standards-failures-lookup-decisions.md) | Sections 12 to 15 |
| [`docs/architecture/17-roadmap-and-closure.md`](./architecture/17-roadmap-and-closure.md) | Section 17 |

**History.** The four dated canon blocks, the old header, outcomes, components, Drive map, brand tables, ideal day, glossary, paths and update protocol, as they stood on 2026-10-04: [`docs/history/2026-10-05-MINDMAKE_OS_ARCHITECTURE-superseded-sections.md`](./history/2026-10-05-MINDMAKE_OS_ARCHITECTURE-superseded-sections.md). The hand-written rolling changelog: [`docs/history/2026-10-05-MINDMAKE_OS_ARCHITECTURE-changelog.md`](./history/2026-10-05-MINDMAKE_OS_ARCHITECTURE-changelog.md).
