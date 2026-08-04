import { describe, expect, it } from "vitest";
import { evalQJson_evalmsf838oc } from "@/lib/eval_qjson_evalmsf838oc";

describe("evalQJson_evalmsf838oc", () => {
  it("formats a numeric total", () => {
    expect(evalQJson_evalmsf838oc('{"total":12.5}')).toBe("12.50");
  });

  it("formats a zero total", () => {
    expect(evalQJson_evalmsf838oc('{"total":0}')).toBe("0.00");
  });

  it("falls back when the payload has no total", () => {
    expect(evalQJson_evalmsf838oc("{}")).toBe("0.00");
  });

  it("falls back when the total is null", () => {
    expect(evalQJson_evalmsf838oc('{"total":null}')).toBe("0.00");
  });
});
