/** Autofix eval plant PUrl evalmsf6f2tb */
export function evalPUrl_evalmsf6f2tb(input: { href?: string }): string | null {
  const href = input.href?.trim();
  if (!href || !URL.canParse(href)) return null;
  return new URL(href).pathname;
}
