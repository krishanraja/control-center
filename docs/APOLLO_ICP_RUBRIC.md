# Apollo ICP Scoring Rubric

> The gate. **No prospect is pulled from Apollo, scored, or inserted into
> `leads` except through this rubric.** It exists so the credit burn buys
> *precision*, not volume: every lead that lands in the Control Center should be
> one Krish would genuinely want to act on.

Status: v1 (2026-06-20). Owner: Krish. Lives alongside the live scoring criteria
seeded in `venture_registry.scoring_criteria` — this doc is the human-readable
master; the code in `api/_icpScore.ts` is the executable copy. Keep them in sync.

---

## 0. How scoring works (one pass per prospect)

1. **Source** — Apollo `mixed_people/search` with the per-lane filters in §2.
   Search is cheap (no credits for the list); it pre-qualifies the pool.
2. **Reveal/enrich** — Apollo `people/bulk_match` (≤10/call, `reveal_personal_emails`)
   pulls the verified email + full org/career data. **This is the credit-spending
   step**, so it only runs on prospects that survive dedup (§4).
3. **Score** — Claude (Sonnet, per MT-003) applies §3 to the enriched record and
   emits, for **every lane**, a 0–100 score; then a `tier`, a `primary_venture`
   (one of the three `venture_registry` slugs), `tags[]`, and a one-line
   `why_relevant`. Output schema in §5.
4. **Gate** — a prospect is **inserted only if its best lane ≥ 70** (§6). Below
   that, it is discarded (no row written) — that is the "10/10" precision bar.

Every score must be *defensible from the data on the record*. Absent a signal,
that dimension scores low — the model never invents intent.

---

## 1. Lanes (covering every venture + the additions Krish asked for)

A prospect can match more than one lane (multi-tag); `primary_venture` is the
single registry slug for the lane it scores highest on. Lanes that aren't a
registry venture (fractional, mm-ctrl, ecosystem) still set a `tag` and an
`icp_scores` key, and map `primary_venture` to the closest registry slug.

| Lane | `tag` | `primary_venture` | Serves | OS outcome |
|---|---|---|---|---|
| **Mindmaker buyer** | `mindmaker_buyer` | `mindmaker` | AI consulting sprint buyers | **O-2** ($20K/mo consulting) |
| **Fractional network** *(new)* | `fractional_network` | `mindmaker` | Fractional execs / independent advisors / boutique AI consultancies — referral, co-delivery, and buyers | O-2 + O-3 |
| **Signal & Noise guest** | `signal_noise_guest` | `signal_noise` | AI-in-media voices for the podcast | content / audience |
| **Builder Economy guest** | `builder_economy_guest` | `builder_economy` | AI builders / indie hackers / technical founders | content / audience |
| **mm-ctrl buyer** *(outside-box)* | `mm_ctrl_buyer` | `mindmaker` | Leaders who'd buy the decision-clarity product (CTRL) | builder-product growth |
| **Ecosystem partner** *(outside-box)* | `ecosystem_partner` | `mindmaker` / `builder_economy` | Accelerators, communities, agencies, VC platform leads who channel buyers + guests | O-2 + audience compounding |

*Outside-the-box rationale:* the OS sells six builder products and runs three
content brands, not just consulting. mm-ctrl's ICP (senior operators drowning in
decisions) overlaps the consulting ICP but is a distinct buy, and ecosystem
partners are leverage — one accelerator partner channels dozens of buyers/guests.
Both are scored conservatively (higher insert bar in practice) so they never
dilute the core consulting pipeline.

---

## 2. Apollo search filters (the pre-qualifier, per lane)

`mixed_people/search` params. Taxonomy IDs (industries) resolve at runtime;
keywords (`q_keywords`, `q_organization_keyword_tags`) are the portable fallback.
Geography default: `["United States","United Kingdom","Australia"]` (Krish's
markets) unless widened.

| Lane | `person_titles` (examples) | `person_seniorities` | `organization_num_employees_ranges` | Industry / keyword bias |
|---|---|---|---|---|
| `mindmaker_buyer` | Founder, CEO, COO, President, CMO, CTO, Chief of Staff, VP/Head (Ops/Marketing/Product/Strategy) | owner, founder, c_suite, partner, vp, head | `11,50` `51,200` `201,500` `501,1000` `1001,5000` | SaaS, software, professional services, media, fintech; kw "AI", "transformation", "digital" |
| `fractional_network` | Fractional CxO, Fractional CTO/CMO/CPO/CAIO, Independent Advisor, Principal Consultant, Managing Partner | owner, founder, partner, c_suite | `1,10` `11,50` `51,200` | kw "fractional", "advisory", "consultant", "interim", boutique/agency orgs |
| `signal_noise_guest` | Editor, Editor-in-Chief, Journalist, Podcast Host, Head of Content, Producer, Media/Comms Director | owner, founder, c_suite, vp, head, senior | any | publishing, media, broadcasting, marketing; kw "AI", "media", "journalism", "creator" |
| `builder_economy_guest` | Founder, Co-Founder, Indie Hacker, Software Engineer, AI Engineer, Developer, Maker | owner, founder, c_suite, senior, entry | `1,10` `11,50` | kw "AI", "build in public", "indie", "developer", "open source", "agents" |
| `mm_ctrl_buyer` | CEO, COO, Founder, VP/Head (Strategy/Ops), Director | owner, founder, c_suite, vp, head, director | `11,50` `51,200` `201,1000` | leadership-heavy orgs; kw "decision", "strategy", "leadership", "AI" |
| `ecosystem_partner` | Partner, Program Director, Community Lead, Platform Lead, Managing Director | owner, founder, partner, c_suite, director | any | kw "accelerator", "community", "venture", "agency", "ecosystem" |

