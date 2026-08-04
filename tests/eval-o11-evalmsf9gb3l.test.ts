import { describe, expect, it } from "vitest";
import { evalO11_evalmsf9gb3l } from "@/lib/eval_o11_evalmsf9gb3l";

describe("evalO11_evalmsf9gb3l", () => {
  it("converts whole dollars to cents", () => {
    expect(evalO11_evalmsf9gb3l(20)).toBe(2000);
  });

  it("converts two-decimal amounts that lose precision when scaled", () => {
    expect(evalO11_evalmsf9gb3l(19.99)).toBe(1999);
    expect(evalO11_evalmsf9gb3l(1.1)).toBe(110);
    expect(evalO11_evalmsf9gb3l(0.29)).toBe(29);
    expect(evalO11_evalmsf9gb3l(4.35)).toBe(435);
    expect(evalO11_evalmsf9gb3l(8.13)).toBe(813);
  });

  it("converts negative amounts such as refunds", () => {
    expect(evalO11_evalmsf9gb3l(-19.99)).toBe(-1999);
  });

  it("rejects amounts with sub-cent precision", () => {
    expect(() => evalO11_evalmsf9gb3l(1.005)).toThrow(RangeError);
    expect(() => evalO11_evalmsf9gb3l(0.001)).toThrow(RangeError);
  });
});
