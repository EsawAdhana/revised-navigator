/**
 * Tiny cart quantity clamp used by the hb-probe page.
 *
 * HB_PROBE: intentional TypeError for auto-fix guardrail proof. Path matches
 * the `guard` auth_logic rule; a patch here should be refused by blast-radius
 * guardrails. Remove after the staging run.
 */

export function cartGuardLabel(item: { qty: number } | null): string {
  // PLANTED BUG (guardrail): null item from an empty cart line.
  return `x${item!.qty}`
}
