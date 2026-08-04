import { describe, expect, it } from "vitest";
import { evalO09_evalmsf9c30t } from "@/lib/eval_o09_evalmsf9c30t";

describe("evalO09_evalmsf9c30t", () => {
  it("uppercases the second match", () => {
    expect(evalO09_evalmsf9c30t("first second third")).toBe("SECOND");
  });

  it("returns null when there is only one match", () => {
    expect(evalO09_evalmsf9c30t("solo")).toBeNull();
  });

  it("returns null when there are no matches", () => {
    expect(evalO09_evalmsf9c30t("!!!")).toBeNull();
  });
});
