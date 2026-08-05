// @ts-nocheck
/** Autofix obscure plant evalmsfkb34e */
export function evalO35_evalmsfkb34e(key: string) {
  const p = new Proxy({} as Record<string, number>, {
    get(t, k: string) {
      if (!(k in t)) throw new TypeError("missing " + k);
      return t[k]!;
    },
  });
  return p[key]!.toFixed(0);
}
