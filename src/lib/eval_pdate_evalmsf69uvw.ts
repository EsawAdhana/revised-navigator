/** Autofix eval plant PDate evalmsf69uvw */
export function evalPDate_evalmsf69uvw(
  input?: { iso?: string | null } | null,
): string | null {
  const iso = input?.iso;
  if (!iso) return null;
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}
