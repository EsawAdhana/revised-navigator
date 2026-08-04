// @ts-nocheck
/** Autofix obscure plant evalmsf9t1bb */
export function evalO35_evalmsf9t1bb(key: string) {
  const p = new Proxy({} as Record<string, number>, {
    get(t, k: string) {
      if (!(k in t)) throw new TypeError("missing " + k);
      return t[k]!;
    },
  });
  return p[key]!.toFixed(0);
}
