// @ts-nocheck
/** Autofix obscure plant evalmsfh5br7 */
export function evalO16_evalmsfh5br7(code: number) {
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
