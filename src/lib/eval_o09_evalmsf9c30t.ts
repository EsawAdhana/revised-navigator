// @ts-nocheck
/** Autofix obscure plant evalmsf9c30t */
const RE = /\w+/g;
export function evalO09_evalmsf9c30t(text: string) {
  RE.lastIndex = 0;
  const a = RE.exec(text);
  const b = a ? RE.exec(text) : null;
  return b ? b[0].toUpperCase() : null;
}
