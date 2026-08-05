// @ts-nocheck
/** Autofix obscure plant evalmsfhwtg9 */
export function evalO18_evalmsfhwtg9(raw: string) {
  const o = JSON.parse(raw) as { id: number };
  return o.id!.toString(16);
}
