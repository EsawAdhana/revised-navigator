import { describe, expect, it } from "vitest";
import { evalQRec_evalmsf86hdy } from "@/lib/eval_qrec_evalmsf86hdy";

describe("evalQRec_evalmsf86hdy", () => {
  it("formats the entry for a present key", () => {
    expect(evalQRec_evalmsf86hdy({ dict: { a: { n: 1.6 } }, key: "a" })).toBe("2");
  });

  it("returns undefined for a key that is missing from the dict", () => {
    expect(evalQRec_evalmsf86hdy({ dict: { a: { n: 1 } }, key: "b" })).toBeUndefined();
  });

  it("returns undefined for an empty dict", () => {
    expect(evalQRec_evalmsf86hdy({ dict: {}, key: "a" })).toBeUndefined();
  });
});
