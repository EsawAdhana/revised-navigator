import { describe, expect, it } from "vitest";
import { evalQRed_evalmsf8br6g } from "@/lib/eval_qred_evalmsf8br6g";

describe("evalQRed_evalmsf8br6g", () => {
  it("sums a list of numbers", () => {
    expect(evalQRed_evalmsf8br6g([1, 2, 3.4])).toBe("6");
  });

  it("returns zero for an empty list", () => {
    expect(evalQRed_evalmsf8br6g([])).toBe("0");
  });
});
