import { describe, expect, it } from "vitest";
import { evalQMap_evalmsf82lu6 } from "@/lib/eval_qmap_evalmsf82lu6";

describe("evalQMap_evalmsf82lu6", () => {
  it("upper-cases the label for a key that is present", () => {
    const map = new Map([["a", { label: "ready" }]]);
    expect(evalQMap_evalmsf82lu6({ map, key: "a" })).toBe("READY");
  });

  it("returns an empty string for a key that is missing", () => {
    const map = new Map([["a", { label: "ready" }]]);
    expect(evalQMap_evalmsf82lu6({ map, key: "b" })).toBe("");
  });

  it("returns an empty string for an empty map", () => {
    expect(evalQMap_evalmsf82lu6({ map: new Map(), key: "a" })).toBe("");
  });
});
