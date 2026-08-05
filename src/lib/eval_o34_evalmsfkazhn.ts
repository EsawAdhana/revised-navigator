// @ts-nocheck
/** Autofix obscure plant evalmsfkazhn */
export function evalO34_evalmsfkazhn(s: string) {
  if (s.length !== [...s].length) throw new RangeError("code unit length mismatch");
  return s.length.toFixed(0);
}
