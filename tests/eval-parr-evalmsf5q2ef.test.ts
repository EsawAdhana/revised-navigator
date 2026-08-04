import { describe, expect, it } from "vitest";
import { evalPArr_evalmsf5q2ef } from "@/lib/eval_parr_evalmsf5q2ef";

describe("evalPArr_evalmsf5q2ef", () => {
  it("trims the first item", () => {
    expect(evalPArr_evalmsf5q2ef({ items: ["  ada  ", "grace"] })).toBe("ada");
  });

  it("returns an empty string when items is missing", () => {
    expect(evalPArr_evalmsf5q2ef({})).toBe("");
  });

  it("returns an empty string when items is empty", () => {
    expect(evalPArr_evalmsf5q2ef({ items: [] })).toBe("");
  });
});
