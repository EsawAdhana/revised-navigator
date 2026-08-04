import { describe, expect, it } from "vitest";
import { greetingFor } from "@/lib/receipt-greeting";

describe("greetingFor", () => {
  it("greets a named customer", () => {
    expect(greetingFor({ customer: { name: "Ada" } })).toBe("Thanks, Ada!");
  });

  it("greets a guest checkout with no customer", () => {
    expect(greetingFor({ customer: null })).toBe("Thanks for your order!");
    expect(greetingFor({})).toBe("Thanks for your order!");
  });
});
