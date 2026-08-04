export function evalQJson_evalmsf838oc(raw: string) {
  const parsed = JSON.parse(raw) as { total?: number };
  return parsed.total!.toFixed(2);
}
