import { describe, expect, it } from "vitest";
import { evalO06_evalmsf97wp4 } from "@/lib/eval_o06_evalmsf97wp4";

describe("evalO06_evalmsf97wp4", () => {
  it("keeps the first n characters", () => {
    expect(evalO06_evalmsf97wp4("abcdef", 3)).toBe("abc");
  });

  it("keeps every character when n is the whole length", () => {
    expect(evalO06_evalmsf97wp4("abc", 3)).toBe("abc");
  });

  it("keeps the whole string when n is longer than it", () => {
    expect(evalO06_evalmsf97wp4("ab", 5)).toBe("ab");
  });

  it("returns an empty string when n is 0", () => {
    expect(evalO06_evalmsf97wp4("abcdef", 0)).toBe("");
  });
});
