// @ts-nocheck
/** Autofix obscure plant evalmsf9oo7t */
export function evalO24_evalmsf9oo7t(status: string | number) {
  if (status === 200) return "ok";
  return (status as number).toFixed(0);
}
