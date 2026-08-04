/**
 * Guest vs named-customer receipt greeting.
 */
export type ReceiptOrder = {
  customer?: { name: string } | null;
};

export function greetingFor(order: ReceiptOrder): string {
  const name = order.customer?.name?.trim();
  return name ? `Thanks, ${name}!` : "Thanks!";
}
