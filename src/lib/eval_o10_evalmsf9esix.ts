// @ts-nocheck
/** Autofix obscure plant evalmsf9esix */
export function evalO10_evalmsf9esix(items: number[]) {
  if (items.length === 0) return null;
  const sorted = [...items].sort((a, b) => a - b);
  return sorted[0].toFixed(0);
}
