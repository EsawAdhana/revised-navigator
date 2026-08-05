// @ts-nocheck
/** Autofix obscure plant evalmsfcbqda */
export function evalO12_evalmsfcbqda(ymd: string) {
  // BUG: Date.parse('YYYY-MM-DD') is UTC; local day can shift
  const d = new Date(ymd);
  return d.getUTCDate().toFixed(0);
}
