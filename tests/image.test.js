import { describe, it, expect } from "vitest";
import { bytesToBase64, base64ToBytes } from "../lib/image.js";

describe("base64", () => {
  it("round-trips a known byte sequence", () => {
    const bytes = new Uint8Array([0, 1, 2, 253, 254, 255, 137, 80, 78, 71]);
    const encoded = bytesToBase64(bytes);
    expect(encoded).toBe("AAEC/f7/iVBORw==");
    expect(Array.from(base64ToBytes(encoded))).toEqual(Array.from(bytes));
  });

  it("round-trips a longer sequence spanning the chunk logic", () => {
    const bytes = new Uint8Array(100000);
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = i % 256;
    expect(Array.from(base64ToBytes(bytesToBase64(bytes)))).toEqual(
      Array.from(bytes)
    );
  });
});
