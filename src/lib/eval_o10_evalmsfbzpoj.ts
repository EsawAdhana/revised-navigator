// @ts-nocheck
/** Autofix obscure plant evalmsfbzpoj */
export function evalO10_evalmsfbzpoj(items: number[]) {
  const sorted = items.sort((a, b) => a - b);
  return sorted[0]!.toFixed(0);
}
