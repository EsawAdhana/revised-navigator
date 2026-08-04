import { describe, expect, it } from "vitest";
import { evalO10_evalmsf9esix } from "@/lib/eval_o10_evalmsf9esix";

describe("evalO10_evalmsf9esix", () => {
  it("formats the smallest item", () => {
    expect(evalO10_evalmsf9esix([3, 1, 2])).toBe("1");
  });

  it("returns null for an empty list instead of throwing", () => {
    expect(evalO10_evalmsf9esix([])).toBeNull();
  });

  it("leaves the caller's array order untouched", () => {
    const items = [3, 1, 2];
    evalO10_evalmsf9esix(items);
    expect(items).toEqual([3, 1, 2]);
  });
});
