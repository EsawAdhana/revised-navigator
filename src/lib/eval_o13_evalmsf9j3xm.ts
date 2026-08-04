// @ts-nocheck
/** Autofix obscure plant evalmsf9j3xm */
export function evalO13_evalmsf9j3xm(base: { n: number }) {
  const o = Object.freeze({ ...base });
  (o as { n: number }).n = base.n + 1;
  return o.n.toFixed(0);
}
