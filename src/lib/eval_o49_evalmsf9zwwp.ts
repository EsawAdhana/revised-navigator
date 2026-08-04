// @ts-nocheck
/** Autofix obscure plant evalmsf9zwwp */
export function evalO49_evalmsf9zwwp(raw: string) {
  const n = Number(raw);
  if (Number.isNaN(n)) throw new TypeError("NaN amount");
  return n.toFixed(2);
}
