-- The 119 contacts that no search could find.
--
-- network_search ranks on contact_intelligence. A contacts row without one is
-- not low-ranked, it is absent: invisible to the Network tab, to the Pilots
-- seed, to the guest scout, to every surface that goes through the scorer.
-- api/network/add-person.ts always wrote both rows; the bulk paths never did,
-- and on 2026-09-16 exactly 119 people were stranded that way - the same
-- number migration 20260915240000 added an "invisible" counter to report.
-- Counting them was the right first step. This stops them existing.
--
-- api/_intelStub.ts closes the leak going forward. This closes the backlog.
--
-- A stub is enough to be found: ci_rebuild_doc_trg fires BEFORE INSERT and
-- composes intel_doc from the CONTACTS row, so "Jane Doe · VP Sales · AdRoll
-- · London" is reachable by lexical search the moment this runs, and the row
-- is marked embed_stale so the next embedding pass picks it up rather than
-- claiming a freshness it does not have.
--
-- intel_method is 'pending', which is deliberately NOT one of the eight real
-- methods, so no stub can be mistaken for a judgment and the thin-evidence
-- badge keeps telling the truth. network_tier is the one NOT NULL column with
-- no default; owned network is the honest floor, and claiming closer would
-- overstate a relationship nobody has assessed.

INSERT INTO public.contact_intelligence (contact_id, network_tier, intel_method)
SELECT c.id, '4_owned_network', 'pending'
  FROM public.contacts c
  LEFT JOIN public.contact_intelligence ci ON ci.contact_id = c.id
 WHERE ci.contact_id IS NULL
ON CONFLICT (contact_id) DO NOTHING;
