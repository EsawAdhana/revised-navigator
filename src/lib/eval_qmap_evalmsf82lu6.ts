/** Autofix eval plant QMap evalmsf82lu6 */
export function evalQMap_evalmsf82lu6(input: { map: Map<string, { label: string }>, key: string }) {
  return input.map.get(input.key)!.label.toUpperCase();
}
