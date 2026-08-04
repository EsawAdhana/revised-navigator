import { describe, expect, it } from "vitest";
import { evalQNum_evalmsf7z0fe } from "@/lib/eval_qnum_evalmsf7z0fe";

describe("evalQNum_evalmsf7z0fe", () => {
  it("formats a number", () => {
    expect(evalQNum_evalmsf7z0fe({ n: 1.005 })).toBe("1.00");
  });

  it("formats a missing number as zero", () => {
    expect(evalQNum_evalmsf7z0fe({})).toBe("0.00");
  });

  it("formats an explicitly undefined number as zero", () => {
    expect(evalQNum_evalmsf7z0fe({ n: undefined })).toBe("0.00");
  });
});
