// @ts-nocheck
/** Autofix obscure plant evalmsfc70qu */
export function evalO11_evalmsfc70qu(dollars: number) {
  const cents = dollars * 100;
  if (cents !== Math.trunc(cents)) throw new RangeError("non-integral cents");
  return cents;
}
