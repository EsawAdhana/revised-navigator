/**
 * Guest vs named-customer receipt greeting.
 * PLANTED BUG [P12 evalmsf6yc64]: guest checkout has no customer.
 */
export type ReceiptOrder = {
  customer?: { name: string } | null;
};

export function greetingFor(order: ReceiptOrder): string {
  return `Thanks, ${order.customer!.name}!`;
}
