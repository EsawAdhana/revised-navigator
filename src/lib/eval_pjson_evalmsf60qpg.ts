export function evalPJson_evalmsf60qpg(raw: string) {
  const parsed = JSON.parse(raw) as { total?: number | null };
  return (parsed.total ?? 0).toFixed(2);
}
