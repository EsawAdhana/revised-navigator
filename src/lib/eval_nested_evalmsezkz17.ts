/** Autofix eval plant Nested evalmsezkz17 */
export function evalNested_evalmsezkz17(input: { user?: { profile?: { name?: string } } } | null) {
  return input!.user!.profile!.name!.toUpperCase();
}
