// @ts-nocheck
/** Autofix obscure plant evalmsfck7nb */
export function evalO20_evalmsfck7nb(u?: { a?: { x: number }; b?: { y: number } }) {
  return (u?.a?.x ?? u!.b!.y).toFixed(0);
}
