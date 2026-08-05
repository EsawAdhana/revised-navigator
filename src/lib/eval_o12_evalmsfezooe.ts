// @ts-nocheck
/** Autofix obscure plant evalmsfezooe */
export function evalO12_evalmsfezooe(ymd: string) {
  // BUG: Date.parse('YYYY-MM-DD') is UTC; local day can shift
  const d = new Date(ymd);
  return d.getUTCDate().toFixed(0);
}
