-- Restore the two hardening categories ADR-008 accepted, where they have drifted.
--
-- ── What this is NOT ────────────────────────────────────────────────────────
-- ADR-008 deliberately DEFERRED three things, and this migration touches none
-- of them, because "fixing" them naively breaks the live app:
--
--   * the SECURITY DEFINER views (decisions_waiting, triage_queue, +10). They
--     are read by the anon key BECAUSE they are definer; converting them blanks
--     the dashboard until real auth exists.
--   * the USING(true) write policies that the one-click actions depend on.
--   * vector / http living in public — unqualified references across many
--     functions depend on it.
--
-- Those stay open, by decision, until the auth layer lands.
--
-- ── What this IS ────────────────────────────────────────────────────────────
-- ADR-008 APPLIED two categories on 2026-07-01, in migrations
-- cc_harden_function_search_path and cc_lockdown_security_definer_function_execute.
-- Both have since drifted: functions added after that date did not follow the
-- precedent, so the advisor is reporting the same class of finding again.
-- This is restoration of an accepted decision, not a new one.
--
-- 1. PIN search_path (advisor 0011). ADR-008 pinned all 39 functions that
--    existed then. Six added since have a mutable search_path, which is how a
--    function gets tricked into resolving an unqualified name against an
--    attacker-controlled schema. All six reference only public, so pinning
--    preserves behaviour exactly.
ALTER FUNCTION public.events_for(p_home_city text)                    SET search_path = public;
ALTER FUNCTION public.fix_lane_sourcing_type()                        SET search_path = public;
ALTER FUNCTION public.maya_striking_distance_shift_position()         SET search_path = public;
ALTER FUNCTION public.operator_tz()                                   SET search_path = public;
ALTER FUNCTION public.scrub_dead_events(p_home_city text)             SET search_path = public;
ALTER FUNCTION public.touch_updated_at()                              SET search_path = public;

-- 2. LOCK DOWN anon-callable SECURITY DEFINER functions (advisors 0028/0029).
--    Two were added after ADR-008 and are executable by anon — i.e. by anyone
--    holding the public anon key, which ships in the browser bundle.
--
--    audience_import_proxy is the sharp one: it is SECURITY DEFINER, takes a
--    CSV, and writes contacts. scripts/migrations/2026-07-29-audience-import-source.sql
--    already ran `revoke all ... from public`, but that does not remove the
--    grants Supabase issues directly to the anon and authenticated ROLES, so
--    the function stayed reachable. Naming the roles is what actually closes it
--    — the same correction ADR-008 made.
--
--    Caller-audited safe, re-verified for this change:
--      * src/ makes ZERO .rpc() calls (the audit ADR-008 relied on still holds)
--      * audience_import_proxy   <- api/audience/import-substack.ts  (service role)
--      * reject_reason_neighbors <- api/content-decisions/[id]/likely-reasons.ts (service role)
--    Both callers go through api/_supabase.ts, which uses SUPABASE_SERVICE_ROLE_KEY.
REVOKE EXECUTE ON FUNCTION public.audience_import_proxy(text, text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.audience_import_proxy(text, text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.reject_reason_neighbors(text, double precision, integer) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.reject_reason_neighbors(text, double precision, integer) TO service_role;

-- Reversible: re-granting EXECUTE to anon restores the previous state, and the
-- search_path pins can be dropped with `ALTER FUNCTION ... RESET search_path`.
