import { describe, expect, it } from "vitest";
import { evalPDate_evalmsf69uvw } from "@/lib/eval_pdate_evalmsf69uvw";

describe("evalPDate_evalmsf69uvw", () => {
  it("normalises an ISO timestamp", () => {
    expect(evalPDate_evalmsf69uvw({ iso: "2026-08-04T12:30:00Z" })).toBe(
      "2026-08-04T12:30:00.000Z",
    );
  });

  it("returns null when the input is null", () => {
    expect(evalPDate_evalmsf69uvw(null)).toBeNull();
  });

  it("returns null when the input is missing", () => {
    expect(evalPDate_evalmsf69uvw()).toBeNull();
  });

  it("returns null when iso is null or absent", () => {
    expect(evalPDate_evalmsf69uvw({ iso: null })).toBeNull();
    expect(evalPDate_evalmsf69uvw({})).toBeNull();
  });

  it("returns null when iso is unparseable", () => {
    expect(evalPDate_evalmsf69uvw({ iso: "not-a-date" })).toBeNull();
  });
});
