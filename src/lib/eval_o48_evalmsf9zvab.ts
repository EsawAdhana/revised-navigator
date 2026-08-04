// @ts-nocheck
/** Autofix obscure plant evalmsf9zvab */
const seen = new Set<string>();
export function evalO48_evalmsf9zvab(id: string, amount: number) {
  if (seen.has(id)) throw new TypeError("double charge for " + id);
  seen.add(id);
  return amount.toFixed(2);
}
