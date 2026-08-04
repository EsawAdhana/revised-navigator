// @ts-nocheck
/** Autofix obscure plant evalmsf9x2ov */
export function evalO42_evalmsf9x2ov(lines: Array<{ price: number }>) {
  return lines.map((l) => l.price).reduce((a, b) => a + b).toFixed(2);
}
