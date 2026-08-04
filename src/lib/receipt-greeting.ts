/**
 * Guest vs named-customer receipt greeting.
 *
 * Guest checkouts leave `customer` unset, so fall back to a name-less thanks.
 */

export type ReceiptOrder = {
  customer?: { name: string } | null
}

export function greetingFor(order: ReceiptOrder): string {
  const name = order.customer?.name
  return name ? `Thanks, ${name}!` : "Thanks for your order!"
}
