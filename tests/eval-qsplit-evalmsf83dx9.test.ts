import { describe, expect, it } from "vitest";
import { evalQSplit_evalmsf83dx9 } from "@/lib/eval_qsplit_evalmsf83dx9";

describe("evalQSplit_evalmsf83dx9", () => {
  it("returns the first trimmed field", () => {
    expect(evalQSplit_evalmsf83dx9({ csv: " a , b " })).toBe("a");
  });

  it("returns an empty string when csv is missing", () => {
    expect(evalQSplit_evalmsf83dx9({})).toBe("");
  });

  it("returns an empty string when csv is undefined", () => {
    expect(evalQSplit_evalmsf83dx9({ csv: undefined })).toBe("");
  });
});
