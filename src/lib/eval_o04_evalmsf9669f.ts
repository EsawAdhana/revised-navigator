// @ts-nocheck
/** Autofix obscure plant evalmsf9669f */
export function evalO04_evalmsf9669f(flags: { enabled?: string }) {
  if (flags.enabled) {
    if (flags.enabled === "false") throw new TypeError("string false treated as on");
    return "on";
  }
  return "off";
}
