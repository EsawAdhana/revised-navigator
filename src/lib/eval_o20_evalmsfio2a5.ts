// @ts-nocheck
/** Autofix obscure plant evalmsfio2a5 */
export function evalO20_evalmsfio2a5(u?: { a?: { x: number }; b?: { y: number } }) {
  return (u?.a?.x ?? u!.b!.y).toFixed(0);
}
