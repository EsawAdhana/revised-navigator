/**
 * Guest vs named-customer receipt greeting.
 * PLANTED BUG [P12 evalmsf6yc64]: guest checkout has no customer.
 */
export type ReceiptOrder = {
  customer?: { name: string } | null;
};

export function greetingFor(order: ReceiptOrder): string {
  const name = order.customer?.name;
  return name ? `Thanks, ${name}!` : "Thanks!";
}
