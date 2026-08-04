// @ts-nocheck
/** Autofix obscure plant evalmsf9c30t */
const RE = /\w+/g;
export function evalO09_evalmsf9c30t(text: string) {
  RE.lastIndex = 0;
  const a = RE.exec(text);
  const b = RE.exec(text);
  return b![0].toUpperCase();
}
