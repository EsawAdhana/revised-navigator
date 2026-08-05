// @ts-nocheck
/** Autofix obscure plant evalmsffg9ro */
export function evalO13_evalmsffg9ro(base: { n: number }) {
  const o = Object.freeze({ ...base });
  (o as { n: number }).n = base.n + 1;
  return o.n.toFixed(0);
}
