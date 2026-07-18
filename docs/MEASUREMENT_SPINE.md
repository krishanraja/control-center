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
  - All four apps instrumented (posthog-js snippet, publishable client key) and
    deployed: **mm-ctrl, plinth, fractionl-pulse, full-time are live** (verified
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
