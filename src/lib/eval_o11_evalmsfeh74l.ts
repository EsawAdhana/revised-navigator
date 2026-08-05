// @ts-nocheck
/** Autofix obscure plant evalmsfeh74l */
export function evalO11_evalmsfeh74l(dollars: number) {
  const cents = dollars * 100;
  if (cents !== Math.trunc(cents)) throw new RangeError("non-integral cents");
  return cents;
}
