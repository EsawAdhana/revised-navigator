import { describe, expect, it } from "vitest";
import { evalO04_evalmsf9669f } from "@/lib/eval_o04_evalmsf9669f";

describe("evalO04_evalmsf9669f", () => {
  it("treats the string \"false\" as off", () => {
    expect(evalO04_evalmsf9669f({ enabled: "false" })).toBe("off");
  });

  it("treats a padded, mixed-case \"False\" as off", () => {
    expect(evalO04_evalmsf9669f({ enabled: " False " })).toBe("off");
  });

  it("treats the string \"true\" as on", () => {
    expect(evalO04_evalmsf9669f({ enabled: "true" })).toBe("on");
  });

  it("treats a missing flag as off", () => {
    expect(evalO04_evalmsf9669f({})).toBe("off");
  });

  it("treats an empty flag as off", () => {
    expect(evalO04_evalmsf9669f({ enabled: "" })).toBe("off");
  });
});
