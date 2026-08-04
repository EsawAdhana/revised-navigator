/** Autofix eval plant QUrl evalmsf8bfow */
export function evalQUrl_evalmsf8bfow(input: { href?: string }): string | null {
  const href = input.href?.trim();
  if (!href) return null;
  try {
    return new URL(href).host;
  } catch {
    return null;
  }
}
