// @ts-nocheck
/** Autofix obscure plant evalmsfck5pp */
export function evalO19_evalmsfck5pp(key: { id: string }, val: string) {
  const m = new Map<object, string>();
  m.set({ id: key.id }, val);
  return m.get(key)!.toUpperCase();
}
