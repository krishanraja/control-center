/**
 * Reconcile what Control Center records against what Stripe says, per account.
 *
 * WHY THIS EXISTS. On 2026-10-05 an audit reported that Control Center was
 * missing about a third of the revenue history: Stripe showed "$1,244.00 across
 * 20 charges" on the Mindmaker LLC account while the tables held "$842.56
 * across 9 payments". A pull that silently drops history is the worst kind of
 * bug, so the first job was to find the pagination or date-window fault.
 *
 * THERE IS NO MISSING HISTORY. The pull is complete, and the two figures are
 * three different measurements of the same nine payments:
 *
 *   20 charges   every charge OBJECT on the account, 11 of which FAILED. Ten of
 *                those eleven are the August dunning retries on the four $8/mo
 *                subscriptions that had already cancelled. 9 succeeded.
 *   $1,244.00    the sum of those charge amounts with the CURRENCY IGNORED:
 *                111,500 AUD cents + 12,900 USD cents = 124,400, read as
 *                dollars. Adding A$ to US$ is not a total of anything.
 *   $842.56      the NET of the nine real payments after Stripe's cut and
 *                Substack's 10% application fee. The gross settled figure is
 *                $911.45, and 911.45 - 842.56 = 68.89 of fees.
 *
 * So the honest reconciliation for that account is 9 payments, US$129.00 and
 * A$1,115.00 presented, $911.45 gross settled into a USD account, $842.56 net.
 * This script prints that comparison for every account so the next version of
 * the question is answered by a measurement rather than by a guess.
 *
 * What the pull genuinely does NOT record, stated rather than hidden: balance
 * transactions of type `stripe_fee` (8 rows, -$1.50 in total on Mindmaker LLC).
 * They are a cost, not revenue, and `revenue_events.kind` is a CHECK over
 * recurring / one_time / refund / adjustment, so adding them would need a
 * migration and would mix a cost into a revenue figure. They are reported here
 * as the residual instead, which is why the Stripe and recorded nets can differ
 * by exactly that much and still be right.
 *
 * Needs, at execution time and never from a file in the tree:
 *   STRIPE_ORG_KEY                 reads all five accounts
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Without them it prints NOT CHECKED and exits 0, rather than reporting green
 * on something it never looked at.
 *
 *   npx tsx scripts/stripe-reconcile.mts
 *
 * It is READ ONLY. It writes nothing to Stripe and nothing to Supabase.
 */

import {
  configuredStripeAccounts, stripeHeaders, STRIPE_BASE, type StripeAuth,
} from '../api/_stripe.ts'

type Json = Record<string, any>

const money = (cents: number, cur = 'usd') =>
  `${cur.toUpperCase()} ${(cents / 100).toFixed(2)}`

async function sList(auth: StripeAuth, path: string, params: Record<string, string | number> = {}): Promise<Json[]> {
  const out: Json[] = []
  let after: string | undefined
  for (let i = 0; i < 1000; i++) {
    const qs = new URLSearchParams()
    for (const [k, v] of Object.entries({ ...params, limit: 100 })) qs.append(k, String(v))
    if (after) qs.append('starting_after', after)
    const r = await fetch(`${STRIPE_BASE}${path}?${qs}`, { headers: stripeHeaders(auth) })
    if (!r.ok) throw new Error(`Stripe ${r.status} on ${path}: ${(await r.text()).slice(0, 160)}`)
    const body = await r.json() as Json
    const data = (body.data || []) as Json[]
    out.push(...data)
    if (!body.has_more || data.length === 0) return out
    after = data[data.length - 1].id
  }
  throw new Error(`${path}: over 100000 rows, aborted rather than truncated`)
}

async function sb(path: string): Promise<Json[]> {
  const url = `${process.env.SUPABASE_URL}/rest/v1/${path}`
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY as string
  const r = await fetch(url, { headers: { apikey: key, Authorization: `Bearer ${key}` } })
  if (!r.ok) throw new Error(`Supabase ${r.status} on ${path}: ${(await r.text()).slice(0, 160)}`)
  return r.json() as Promise<Json[]>
}

