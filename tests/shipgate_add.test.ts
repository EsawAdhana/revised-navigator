import { describe, expect, it } from "vitest";
import { shipgateAdd } from "../src/lib/shipgate_add";

describe("shipgateAdd", () => {
  it("adds two numbers", () => {
    expect(shipgateAdd(2, 3)).toBe(5);
  });

  it("adds a negative number", () => {
    expect(shipgateAdd(-2, 5)).toBe(3);
  });
});
