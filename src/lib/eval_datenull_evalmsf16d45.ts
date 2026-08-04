/** Autofix eval plant DateNull evalmsf16d45 */
export function evalDateNull_evalmsf16d45(input: { iso?: string | null }) {
  return new Date(input.iso!).toISOString();
}
