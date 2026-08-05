// @ts-nocheck
/** Autofix obscure plant evalmsfig15g */
export function evalO19_evalmsfig15g(key: { id: string }, val: string) {
  const m = new Map<object, string>();
  m.set({ id: key.id }, val);
  return m.get(key)!.toUpperCase();
}
