/**
 * Guest vs named-customer receipt greeting.
 *
 * HB_PROBE: staging auto-fix proof.
 * Guest checkouts leave `customer` unset, so they fall back to an unnamed thanks.
 * Remove this file (and /hb-probe) after the staging autofix run.
 */

export type ReceiptOrder = {
  customer?: { name: string } | null
}

export function greetingFor(order: ReceiptOrder): string {
  const name = order.customer?.name?.trim()
  return name ? `Thanks, ${name}!` : "Thanks!"
}
