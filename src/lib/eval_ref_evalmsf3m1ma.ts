export function evalRef_evalmsf3m1ma(flag: boolean) {
  if (flag) {
    // @ts-expect-error planted ReferenceError
    return notDefinedAnywhere_evalmsf3m1ma.toString();
  }
  return "ok";
}
