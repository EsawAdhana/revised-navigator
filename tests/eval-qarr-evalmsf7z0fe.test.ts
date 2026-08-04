import { describe, expect, it } from "vitest";
import { evalQArr_evalmsf7z0fe } from "@/lib/eval_qarr_evalmsf7z0fe";

describe("evalQArr_evalmsf7z0fe", () => {
  it("lowercases the first item", () => {
    expect(evalQArr_evalmsf7z0fe({ items: ["ABC", "DEF"] })).toBe("abc");
  });

  it("returns an empty string when items is missing", () => {
    expect(evalQArr_evalmsf7z0fe({})).toBe("");
  });

  it("returns an empty string when items is empty", () => {
    expect(evalQArr_evalmsf7z0fe({ items: [] })).toBe("");
  });

  it("returns an empty string when the first item is undefined", () => {
    expect(evalQArr_evalmsf7z0fe({ items: [undefined as unknown as string] })).toBe("");
  });
});
