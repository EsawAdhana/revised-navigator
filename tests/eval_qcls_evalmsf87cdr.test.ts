import { describe, expect, it } from "vitest";
import { CartLine_evalmsf87cdr } from "@/lib/eval_qcls_evalmsf87cdr";

describe("CartLine_evalmsf87cdr", () => {
  it("upper-cases the sku of a line with an item", () => {
    expect(new CartLine_evalmsf87cdr({ sku: "abc-1" }).sku()).toBe("ABC-1");
  });

  it("returns an empty sku for a line with no item", () => {
    expect(new CartLine_evalmsf87cdr().sku()).toBe("");
  });
});
