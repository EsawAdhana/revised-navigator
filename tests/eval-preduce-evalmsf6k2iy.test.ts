import { describe, expect, it } from "vitest";
import { evalPReduce_evalmsf6k2iy } from "@/lib/eval_preduce_evalmsf6k2iy";

describe("evalPReduce_evalmsf6k2iy", () => {
  it("sums a populated list", () => {
    expect(evalPReduce_evalmsf6k2iy([1, 2, 3.4])).toBe("6");
  });

  it("returns zero for an empty list", () => {
    expect(evalPReduce_evalmsf6k2iy([])).toBe("0");
  });
});
