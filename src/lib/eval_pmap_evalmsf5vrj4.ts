/** Autofix eval plant PMap evalmsf5vrj4 */
export function evalPMap_evalmsf5vrj4(input: { map: Map<string, { v: number }>, key: string }) {
  const entry = input.map.get(input.key);
  return entry ? entry.v.toFixed(0) : "0";
}