Searches are issued per lane; the pool is unioned and de-duplicated before any
credit-spending reveal.

---

## 3. Scoring dimensions (weights sum to 1.0 per lane)

Each dimension is scored 0–100 from the enriched record; the lane score is the
weighted sum. Weights for the three registry ventures match the live
`venture_registry.scoring_criteria` seed; the new lanes are defined here.

**`mindmaker_buyer`** (matches seed) — role_fit **0.30**, intent_signals **0.25**,
ai_fluency_gap **0.20**, budget_signal **0.15**, audience_overlap **0.10**.

**`fractional_network`** — role_fit **0.30** (is this actually a fractional/advisor
role?), referral_reach **0.25** (network/portfolio breadth → can route buyers),
ai_delivery_fit **0.20** (do they deliver AI/transformation work?),
independence_signal **0.15** (independent vs. captive), audience_overlap **0.10**.

**`signal_noise_guest`** (matches seed) — narrative_strength **0.35**,
novelty **0.25**, audience_pull **0.20**, availability_signal **0.10**,
krish_curiosity **0.10**.

**`builder_economy_guest`** (matches seed) — leverage_score **0.35**,
ship_cadence **0.25**, infra_thesis **0.20**, audience_pull **0.10**,
krish_curiosity **0.10**.

**`mm_ctrl_buyer`** — decision_load **0.30** (seniority/role implies high
decision volume), seniority_fit **0.25**, ai_curiosity **0.20**,
budget_signal **0.15**, reachability **0.10**.

**`ecosystem_partner`** — channel_leverage **0.35** (how many buyers/guests they
can route), audience_overlap **0.25**, collaboration_fit **0.20**,
reachability **0.10**, krish_curiosity **0.10**.

**Reachability is a hard multiplier, not just a dimension:** if Apollo returns no
verified email *and* no usable LinkedIn, every lane is capped at 55 (it can't
become an A/B lead you can act on).

---

## 4. Dedup & exclusions (before any reveal credit is spent)

- **Dedup** against existing `leads` and `contacts` on `email_norm` and
  `linkedin_url_norm` (reuse the keys from migration `20260617120000`). A match →
  skip (optionally enrich-existing path, never a new insert).
- **Hard excludes:** students/interns; explicit do-not-contact; obvious direct
  competitors (other AI-consulting sprint shops, unless `ecosystem_partner`);
  missing both name and company; personal/throwaway domains with no org.
- **Geography:** outside the target markets is allowed only if the lane score is
  A-tier on narrative/leverage (guests/partners can be global).

---

## 5. Output schema (what scoring writes per prospect)

```jsonc
{
  "icp_scores": {                 // → leads.icp_scores (jsonb)
    "mindmaker": 0-100,           // keyed by lane; registry slugs use the slug,
    "fractional_network": 0-100,  // non-registry lanes use the tag name
    "signal_noise": 0-100,
    "builder_economy": 0-100,
    "mm_ctrl_buyer": 0-100,
    "ecosystem_partner": 0-100
  },
  "best_lane": "mindmaker_buyer",
  "best_score": 0-100,
  "tier": "A" | "B" | "C",        // → leads.tier
  "icp_score": 0-100,             // → leads.icp_score (int, = best_score)
  "primary_venture": "mindmaker", // → leads.primary_venture (FK; registry slug)
  "tags": ["mindmaker_buyer"],    // → leads.tags (every lane ≥ tier-C threshold)
  "why_relevant": "one concrete sentence grounded in the record",
  "dimension_breakdown": { "...": "for auditability, stored in raw_extraction" }
}
```

Tier thresholds (best lane): **A ≥ 80**, **B 60–79**, **C 40–59**. Registry
ventures keep their seeded thresholds for the per-lane tag decision; the
cross-lane `tier` uses A/B/C above.

---

## 6. The insert gate (the "10/10" bar)

A new `leads` row is written **only when `best_score ≥ 70`**. Everything below is
discarded without spending an insert (the reveal credit is already spent, which
is why dedup runs first). Inserted rows carry `source_type='apollo'`,
`status='new'`, the schema in §5, and `raw_extraction.apollo` (raw match payload
+ dimension breakdown + the search lane that surfaced them).

Rationale: at ~1642 credits the temptation is to flood the deck. The gate keeps
the Leads tab a place Krish *trusts* — if he opens it and the top cards aren't
obviously worth a reply, the rubric failed and we tighten it before the full burn.
The 50-lead test pull exists precisely to check this before committing the budget.
