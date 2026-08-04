import { describe, expect, it } from "vitest";
import { evalO08_evalmsf9aqzb } from "@/lib/eval_o08_evalmsf9aqzb";

describe("evalO08_evalmsf9aqzb", () => {
  it("upper-cases the id from the awaited loader", async () => {
    await expect(
      evalO08_evalmsf9aqzb(() => Promise.resolve({ id: "ord_1" })),
    ).resolves.toBe("ORD_1");
  });

  it("waits for a loader that resolves asynchronously", async () => {
    await expect(
      evalO08_evalmsf9aqzb(
        () =>
          new Promise((resolve) =>
            setTimeout(() => resolve({ id: "ord_2" }), 5),
          ),
      ),
    ).resolves.toBe("ORD_2");
  });
});
