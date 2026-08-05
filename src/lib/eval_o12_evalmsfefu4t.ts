// @ts-nocheck
/** Autofix obscure plant evalmsfefu4t */
export function evalO12_evalmsfefu4t(ymd: string) {
  // BUG: Date.parse('YYYY-MM-DD') is UTC; local day can shift
  const d = new Date(ymd);
  return d.getUTCDate().toFixed(0);
}
