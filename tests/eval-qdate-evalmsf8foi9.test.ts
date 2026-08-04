import { describe, expect, it } from "vitest";
import { evalQDate_evalmsf8foi9 } from "@/lib/eval_qdate_evalmsf8foi9";

describe("evalQDate_evalmsf8foi9", () => {
  it("returns the epoch millis for an iso date", () => {
    expect(evalQDate_evalmsf8foi9({ iso: "2026-08-04T00:00:00.000Z" })).toBe(
      Date.parse("2026-08-04T00:00:00.000Z"),
    );
  });

  it("returns null when there is no input", () => {
    expect(evalQDate_evalmsf8foi9(null)).toBeNull();
    expect(evalQDate_evalmsf8foi9(undefined)).toBeNull();
  });

  it("returns null when the iso date is missing", () => {
    expect(evalQDate_evalmsf8foi9({ iso: null })).toBeNull();
    expect(evalQDate_evalmsf8foi9({})).toBeNull();
  });
});
