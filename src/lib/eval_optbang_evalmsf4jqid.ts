/** Autofix eval plant OptBang evalmsf4jqid */
export function evalOptBang_evalmsf4jqid(input: { a?: { b?: { c?: string } } }) {
  return input.a?.b!.c!.toLowerCase();
}
