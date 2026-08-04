import { describe, expect, it } from "vitest";
import { evalProbe_evalmsewf1wj } from "@/lib/eval_evalmsewf1wj";

describe("evalProbe_evalmsewf1wj", () => {
  it("formats a provided number", () => {
    expect(evalProbe_evalmsewf1wj({ n: 1.5 })).toBe("1.50");
  });

  it("formats a missing number without throwing", () => {
    expect(evalProbe_evalmsewf1wj({})).toBe("0.00");
  });
});
