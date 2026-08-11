# Mindmaker OS — Ideal Customer Profile (shareable)

> **HISTORICAL (2026-07-10):** advisory sales were retired 2026-07-10 and REOPENED 2026-08-05 under a new thesis; the
> `mindmaker_buyer` lane and the Apollo burn-down are no longer live. Kept for the
> record. The guest/content lanes (`signal_noise_guest`, `built_guest`)
> are still referenced by Nell/Nova.

> Portable ICP spec for the whole fleet. Any agent that sources, scores, routes,
> or drafts to a person (Felix outbound, Nell guest scout, Nova visibility, Cleo,
> the Apollo burn-down, n8n lead ingest) should target and qualify against this.
> Self-contained — you don't need any other doc to use it. Machine-readable
> companion: `docs/icp.json`. Live executable copy: `api/_icpScore.ts` +
> `scripts/apollo/burn.ts`. Full rubric + math: `docs/APOLLO_ICP_RUBRIC.md`.

Status: v2, 2026-06-20. Calibrated against two live Apollo pulls (82 reveals).

---

## The one rule

Score a prospect 0–100 on each lane below from real evidence; **a person is
worth acting on only if their best lane ≥ 70.** Below that, drop — don't dilute
the deck. Absent a signal, that dimension scores low; never invent intent.

Multi-tag is allowed (a person can fit several lanes). The single
`primary_venture` is the registry slug of their best lane (`mindmaker`,
`mindmaker_live`).

---

## The six lanes

### 1. `mindmaker_buyer` → primary_venture `mindmaker`  (serves O-2, consulting revenue)
**Who:** Senior operators or dedicated AI/transformation leaders **inside non-tech
operating companies** who need help adopting AI — Chief Digital/Transformation
Officers, Heads of AI/Innovation/Digital Transformation, CIOs with a transformation
mandate, and CEOs/COOs of mid-market firms actively adopting AI.
**Who it is NOT:** anyone whose employer *sells* AI or software. An AI-vendor
employer is the supply side — disqualifying. (Live proof: v1 targeting on the
word "AI" returned almost all sellers; only an in-house Head of AI Transformation
at a non-tech company was a real buyer.)
**Best evidence:** a dedicated transformation/AI role + a 50–5000-person operating
company in a traditional industry.

### 2. `fractional_network` → primary_venture `mindmaker`  (referral + co-delivery + buyers)
**Who:** Fractional execs and independent advisors who actually **deliver AI work**
— Fractional CTO/CMO/CAIO, AI advisors, boutique AI/transformation consultancies.
They refer buyers, co-deliver, and sometimes buy.
**Who it is NOT:** generic fractional CMOs/COOs with no AI signal (they're 95% of
the raw pool and score low).

### 3. `signal_noise_guest` → primary_venture `signal_noise`  (podcast: AI in media)
**Who:** Credible AI-in-media voices — editors-in-chief, journalists, podcast
hosts, heads of content at media/publishing orgs covering AI.
**Best evidence:** a real outlet + a track record writing/speaking on AI.

### 4. `built_guest` → primary_venture `mindmaker_live`  (podcast: AI builders)
**Who:** People doing something that was **impossible before AI** — a tiny team
shipping what used to take many, a net-new AI-native product, novel craft — with
real audience/traction. Founders at AI-era (founded 2022+) companies.
**Who it is NOT:** a junior AI engineer at a dev shop.
**Note:** structured B2B data (Apollo) cannot judge this lane — audience and
novelty live on the open web. Always run a web pass (Perplexity/Exa/Brave) before
scoring it.

### 5. `mm_ctrl_buyer` → primary_venture `mindmaker`  (CTRL decision-clarity product)
**Who:** Leaders at **non-AI operating companies** in decision-heavy traditional
industries (manufacturing, construction, healthcare, logistics, distribution,
multi-site retail) — Presidents, COOs, GMs, Heads of Operations — drowning in
decisions. 50–5000 people.
**Who it is NOT:** leaders at AI/software companies. They build their own tooling;
they are the worst fit for an external decision-clarity product. (Live proof: v1
surfaced only AI-company COOs and all were wrong; v2 on construction/manufacturing/
logistics ops leaders landed.)

