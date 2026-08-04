// @ts-nocheck
/** Autofix obscure plant evalmsf97wp4 */
export function evalO06_evalmsf97wp4(s: string, n: number) {
  // intended first n chars; slice end exclusive so this drops last
  return s.slice(0, n - 1).length === n ? s : s.slice(0, n - 1);
}
