# Deployment

> **Scope.** How Control Center gets from a `git push` to the live
> production URL, the Vercel quirks that bite if ignored, the rollback
> procedure, and the env-var inventory.
>
> **Not in this document.** Secrets rotation lives in
> [`SECURITY.md`](./SECURITY.md). Health-check contracts live in
> [`OBSERVABILITY.md`](./OBSERVABILITY.md).

## Overview

- **Production URL:** [`controlcenter.krishraja.com`](https://controlcenter.krishraja.com)
- **Host:** Vercel
- **Auto-deploy trigger:** push to `main`
- **Manual deploy:** banned (the Vercel CLI is explicitly off-limits — see [§Vercel CLI is banned](#vercel-cli-is-banned))

## Vercel configuration

### Project settings

| Setting | Value |
|---|---|
| Framework Preset | Vite |
| Build Command | `npm run build` (configured in `vercel.json`) |
| Output Directory | `dist` |
| Install Command | `npm install` |
| Node.js Version | 18.x or later |
| SPA rewrites | All non-`/api/*` paths rewrite to `/index.html` (`vercel.json`) |
| `/api/*` routes | Auto-detected from `api/` folder |

### `vercel.json` invariants

Don't change without coordination:

- `framework: "vite"` — disabling the auto-detection breaks the
  Vite-specific build path.
- SPA rewrite to `index.html` — required for the hash router on cold
  loads.

## Domain configuration

1. Add custom domain in the Vercel dashboard.
2. DNS CNAME → `cname.vercel-dns.com`.
3. SSL is auto-provisioned by Vercel.
4. The `controlcenter.krishraja.com` apex is owned and managed by Krish.

## Deployment workflow

### Automatic (only path)

Every push to `main`:

1. Vercel detects the push.
2. Runs `npm install`.
3. Runs `npm run build`.
4. Deploys to production with the production env vars.

CI (`.github/workflows/ci.yml`) runs before merge:

- `npm ci`
- `npm run lint --max-warnings 0`
- `npx tsc --noEmit`

A lint warning or type error fails CI and blocks merge.

### Preview deployments

Every PR gets a unique preview URL:

```
control-center-<hash>-krishanraja-projects.vercel.app
```

Preview deployments use the **Preview** env-var scope in Vercel — keep
that pointed at a separate Supabase project (or a clearly labelled
staging schema), not production. See [`SECURITY.md`](./SECURITY.md).

### Vercel CLI is banned

`vercel deploy` and `vercel --prod` are off-limits for this repo. The
rule exists because:

1. Manual deploys drift from `main` — the deployed code stops matching
   what's in git, which makes rollback ambiguous.
2. Manual deploys skip the CI gate.
3. The OS architecture (`MINDMAKER_OS_ARCHITECTURE.md` §4) treats the
   commit on `main` as the deploy receipt.

If a deploy is wedged and pushing a fresh commit doesn't work, talk to
Krish.

## ESM gotcha (the most common 500)

Because `package.json` declares `"type": "module"`, every relative
import inside `api/` must include the `.js` extension:

```typescript
// Good
import { supabase } from './_supabase.js'

// Bad — Vercel returns a silent 500 on the deployed function
import { supabase } from './_supabase'
```

The TS compiler doesn't surface this; Vite-built browser code doesn't
have the problem (it's the Vercel serverless runtime specifically). If
a freshly deployed `/api/*` endpoint returns 500 with no body, this is
the first thing to check.

## Environment variables

The full list lives in `.env.example`. Two scopes:

### Client (browser-exposed, prefixed `VITE_`)

| Variable | Purpose |
|---|---|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Anon key — public, subject to RLS |
| `VITE_API_URL` | Optional override for `/api` base (defaults to same-origin) |
| `VITE_N8N_FEEDBACK_URL` | N8N feedback ingestion webhook |
| `VITE_N8N_CLEO_TRANSFORM_URL` | Cleo content transform webhook |
| `VITE_N8N_VISIBILITY_DEEP_ENRICH_URL` | Visibility deep-enrich webhook |

### Server (Vercel API routes, never exposed)

| Variable | Purpose |
|---|---|
| `SUPABASE_URL` | Mirror of `VITE_SUPABASE_URL` for server-side |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role — bypasses RLS. **Most sensitive secret.** |
| `SYNC_SECRET` | Guards `/api/sync` against unauthorised inbound writes |
| `N8N_API_KEY` | Auth for the N8N API (`/api/status`) |
| `N8N_API_BASE_URL` | Base URL for the N8N API |
| `N8N_FEEDBACK_URL` | Server-side mirror of the feedback webhook |
| `OPENAI_API_KEY` | Skill Forge (`/api/skills/*`) |
| `OPENAI_MODEL` | Defaults to `gpt-4o` |
| `SKILL_DELIVERY_WEBHOOK_URL` | Skill Forge delivery target |

**Env-var changes don't auto-redeploy.** After editing in the Vercel UI,
trigger a fresh deploy (commit something, or use the Vercel UI's "Redeploy" on
the latest deployment) so the functions pick up the new value.

## Build process

### Local

```bash
npm install
npx tsc --noEmit       # type check
npm run lint           # eslint
npm run build          # production bundle
npm run preview        # serve dist/
```

### Build output

```
dist/
  index.html
  assets/
    index-<hash>.js
    index-<hash>.css
  favicon.ico
```

## Pre-deploy checklist

If you're not sure whether to push:

- [ ] `npx tsc --noEmit` passes
- [ ] `npm run lint` passes (`--max-warnings 0`)
- [ ] `npm run build` completes
- [ ] No `console.error` left behind in changed files
- [ ] Realtime subscriptions verified manually
- [ ] Mobile + desktop layouts manually checked at 414×900 and 1280×800
- [ ] If you added a service-role write path, it's behind `/api/*` not
      the anon-key browser client
- [ ] If you added an `api/*` import, the import path ends in `.js`

## Rollback

### Via Vercel dashboard

1. Vercel Deployments tab.
2. Find a previous green production deployment.
3. Click "..." → "Promote to Production".

Use only when a hot revert can't go through a regular commit. The
canonical state is `main`; promoting an older deploy puts the deployed
state out of sync with `git`. Follow up with a revert commit and push so
they re-converge.

### Via revert commit (preferred)

```bash
git revert <bad-sha>
git push origin main
```

Vercel auto-deploys the revert. Clean, ungappable history.

## Monitoring

### Vercel Analytics

Enabled in the dashboard. Tracks page views and Core Web Vitals (LCP,
FID, CLS). Useful for catching regressions in cold-load performance.

### Function logs

`Functions` tab in the Vercel project. Filter by endpoint when
investigating a `/api/*` issue.

### Health endpoint

`GET /api/health` returns the live aggregate status. External monitors
(if any) should poll this rather than the root HTML.

## Performance

### Current bundle size

The build produces a single large bundle (~885KB). Acceptable today for
a single-operator product but should be split before any public
exposure.

### Code splitting roadmap

```typescript
// Lazy load tabs
const DesktopLeads = lazy(() => import('./components/desktop/DesktopLeads'))
```

### Manual chunks (when you ship splitting)

```typescript
// vite.config.ts
export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          'supabase': ['@supabase/supabase-js']
        }
      }
    }
  }
})
```

### Asset caching

Vercel auto-caches `dist/assets/*` (hashed filenames) with long TTLs.
API routes should set explicit cache headers — the default is
no-cache.

## Troubleshooting

### Build failures

1. Check the Vercel build log.
2. Reproduce locally with `npm run build`.
3. Common causes: TypeScript error, missing env var referenced in
   `vite.config.ts` at build time, broken relative import path.

### Runtime errors (browser)

1. Browser console.
2. Vercel function logs (if the error is from an `/api/*` call).
3. Supabase logs (Studio → Logs) for RLS denials or query errors.

### Runtime errors (api/*)

1. Vercel function logs.
2. **Is the import path missing `.js`?** (See ESM gotcha above.)
3. Is `SUPABASE_SERVICE_ROLE_KEY` set on the right env scope?

### Realtime not working

1. Verify `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` match the
   project.
2. Check Supabase Studio → Database → Replication → table has Realtime
   enabled.
3. Verify the table's anon SELECT RLS policy.
4. Browser DevTools Network tab → filter `ws` → confirm the WebSocket
   is connected.

### "Silent 500" from a freshly deployed `/api/*`

ESM import path missing `.js`. Always check this first.

## Security considerations

- **Never commit secrets.** `.env*` is gitignored. CI runs secret
  scanning.
- **Anon key is public** — RLS is the protection, not key secrecy.
- **Service role key is server-only.** Never exposed in any `VITE_*`
  env var; never imported under `src/`.
- **CORS** is handled by Supabase automatically for project URLs and by
  Vercel functions when needed (set `Access-Control-Allow-Origin: *`
  explicitly on `/api/*` reads).

Full rotation procedure: [`SECURITY.md`](./SECURITY.md#rotation-procedure).