async function main() {
  const missing = ['STRIPE_ORG_KEY', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']
    .filter(k => !process.env[k])
  if (missing.length) {
    console.log(`NOT CHECKED  needs ${missing.join(', ')}. Nothing was read, so nothing is claimed.`)
    process.exit(0)
  }

  const accounts = configuredStripeAccounts()
  const recorded = await sb('revenue_events?select=stripe_account,kind,currency,gross_cents,net_cents,id')
  const recordedSubs = await sb('revenue_subscriptions?select=stripe_account,id,status,product')

  let problems = 0

  for (const { account, auth } of accounts) {
    console.log('='.repeat(72))
    console.log(`${account.label}  (${account.key}, ${account.accountId})`)
    if (account.paymentsVia !== 'stripe') {
      console.log(`  ${account.note}`)
    }

    const charges = await sList(auth, '/charges')
    const succeeded = charges.filter(c => c.paid && c.status === 'succeeded')
    const presented = new Map<string, number>()
    for (const c of succeeded) presented.set(c.currency, (presented.get(c.currency) || 0) + Number(c.amount || 0))

    const txns = await sList(auth, '/balance_transactions')
    const REVENUE = new Set(['charge', 'payment', 'refund', 'payment_refund', 'adjustment'])
    const moneyIn = txns.filter(t => REVENUE.has(String(t.type)))
    const stripeGross = moneyIn.reduce((n, t) => n + Number(t.amount || 0), 0)
    const stripeNet = moneyIn.reduce((n, t) => n + Number(t.net ?? 0), 0)
    const feeOnly = txns.filter(t => String(t.type) === 'stripe_fee')
    const feeOnlyTotal = feeOnly.reduce((n, t) => n + Number(t.amount || 0), 0)

    const mine = recorded.filter(e => e.stripe_account === account.key)
    const myGross = mine.reduce((n, e) => n + Number(e.gross_cents || 0), 0)
    const myNet = mine.reduce((n, e) => n + Number(e.net_cents || 0), 0)

    console.log(`  charge objects on the account   ${charges.length}`)
    console.log(`    of which succeeded and paid   ${succeeded.length}`)
    console.log(`    of which failed or unpaid     ${charges.length - succeeded.length}  (not revenue, and not a gap)`)
    console.log(`  presented to the customer       ${[...presented].map(([c, v]) => money(v, c)).join('  +  ') || 'nothing'}`)
    console.log(`    (a mixed-currency sum of those numbers is ${[...presented.values()].reduce((a, b) => a + b, 0)} cents, which is not a total)`)
    console.log(`  Stripe money-in transactions    ${moneyIn.length}`)
    console.log(`  Stripe gross settled            ${money(stripeGross)}`)
    console.log(`  Stripe net settled              ${money(stripeNet)}`)
    console.log(`  Control Center events recorded  ${mine.length}`)
    console.log(`  Control Center gross            ${money(myGross)}`)
    console.log(`  Control Center net              ${money(myNet)}`)

    const dCount = moneyIn.length - mine.length
    const dGross = stripeGross - myGross
    const dNet = stripeNet - myNet
    const ok = dCount === 0 && dGross === 0 && dNet === 0
    console.log(`  RECONCILES                      ${ok ? 'YES, exactly' : 'NO'}`)
    if (!ok) {
      problems += 1
      console.log(`    difference: ${dCount} events, ${money(dGross)} gross, ${money(dNet)} net`)
    }
    if (feeOnly.length) {
      console.log(`  standalone stripe_fee rows      ${feeOnly.length}, ${money(feeOnlyTotal)} (a cost, deliberately not in revenue_events)`)
    }

    const subs = await sList(auth, '/subscriptions', { status: 'all' })
    const mySubs = recordedSubs.filter(s => s.stripe_account === account.key)
    const unattributed = mySubs.filter(s => !s.product)
    const countsAgree = subs.length === mySubs.length
    console.log(`  subscriptions  Stripe ${subs.length}, recorded ${mySubs.length}${countsAgree ? '' : '  <-- MISMATCH'}`)
    // A count mismatch is a real fault: the pull either missed a subscription
    // or the account is not in the pull at all.
    if (!countsAgree) problems += 1
    if (unattributed.length) {
      // A null product is a PRICE MAP gap, not a pull fault, and on an account
      // that does not bill through Stripe it is expected: Heartside's only
      // subscription is a cancelled Conclusiv test of Krish's own, and the map
      // deliberately does not claim it, because inventing a Heartside Stripe
      // lane would be a worse error than leaving it unattributed.
      const fault = account.paymentsVia === 'stripe'
      if (fault) problems += 1
      console.log(`    ${unattributed.length} recorded with NO product${fault ? '' : ' (expected on this account)'}: ${unattributed.map(s => s.id).join(', ')}`)
      if (fault) console.log('      add the price or product id to system_config.stripe_price_product_map')
    }
  }

  console.log('='.repeat(72))
  console.log(problems === 0
    ? 'PASS  every account reconciles with Stripe, and every recorded subscription is attributed.'
    : `FAIL  ${problems} thing(s) do not reconcile. Each is named above.`)
  process.exit(problems === 0 ? 0 : 1)
}

main().catch(e => {
  console.error('reconcile failed:', e instanceof Error ? e.message : e)
  process.exit(1)
})
