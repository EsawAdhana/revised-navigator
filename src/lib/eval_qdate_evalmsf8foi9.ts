/** Autofix eval plant QDate evalmsf8foi9 */
export function evalQDate_evalmsf8foi9(
  input?: { iso?: string | null } | null,
): number | null {
  if (!input?.iso) return null;
  const time = new Date(input.iso).getTime();
  return Number.isNaN(time) ? null : time;
}
