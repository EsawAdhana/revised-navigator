import { describe, expect, it } from "vitest";
import { evalQBool_evalmsf8eoq3 } from "@/lib/eval_qbool_evalmsf8eoq3";

describe("evalQBool_evalmsf8eoq3", () => {
  it("returns the boolean value when ok is set", () => {
    expect(evalQBool_evalmsf8eoq3({ ok: true })).toBe(true);
    expect(evalQBool_evalmsf8eoq3({ ok: false })).toBe(false);
  });

  it("returns false when ok is undefined", () => {
    expect(evalQBool_evalmsf8eoq3({ ok: undefined })).toBe(false);
  });

  it("returns false when ok is missing", () => {
    expect(evalQBool_evalmsf8eoq3({})).toBe(false);
  });
});
