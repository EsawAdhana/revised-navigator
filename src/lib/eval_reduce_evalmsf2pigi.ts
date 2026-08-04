export function evalReduce_evalmsf2pigi(nums: number[]) {
  // Plant: empty array throws TypeError on reduce without initializer
  return nums.reduce((a, b) => a + b);
}
