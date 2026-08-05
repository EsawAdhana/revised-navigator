// @ts-nocheck
/** Autofix obscure plant evalmsfck3mp */
export function evalO18_evalmsfck3mp(raw: string) {
  const o = JSON.parse(raw) as { id: number };
  return o.id!.toString(16);
}
