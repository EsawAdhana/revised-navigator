import { describe, expect, it } from "vitest";
import { evalPSplit_evalmsf65epr } from "@/lib/eval_psplit_evalmsf65epr";

describe("evalPSplit_evalmsf65epr", () => {
  it("returns the first trimmed field", () => {
    expect(evalPSplit_evalmsf65epr({ csv: " a , b " })).toBe("a");
  });

  it("returns an empty string when csv is missing", () => {
    expect(evalPSplit_evalmsf65epr({})).toBe("");
  });

  it("returns an empty string when csv is undefined", () => {
    expect(evalPSplit_evalmsf65epr({ csv: undefined })).toBe("");
  });
});
