# control-center

Autonomous Organisation OS — Mission Control Dashboard.

A real-time dashboard for monitoring and steering an autonomous agent
organisation: tracking agents, tasks, goals, automations, and the n8n
workflows that run them.

## Tech Stack

- **Frontend:** React 18 + TypeScript, built with Vite 4, styled with Tailwind CSS
- **Backend:** Vercel serverless API routes (`@vercel/node`) under `api/`
- **Data:** Supabase (Postgres + Realtime) — see `src/lib/supabase.ts` (client) and `api/_supabase.ts` (server, service role)
- **Automation:** n8n (workflow status, feedback webhooks, skill delivery)
- **AI:** OpenAI (Skill Forge — `api/skills/*`, `api/_skill-prompt.ts`)
- **Hosting:** Vercel (`vercel.json` — Vite framework, SPA rewrites, `/api/*` routes)

## Local Development

1. **Install dependencies** (npm — `package-lock.json` is the committed lockfile):

   ```bash
   npm install
   ```

2. **Configure environment variables.** Copy `.env.example` to `.env` and fill in
   the values. Client variables are prefixed `VITE_` and exposed to the browser;
   the rest are server-only secrets used by the Vercel API routes:

   ```bash
   cp .env.example .env
   ```

   Key variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (client);
   `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `N8N_API_KEY`,
   `N8N_API_BASE_URL`, `SYNC_SECRET`, `OPENAI_API_KEY` (server).

3. **Run the dev server:**

   ```bash
   npm run dev
   ```

   Other scripts: `npm run build`, `npm run preview`, `npm run lint`.

   > Note: the `api/` routes run on Vercel's runtime. Use `vercel dev` if you
   > need the serverless endpoints locally.

## Project Structure

```
api/              Vercel serverless API routes
  _supabase.ts      Server-side Supabase client (service role)
  _skill-prompt.ts  OpenAI prompt logic for Skill Forge
  agents/           Per-agent endpoint ([name].ts)
  skills/           Skill Forge endpoints (generate.ts, ship.ts)
  status.ts         n8n workflow + execution status
  ...               task, goals, metrics, approvals, sync, etc.
src/
  components/       React components (desktop/, mobile/, flows/, shared/)
  contexts/         React context providers (AgentsContext)
  hooks/            Custom hooks (useAgents, useLiveStatus, useRealtimeTasks, ...)
  services/         Data services (agentBriefs, agentData)
  lib/              Supabase browser client
  types/            Shared TypeScript types
docs/             Architecture, API, database, deployment and decision records
scripts/          Cron definitions, SQL migrations, build helpers
public/           Static assets
```

See `docs/` for deeper documentation — `ARCHITECTURE.md`, `API.md`,
`DATABASE.md`, `DEPLOYMENT.md`, and the `DECISIONS/` records.
