import { describe, expect, it } from "vitest";
import { evalQSet_evalmsf8foog } from "@/lib/eval_qset_evalmsf8foog";

describe("evalQSet_evalmsf8foog", () => {
  it("uppercases the first member matching the key", () => {
    expect(evalQSet_evalmsf8foog(new Set(["alpha", "beta"]), "al")).toBe("ALPHA");
  });

  it("returns undefined when no member matches the key", () => {
    expect(evalQSet_evalmsf8foog(new Set(["alpha", "beta"]), "zz")).toBeUndefined();
  });

  it("returns undefined for an empty set", () => {
    expect(evalQSet_evalmsf8foog(new Set(), "al")).toBeUndefined();
  });
});
