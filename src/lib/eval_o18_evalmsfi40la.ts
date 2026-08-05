// @ts-nocheck
/** Autofix obscure plant evalmsfi40la */
export function evalO18_evalmsfi40la(raw: string) {
  const o = JSON.parse(raw) as { id: number };
  return o.id!.toString(16);
}
