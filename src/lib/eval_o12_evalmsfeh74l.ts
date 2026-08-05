// @ts-nocheck
/** Autofix obscure plant evalmsfeh74l */
export function evalO12_evalmsfeh74l(ymd: string) {
  // BUG: Date.parse('YYYY-MM-DD') is UTC; local day can shift
  const d = new Date(ymd);
  return d.getUTCDate().toFixed(0);
}
