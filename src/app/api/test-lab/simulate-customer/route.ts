import { NextResponse } from 'next/server'
import Stripe from 'stripe'

export const runtime = 'nodejs'

/**
 * Creates a real Stripe test customer + trialing subscription + paid invoice on
 * the connected account that the HumanBehavior project syncs (via Stripe
 * Connect). We use the platform secret key plus `{ stripeAccount }` so the
 * records land on the connected account even though it isn't onboarded for live
 * Checkout. Revenue is recorded "out of band" since the account can't take a
 * real card charge in this state.
 */
function config() {
  const secretKey = process.env.STRIPE_SECRET_KEY
  const connectedAccountId = process.env.STRIPE_CONNECTED_ACCOUNT_ID
  if (!secretKey) throw new Error('missing_stripe_secret_key')
  if (!connectedAccountId) throw new Error('missing_stripe_connected_account_id')

  const priceCents = Number.parseInt(process.env.STRIPE_TEST_PRICE_CENTS ?? '2900', 10)
  if (!Number.isFinite(priceCents) || priceCents <= 0) throw new Error('invalid_stripe_test_price')

  return {
    stripe: new Stripe(secretKey),
    requestOptions: { stripeAccount: connectedAccountId } as Stripe.RequestOptions,
    priceCents,
    currency: process.env.STRIPE_TEST_CURRENCY ?? 'usd',
    productName: process.env.STRIPE_TEST_PRODUCT_NAME ?? 'Stanford Root Plus',
  }
}

export async function POST() {
  try {
    const { stripe, requestOptions, priceCents, currency, productName } = config()
    const stamp = Date.now()
    const email = `stanford-student-${stamp}@stanford.edu`

    const customer = await stripe.customers.create(
      { email, name: `Stanford Student ${stamp}` },
      requestOptions,
    )

    const price = await stripe.prices.create(
      {
        unit_amount: priceCents,
        currency,
        recurring: { interval: 'month' },
        product_data: { name: productName },
      },
      requestOptions,
    )

    const subscription = await stripe.subscriptions.create(
      {
        customer: customer.id,
        items: [{ price: price.id }],
        trial_period_days: 14,
      },
      requestOptions,
    )

    // Record revenue out of band (the connected account can't take a live card
    // charge until it completes onboarding). Best-effort: never fail the whole
    // request if this part hiccups — the customer + subscription already landed.
    let revenueRecorded = false
    try {
      const draft = await stripe.invoices.create(
        {
          customer: customer.id,
          collection_method: 'send_invoice',
          days_until_due: 0,
          auto_advance: false,
        },
        requestOptions,
      )
      if (draft.id) {
        await stripe.invoiceItems.create(
          {
            customer: customer.id,
            amount: priceCents,
            currency,
            description: productName,
            invoice: draft.id,
          },
          requestOptions,
        )
        const finalized = await stripe.invoices.finalizeInvoice(draft.id, {}, requestOptions)
        if (finalized.status === 'paid') {
          revenueRecorded = true
        } else if (finalized.status === 'open') {
          const paid = await stripe.invoices.pay(draft.id, { paid_out_of_band: true }, requestOptions)
          revenueRecorded = paid.status === 'paid'
        }
      }
    } catch {
      revenueRecorded = false
    }

    return NextResponse.json({
      ok: true,
      customerId: customer.id,
      subscriptionId: subscription.id,
      subscriptionStatus: subscription.status,
      revenueRecorded,
      amountCents: priceCents,
    })
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'simulate_customer_failed'
    const status = reason.startsWith('missing_') ? 503 : 400
    return NextResponse.json({ error: reason }, { status })
  }
}
