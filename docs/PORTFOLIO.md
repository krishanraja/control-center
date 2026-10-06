# Krish's portfolio: every venture

**Every venture Krish Raja runs, in priority order, each described the same way so an agent can compare them.** Read [`docs/KRISH.md`](KRISH.md) first: it holds the decision rules every proposal here must pass, and how the products sit inside the mission.

| | |
|---|---|
| As of | 2026-10-06 (money measured 2026-10-05) |
| Priority order | `src/lib/portfolio.ts` (the single code source of the ranking) |
| Money | Measured live on 2026-10-05 across all five Stripe accounts and the Shopify Admin API |
| Live buyer definitions (ICP) | Supabase `product_icp`, edited in Control Center at **Growth > Buyers** |
| Business canon for Mindmake | `github.com/krishanraja/mindmake`, `project-documentation/00_NORTH_STAR.md` and `01_CANON.md` (read only) |

> **Ruling (Krish, 2026-10-05):** publish his ikigai, venture objectives, pricing and revenue in `krishanraja/control-center` and `krishanraja/ai-harness`. The `krishanraja/mindmake` repository is excluded. No credentials, secret names or infrastructure identifiers, and no other people's personal details.

> **Ruling (Krish, 2026-10-05): priority ladder.** Priority 1: Heartside and Full Time. Priority 2: Legibility. Priority 3: CTRL and Pulse. Circle is DORMANT: preserved, never purged, not worked.

