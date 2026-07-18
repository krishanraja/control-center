# Measurement spine — status

Layer 3 of the growth control model: real signal from every product flowing into
the OS. Product brands only; no personal brand anywhere.

## Live

- **SEO rank** (`maya_striking_distance`) — Maya SEO Rank Sweep (weekly). Serper
  positions + DataForSEO volume for CTRL / Pulse / Plinth ICP keywords. Surfaced
  on the Growth tab (SEO rank board).
- **GEO citations** (`zara_signals`) — Zara GEO Citation Sweep (weekly). Whether
  products get cited in AI answers.
- **PostHog product analytics** (`product_metrics`) — Maya PostHog Product Sync
  (daily 06:30 UTC). 7-day rolling active users / pageviews / events per product.
  One shared PostHog project (free tier caps at one); the `product` super-property
  separates ventures.
  - Apps instrumented (posthog-js snippet, publishable client key): **mm-ctrl,
    plinth, fractionl-pulse are live**; **full-time is committed but not yet
    deployed** (its Vercel project's git auto-deploy is disconnected, so the push
    to main did not build — needs a manual Vercel deploy or a git reconnect).
- **OP3 podcast downloads** — the `op3.dev/e/` enclosure prefix is live in Full
  Time's RSS (`src/routes/api/public/feed[.]rss.ts`), so downloads start counting
  at OP3 the moment that build ships (see full-time deploy note above).

## Blocked on a one-time external action

- **GSC** (`maya_striking_distance` clicks/impressions/ctr) — the n8n "Google
  account" OAuth has no live access token. Connect a Google OAuth with the
  `webmasters.readonly` scope (or add a service account as a user on the 4 Search
  Console properties), then the sync into `maya_striking_distance` can run.
- **OP3 read-back** — the prefix is live and collecting; pulling the counts into
  `podcast_downloads` needs an OP3 API token (op3.dev signup) plus real feed
  traffic.
- **Postmaster** (deliverability) — needs a Google OAuth with `postmaster.readonly`
  scope, the Resend domains registered in Postmaster Tools (DNS TXT), and
  meaningful send volume (Postmaster reports little below ~100 emails/day).
  Lowest value at current volume.

Costs for every wired tool fold into `lane_economics` via `growth_integrations`,
so the Profit Governor already covers them.
