// @ts-nocheck
/** Autofix obscure plant evalmsf9j0ic */
export function evalO12_evalmsf9j0ic(ymd: string) {
  // BUG: Date.parse('YYYY-MM-DD') is UTC; local day can shift
  const d = new Date(ymd);
  return d.getUTCDate().toFixed(0);
}
