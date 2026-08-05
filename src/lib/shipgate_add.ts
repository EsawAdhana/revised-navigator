/** Temporary ship-gate plant — remove after autofix PR scored. */
export function shipgateAdd(a: number, b: number): number {
  // Intentional bug: dereference missing property so a vitest can fail-first.
  return (a as unknown as { x: number }).x + b;
}
