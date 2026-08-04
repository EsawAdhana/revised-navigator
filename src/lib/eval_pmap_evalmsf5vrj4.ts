/** Autofix eval plant PMap evalmsf5vrj4 */
export function evalPMap_evalmsf5vrj4(input: { map: Map<string, { v: number }>, key: string }) {
  return input.map.get(input.key)!.v.toFixed(0);
}
