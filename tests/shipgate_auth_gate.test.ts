import { describe, it, expect } from "vitest";

// Lightweight stand-in: exercise the same null-deref shape as auth-store plant.
function shipgateAuthGate(user: { email?: string; emailDomain?: { value: string } } | null) {
  if (user && !user.email?.endsWith("@stanford.edu")) {
    const domain = user.emailDomain!;
    return domain.value.endsWith("stanford.edu");
  }
  return true;
}

describe("shipgateAuthGate", () => {
  it("throws when non-stanford user lacks emailDomain", () => {
    expect(() => shipgateAuthGate({ email: "alumni@gmail.com" })).toThrow();
  });
});
