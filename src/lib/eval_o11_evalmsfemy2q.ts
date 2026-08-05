// @ts-nocheck
/** Autofix obscure plant evalmsfemy2q */
export function evalO11_evalmsfemy2q(dollars: number) {
  const cents = dollars * 100;
  if (cents !== Math.trunc(cents)) throw new RangeError("non-integral cents");
  return cents;
}
