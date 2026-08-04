import { describe, expect, it } from "vitest";
import { evalO02_evalmsf92dbw } from "@/lib/eval_o02_evalmsf92dbw";

describe("evalO02_evalmsf92dbw", () => {
  it("measures a provided name", () => {
    expect(evalO02_evalmsf92dbw({ name: "Ada" })).toBe(3);
  });

  it("falls back to the guest name when no name is given", () => {
    expect(evalO02_evalmsf92dbw({})).toBe(5);
  });

  it("keeps an empty name instead of coercing it to the guest fallback", () => {
    expect(evalO02_evalmsf92dbw({ name: "" })).toBe(0);
  });
});
