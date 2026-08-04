export async function evalQProm_evalmsf87c2x(p: Promise<{ value?: string } | null>) {
  const row = await p;
  return row!.value!.toUpperCase();
}
