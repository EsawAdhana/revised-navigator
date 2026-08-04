import { describe, expect, it } from "vitest";
import { evalPBool_evalmsf6twqn } from "@/lib/eval_pbool_evalmsf6twqn";

describe("evalPBool_evalmsf6twqn", () => {
  it("stringifies a true flag", () => {
    expect(evalPBool_evalmsf6twqn({ flag: true })).toBe("true");
  });

  it("stringifies a false flag", () => {
    expect(evalPBool_evalmsf6twqn({ flag: false })).toBe("false");
  });

  it("treats an omitted flag as false", () => {
    expect(evalPBool_evalmsf6twqn({})).toBe("false");
  });

  it("treats an undefined flag as false", () => {
    expect(evalPBool_evalmsf6twqn({ flag: undefined })).toBe("false");
  });
});
