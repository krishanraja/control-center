-- Service-role-only secrets store. The app reads some third-party API keys at
-- runtime (e.g. OPENAI_API_KEY for embedding/clustering) and the deploy env is
-- not always the most convenient place to set them. This table holds them
-- server-side ONLY: RLS is enabled with no anon/authenticated policy, so the
-- browser (anon) client can never read it, while the API's service-role client
-- bypasses RLS and can. NEVER select from this table with the anon client.
--
-- Values are inserted out-of-band (not in this migration) so secrets never live
-- in the repo. Idempotent.

CREATE TABLE IF NOT EXISTS public.app_secrets (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.app_secrets ENABLE ROW LEVEL SECURITY;

-- Belt-and-suspenders: no grants to client roles, and (with RLS on + no policy)
-- anon/authenticated get zero rows even if a grant existed. service_role bypasses RLS.
REVOKE ALL ON public.app_secrets FROM anon, authenticated;
