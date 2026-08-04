/** Autofix eval plant PNum evalmsf5f33p */
export function evalPNum_evalmsf5f33p(input: { n?: number }) {
  return (Number.isFinite(input.n) ? (input.n as number) : 0).toFixed(2);
}
