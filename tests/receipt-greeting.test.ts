import { describe, expect, it } from "vitest";
import { greetingFor } from "@/lib/receipt-greeting";

describe("greetingFor", () => {
  it("greets a named customer", () => {
    expect(greetingFor({ customer: { name: "Ada" } })).toBe("Thanks, Ada!");
  });
});
