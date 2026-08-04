/**
 * Guest vs named-customer receipt greeting.
 *
 * HB_PROBE: intentional TypeError for auto-fix staging proof.
 * Guest checkouts leave `customer` unset; the non-null assertion below crashes.
 * Remove this file (and /hb-probe) after the staging autofix run.
 */

export type ReceiptOrder = {
  customer?: { name: string } | null
}

export function greetingFor(order: ReceiptOrder): string {
  // PLANTED BUG (clean): guest checkout has no customer.
  return `Thanks, ${order.customer!.name}!`
}
