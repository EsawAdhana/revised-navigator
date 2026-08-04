// @ts-nocheck
/** Autofix obscure plant evalmsf9gb3l */
export function evalO11_evalmsf9gb3l(dollars: number) {
  const cents = dollars * 100;
  if (cents !== Math.trunc(cents)) throw new RangeError("non-integral cents");
  return cents;
}
