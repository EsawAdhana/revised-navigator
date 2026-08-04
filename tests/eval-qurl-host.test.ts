import { describe, expect, it } from "vitest";
import { evalQUrl_evalmsf8bfow } from "@/lib/eval_qurl_evalmsf8bfow";

describe("evalQUrl_evalmsf8bfow", () => {
  it("returns the host of an absolute URL", () => {
    expect(
      evalQUrl_evalmsf8bfow({ href: "https://eval.humanbehavior.local/checkout" }),
    ).toBe("eval.humanbehavior.local");
  });

  it("returns null when href is missing", () => {
    expect(evalQUrl_evalmsf8bfow({})).toBeNull();
  });

  it("returns null when href is empty or blank", () => {
    expect(evalQUrl_evalmsf8bfow({ href: "" })).toBeNull();
    expect(evalQUrl_evalmsf8bfow({ href: "   " })).toBeNull();
  });

  it("returns null for a relative or otherwise unparseable href", () => {
    expect(evalQUrl_evalmsf8bfow({ href: "/checkout" })).toBeNull();
    expect(evalQUrl_evalmsf8bfow({ href: "not a url" })).toBeNull();
  });
});
