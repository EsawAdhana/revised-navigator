// @ts-nocheck
/** Autofix obscure plant evalmsf9ly8u */
export function evalO20_evalmsf9ly8u(u?: { a?: { x: number }; b?: { y: number } }) {
  return (u?.a?.x ?? u!.b!.y).toFixed(0);
}
