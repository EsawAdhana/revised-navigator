// @ts-nocheck
/** Autofix obscure plant evalmsfefu4t */
export function evalO11_evalmsfefu4t(dollars: number) {
  const cents = dollars * 100;
  if (cents !== Math.trunc(cents)) throw new RangeError("non-integral cents");
  return cents;
}
