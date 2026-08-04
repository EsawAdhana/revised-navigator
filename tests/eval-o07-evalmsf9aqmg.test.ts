import { describe, expect, it } from "vitest";
import { evalO07_evalmsf9aqmg } from "@/lib/eval_o07_evalmsf9aqmg";

describe("evalO07_evalmsf9aqmg", () => {
  it("formats an amount to two decimals", () => {
    expect(evalO07_evalmsf9aqmg(12.5)).toBe("12.50");
  });

  it("formats a zero amount", () => {
    expect(evalO07_evalmsf9aqmg(0)).toBe("0.00");
  });

  it("formats a missing checkout amount as a two-decimal string", () => {
    expect(evalO07_evalmsf9aqmg(null)).toBe("0.00");
  });
});
