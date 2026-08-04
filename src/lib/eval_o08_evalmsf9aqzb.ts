// @ts-nocheck
/** Autofix obscure plant evalmsf9aqzb */
export async function evalO08_evalmsf9aqzb(loader: () => Promise<{ id: string }>) {
  const row = await loader();
  return row.id.toUpperCase();
}
