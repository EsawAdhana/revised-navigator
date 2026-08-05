import { describe, expect, it } from "vitest";
import { shipgateAdd } from "../src/lib/shipgate_add";

describe("shipgateAdd", () => {
  it("adds two numbers", () => {
    expect(shipgateAdd(2, 3)).toBe(5);
  });

  it("returns a finite number callers can format", () => {
    const total = shipgateAdd(2.5, 1.25);
    expect(Number.isFinite(total)).toBe(true);
    expect(total.toFixed(2)).toBe("3.75");
  });

  it("adds zero and negative numbers", () => {
    expect(shipgateAdd(0, 0)).toBe(0);
    expect(shipgateAdd(-4, 1)).toBe(-3);
  });
});
