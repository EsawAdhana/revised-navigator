export function evalPJson_evalmsf60qpg(raw: string) {
  const parsed = JSON.parse(raw) as { total?: number };
  return parsed.total!.toFixed(2);
}
