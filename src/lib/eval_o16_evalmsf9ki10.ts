// @ts-nocheck
/** Autofix obscure plant evalmsf9ki10 */
export function evalO16_evalmsf9ki10(code: number) {
  let label: string;
  switch (code) {
    case 1:
      label = "one";
    case 2:
      label = "two";
      break;
    default:
      label = "other";
  }
  return label.toUpperCase();
}
