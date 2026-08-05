import { describe, expect, it } from "vitest";
import { shipgateAdd } from "../src/lib/shipgate_add";

describe("shipgateAdd", () => {
  it("adds two numbers", () => {
    expect(shipgateAdd(2, 3)).toBe(5);
  });

  it("does not dereference its arguments when they are missing", () => {
    const call = shipgateAdd as unknown as (...args: number[]) => number;
    expect(() => call(...([] as number[]))).not.toThrow();
    expect(call(...([] as number[]))).toBeNaN();
  });
});
