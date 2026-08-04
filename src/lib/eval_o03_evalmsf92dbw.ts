// @ts-nocheck
/** Autofix obscure plant evalmsf92dbw */
export function evalO03_evalmsf92dbw(p: { discount?: number | null }) {
  const d = p.discount ?? 0.1;
  return (1 - d).toFixed(2);
}
