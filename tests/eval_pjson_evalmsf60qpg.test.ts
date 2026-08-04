import { describe, expect, it } from "vitest";
import { evalPJson_evalmsf60qpg } from "@/lib/eval_pjson_evalmsf60qpg";

describe("evalPJson_evalmsf60qpg", () => {
  it("formats a total", () => {
    expect(evalPJson_evalmsf60qpg('{"total":12.5}')).toBe("12.50");
  });

  it("formats a zero total", () => {
    expect(evalPJson_evalmsf60qpg('{"total":0}')).toBe("0.00");
  });

  it("falls back to zero when the payload has no total", () => {
    expect(evalPJson_evalmsf60qpg("{}")).toBe("0.00");
  });

  it("falls back to zero when the total is null", () => {
    expect(evalPJson_evalmsf60qpg('{"total":null}')).toBe("0.00");
  });
});
