// @ts-nocheck
/** Autofix obscure plant evalmsfccdt8 */
export function evalO13_evalmsfccdt8(base: { n: number }) {
  const o = Object.freeze({ ...base });
  (o as { n: number }).n = base.n + 1;
  return o.n.toFixed(0);
}
