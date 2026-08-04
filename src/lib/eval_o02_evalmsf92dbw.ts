// @ts-nocheck
/** Autofix obscure plant evalmsf92dbw */
export function evalO02_evalmsf92dbw(user: { name?: string }) {
  const n = user.name ?? "guest";
  if (n === "guest" && user.name === "") throw new TypeError("empty name coerced");
  return n.length;
}
