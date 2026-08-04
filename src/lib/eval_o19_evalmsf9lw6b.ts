// @ts-nocheck
/** Autofix obscure plant evalmsf9lw6b */
export function evalO19_evalmsf9lw6b(key: { id: string }, val: string) {
  const m = new Map<object, string>();
  m.set({ id: key.id }, val);
  return m.get(key)!.toUpperCase();
}
