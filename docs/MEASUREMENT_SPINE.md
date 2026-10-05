# Measurement spine — status

Layer 3 of the growth control model: real signal from every product flowing into
the OS. Product brands only; no personal brand anywhere.

## Live

- **SEO rank** (`maya_striking_distance`) — Maya SEO Rank Sweep (weekly). Serper
  positions + DataForSEO volume for CTRL / Pulse / Legibility ICP keywords. Surfaced
  on the Growth tab (SEO rank board).
- **GEO citations** (`growth_geo_probes`), the weekly answer-engine research (krishanraja/AEO-Engine, Sunday 04:00 UTC, landing through `api/aeo/ingest.ts`), with the Monday `api/growth/geo-probe` Perplexity cron as the baseline until the engine has two green weeks. Whether an answer engine cites us, per subject (venture, prospect, aspiration) and per query; the citation rate is computed from the rows, never stored. The scored queries and the weekly digest sit beside it in `growth_aeo_queries` and `growth_aeo_digests`. (The Zara GEO Citation Sweep into `zara_signals` never wrote a row and is retired; corrected 2026-09-09.)
- **PostHog product analytics** (`product_metrics`) — Maya PostHog Product Sync
  (daily 06:30 UTC). 7-day rolling active users / pageviews / events per product.
  One shared PostHog project (free tier caps at one); the `product` super-property
  separates ventures.
  - All four apps instrumented (posthog-js snippet, publishable client key) and
    deployed: **mm-ctrl, legibility, fractionl-pulse, full-time are live** (verified
    in served HTML). full-time was deployed via the Vercel API since its git
    auto-deploy is disconnected.
- **GSC search analytics** (`maya_striking_distance`) — Maya GSC Search Analytics
  Sync (weekly). A Google service account reads real clicks / impressions / CTR /
  position per property into `maya_striking_distance` (deduped across
  domain+subdomain properties). GSC owns those columns; the Serper sweep owns
  `search_volume` / `priority`; merge-duplicates upsert keeps them separate.
- **OP3 podcast downloads** — the `op3.dev/e/` enclosure prefix is live in Full
  Time's RSS (`src/routes/api/public/feed[.]rss.ts`) and serving (verified), so
  downloads are counting at OP3.

## Google Analytics, four sites

One check reads Google Analytics for four sites and turns each into one honest
verdict, what the OS fixed on its own, and at most one thing only Krish can do.
Added 2026-09-27, when fulltime.fm and legibility.io got their tags.

**The registry.** `src/lib/webProperties.ts` is the one list: mindmake.co
(`site`), the makeyourmindup newsletter on home.makeyourmindup.ai (`mymu`),
fulltime.fm (`fulltime`) and legibility.io (`legibility`). The newsletter's
old address, mindmakerlive.substack.com, stays in its entry as a host alias,
so visits Google records under either address count. Each entry carries
the domain (the card title, never a venture label), the G- measurement id the
page must load, the env var that overrides its numeric property id, a code
default where the id is known (fulltime.fm and legibility.io), its venture, its
canon (live, ruling owed, measure only, retired) and its jobs. Adding a site is
one entry there. `web_property_insights.property` has no CHECK on purpose.

**Where it lands.**
- `growth_metrics`: four headline flows per site per day
  (`<prefix>_sessions_1d`, `_users_1d`, `_pageviews_1d`, `_key_events_1d`),
  written by `api/growth/snapshot.ts`.
- `web_analytics_daily`: the daily source and landing-page breakdowns.
- `web_property_insights`: one row per site per day from
  `api/growth/web-insights.ts` (daily at 13:20 UTC): verdict, flags, the raw
  checks behind them, 7-day totals against the week before, a 28-day series,
  findings, fixes and the one action. Service role only; the app reads it
  through the route.

**Eight verdicts, first match wins.** `no_access` (no id, a credential problem,
or Google refused the read), `api_disabled` (the Data API is off, or the Admin
API is off and the site has recorded nothing after 48 hours), `wrong_stream`
(the property has no web stream with the page's G- id), `tag_missing` (the
page answers 200 without its tag), `never_received` (tag and property right,
nothing ever recorded), `provisional` (the first 48 hours after the tag went
live), `quiet` (fewer than 5 visits in 7 days) and `ok`.

**Six flags**, on any verdict: `consent_gated` (counts only visitors who press
Allow; mindmake.co by Krish's design), `thresholded` (Google hides small
numbers), `admin_unverified` (the Admin API is off, so streams were not
checked), `undercounting` (Google sees under half of PostHog's page views, from
10 up), `host_filter_off` (the host filter was refused, so other hosts could
not be left out) and `read_failed` (the last read failed; the verdict shown is
the one before it).

**An unknown is never a zero.** Totals and series stay null unless the read
succeeded and the verdict is `ok`, `quiet` or `provisional`, and no copy prints
"0 visits" for a site that is not proven to be counting. The snapshot restates
the last three days in the property's own time zone on every run, because
Google keeps counting a day for up to 48 hours: a changed value is written as
a correction, and the two newest days are marked provisional. An empty or
missing day is written as 0 only when the property is proven to receive data
(its last verdict was `ok` or `quiet`, or another day in the same read has
visits). Otherwise the day is held, and any stored `ga4` zero for it is
deleted, never a hand-entered one. A failed fetch writes nothing.

**Plausible for mindmake.co.** Google Analytics on mindmake.co loads only after
a visitor presses Allow, so it can never show real traffic there.
`PLAUSIBLE_API_KEY` lets the check read Plausible's visits, sources and goals
beside it. Until the key is set, asking for it is the site's action once
nothing earlier on the ladder is open.

**The ladder: one action per site.** Rungs in order, lowest open one wins:
1. access (the account-level Viewer grant, or the Data API);
2. wiring (tag, stream, the Admin API when a site has recorded nothing);
3. data (the Plausible key);
4. a ruling Krish owes on what the site is for (fulltime.fm, legibility.io);
5. one growth action, for live sites that read fine, written by the model under
   the site's jobs, with a fixed fallback, and retired after 14 days if
   untouched.

Each action names its first step, his minutes and the check that closes it.
Blocking steps that several sites share (the account grant, the Admin API) show
once at the top, and the member cards say they are waiting on it. What the OS
did itself shows under "Fixed on its own"; findings for Maya go onto her
`growth_touchpoints` row as `evidence.web`, never as `tasks` rows.

**Check now.** Growth > What's moving has a Check now button that runs the whole
check on demand with only the app cookie (no CRON_SECRET). It is allowed once
every 10 minutes across all instances, enforced from the database rather than
memory: the newest `web_property_insights.run_at` (service role only) sets the
interval, and a `running` `workflow_runs` heartbeat from the last 5 minutes
covers a check still in flight. `workflow_runs` takes anon writes, so a
heartbeat dated in the future is ignored and no wait is ever longer than 10
minutes.

## Blocked on a one-time external action

- **OP3 read-back** — the prefix is live and collecting; pulling the counts into
  `podcast_downloads` needs an OP3 API token (op3.dev signup) plus real feed
  traffic.
- **Postmaster** (deliverability) — needs a Google OAuth with `postmaster.readonly`
  scope, the Resend domains registered in Postmaster Tools (DNS TXT), and
  meaningful send volume (Postmaster reports little below ~100 emails/day).
  Lowest value at current volume.

Costs for every wired tool fold into `lane_economics` via `growth_integrations`,
so the Profit Governor already covers them.
