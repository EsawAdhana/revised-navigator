import { describe, expect, it } from "vitest";
import { evalO05_evalmsf970r5 } from "@/lib/eval_o05_evalmsf970r5";

describe("evalO05_evalmsf970r5", () => {
  it("upper-cases the last item", () => {
    expect(evalO05_evalmsf970r5(["a", "b", "c"])).toBe("C");
  });

  it("upper-cases the only item of a single-element list", () => {
    expect(evalO05_evalmsf970r5(["solo"])).toBe("SOLO");
  });
});
