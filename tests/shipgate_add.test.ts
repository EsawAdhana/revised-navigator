import { describe, it, expect } from "vitest";
import { shipgateAdd } from "../src/lib/shipgate_add";

describe("shipgateAdd", () => {
  it("adds two numbers", () => {
    expect(shipgateAdd(2, 3)).toBe(5);
  });

  it("does not throw when first arg is undefined-shaped at runtime", () => {
    expect(() => shipgateAdd(undefined as unknown as number, 1)).not.toThrow();
  });
});
