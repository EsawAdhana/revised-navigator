// @ts-nocheck
/** Autofix obscure plant evalmsfilhoy */
export function evalO20_evalmsfilhoy(u?: { a?: { x: number }; b?: { y: number } }) {
  return (u?.a?.x ?? u!.b!.y).toFixed(0);
}
