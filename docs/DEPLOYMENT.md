# Deployment Guide

## Overview

Control Center is deployed on Vercel with automatic deployments from the `main` branch.

## Production URL

```
https://controlcenter.krishraja.com
```

## Vercel Configuration

### Project Settings

| Setting | Value |
|---------|-------|
| Framework Preset | Vite |
| Build Command | `npm run build` |
| Output Directory | `dist` |
| Install Command | `npm install` |
| Node.js Version | 18.x |

### Environment Variables

Required environment variables in Vercel dashboard:

| Variable | Description |
|----------|-------------|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anonymous key |

### Domain Configuration

1. Add custom domain in Vercel dashboard
2. Configure DNS CNAME record pointing to `cname.vercel-dns.com`
3. SSL certificate auto-provisioned

## Deployment Workflow

### Automatic Deployments

Every push to `main` triggers:
1. Vercel detects push
2. Installs dependencies
3. Runs `npm run build`
4. Deploys to production

### Preview Deployments

Every PR gets a preview URL:
- Format: `control-center-<hash>-<team>.vercel.app`
- Useful for testing changes before merge

### Manual Deployment

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy to preview
vercel

# Deploy to production
vercel --prod
```

## Build Process

### Local Build

```bash
# Install dependencies
npm install

# Type check
npx tsc --noEmit

# Build for production
npm run build

# Preview production build locally
npm run preview
```

### Build Output

```
dist/
├── index.html
├── assets/
│   ├── index-<hash>.js
│   └── index-<hash>.css
└── favicon.ico
```

## Pre-Deployment Checklist

- [ ] `npx tsc --noEmit` passes with no errors
- [ ] `npm run build` completes successfully
- [ ] No console errors in browser
- [ ] All tabs render correctly
- [ ] Realtime subscriptions working
- [ ] Inline actions update Supabase
- [ ] Mobile and desktop layouts correct

## Rollback

### Via Vercel Dashboard

1. Go to Deployments tab
2. Find previous working deployment
3. Click "..." menu → "Promote to Production"

### Via CLI

```bash
# List deployments
vercel ls

# Promote specific deployment
vercel promote <deployment-url>
```

## Monitoring

### Vercel Analytics

Enable in Vercel dashboard for:
- Page views
- Web Vitals (LCP, FID, CLS)
- Geographic distribution

### Error Tracking

Consider adding Sentry for production error tracking:

```bash
npm install @sentry/react
```

```typescript
import * as Sentry from '@sentry/react'

Sentry.init({
  dsn: 'your-sentry-dsn',
  environment: import.meta.env.MODE,
})
```

## Performance Optimization

### Vite Build Optimization

Current build produces a large bundle (~885KB). Consider:

1. **Code Splitting**
```typescript
// Lazy load tabs
const DesktopHome = lazy(() => import('./components/desktop/DesktopHome'))
```

2. **Manual Chunks**
```typescript
// vite.config.ts
export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          'supabase': ['@supabase/supabase-js'],
          'charts': ['recharts'],
        }
      }
    }
  }
})
```

### Caching

Vercel automatically caches static assets with long TTLs. API routes (if any) should set appropriate cache headers.

## Troubleshooting

### Build Failures

1. Check Vercel build logs
2. Reproduce locally with `npm run build`
3. Common issues:
   - TypeScript errors
   - Missing environment variables
   - Import path issues

### Runtime Errors

1. Check browser console
2. Check Vercel Function logs (if using API routes)
3. Check Supabase logs for database errors

### Realtime Not Working

1. Verify Supabase URL and key
2. Check Supabase Realtime is enabled
3. Verify RLS policies allow reads
4. Check browser Network tab for WebSocket connection

## Security Considerations

1. **Never commit secrets** - Use Vercel environment variables
2. **Anon key is public** - RLS policies protect data
3. **Service role key** - Never expose in frontend
4. **CORS** - Supabase handles automatically
