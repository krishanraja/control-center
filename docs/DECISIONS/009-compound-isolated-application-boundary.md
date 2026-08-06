# ADR-009: COMPOUND isolated application boundary

- Status: Accepted
- Date: 2026-08-06
- Deciders: Krish Raja

## Context

COMPOUND must live in the existing Control Center GitHub repository and Supabase project while remaining unrelated to the Control Center product. A nested application can share operational platforms without sharing code, navigation, runtime APIs or business tables, but the boundary must be explicit and testable.

## Decision

COMPOUND is a standalone package under `compound/`, deployed as its own Vercel project and backed only by a dedicated `compound` Supabase schema. Its only permitted cross-schema relationship is membership identity through `auth.users`.

## Alternatives considered

- New GitHub and Supabase projects: stronger physical isolation, rejected because Krish explicitly chose shared platforms.
- A route inside the existing Vite application: rejected because it couples builds, dependencies, navigation and runtime state.
- Daily JSON committed to Git: rejected because it creates deployment churn and competes with Supabase as the runtime source of truth.

## Consequences

- COMPOUND can deploy, fail and evolve without importing Control Center application code.
- Database objects and policies are auditable as one namespace.
- Repository permissions, Supabase availability and service-role blast radius remain shared.
- Root workflows and migrations are the two intentional repository touchpoints.

## Follow-ups

- Add an automated import and database-schema boundary check.
- Configure path-aware Vercel build skipping before production release.
- Verify RLS with anonymous, non-member, member and service-role identities.
