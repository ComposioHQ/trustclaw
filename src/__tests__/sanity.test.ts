import { describe, it, expect } from "vitest";

// Sanity test to verify the Vitest harness is wired up correctly.
// Real tests live alongside the modules they cover.
describe("vitest harness", () => {
  it("runs", () => {
    expect(1 + 1).toBe(2);
  });
});
