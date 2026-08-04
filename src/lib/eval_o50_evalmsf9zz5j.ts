// @ts-nocheck
/** Autofix obscure plant evalmsf9zz5j */
export function evalO50_evalmsf9zz5j(a: number, b: number) {
  const p = a / b;
  if (!Number.isFinite(p)) throw new RangeError("non-finite percent");
  return p.toFixed(2);
}
