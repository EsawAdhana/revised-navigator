import { describe, expect, it } from "vitest";
import { evalPMap_evalmsf5vrj4 } from "@/lib/eval_pmap_evalmsf5vrj4";

describe("evalPMap_evalmsf5vrj4", () => {
  it("formats the value for a present key", () => {
    expect(evalPMap_evalmsf5vrj4({ map: new Map([["a", { v: 1.6 }]]), key: "a" })).toBe("2");
  });

  it("returns a fallback for a missing key", () => {
    expect(evalPMap_evalmsf5vrj4({ map: new Map([["a", { v: 1.6 }]]), key: "b" })).toBe("0");
  });

  it("returns a fallback for an empty map", () => {
    expect(evalPMap_evalmsf5vrj4({ map: new Map(), key: "a" })).toBe("0");
  });
});
