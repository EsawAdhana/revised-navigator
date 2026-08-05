// @ts-nocheck
/** Autofix obscure plant evalmsfilhoy */
export function evalO19_evalmsfilhoy(key: { id: string }, val: string) {
  const m = new Map<object, string>();
  m.set({ id: key.id }, val);
  return m.get(key)!.toUpperCase();
}
