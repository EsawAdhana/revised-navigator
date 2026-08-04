import { describe, expect, it } from "vitest";
import { evalO03_evalmsf92dbw } from "@/lib/eval_o03_evalmsf92dbw";

describe("evalO03_evalmsf92dbw", () => {
  it("keeps a zero discount instead of falling back to the default", () => {
    expect(evalO03_evalmsf92dbw({ discount: 0 })).toBe("1.00");
  });

  it("applies a provided discount", () => {
    expect(evalO03_evalmsf92dbw({ discount: 0.25 })).toBe("0.75");
  });

  it("falls back to the default discount when absent", () => {
    expect(evalO03_evalmsf92dbw({})).toBe("0.90");
  });

  it("falls back to the default discount when null", () => {
    expect(evalO03_evalmsf92dbw({ discount: null })).toBe("0.90");
  });
});
