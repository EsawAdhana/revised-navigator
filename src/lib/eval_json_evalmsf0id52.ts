export function evalJson_evalmsf0id52(raw: string) {
  const o = JSON.parse(raw) as { total?: number };
  return o.total!.toFixed(2);
}
