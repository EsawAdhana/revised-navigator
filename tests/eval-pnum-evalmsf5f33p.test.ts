import { describe, expect, it } from "vitest";
import { evalPNum_evalmsf5f33p } from "@/lib/eval_pnum_evalmsf5f33p";

describe("evalPNum_evalmsf5f33p", () => {
  it("formats a number", () => {
    expect(evalPNum_evalmsf5f33p({ n: 12.3 })).toBe("12.30");
  });

  it("formats zero", () => {
    expect(evalPNum_evalmsf5f33p({ n: 0 })).toBe("0.00");
  });

  it("falls back when n is missing", () => {
    expect(evalPNum_evalmsf5f33p({})).toBe("0.00");
  });

  it("falls back when n is undefined", () => {
    expect(evalPNum_evalmsf5f33p({ n: undefined })).toBe("0.00");
  });

  it("falls back when n is not finite", () => {
    expect(evalPNum_evalmsf5f33p({ n: Number.NaN })).toBe("0.00");
  });
});