### 6. `ecosystem_partner` → primary_venture `mindmaker` / `mindmaker_live`  (channel/referrals)
**Who:** Startup accelerators, VC platform leads, and operator communities who can
channel **many** buyers or guests — one good partner is leverage.
**Who it is NOT:** government procurement programs and nonprofit/civic "accelerators"
(they dominate a naive keyword search and convert to nothing).

---

## Apollo source filters (validated, per lane)

`mixed_people/api_search` (note: the older `/mixed_people/search` is deprecated for
API callers). Geography default: US / UK / Australia.

| Lane | Titles | Seniority | Size | Key filter |
|---|---|---|---|---|
| `mindmaker_buyer` | CDO, Chief Transformation Officer, CIO, Head of AI / Digital Transformation / Innovation | c_suite, vp, head | 51–5000 | **exclude NAICS 5415/5112/5182** (drop AI/software vendors) |
| `fractional_network` | Fractional CTO/CMO/CAIO, AI Advisor, Principal Consultant | owner, founder, partner, c_suite | 1–200 | keyword `AI` |
| `signal_noise_guest` | Editor-in-Chief, Journalist, Podcast Host, Head of Content | c_suite, vp, head, senior | any | keyword `AI`, media/publishing |
| `built_guest` | Founder, Co-Founder, Creator | owner, founder | 1–50 | **founded 2022+**, keyword `AI`, + web pass |
| `mm_ctrl_buyer` | CEO, COO, President, GM, VP/Head Operations | owner, c_suite, vp, head | 51–5000 | org keywords manufacturing/healthcare/logistics/construction; **exclude NAICS 5415/5112/5182** |
| `ecosystem_partner` | Partner, Program/Managing Director, Head of Community | owner, founder, partner, c_suite, director | any | org keywords accelerator/VC/startup; **exclude NAICS 92/813** (govt/nonprofit) |

**Sourcing mechanics that bite:** keep keyword filters to a *single* term (multi-word
AND-matches to near-zero); Apollo search masks last names, so enrich/dedup on the
Apollo `person_id`; reveal costs 1 credit per match, so dedup *before* the reveal
where possible and always against `lower(email)`.

---

## Scoring dimensions (weights per lane, sum 1.0)

- `mindmaker_buyer`: role_fit .30, intent_signals .25, ai_fluency_gap .20, budget_signal .15, audience_overlap .10
- `fractional_network`: role_fit .30, referral_reach .25, ai_delivery_fit .20, independence_signal .15, audience_overlap .10
- `signal_noise_guest`: narrative_strength .35, novelty .25, audience_pull .20, availability_signal .10, krish_curiosity .10
- `built_guest`: leverage_score .35, ship_cadence .25, infra_thesis .20, audience_pull .10, krish_curiosity .10
- `mm_ctrl_buyer`: decision_load .30, seniority_fit .25, ai_curiosity .20, budget_signal .15, reachability .10
- `ecosystem_partner`: channel_leverage .35, audience_overlap .25, collaboration_fit .20, reachability .10, krish_curiosity .10

**Tiers (best lane):** A ≥ 80 · B 60–79 · C 40–59 · drop < 40. **Insert gate: ≥ 70.**
**Hard guards:** no email *and* no LinkedIn → cap every lane at 55. AI/software-vendor
employer → cap `mindmaker_buyer` and `mm_ctrl_buyer` ≤ 25.

---

## What the live runs proved

- Targeting on the word "AI" recruits the **supply side**; buyer lanes must exclude
  vendors and target intent roles inside operating companies.
- Corrected `mindmaker_buyer` converted **11/15** (vs 1/7 before); corrected
  `mm_ctrl_buyer` **8/12** (vs 0 right before).
- `built_guest` needs a web pass — Apollo data alone can't separate a landmark
  guest from a generic AI founder.
- Universities and government/nonprofit "accelerators" look on-target but convert
  to nothing — exclude or down-rank.

---

## Open calibration notes (for the next revision)

- `mm_ctrl_buyer`'s `ai_curiosity` dimension penalizes exactly the traditional-industry
  leaders CTRL is for; consider replacing it with an `ops_complexity` signal.
- `mindmaker_buyer`'s enterprise CIO/CDO profile overlaps Meliora/AdFixus more than
  the SMB/founder core Mindmaker ICP; consider an enterprise vs. SMB sub-lane.
