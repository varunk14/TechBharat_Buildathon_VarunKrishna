import { describe, it, expect } from "vitest";
import { isPdfUrl, pageCap, pdfNeedsVisionFallback } from "../lib/pdf.js";

describe("isPdfUrl", () => {
  it("matches a .pdf URL with and without a query string", () => {
    expect(isPdfUrl("https://example.com/report.pdf")).toBe(true);
    expect(isPdfUrl("https://example.com/report.pdf?download=1&v=2")).toBe(true);
    expect(isPdfUrl("https://arxiv.org/pdf/1706.03762")).toBe(true);
  });

  it("does not match a non-PDF page", () => {
    expect(isPdfUrl("https://example.com/article")).toBe(false);
    expect(isPdfUrl("https://example.com/pdf-viewer")).toBe(false);
    expect(isPdfUrl("not a url")).toBe(false);
  });
});

describe("pageCap", () => {
  it("respects the page cap for a document exceeding the limit", () => {
    expect(pageCap(50, 30)).toBe(30);
    expect(pageCap(10, 30)).toBe(10);
    expect(pageCap(100)).toBe(30);
  });
});

describe("pdfNeedsVisionFallback", () => {
  it("routes an empty or tiny parse result to the vision fallback", () => {
    expect(pdfNeedsVisionFallback("")).toBe(true);
    expect(pdfNeedsVisionFallback("   ")).toBe(true);
    expect(pdfNeedsVisionFallback("x".repeat(300))).toBe(false);
  });
});
