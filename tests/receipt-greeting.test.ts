import { describe, expect, it } from "vitest";
import { greetingFor } from "@/lib/receipt-greeting";

describe("greetingFor", () => {
  it("greets a named customer", () => {
    expect(greetingFor({ customer: { name: "Ada" } })).toBe("Thanks, Ada!");
  });

  it("greets a guest checkout with a null customer", () => {
    expect(greetingFor({ customer: null })).toBe("Thanks!");
  });

  it("greets a guest checkout with no customer key", () => {
    expect(greetingFor({})).toBe("Thanks!");
  });

  it("greets a guest checkout when the customer has no name", () => {
    expect(greetingFor({ customer: { name: "" } })).toBe("Thanks!");
  });
});
