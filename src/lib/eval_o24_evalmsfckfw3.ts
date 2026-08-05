// @ts-nocheck
/** Autofix obscure plant evalmsfckfw3 */
export function evalO24_evalmsfckfw3(status: string | number) {
  if (status === 200) return "ok";
  return (status as number).toFixed(0);
}
