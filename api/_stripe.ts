/**
 * The five Stripe accounts the portfolio bills through, and the one credential
 * that reads all of them.
 *
 * Before this file `api/revenue/sync.ts` hardcoded two accounts behind two env
 * vars (`STRIPE_API_KEY`, `STRIPE_API_KEY_FRACTIONL`), so Full Time, Legibility
 * and Heartside could not appear in Control Center however much they earned.
 * Three products were invisible by construction, not by accident.
 *
 * ONE KEY, FIVE ACCOUNTS. The Stripe organisation key reads every account in
 * the org when each request carries `Stripe-Context: acct_...`. That is one
 * credential to rotate instead of five, and Control Center only ever needs
 * READ, so it is the only Stripe credential this app should hold. Measured
 * against the live API on 2026-10-05: `/account`, `/charges`,
 * `/balance_transactions`, `/subscriptions`, `/products`, `/prices`,
 * `/invoices`, `/customers` and `/events` all answer for all five accounts.
 *
 * Two mechanics that are not optional, both found the hard way:
 *
 * 1. An org-key v1 call needs BOTH `Stripe-Context` AND `Stripe-Version`.
 *    Without the version header every call fails with "You did not provide an
 *    API version", which reads like a broken key rather than a missing header.
 * 2. The org key does NOT carry `webhook_read`. Listing webhook endpoints still
 *    needs the account's own key. Nothing here needs that, so nothing here asks
 *    for it; `scripts/stripe-reconcile.mts` says so rather than failing oddly.
 *
 * The per-account env vars stay as a fallback so a deploy without the org key
 * keeps working exactly as it did, and so one account can be read with a
 * narrower key if Krish ever wants that. The org key wins when both are set.
 */

/** The API version the org key is pinned to. Required on every v1 call. */
export const STRIPE_VERSION = '2025-08-27.basil'

export const STRIPE_BASE = 'https://api.stripe.com/v1'

export type PaymentsVia = 'stripe' | 'shopify'

export interface StripeAccount {
  /** `revenue_events.stripe_account` / `revenue_subscriptions.stripe_account`. */
  key: string
  /** What a human calls it. */
  label: string
  /** The Stripe account id, sent as `Stripe-Context`. */
  accountId: string
  /** Env var holding a per-account secret key, used only without the org key. */
  legacyEnvVar: string | null
  /**
   * An account that sells exactly one product files its unmapped prices there,
   * so a first payment appears without waiting for a price-map edit.
   */
  defaultProduct: string | null
  /**
   * How the product actually takes money. Heartside is a Shopify store, so its
   * Stripe account is reserved and empty: it must read as "not wired yet",
   * never as a Stripe revenue of zero, which would be a different claim.
   */
  paymentsVia: PaymentsVia
  /** One plain line for the report when an account is read but earns nothing. */
  note: string | null
}

export const STRIPE_ACCOUNTS: readonly StripeAccount[] = [
  {
    key: 'mindmaker_llc',
    label: 'mind/make (Mindmaker LLC)',
    accountId: 'acct_1RiiZEHGqJqsGEJL',
    legacyEnvVar: 'STRIPE_API_KEY',
    // Deliberately null. This account carries the Substack's plans AND CTRL's
    // own product, so an unmapped price here must stay unmapped and be named in
    // the report, never guessed into one of them.
    defaultProduct: null,
    paymentsVia: 'stripe',
    note: null,
  },
  {
    key: 'full_time',
    label: 'Full Time',
    accountId: 'acct_1SiiexHqiZo6hj3e',
    legacyEnvVar: 'STRIPE_API_KEY_FULLTIME',
    defaultProduct: 'full_time',
    paymentsVia: 'stripe',
    note: null,
  },
  {
    key: 'legibility',
    label: 'Legibility',
    accountId: 'acct_1Sapu84w6vAdI2o5',
    legacyEnvVar: 'STRIPE_API_KEY_LEGIBILITY',
    defaultProduct: 'legibility',
    paymentsVia: 'stripe',
    note: null,
  },
  {
    key: 'fractionl_ai',
    label: 'Fractionl (Pulse and Circle)',
    accountId: 'acct_1TELoiHdk8IR8OrU',
    legacyEnvVar: 'STRIPE_API_KEY_FRACTIONL',
    // Two products share this account, so an unmapped price must be named.
    defaultProduct: null,
    paymentsVia: 'stripe',
    note: null,
  },
  {
    key: 'heartside',
    label: 'Heartside',
    accountId: 'acct_1SaqhJHv8qNXfrXZ',
    legacyEnvVar: 'STRIPE_API_KEY_HEARTSIDE',
    defaultProduct: null,
    paymentsVia: 'shopify',
    note: 'Heartside sells through Shopify. Its Stripe account is reserved and holds no product, so Stripe reports nothing for it by design.',
  },
]

export function stripeAccount(key: string): StripeAccount | undefined {
  return STRIPE_ACCOUNTS.find(a => a.key === key)
}

export interface StripeAuth {
  key: string
  /** Set only for the org key: the account this request is scoped to. */
  context: string | null
  /** 'org' when one key reads every account, 'account' on a per-account key. */
  via: 'org' | 'account'
}

/**
 * How to authenticate against one account, or null when nothing is configured
 * for it. The org key is preferred; a per-account key is the fallback.
 */
export function stripeAuthFor(
  account: StripeAccount,
  env: Record<string, string | undefined> = process.env,
): StripeAuth | null {
  const org = env.STRIPE_ORG_KEY
  if (org) return { key: org, context: account.accountId, via: 'org' }
  const legacy = account.legacyEnvVar ? env[account.legacyEnvVar] : undefined
  if (legacy) return { key: legacy, context: null, via: 'account' }
  return null
}

export function stripeHeaders(auth: StripeAuth): Record<string, string> {
  const h: Record<string, string> = { Authorization: `Bearer ${auth.key}` }
  // The version is only forced on the org key, which requires it. A per-account
  // key keeps whatever version its own dashboard is pinned to, so adding this
  // header cannot silently reshape the payload a working deploy already parses.
  if (auth.context) {
    h['Stripe-Context'] = auth.context
    h['Stripe-Version'] = STRIPE_VERSION
  }
  return h
}

/** Every account this deploy can actually read, with how. */
export function configuredStripeAccounts(
  env: Record<string, string | undefined> = process.env,
): Array<{ account: StripeAccount; auth: StripeAuth }> {
  const out: Array<{ account: StripeAccount; auth: StripeAuth }> = []
  for (const account of STRIPE_ACCOUNTS) {
    const auth = stripeAuthFor(account, env)
    if (auth) out.push({ account, auth })
  }
  return out
}
