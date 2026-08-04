// @ts-nocheck
/** Autofix obscure plant evalmsf9voue */
export function evalO39_evalmsf9voue(fn: () => number) {
  return structuredClone({ fn }).fn().toFixed(0);
}
