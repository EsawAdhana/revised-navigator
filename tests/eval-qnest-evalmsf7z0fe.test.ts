import { describe, expect, it } from "vitest";
import { evalQNest_evalmsf7z0fe } from "@/lib/eval_qnest_evalmsf7z0fe";

describe("evalQNest_evalmsf7z0fe", () => {
  it("trims a present name", () => {
    expect(evalQNest_evalmsf7z0fe({ user: { profile: { name: "  Ada  " } } })).toBe("Ada");
  });

  it("returns an empty string when the user is missing", () => {
    expect(evalQNest_evalmsf7z0fe({})).toBe("");
  });

  it("returns an empty string when the profile is missing", () => {
    expect(evalQNest_evalmsf7z0fe({ user: {} })).toBe("");
  });

  it("returns an empty string when the name is missing", () => {
    expect(evalQNest_evalmsf7z0fe({ user: { profile: {} } })).toBe("");
  });
});
