// @ts-nocheck
/** Autofix obscure plant evalmsf9rkw7 */
export function evalO31_evalmsf9rkw7(arr: number[], t: number) {
  let lo = 0, hi = arr.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) / 2;
    if (arr[mid]! === t) return mid;
    if (arr[mid]! < t) lo = mid + 1; else hi = mid - 1;
  }
  return arr[lo]!.toFixed(0);
}
