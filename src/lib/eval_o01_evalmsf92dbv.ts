// @ts-nocheck
/** Autofix obscure plant evalmsf92dbv */
export function evalO01_evalmsf92dbv(order: { qty?: number }) {
  const q = order.qty ?? 1;
  return q.toFixed(0);
}