> **Ruling (Krish, 2026-10-06): the portfolio rolls into the mission.** Krish: "portfolio rolls in to mission." Mindmake is the one company and the one swing; the products below are parts of it, not a separate lane. One queue: when a surface can show only one thing the mission leads, and products are ordered beneath it by the ladder above. This supersedes the 2026-10-05 ruling "both, explicitly split" and its seven-point rule. The tension with ikigai Rules 7 and 8 is resolved by this ruling, not by rewriting the rules. Detail in [`docs/KRISH.md`](KRISH.md#mission-versus-portfolio).

> **Rulings (Krish, 2026-10-06), also:** Full Time is "a b2c monetization experiment app", not a job-search asset. "CTRL is fine priced": CTRL Pro at $49 a month stands. The publication has three channels. "Hunter is active yes." Founder visibility is still open.

> **Rulings (Krish, 2026-10-06), second batch:** Full Time: "fulltime is ready for pilot users, it is an autonomous AI football podcast." It is an autonomous AI football podcast, a B2C monetisation experiment app, ready for pilot users, and its job now is getting pilot listeners. This closes the owed ruling "What is fulltime.fm for?" (`src/lib/webProperties.ts`). Pulse: "Pulse can be for sale in a few months but not yet." It is not for sale yet and is planned for sale in a few months under the licence-fee model. No launch date is set.

## Contents

1. [Summary](#summary)
2. [Money across the portfolio](#money-across-the-portfolio)
3. [The six measures Control Center tracks](#the-six-measures-control-center-tracks)
4. [Rules for every growth agent](#rules-for-every-growth-agent)
5. [Priority 1: Heartside](#priority-1-heartside)
6. [Priority 1: Full Time](#priority-1-full-time)
7. [Priority 2: Legibility](#priority-2-legibility)
8. [Priority 3: CTRL](#priority-3-ctrl)
9. [Priority 3: Pulse](#priority-3-pulse)
10. [Mindmake: the mission](#mindmake-the-mission)
11. [Dormant: Circle](#dormant-circle)
12. [Not ventures](#not-ventures)
13. [Retired: do not resurrect](#retired-do-not-resurrect)
14. [Inconsistencies found](#inconsistencies-found)
15. [Not verified](#not-verified)

---

## Summary

| Venture | What it is | Priority | Stage | Real money to date | Takes payment through | ICP defined in `product_icp`? |
|---|---|---|---|---|---|---|
| **Heartside** | A Shopify store selling gifts written in your dog's voice | 1 | Pre-launch. Opens 20 October 2026 | $0. 0 orders, 0 customers | Shopify Payments, in USD | No |
| **Full Time** | An autonomous AI football podcast, a B2C monetisation experiment app: six AI pundits recap one match a day | 1 | Live beta, ready for pilot users | $0. Has never collected a payment | Stripe (Full Time account), Full Time Pro $4.99 a month | No |
| **Legibility** | An API that gives AI agents typed product data | 2 | Private beta | $0. Every customer so far was a QA bot or Krish | Stripe (Legibility account), Starter $29 and Growth $199 a month | No |
| **CTRL** | An AI briefing and decision app for founders and small-team CEOs | 3 | Live | $0. Zero paying customers | Stripe (mind/make account), CTRL Pro $49 a month | No |
| **Pulse** | A free public index of demand for fractional executives | 3 | Live and free. Not for sale yet; for sale in a few months under a licence fee | $0. **Cannot take a payment**: no button starts a checkout | Stripe (Fractionl account), Pulse Pro $99 a month or $948 a year, not reachable | No |
| **Mindmake** | Krish's AI and commercial strategy practice. **The mission**, which every product above rolls into. | Not ranked: the parent of the ladder | Live | Part of the $842.56 below (split by product not measured) | Privately agreed fee, Stripe (mind/make account) | **Yes** |
| **Circle** | Personal contact memory for independent operators | Dormant | Dormant | $0 | Stripe (Fractionl account) | Not applicable while dormant |

**Whole portfolio, lifetime: $842.56 net** from 9 real payments, all in the mind/make Stripe account, last charge 2026-08-18. **The only live recurring revenue is the Substack publication:** 2 founding members, $13.51 a month combined.

## Money across the portfolio

All figures measured live on 2026-10-05.

| Fact | Value |
|---|---|
| Net lifetime revenue, whole portfolio | **$842.56** |
| Gross settled | $911.45 (the gap is payment fees) |
| Real payments | 9, all in the mind/make Stripe account |
| Last charge | 2026-08-18 |
| Live recurring revenue | 2 founding members of the makeyourmindup Substack publication: one at $81 a year, one at A$115 a year. $13.51 a month combined. |
| Every other account | $0 |

- **Never repeat "$1,244 across 20 charges".** That figure was wrong. It counted 11 failed charges and added Australian dollar cents to US dollar cents. Reconcile with `scripts/stripe-reconcile.mts`, which settles all five accounts exactly.
- **The Substack plans belong to Substack, not CTRL.** Substack bills through the Mindmaker LLC Stripe account and owns those products, named "$81 a year", "A$115 a year" and "$8 a month". Never rename them.
- **Stripe is one organisation with five accounts:** mind/make (AI Brain, AI GTM, the makeyourmindup Substack, Maven teaching, CTRL), Full Time, Legibility, Heartside (empty and redundant; closing it is Krish's call), and Fractionl (Pulse and Circle).
- **The retired offer ladder was archived in Stripe on 2026-10-05:** AI Immersion, Revenue Architecture, Signal Session, AI-Fluent Executive, the workshops, the Alumni Pass and the deposits.
- **Heartside never touches Stripe.** It sells through Shopify Payments. Report it in USD, as one-off orders (orders, revenue, average order value, repeat customers). Never as MRR or paying subscribers.

## The six measures Control Center tracks

Defined in `src/lib/portfolio.ts` (`METRICS`). Growth and Subscriptions show the same six for every ranked product, in this order. **An unwired number is never shown as zero:** the tab prints what is missing instead.

| Measure | What it counts |
|---|---|
| AEO / GEO | AI answers that name the product, last 30 days (the Monday AI answer check) |
| Analytics | Site visits or active users this week |
| Sign-ups | Free sign-ups and waitlist, not paying |
| Suggestions | What the weekly growth review says to double down on |
| Growth hacks | Places buyers already go, and how many are covered (the places map) |
| Revenue | Committed monthly revenue from paying customers (for Heartside: one-off orders in USD) |

Wiring at a glance (detail in each venture's section):

| Venture | AEO / GEO | Analytics | Sign-ups | Suggestions | Growth hacks | Revenue |
|---|---|---|---|---|---|---|
| Heartside | Not wired | Read in Shopify | Read in Shopify | Wired | Wired | Read in Shopify |
| Full Time | Wired | Wired | Not wired | Wired | Wired | Wired (measured $0) |
| Legibility | Not wired | Wired | Not wired | Wired | Wired | Wired (measured $0) |
| CTRL | Wired | Wired | Wired | Wired | Wired | Wired (measured $0) |
| Pulse | Wired | Wired | Wired | Wired | Wired | Not wired: no checkout exists |

## Rules for every growth agent

These apply to every venture below. Each venture adds its own.

**You may:**

- Research, measure and draft. Map each product's buyer touchpoints and cover them as cheaply as possible.
- Work on search and AI answer visibility (SEO, GEO, AEO), organic social, the product's own surfaces, and the Substack cross-drive.
- Prepare warm-path drafts for Krish to approve and send.

**You must not:**

- Send anything without Krish's approval. Drafts never send.
- Use cold outbound of any kind: cold email, cold DMs, bought lists (ikigai Rule 2; Acquisition OS v1.1, Gate 1, 2026-07-06).
- Spend money. Paid tests are capped at $500 a month across all products and start only after revenue flows through owned or earned channels (Acquisition OS v1.1, Gate 4). Spend is Krish's action.
- Prospect against a buyer that is not defined. Where `product_icp` has no row, the prospecting lane stays blocked until Krish fills Growth > Buyers. Do not borrow another product's buyer.
- Invent a number, a customer, a review or a claim. Cited or silent.
- Put Krish's name or face in public without asking him first, or put football or music into his own working time without flagging it in one line (ikigai Rule 8; see [`docs/KRISH.md`](KRISH.md#mission-versus-portfolio)).
- Write agent output into Krish's Google Drive. Agents report to Control Center (Ruling, Krish, 2026-10-05).

---

## Priority 1: Heartside

### What it is
A Shopify store that sells personalised gifts written in your dog's voice. Brand line: "Your dog has notes." Tagline: "Keep them close."

### What it does and for whom
The dog is the author of every gift: a performance review poster, a framed poster, a photo pillow, a tree ornament and a short video of the dog "reading" its review. The range is printed and shipped by Printful; Teeinblue handles personalisation. A human checks every design before it prints.

- **Buyer:** no ICP is defined in `product_icp` yet. Krish must fill Growth > Buyers before any prospecting runs.
- Older description in `venture_registry` (not the live ICP): "US dog owners whose dog is their person, buying a gift for themselves or for another dog owner."

### Objective now and how success is measured
- **Objective:** launch on **20 October 2026** and sell through Christmas. The store's plan sets a last order date of 10 December for the printed range, still to be confirmed per product in Printful (`docs/V2-FROM-THE-DOG.md`, section 5).
- **Success is one-off orders:** number of orders, revenue in USD, average order value, repeat customers. **Never MRR and never "paying subscribers"** (Ruling, Krish, 2026-10-05).
- The plan's break-even cost per purchase for ads is roughly each product's contribution: about $21 on a poster order, about $42 framed (`docs/V2-FROM-THE-DOG.md`, section 4).

### Priority and why
Priority 1, by Krish's ruling of 2026-10-05. He did not record a reason. It is the venture with a dated launch and a seasonal deadline.

### Status and stage
Pre-launch. Measured live on 2026-10-05 through the Shopify Admin API: base currency USD, 11 products, 0 orders, 0 customers. The storefront is behind its password page until launch.

### Money to date
$0. No orders yet.

### How it takes payment
Shopify Payments, in USD. Not Stripe. A Heartside Stripe account exists, is empty and is redundant; closing it is Krish's call.

Prices in the current plan (`docs/V2-FROM-THE-DOG.md`, section 4, written 4 to 5 October 2026):

| Product | Price |
|---|---|
| The Annual Review poster, 12 by 18 inches | $39 |
| The Annual Review, framed | $89 |
| The Body Double photo pillow, 16 by 16 inches | $59 |
| Tiny Me ornament | $24, or $19 as an add-on to another order |
| The dog reads your review (15 second video) | $12; free with any order from 20 October to 1 November |
| Uniform sweatshirt set and socks | Paused until background removal exists |

Free US shipping on everything. No strike-through "was" prices.

### The six measures

| Measure | Wired? | Source or gap |
|---|---|---|
| AEO / GEO | No | No AI answer questions are set up for Heartside. Fix: add a Heartside subject to the Monday AI answer check. |
| Analytics | Read in Shopify | Krish reads visits in Shopify; Control Center links out to Shopify analytics (Ruling, 2026-10-05) |
| Sign-ups | Read in Shopify | Same link |
| Suggestions | Yes | The Sunday growth review |
| Growth hacks | Yes | The places map |
| Revenue | Read in Shopify | Orders in USD, one-off. Never MRR. |

### Where it lives
- Repository: `krishanraja/heartside`.
- Domain: heartside.io.
- Its own docs: `README.md`; `docs/V2-FROM-THE-DOG.md` (the current plan: positioning, comedy rules, range, prices, fulfilment, ads); `docs/BRIEF.md` (guardrails); `docs/TEEINBLUE-SETUP.md`; `docs/STORE-STATE.md` and `docs/HANDOFF.md` (version one history).

### Growth levers
**May pull:**
- Organic short video on TikTok, Instagram Reels and YouTube Shorts, in the plan's voice, from 13 October, as drafts for Krish's approval (`docs/V2-FROM-THE-DOG.md`, section 6). Label AI-made ads as the platforms require.
- Comment prompts that invite dog photos ("Who would your dog fire?").
- Search and AI answer visibility for dog gift questions, once the AEO subject exists.
- Post-purchase moments the customer chooses to share (the read-aloud video).

**Must not pull:**
- Any invented review, customer, number or scarcity; fake countdown timers; strike-through prices the store never charged (`docs/BRIEF.md`; the plan cites 16 CFR 233.1).
- Grief, loss, illness or old age used to sell; safety or health claims; jokes that mock the customer, the dog, breeds or body types.
- Ad spend. The plan puts $100 to $150 behind the best two organic clips; that is Krish's action, and it sits against the Acquisition OS Gate 4 rule (see [Inconsistencies found](#inconsistencies-found)).
- Cold outreach to dog owners, pet influencers or retailers.

### Open issues
- **The sling is priced below landed cost once the 30% discount applies** (from the store's own notes). The current plan says retire the 30% off for the new range and keep it only on old products, or end it.
- No ICP in `product_icp`; prospecting is blocked until Growth > Buyers is filled.
- AEO is not wired.
- Christmas last order dates must be confirmed per product in Printful before they go on the site.
- The Body Double pillow's base cost and shipping must be re-read before any ad money goes behind it.
- Whether Teeinblue can prefill its fields from the homepage review builder is unconfirmed.
- The empty Heartside Stripe account is waiting on Krish's decision to close it.
- Ikigai tension, resolved by ruling: a gift shop does not put a leader's edge back (Rule 7). Krish ranked it priority 1 knowing that, and on 2026-10-06 placed the portfolio inside the mission. See [`docs/KRISH.md`](KRISH.md#mission-versus-portfolio).

---

## Priority 1: Full Time

### What it is
**An autonomous AI football podcast, a B2C monetisation experiment app, ready for pilot users** (Rulings, Krish, 2026-10-06: "fulltime is not a job search thing, its a b2c monetization experiment app"; "fulltime is ready for pilot users, it is an autonomous AI football podcast"). Each day one finished Premier League match becomes six short audio shows, each written and voiced by a different AI pundit, with automated fact checks deciding what is allowed to publish.

### What it does and for whom
It turns one checked set of match facts into six different readings of the game. Listeners pick a pundit. All six are free without an account; Full Time Pro is $4.99 a month.

- **Buyer:** no ICP is defined in `product_icp` yet.
- It is **not** a job-search or career asset. The `venture_registry` and `ventures` rows that said so were corrected on 2026-10-06 (see [Inconsistencies found](#inconsistencies-found), items 1 and 2).

### Objective now and how success is measured
- **Objective: get pilot listeners** (Ruling, Krish, 2026-10-06: ready for pilot users). Control Center's site check reads fulltime.fm against that goal: football fans become pilot listeners, find the show, follow the feed and come back for the next episode. Its growth step asks Krish to invite the first listeners himself (`api/_webInsightsCore.ts`).
- **No success number is recorded.** Krish has not said how many pilot listeners counts as a result. Until he does, report the six measures; sign-ups, the measure closest to pilot users, is not wired yet.
- Its own repository measures editorial quality: an edition publishes only if it passes every gate (`docs/00-product.md`; `NOW.md`).

### Priority and why
Priority 1, by Krish's ruling of 2026-10-05. He did not record a reason.

### Status and stage
Live beta at fulltime.fm since 2026-09-04, set live by founder override. Ready for pilot users (Ruling, Krish, 2026-10-06). Its repository records one edition published (2026-09-05) and none since, as of 2026-10-03; a later edition would be a database fact the repository cannot confirm (`full-time` `NOW.md`). Premier League only, one match at a time.

### Money to date
$0. 0 paying customers. Full Time has **never collected a payment**. An older memory that "real money flows" was wrong.

### How it takes payment
Stripe, Full Time account. One product: Full Time Pro, $4.99 a month. The 2026-10-05 facts say the checkout is fully wired; the repository's own `NOW.md` (2026-10-03) lists "new checkout" as built but switched off. See [Inconsistencies found](#inconsistencies-found).

### The six measures

| Measure | Wired? | Source or gap |
|---|---|---|
| AEO / GEO | Yes | The Monday AI answer check |
| Analytics | Yes | Google Analytics for fulltime.fm (the daily site check) |
| Sign-ups | No | Full Time accounts, so its pilot users, live in its own database and are not copied to the OS. Fix: bridge them the way CTRL sign-ups are, so pilot users can be counted here. |
| Suggestions | Yes | The Sunday growth review |
| Growth hacks | Yes | The places map |
| Revenue | Yes | Stripe, Full Time account, daily pull. A measured $0. |

### Where it lives
- Repository: `krishanraja/full-time`.
- Domain: fulltime.fm.
- Its own docs: `NOW.md`; `docs/00-product.md` (product doctrine); `docs/product-state.json` (implemented state and gaps); `docs/19-release-state.md`; growth docs `docs/07-marketing.md`, `docs/08-sales.md`, `docs/21-go-to-market-agent.md`.

### Growth levers
**May pull:**
- Search and AI answer visibility for match recap questions.
- The show's RSS feed and podcast directories.
- Organic social clips of published editions, as drafts for approval.

**Must not pull:**
- Anything that presents it as a betting product, a live score app or a league table product (`docs/00-product.md`).
- The Premier League's own mark (club crests are used under a founder ruling; the league mark is not).
- Public forecast accuracy figures before release evidence allows them (`docs/00-product.md`).
- Cold outreach to clubs, fans, media or sponsors.
- Krish's own time on football without flagging it to him first (ikigai Rule 8's test; the product itself is inside the mission by the 2026-10-06 ruling).

### Open issues
- No edition has published since 2026-09-05, per the repository as of 2026-10-03.
- The model provider was switched after the Anthropic account hit its monthly cap (2026-09-21), with some judge floors lowered until it switches back (`full-time` `NOW.md`).
- Sign-ups are not bridged into the OS, so pilot users cannot be counted in Control Center yet.
- No ICP in `product_icp`.
- No target number of pilot listeners.
- The repository's `never_publish` list asks writers not to name the product, its domain or the sport. This document names them, under Krish's publication ruling of 2026-10-05.
- Ikigai tension, resolved by ruling: football is protected (Rule 8), and Full Time is priority 1. Krish placed the portfolio inside the mission on 2026-10-06. See [`docs/KRISH.md`](KRISH.md#mission-versus-portfolio).

---

## Priority 2: Legibility

### What it is
An API for AI agents: give it a product URL, a barcode or a product name and it returns typed product data, with a confidence score per field, a price range and the cost of the call.

### What it does and for whom
Developers building software agents call it over REST or MCP. Four tools: read a product, resolve a name to a product, compare products, and brief a product. Agents can pay per call in USDC through x402, which today runs on a test network only.

- **Buyer:** no ICP is defined in `product_icp` yet.
- Older `venture_registry` text (not the live ICP): "Dev-first, agent-first: buyers arrive via agent-facing discovery (llms.txt, MCP directories) and waitlist, not outbound. No engine until a design partner exists."

### Objective now and how success is measured
From the repository's decision record (`docs/KILL-CRITERIA.md`):
- **North Star:** weekly trusted reads per active account. A read is trusted at or above a 0.7 calibrated confidence. Beta target: 7 or more a week for a typical active account.
- **Kill criteria:** after eight weeks of beta with at least ten active accounts, reconsider if all three hold: median active account below 3 trusted reads a week and not rising; week-over-week repeat rate below 30 percent; trust rate cannot rise above 0.6 without gaming the score.

### Priority and why
Priority 2, by Krish's ruling of 2026-10-05. He did not record a reason.

### Status and stage
Private beta, live at legibility.io. All four tools, key auth, metering, quotas, the dashboard, Stripe billing and the MCP server are deployed (`README.md`). Trusted coverage is structured data (JSON-LD product pages, Shopify stores, barcodes, some OpenGraph pages); bot-hostile retailers do not return a trusted object today.

### Money to date
$0. Every customer so far was a QA account or Krish.

### How it takes payment
Stripe, Legibility account, by API key. Plans (`README.md`; `src/lib/portfolio.ts`):

| Plan | Price | Trusted reads a month | Overage |
|---|---|---|---|
| Free | $0 | 1,000 | None, hard stop |
| Starter | $29 a month | 5,000 | $0.01 a read |
| Growth | $199 a month | 50,000 | $0.005 a read |

Paid-plan overage is not yet reported to Stripe. x402 payments are on a test network, so no on-chain money settles yet. Reads below the trust gate cost the caller nothing.

### The six measures

| Measure | Wired? | Source or gap |
|---|---|---|
| AEO / GEO | No | No AI answer questions are set up for Legibility. Fix: add a Legibility subject to the Monday AI answer check. |
| Analytics | Yes | Google Analytics for legibility.io (the daily site check) |
| Sign-ups | No | Legibility accounts live in its own database. Fix: send them into the audience pipeline. |
| Suggestions | Yes | The Sunday growth review |
| Growth hacks | Yes | The places map |
| Revenue | Yes | Stripe, Legibility account, daily pull. A measured $0. |

### Where it lives
- Repository: `krishanraja/legibility` (no `NOW.md` yet).
- Domain: legibility.io. The former names and hosts (Plinth) are dead.
- Its own docs: `README.md`; `docs/KILL-CRITERIA.md`; `docs/OUTSTANDING.md`; `docs/gtm/`.

### Growth levers
**May pull:**
- Agent-facing discovery: `llms.txt`, the MCP discovery file, MCP directories and registries.
- Developer content that shows real calls and real costs.
- A design partner found through a warm intro, drafted for Krish.

**Must not pull:**
- An outbound engine. None until a design partner exists (`venture_registry`).
- Claims of coverage it does not have (bot-hostile retailers) or of live on-chain payment.
- Cold outreach to developers or companies.

### Open issues
- Metered overage not reported to Stripe.
- A paid fallback for hard sites is dormant pending a payment method.
- No ICP in `product_icp`; AEO and sign-ups not wired.
- The repository has no `NOW.md`, so the docs steward has no current-state file to read.
- Ikigai tension, resolved by ruling: a data API for agents does not put a leader's edge back (Rule 7). Krish placed the portfolio inside the mission on 2026-10-06.

---

## Priority 3: CTRL

### What it is
An AI briefing and decision app for founders and small-team CEOs. Four parts: Today (AI news ranked against your priorities), Decide (a real call weighed against evidence), Blind Spot (one private read and one small experiment) and Memory (your own context, portable to any AI tool).

### What it does and for whom
It keeps a leader's own context and judgement in one place and uses it on their real decisions. "Make Your Mind Up" is its public intake, one question at a time.

- **Buyer:** no ICP is defined in `product_icp` yet. CTRL's own product file names the AI-active founder or small-team CEO (`public/.well-known/product.json`). The `mm_ctrl_buyer` lane in `docs/ICP.md` is parked.
- **In the ikigai,** CTRL is "what the leader keeps after the room": a leader's edge held as a portable standard (Sheet 3). It must never become "a company brain sold to organisations to absorb their people's judgement".

### Objective now and how success is measured
- **No portfolio objective or success number is recorded** for CTRL in Control Center for this tier. Report the six measures.
- The ikigai gates CTRL's growth on paid rooms: build the leader's edge file after the first paid room, a paid ongoing product once two leaders ask to keep it (Sheet 3, section 3). Those gates belong to the ikigai commitment, which is ongoing; the original plan's dates are history and no new ones are set (see [`docs/KRISH.md`](KRISH.md#the-ikigai-commitment-ongoing)). CTRL Pro being priced now is fine by Krish's ruling of 2026-10-06.

### Priority and why
Priority 3, by Krish's ruling of 2026-10-05. He did not record a reason. Like every product, it sits inside the mission (Ruling, 2026-10-06).

### Status and stage
Live. Free tier plus one paid tier.

### Money to date
$0. **Zero paying customers.** It has never taken a payment.

### How it takes payment
Stripe, mind/make account. One product: **CTRL Pro, $49 a month** (renamed from "Edge Pro" on 2026-10-05). Charged through Supabase edge functions in `mm-ctrl`. The checkout works; nobody has bought. **Ruling (Krish, 2026-10-06): "CTRL is fine priced."** Any line saying CTRL is never priced is wrong for CTRL itself; see [Inconsistencies found](#inconsistencies-found), item 20, for the canon's wording about mindmake.co.

### The six measures

| Measure | Wired? | Source or gap |
|---|---|---|
| AEO / GEO | Yes | The Monday AI answer check |
| Analytics | Yes | PostHog weekly active users |
| Sign-ups | Yes | CTRL sign-ups through the audience pipeline |
| Suggestions | Yes | The Sunday growth review |
| Growth hacks | Yes | The places map |
| Revenue | Yes | Stripe, mind/make account, daily pull. A measured $0. |

### Where it lives
- Repository: `krishanraja/mm-ctrl`.
- Domains: ctrl.mindmake.co (Control Center and the business canon) and makeyourmindup.ai (the repository's production address). Both answered on 2026-10-05.
- Its own docs: `NOW.md`; `docs/current/` (release state and commercial authority); `public/.well-known/product.json` (product truth).

### Growth levers
**May pull:**
- The Make Your Mind Up intake and content that leads to it.
- Search and AI answer visibility.
- The publication as a feeder, without selling in the editorial.

**Must not pull:**
- Selling CTRL to organisations as a company brain (ikigai Sheet 3, section 5).
- A free tier that gives away the point of view (ikigai Sheet 3, section 5).
- Naming, pricing or linking CTRL on mindmake.co. The canon allows CTRL to be named only on `/ai-brain`, as the engine Mindmake runs on itself (`01_CANON.md`).
- Security certifications it does not hold; any user's private memory or decisions.
- Cold outreach.

### Open issues
- Resolved 2026-10-06: `src/lib/portfolio.ts` now says "CTRL Pro", and its `SUBSTACK` constant counts paid Substack members under the publication, matching migration `20261005140000` (items 7 and 8 below).
- The repository's docs still carry the old "Mindmaker" name (`mm-ctrl` `NOW.md`).
- No ICP in `product_icp`.

---

## Priority 3: Pulse

### What it is
A free public index, scored 0 to 100, that shows whether demand for fractional executives is growing, which roles are moving and how strong the evidence is.

### What it does and for whom
Twenty tracked inputs feed one daily score, a weekly brief and seven-day role windows. People read it on the site; agents read it through a public API and an MCP server. Published by Fractionl; not an official index.

- **Buyer:** no ICP is defined in `product_icp` yet.
- Its own strategy names the economic buyer as the founder, CEO, managing director or COO of a specialist fractional-talent firm, for a private benchmark built from partner data. That paid offer is a hypothesis and is not live (`docs/CORPORATE_STRATEGY.md`).

### Objective now and how success is measured
From `docs/CORPORATE_STRATEGY.md`:
- **Moat metric:** verified partner-contributed engagements in the trailing 12 months that pass schema, provenance, privacy and quality checks.
- **Kill or reposition** the paid membership if fewer than 5 of 25 qualified firms pay for the pilot, or ten partners cannot produce 500 usable records between them. Keep the free index while it earns repeat use, citations, qualified inbound or partner conversations.
- **Review trigger:** 25 qualified buyer interviews, 10 signed data-sharing letters of intent, or a material change to the method.

### Priority and why
Priority 3, by Krish's ruling of 2026-10-05. He did not record a reason.

### Status and stage
Live at pulse.fractionl.ai, free. **Not for sale yet:** Krish plans to sell it in a few months under the licence-fee model (Ruling, Krish, 2026-10-06: "Pulse can be for sale in a few months but not yet"). No launch date is set.

### Money to date
$0.

### How it takes payment
**It cannot take a payment.** The server checkout, its secrets and the enable flag are live, but no button in the Pulse app calls `startCheckout()` (`fractionl-pulse` `src/lib/checkout.ts`). Pulse Pro stays priced at **$99 a month or $948 a year** as the data-feed licence (Ruling, Krish, 2026-10-05: keep that pricing; do not invent new price points). Stripe, Fractionl account.

### The six measures

| Measure | Wired? | Source or gap |
|---|---|---|
| AEO / GEO | Yes | The Monday AI answer check |
| Analytics | Yes | PostHog weekly active users |
| Sign-ups | Yes | The customers ledger (waitlist and free sign-ups) |
| Suggestions | Yes | The Sunday growth review |
| Growth hacks | Yes | The places map |
| Revenue | No | No checkout in the app. Fix: add a checkout on the existing Pulse Pro prices. |

### Where it lives
- Repository: `krishanraja/fractionl-pulse`.
- Domain: pulse.fractionl.ai.
- Its own docs: `NOW.md`; `docs/CORPORATE_STRATEGY.md`; `docs/DOCUMENTATION_GOVERNANCE.md`; `public/product-truth.json`, `public/llms.txt`.

### Growth levers
**May pull:**
- Distribution of the free index: citations, the weekly brief, the API and MCP listings.
- Search and AI answer visibility for fractional market questions.
- Partner conversations through warm intros, drafted for Krish.

**Must not pull:**
- Calling the index first, only, real-time or predictive; turning a feature flag into a live-product claim (`docs/DOCUMENTATION_GOVERNANCE.md`).
- Passing the labelled simulated history off as measured.
- New price points (Ruling, 2026-10-05).
- Cold outreach to firms or executives.

### Open issues
- The missing checkout button. One button would let it take a payment, and it is needed before the planned sale; there is no date for that yet.
- No ICP in `product_icp`; its `venture_registry` text and its own strategy name different buyers.
- Resolved 2026-10-06: the `ventures` table used to call Pulse "never a product for sale"; it now reads not for sale yet, planned for sale in a few months under the licence-fee model.

---

## Mindmake: the mission

### What it is
Krish's principal-led AI and commercial strategy practice. Canon headline: **"Build the human + AI business that augments your vision."** One sentence: "Every AI a leader buys already knows the market. None of them know the leader. Mindmake builds the one that does, so the leader keeps their edge as the market moves." (`00_NORTH_STAR.md`, `01_CANON.md`)

### What it does and for whom
Two public doors, **Build your AI brain** and **Build your AI GTM**, lead to **one privately scoped paid proof**: pick one decision or capability, build a working first version, use it on real work, leave something that keeps running. The only public duration is the 30-day shape on `/ai-gtm` and `/ai-brain`. The only primary action on the site is **Start here**. "Instruments, not oracles." "The third level is the only one worth paying for." (`01_CANON.md`)

- **Buyer: defined.** `product_icp` row `mindmake`, seeded from the canon. Who: "A founder, principal or senior commercial leader who can move a decision and the result behind it. They own the outcome, not a recommendation about it." Not: "Anyone who has to take the idea to somebody else before anything changes." Trigger: "A decision they already own has stalled, and the cost of it staying stalled is now visible to them." Titles: founder, co-founder, CEO, managing director, managing partner, principal, CCO, CSO, COO, general manager. Places: United States, United Kingdom, Australia.
- **The face** from the ikigai (LOCKED): "A senior leader who will not admit to anyone that they are not ready for what is happening." The `pilot_face` lane in `docs/ICP.md` (ADR-016, 2026-09-06) scores leads against it.

### Objective now and how success is measured
- **Mission (WORKING):** "Build the company that gives leaders their edge back before what is coming takes it, and sell it at scale with my name on it." (ikigai, Sheet 1)
- **A proof counts as working** when the client says it is useful in practice and will stand behind that view (`01_CANON.md`, "The offer").
- **The ikigai's twelve month commitment is ONGOING** (Ruling, Krish, 2026-10-06; it had been marked PAUSED on 2026-10-05). The 5 Oct stop rule was not met and Krish chose to continue. No new stop date or numeric target has been set, and the original plan's day 90 review date (5 Dec 2026) is unconfirmed. See [`docs/KRISH.md`](KRISH.md#the-ikigai-commitment-ongoing).

### Priority and why
Not ranked against the products: it is the mission and the one swing, and the products roll into it (Ruling, Krish, 2026-10-06, superseding the 2026-10-05 split). When a surface can show only one thing, the mission leads. `src/lib/portfolio.ts` tracks it on Growth as unranked.

### Status and stage
Live at mindmake.co. Approved R3 homepage and companion pages live (`mindmake` `NOW.md`, 2026-10-04).

### Money to date
The whole portfolio's $842.56 net lifetime sits in the mind/make Stripe account, which holds AI Brain, AI GTM, the Substack, Maven teaching and CTRL. CTRL's share is $0. The Substack's live share is the 2 founding members. **How the 9 payments split between advisory, Substack and Maven was not measured on 2026-10-05**; `scripts/stripe-reconcile.mts` can settle it.

### How it takes payment
Scope and fee agreed privately in writing before work starts; billed through the mind/make Stripe account. **The canon keeps the price private and says no number appears anywhere public.** This document does not restate the rate card. See [Inconsistencies found](#inconsistencies-found) for the conflict with the 2026-10-05 publication ruling.

### The six measures
Mindmake is tracked on Growth as unranked (`UNRANKED_GROWTH` in `src/lib/portfolio.ts`), which defines no six-measure sources for it. Which of the six are wired for Mindmake is **unknown** from the code; the Growth tab is where to look.

### Where it lives
- Repository: `krishanraja/mindmake` (the site and the canon; read only for agents outside it).
- Domain: mindmake.co. `themindmaker.ai` redirects there and is infrastructure, never a name.
- Its own docs: `project-documentation/00_NORTH_STAR.md` (read first), `01_CANON.md` (offer, buyer, money), `02_PUBLICATION.md`, `06_CURRENT_STATE.md`.

### Channels that serve the mission

| Channel | What it is | Status and money |
|---|---|---|
| **The publication** (Substack, at home.makeyourmindup.ai) | Mindmake's publication. **Three channels** (Ruling, Krish, 2026-10-06, matching the database): **follow.the.money** on Mondays, **under.the.hood** on Wednesdays, **mind.the.gap** on Fridays. Each one's mandate lives in `venture_formats`. The canon's "exactly two channels" (`02_PUBLICATION.md`) is stale. Long-form is the asset; social is the trailer. | The only live recurring revenue in the portfolio: 2 founding members, $13.51 a month. Two Substack addresses answer today (see [Not verified](#not-verified)). |
| **Signal & Noise** | A co-hosted podcast on AI in media. A distribution channel, not a venture, since 2026-08-11. | Active in `venture_registry` and `ventures`. Revenue: none recorded. |
| **Maven** | Free lessons only. Their job is feeding CTRL and the publication. The paid cohort ladder is retired. | Maven teaching sits in the mind/make Stripe account. |
| **Keynotes and the room** | The ikigai's demand engine: "closest thing to the purpose lived" (Sheet 1, section 8). | Not a product line in Stripe. |

### Growth levers
**May pull:**
- Warm intros, drafted for Krish, never sent without him.
- Published thinking through the three channels, built on owned artifacts, passing the five standards (`02_PUBLICATION.md`).
- Search and AI answer visibility for mindmake.co.
- The Start here flow and its bounded follow-up (results, then one follow-up fourteen days later).

**Must not pull:**
- A public price, discount, diary link or "Book a call" button; an offer ladder; a chatbot (`00_NORTH_STAR.md`, "What we will not do").
- Attendee brands described as clients; a count of leaders helped that is not evidenced.
- Any name but Mindmake ("Mindmaker" only inside verbatim quotes and the legal entity).
- A fourth publication channel, or a revived old channel name (The Money of AI, Built with AI, Paid, Built).
- Cold email, or an email nobody asked for.
- The internal buyer psychology, sales wedge or routing notes in public copy (`01_CANON.md`).

### Open issues
- `api/_mission.ts` in this repository still says "a paid three week pilot" and one door; the canon says a 30-day public shape and two doors. It feeds Home's daily move.
- `api/_venturePositioning.ts` still offers the retired Strategy Day and lists builder_economy as live.
- Canon conflict, recorded not fixed: `00_NORTH_STAR.md` still carries the older homepage promise "Build the business that can think with you", while `01_CANON.md` and `NOW.md` carry the new headline; `00` outranks `01`.
- Canon conflicts with the 2026-10-06 rulings, recorded here and not fixed, because `krishanraja/mindmake` is excluded from the publication ruling and kept out of the canon rollout: `02_PUBLICATION.md` still says exactly two channels (the ruling says three), and the canon says CTRL is "never priced" (the ruling says CTRL being priced is fine). Both need Krish to edit the canon himself.
- Founder visibility is an open decision for Krish (ikigai Sheet 2, section 4). Still open on 2026-10-06.
- The partner (ikigai "the binding") does not exist yet.

---

## Dormant: Circle

**Ruling (Krish, 2026-10-05): DORMANT. Preserved, never purged, not worked.**

| | |
|---|---|
| What it is | Personal contact memory for independent operators: remember why a person mattered and get them back when they can help. |
| Repository and domain | `krishanraja/fractionl-circle`; circle.fractionl.ai (still serving). Its `NOW.md` says lifecycle dormant. |
| Money to date | $0. Four Circle products exist in the Fractionl Stripe account. |
| What agents do | Nothing. No growth work, no deletion, no data purge. Do not reactivate it; that is Krish's call. |

---

## Not ventures

These appear in the same places as the ventures. They are not on the portfolio ladder.

| Item | What it is | Treat as |
|---|---|---|
| **Control Center and mind/make OS** | The dashboard and agent fleet that run the portfolio (this repository). | The engine. The ikigai parks "the OS as a product" until a paying leader asks to buy it (Sheet 1, section 8). |
| **The Video Engine** | The video and carousel production engine, `krishanraja/content-engine`. | Infrastructure for content. |
| **Compound** | A private personal finance instrument at compound.krishraja.com, in its own private repository. | Personal. Not a venture. Never publish its figures. |
| **`investor` in `venture_registry`** | A lead lane for people who could invest in or open doors for his ventures. | A lane, not a venture. |

---

## Retired: do not resurrect

Each of these is stopped. Do not source, score, draft or build for any of them. Reviving one is Krish's call alone.

| Retired | What it was | Why, and when |
|---|---|---|
| AdFixus | Consulting engagement (identity and first-party data for publishers) | Engagement ended; retired July 2026 |
| Meliora | Consulting engagement (GenAI advisory for telco and media) | Engagement ended; retired July 2026 |
| Gutted, Merciless, OnAlert | Builder products | Retired from the OS on 2026-07-06 by Krish's directive |
| Techonomic | A content brand | Retired 2026-08-06; its investigative register lives on inside the publication |
| The Builder Economy | A podcast and brand | Fully retired 2026-08-11, feed and back catalogue included |
| Mindmaker, Mindmaker Live | The old names of the business and its content arm | Renamed to Mindmake and the publication on 2026-08-29 |
| Personal Brand | A separate personal content lane | Superseded by the publication; LinkedIn and X are channels |
| Plinth | The old name and hosts of what is now Legibility | Old hosts are dead; use Legibility |
| The old offer ladder | The Teardown, The Handover, the 21-day Sprint, Signal Session, Revenue Architecture, AI Immersion, the AI-Fluent Executive cohort, the workshops, the Alumni Pass, deposits, Strategy Day | Replaced by two doors and one paid proof (canon); Stripe products archived 2026-10-05 |
| Edge Pro (as a name) | CTRL's paid tier | Renamed CTRL Pro on 2026-10-05 |
| Track 2, the displaced worker media property | A planned media property | Killed in the ikigai: zero evidence, people pushed not pulled (Sheet 1, section 8) |
| The fund as a route | A capital vehicle | Killed in the ikigai: no capital (Sheet 1, section 8). Reopen only after a sale or a raise. |

**Parked, not retired:** the job search (only a role that is literally the mission) and the OS as a product. See [`docs/KRISH.md`](KRISH.md#what-he-has-killed-and-parked).

---

## Inconsistencies found

Found while writing this on 2026-10-05. Each is recorded, not silently resolved. Where the 2026-10-05 facts or rulings settle it, that is said. Items settled by Krish's rulings of 2026-10-06 are marked "Resolved by ruling" with that date and left in place.

**Ranking and status**

1. **`venture_registry` still frames Full Time as a job-search asset.** Its `icp_description` reads "Employers are the buyers; the payoff is the role (Sept 2026 urgency)... Keep running, no new build", kind `career`. Full Time is a priority 1 product by ruling. The registry row is stale. **Resolved by ruling (Krish, 2026-10-06):** "fulltime is not a job search thing, its a b2c monetization experiment app." The row was corrected that day: `kind` is `product`, and `icp_description` and `scoring_criteria` describe a B2C monetisation experiment with no buyer defined yet. The previous row is backed up outside the repository.
2. **The `ventures` table calls Full Time, Pulse and Circle "Build experiment acquiring test customers... Never a product for sale."** Full Time and Pulse are ranked products with Stripe prices. The CTRL row says "Kept alive deliberately cheaply." Both predate the 2026-10-05 ranking. **Resolved by ruling for Full Time (Krish, 2026-10-06):** its `ventures` description now reads as a B2C monetisation experiment app with Full Time Pro at $4.99 a month. **Resolved for Pulse (Krish, 2026-10-06):** "Pulse can be for sale in a few months but not yet." Its `ventures` description now says it is not for sale yet and is planned for sale in a few months under the licence-fee model, with no launch date; the row was backed up first and read back. Its `venture_registry` row never said "not for sale" and was left as it is. Still open for Circle, which is dormant and no ruling covered.
3. **Circle is marked active in both `venture_registry` and `ventures`,** and `src/lib/portfolio.ts` still tracks it on Growth (unranked). The ruling and Circle's own `NOW.md` say dormant.
4. **`docs/MINDMAKE_OS_ARCHITECTURE.md` section 11 is out of date:** it says the OS tracks 8 ventures, omits Heartside, gives Full Time's domain as a preview address with Stripe in test mode only, says Legibility has no Stripe webhook, and says Circle and Pulse "are now run outside the OS". A second writer is rewriting that document in parallel.
5. **This repository's `NOW.md` ("What it is")** describes the portfolio as Mindmake, the publication with Paid and Built formats, mm-ctrl and Fractionl. It does not reflect the 2026-10-05 ladder.
6. **The ikigai and the one-swing plan call the portfolio the avoidance pattern** ("Working on anything outside the one swing", Sheet 4, section 3; `docs/plans/one-swing/CHARTER.md`). Krish's 2026-10-05 ruling keeps both. Named in [`docs/KRISH.md`](KRISH.md#mission-versus-portfolio), not resolved. **Resolved by ruling (Krish, 2026-10-06):** "portfolio rolls in to mission." This supersedes the 2026-10-05 split; the ikigai text stays unchanged.

**Money and payment**

7. **CTRL's paid tier name:** the facts of 2026-10-05 say "CTRL Pro" (renamed from Edge Pro that day). `src/lib/portfolio.ts` (`what` and the revenue note) and `mm-ctrl` `NOW.md` still say "Edge Pro". **Resolved 2026-10-06:** `src/lib/portfolio.ts` now says "CTRL Pro" (Krish's ruling of the same day: "CTRL is fine priced").
8. **Substack revenue attribution:** `src/lib/portfolio.ts` says CTRL's revenue was corrected and the Substack plans now read under the publication, but the `SUBSTACK` constant in the same file still says `paidCountedUnder: 'mm_ctrl'` and its comment says the price map files Substack subscribers under CTRL. **Resolved 2026-10-06:** `SUBSTACK.paidCountedUnder` is now `publication`, and its comment says so; `tests/api/portfolio.test.ts` pins both.
9. **Full Time checkout:** the facts and `src/lib/portfolio.ts` say the checkout is wired and live. `full-time` `NOW.md` (2026-10-03) lists "new checkout" among things built but switched off by flag. Either way, it has collected $0.
10. **Mindmake's price:** the 2026-10-05 ruling publishes pricing in this repository, but the canon says the rate card is private and "No number appears anywhere public, ever" (`01_CANON.md`, "Pricing"), and `mindmake` `NOW.md` lists the rate card under `never_publish`. This document does not restate it. **Krish should say whether the ruling covers Mindmake's private rate card.** (The ikigai, published verbatim by the same ruling, does contain his 2026 diagnostic and embedded price ranges.)
11. **Heartside ad spend:** the store's plan puts $100 to $150 behind organic clips after 72 hours. The Acquisition OS Gate 4 rule says paid spend starts only after revenue flows through owned or earned channels. Spend is Krish's action either way.

**Buyers (ICP)**

12. **Five product ICPs are undefined in `product_icp`** (Heartside, Full Time, Legibility, CTRL, Pulse). The older `venture_registry.icp_description` text still exists for each and must not be used as the live ICP.
13. **Mindmake has two buyer definitions:** the `product_icp` row (seeded from the canon: owner-led or partner-led businesses, any sector) and the `pilot_face` lane in `docs/ICP.md` (PE or VC backed media, adtech, publishing or data businesses Krish knows). The `mindmake` row in `venture_registry` still holds the retired Maven-cohort buyer.
14. **A memory note of 2026-08-29 says the ikigai workbook's PE and VC diagnostic route and pricing must never enter ICP scoring or outreach.** ADR-016 (2026-09-06) later made the ikigai's face the first ICP lane. The later decision is the one in force in code.
15. **Lane name:** `full-time` and `mm-ctrl` `NOW.md` call the face lane `room_face`; `docs/ICP.md` and `api/_icpScore.ts` call it `pilot_face`.
16. **Pulse's buyer:** its `venture_registry` text names heads of talent strategy, workforce planning leads, PE operating partners and staffing operators; its own strategy names founders and CEOs of specialist fractional-talent firms.

**Names, domains, channels**

17. **CTRL's address:** `src/lib/portfolio.ts` and the canon use ctrl.mindmake.co; `mm-ctrl` `NOW.md` and its product file use makeyourmindup.ai. Both answered on 2026-10-05.
18. **Publication channels:** the canon (`02_PUBLICATION.md`, reviewed 24 September 2026) says exactly two channels, The Money of AI and Built with AI. This repository's `NOW.md` says the publication runs three subchannels (`follow_the_money`, `mind_the_gap`, `under_the_hood`, ruling 2026-09-19, names 2026-09-25), enforced in the database. **Resolved by ruling (Krish, 2026-10-06):** three channels, matching the database: follow.the.money on Mondays, under.the.hood on Wednesdays, mind.the.gap on Fridays, at home.makeyourmindup.ai. The canon file is stale and is Krish's to edit (the mindmake repo is out of the canon rollout).
19. **Substack address:** the publication's address is home.makeyourmindup.ai, which Krish chose on 2026-10-05, and `src/lib/portfolio.ts` uses it. Until then it was mindmakerlive.substack.com (page title "makeyourmind/up"). The site checks keep the old address as an alias, so visits and AI answers that still use it keep counting. The canon named the old address on 2026-10-05 and still needs the same change. A second Substack, makeyourmindup.substack.com ("Make Your Mind Up | Krish Raja"), also answers. The facts call the paid publication "makeyourmindup". `live.themindmaker.ai`, which the old architecture doc said redirects to the Substack, returned 404 on 2026-10-05: Vercel has no deployment there.
20. **CTRL on the Mindmake site:** the canon says CTRL is "never a third thing to buy, never linked, never priced". CTRL itself sells CTRL Pro at $49 a month on its own site. The canon governs mindmake.co only; the conflict is in how the two are described, not in what is live. **Resolved by ruling for CTRL itself (Krish, 2026-10-06):** "CTRL is fine priced", so CTRL Pro at $49 a month stands. The canon's "never priced" line conflicts and is recorded, not edited, because the mindmake repo is excluded.
21. **Founder visibility:** the ikigai mission says "with my name on it" and Sheet 2 recommends founder visible. The Acquisition OS v1.1 rule (2026-07-06) says no motion may require Krish's personal brand, and the canon speaks as "we". Open for Krish. **Still open on 2026-10-06:** not ruled.
22. **The offer shape:** the ikigai (Sheet 2) and `api/_mission.ts` describe a three week diagnostic and one door; the canon has two doors and a 30-day public shape. The canon wins for Mindmake's offer.
23. **Hunter:** the ikigai parks the job search, and the 2026-10-05 facts record that the Hunter agent (job sourcing) is KEPT active. Both are Krish's calls; noted so nobody "fixes" one by reading the other. **Resolved by ruling (Krish, 2026-10-06):** "Hunter is active yes."
24. **Repository `never_publish` lists versus the ruling:** `full-time`, `fractionl-pulse` and `fractionl-circle` ask writers not to name the product or domain, and `mm-ctrl` and this repository's `NOW.md` forbid publishing revenue or scorecard figures. Those rules govern Mindmake content writers; Krish's 2026-10-05 ruling publishes venture objectives, pricing and revenue in this repository.

## Not verified

- **How the 9 mind/make payments split** between advisory, the Substack and Maven. Settle with `scripts/stripe-reconcile.mts`.
- **Which Substack address holds the 2 founding members.** Both addresses answer; the public pages do not say. Check the Substack dashboard.
- **Whether Full Time has published an edition since 2026-09-05.** A database fact; its repository could not confirm it as of 2026-10-03.
- **Whether Full Time's new checkout flag is on in production.** Check its production environment.
- **A success number for Full Time and a growth objective for CTRL.** Full Time's objective is set (pilot listeners, 2026-10-06) but not how many; CTRL has neither. Krish should set them.
- **Why Krish ranked each product where he did.** He did not record reasons.
- **Which of the six measures are wired for Mindmake.** `src/lib/portfolio.ts` defines none; check the Growth tab.
- **Circle's prices.** Four products exist in Stripe; prices were not re-read on 2026-10-05.
- **Revenue or activity for Signal & Noise and Maven.** Not measured separately.
