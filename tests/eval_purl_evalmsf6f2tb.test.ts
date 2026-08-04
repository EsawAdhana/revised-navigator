import { describe, expect, it } from "vitest";
import { evalPUrl_evalmsf6f2tb } from "@/lib/eval_purl_evalmsf6f2tb";

describe("evalPUrl_evalmsf6f2tb", () => {
  it("returns the pathname of an absolute URL", () => {
    expect(
      evalPUrl_evalmsf6f2tb({ href: "https://example.com/checkout" }),
    ).toBe("/checkout");
  });

  it("returns null when there is no href", () => {
    expect(evalPUrl_evalmsf6f2tb({})).toBeNull();
  });

  it("returns null when the href is not a valid URL", () => {
    expect(evalPUrl_evalmsf6f2tb({ href: "/checkout" })).toBeNull();
  });

  it("returns null when the href is blank", () => {
    expect(evalPUrl_evalmsf6f2tb({ href: "   " })).toBeNull();
  });
});
