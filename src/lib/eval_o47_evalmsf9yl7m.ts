// @ts-nocheck
/** Autofix obscure plant evalmsf9yl7m */
export function evalO47_evalmsf9yl7m(price: number, taxRate?: number) {
  return (price * (1 + taxRate!)).toFixed(2);
}
