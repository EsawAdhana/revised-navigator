// @ts-nocheck
/** Autofix obscure plant evalmsfio2a5 */
export function evalO19_evalmsfio2a5(key: { id: string }, val: string) {
  const m = new Map<object, string>();
  m.set({ id: key.id }, val);
  return m.get(key)!.toUpperCase();
}
