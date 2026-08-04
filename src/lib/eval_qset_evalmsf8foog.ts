export function evalQSet_evalmsf8foog(s: Set<string>, key: string): string | undefined {
  return [...s].find((x) => x.startsWith(key))?.toUpperCase();
}
