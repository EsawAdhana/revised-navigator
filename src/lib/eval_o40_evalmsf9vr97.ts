// @ts-nocheck
/** Autofix obscure plant evalmsf9vr97 */
export function evalO40_evalmsf9vr97(id: string) {
  const w = new WeakMap<object, string>();
  w.set(id as unknown as object, "x");
  return w.get(id as unknown as object)!.toUpperCase();
}
