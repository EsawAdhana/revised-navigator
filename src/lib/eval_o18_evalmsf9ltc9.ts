// @ts-nocheck
/** Autofix obscure plant evalmsf9ltc9 */
export function evalO18_evalmsf9ltc9(raw: string) {
  const o = JSON.parse(raw) as { id: number };
  return o.id!.toString(16);
}
