// @ts-nocheck
/** Autofix obscure plant evalmsf92dbv */
export function evalO01_evalmsf92dbv(order: { qty?: number }) {
  // BUG: 0 is valid qty but || treats it as missing
  const q = order.qty || 1;
  if (order.qty === 0) throw new TypeError("zero qty mishandled by ||");
  return q.toFixed(0);
}
