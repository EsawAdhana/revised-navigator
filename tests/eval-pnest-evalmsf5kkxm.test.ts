import { describe, expect, it } from "vitest";
import { evalPNest_evalmsf5kkxm } from "@/lib/eval_pnest_evalmsf5kkxm";

describe("evalPNest_evalmsf5kkxm", () => {
  it("uppercases a name", () => {
    expect(evalPNest_evalmsf5kkxm({ user: { profile: { name: "Ada" } } })).toBe("ADA");
  });

  it("returns an empty string when there is no user", () => {
    expect(evalPNest_evalmsf5kkxm({})).toBe("");
  });

  it("returns an empty string when the user has no profile", () => {
    expect(evalPNest_evalmsf5kkxm({ user: {} })).toBe("");
  });

  it("returns an empty string when the profile has no name", () => {
    expect(evalPNest_evalmsf5kkxm({ user: { profile: {} } })).toBe("");
  });
});
