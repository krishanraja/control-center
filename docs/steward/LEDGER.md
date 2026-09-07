# Docs steward ledger

Append-only. One line per repo per run, newest first. Written by the
control-center nightly steward run from each fleet repo's `NOW.md`
frontmatter, and by hand during the bootstrap. This is the cross-repo
chronology; per-repo detail lives in each repo's `docs/history/LOG.md`.

Disposition vocabulary: `bootstrap`, `no change`, `stamped` (head and as_of
only), `reconciled`, `fallback PR`, `failed`.

| Date | Repo | Head before | Head after | Disposition | Notes |
|---|---|---|---|---|---|
| 2026-09-07 | mindmake | 64d63f1 | 9300add | bootstrap | Krish's decision: project-documentation/history/LOG.md replaces the no-history rule. 06_CURRENT_STATE.md cut from 2,363 to 126 lines by moving its dated journal verbatim into the LOG (every removed line verified present; 46 em dashes replaced); current sections reconciled against facts the journal recorded later; root README's four stale sentences reconciled to canon. Canon files untouched. The testimonials finding from the Content Engine audit was fixed by Krish's own commits (#156, #157) during the run. Waiting on Krish: method wording sign-off; production readback of the 7 September testimonials commits. |
| 2026-09-07 | mm-ctrl | edd9045 | 4a0f6c1 | bootstrap | 64 files from the 2026-09-04 upload classed Historical and moved to docs/history/ with banners; nine overwritten docs restored to their 2026-08-20 revisions; a production login and password removed from one moved file (rotation owed); CHANGELOG gained #371 and #375; release-state and architecture corrected (915 tests in 57 files). Waiting on Krish: rotate the credential; Mindmaker vs Mindmake naming; deployment readback for #371 and #375. |
| 2026-09-07 | control-center | 85c8218 | 3554502d | reconciled | Main moved by five commits during the fleet bootstrap; NOW.md re-headed with two bullets (scorecard counts every commit; one-surface retirement closed out); validator and digest harden path quoting; fleet path fix for fractionl-pulse. |
| 2026-09-07 | full-time | adddf64 | 480e046 | bootstrap | Three Current docs reconciled to the 2026-09-04 founder launch override and 2026-09-05 per-edition publication; ten docs checked against pipeline, judge, evidence, publish and cost changes and stamped; product-state.json asOf and check script moved in lockstep. Waiting on Krish: subset-run publication intent; pre-launch wording in 07, 08, 10, 21. |
| 2026-09-07 | contentarchives | ee3b550 | b8b31ed | bootstrap | No moves. NOW.md figures quoted from the regenerated state files; dated timeline paragraph added to HANDOVER.md; reconciled twice in one session because a Takeout-merge commit landed mid-review. Waiting on Krish: HANDOVER figures refresh from the library machine; three SEGMENTATION.md decisions. |
| 2026-09-07 | mindmake-video-studio | 8477f04 | 374922b | bootstrap | No moves. First date stamp in the repo (CAROUSEL_ENGINE_STATE.md); NOW.md covers both engines and the runner; README rendering sentence corrected against config/studio.json. Waiting on Krish: Mindmaker vs Mindmake naming in README, PILOT.md and skill descriptions. |
| 2026-09-07 | fractionl-circle | 5ac840e | 75fda80 | bootstrap | Two root audit reports moved to docs/_archive/ with banners; archive README's product sentence corrected against the routing code; DELIVERY_STATE gained the #154 line from a read-only bundle readback; lifecycle dormant. Waiting on Krish: parked, retired or resuming. |
| 2026-09-07 | fractionl-pulse | 7df98a5 | 791d899 | bootstrap | No moves. TECHNICAL_SPEC and DATA_SOURCES_ROADMAP reconciled for the two 2026-08-29 production fixes; production not read back so the 11 August stamps and truth-file snapshot stand. Commercial docs checked for contradiction: none. |
| 2026-09-07 | control-center | 600ba77c | 85c8218 | bootstrap | NOW.md, history log, icp.json v2 to v3 (room_face, parked flags), ICP.md lane table, n8n snapshot README banner, glossary pointer. Content Engine ingest now reads NOW.md and the history log. Merged as PR #279. |
