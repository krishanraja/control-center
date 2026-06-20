#!/usr/bin/env -S npx tsx
// Apollo credit balance probe. Run before/after a burn to confirm spend.
//   npx tsx scripts/apollo/usage.ts
// Requires APOLLO_API_KEY. Returns best-effort remaining credits; Apollo's
// credit endpoint varies by plan, so a null means "unknown — meter via the
// burn script's local reveal counter instead."

import { apolloCreditsRemaining } from '../../api/_apollo'

if (!process.env.APOLLO_API_KEY) { console.error('Missing APOLLO_API_KEY'); process.exit(1) }

apolloCreditsRemaining().then(c => {
  if (c == null) {
    console.log('Apollo credits remaining: unknown (endpoint not exposed on this plan).')
    console.log('Meter spend via scripts/apollo/burn.ts revealed-email counter instead.')
  } else {
    console.log(`Apollo credits remaining: ${c}`)
  }
}).catch(e => { console.error(e); process.exit(1) })
