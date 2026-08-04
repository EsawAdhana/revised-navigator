import { describe, expect, it } from "vitest";
import { evalPOpt_evalmsf6oysm } from "@/lib/eval_popt_evalmsf6oysm";

describe("evalPOpt_evalmsf6oysm", () => {
  it("lowercases a fully populated value", () => {
    expect(evalPOpt_evalmsf6oysm({ a: { b: { c: "READY" } } })).toBe("ready");
  });

  it("returns undefined when the middle level is missing", () => {
    expect(evalPOpt_evalmsf6oysm({ a: {} })).toBeUndefined();
  });

  it("returns undefined when the top level is missing", () => {
    expect(evalPOpt_evalmsf6oysm({})).toBeUndefined();
  });

  it("returns undefined when the leaf value is missing", () => {
    expect(evalPOpt_evalmsf6oysm({ a: { b: {} } })).toBeUndefined();
  });
});
