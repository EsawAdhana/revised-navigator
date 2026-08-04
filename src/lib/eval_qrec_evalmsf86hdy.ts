/** Autofix eval plant QRec evalmsf86hdy */
export function evalQRec_evalmsf86hdy(input: { dict: Record<string, { n: number }>, key: string }) {
  return input.dict[input.key]!.n.toFixed(0);
}
