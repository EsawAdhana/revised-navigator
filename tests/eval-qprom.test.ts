import { describe, expect, it } from "vitest";
import { evalQProm_evalmsf87c2x } from "@/lib/eval_qprom_evalmsf87c2x";

describe("evalQProm_evalmsf87c2x", () => {
  it("upper-cases a resolved value", async () => {
    await expect(evalQProm_evalmsf87c2x(Promise.resolve({ value: "ok" }))).resolves.toBe("OK");
  });

  it("returns undefined when the promise resolves to null", async () => {
    await expect(evalQProm_evalmsf87c2x(Promise.resolve(null))).resolves.toBeUndefined();
  });

  it("returns undefined when the row has no value", async () => {
    await expect(evalQProm_evalmsf87c2x(Promise.resolve({}))).resolves.toBeUndefined();
  });
});
