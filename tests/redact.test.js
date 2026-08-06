import { describe, it, expect } from "vitest";
import { redact } from "../lib/redact.js";

describe("redact", () => {
  it("masks a representative positive sample of each pattern", () => {
    const samples = {
      email: "write to ravi.kumar+work@example.co.in today",
      phone: "call +91 98765 43210 now",
      pan: "PAN is ABCDE1234F",
      aadhaar: "aadhaar 1234 5678 9012 given",
      card: "card 4111-1111-1111-1111 on file",
    };
    for (const [name, sample] of Object.entries(samples)) {
      const { text, count } = redact(sample);
      expect(count, name).toBeGreaterThanOrEqual(1);
      expect(text, name).toContain("REDACTED");
    }
    expect(redact("write to ravi.kumar+work@example.co.in").text).not.toContain(
      "example.co.in"
    );
  });

  it("returns non-matching text unchanged with a zero count", () => {
    const input = "The metric rose 42 percent in 2026, from 125 to 178 units.";
    const { text, count } = redact(input);
    expect(text).toBe(input);
    expect(count).toBe(0);
  });

  it("counts one substitution per identifier found", () => {
    const { count } = redact(
      "a@b.com and c@d.org plus PAN ABCDE1234F end"
    );
    expect(count).toBe(3);
  });
});
