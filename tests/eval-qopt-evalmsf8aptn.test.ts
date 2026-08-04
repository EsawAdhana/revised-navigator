import { describe, expect, it } from "vitest";
import { evalQOpt_evalmsf8aptn } from "@/lib/eval_qopt_evalmsf8aptn";

describe("evalQOpt_evalmsf8aptn", () => {
  it("returns the first three characters", () => {
    expect(evalQOpt_evalmsf8aptn({ a: { b: { c: "abcdef" } } })).toBe("abc");
  });

  it("returns undefined when a is missing", () => {
    expect(evalQOpt_evalmsf8aptn({})).toBeUndefined();
  });

  it("returns undefined when b is missing", () => {
    expect(evalQOpt_evalmsf8aptn({ a: {} })).toBeUndefined();
  });

  it("returns undefined when c is missing", () => {
    expect(evalQOpt_evalmsf8aptn({ a: { b: {} } })).toBeUndefined();
  });
});
