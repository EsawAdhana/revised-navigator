import { describe, expect, it } from "vitest";
import { evalO01_evalmsf92dbv } from "@/lib/eval_o01_evalmsf92dbv";

describe("evalO01_evalmsf92dbv", () => {
  it("keeps an explicit zero qty", () => {
    expect(evalO01_evalmsf92dbv({ qty: 0 })).toBe("0");
  });

  it("defaults a missing qty to 1", () => {
    expect(evalO01_evalmsf92dbv({})).toBe("1");
  });

  it("passes through a positive qty", () => {
    expect(evalO01_evalmsf92dbv({ qty: 3 })).toBe("3");
  });
});
