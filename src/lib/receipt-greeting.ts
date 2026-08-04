export type ReceiptOrder = { customer: { name: string } | null };

/** Planted for autofix eval C7 evalmsex0bnb */
export function greetingFor(order: ReceiptOrder): string {
  return order.customer!.name.split(" ")[0];
}
