// @ts-nocheck
/** Autofix obscure plant evalmsf9gb3l */
export function evalO11_evalmsf9gb3l(dollars: number) {
  const scaled = dollars * 100;
  const cents = Math.round(scaled);
  const tolerance = Math.max(1, Math.abs(scaled)) * 1e-9;
  if (!(Math.abs(scaled - cents) <= tolerance)) throw new RangeError("non-integral cents");
  return cents;
}
