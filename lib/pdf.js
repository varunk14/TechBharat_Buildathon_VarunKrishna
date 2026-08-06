// PDF detection and text extraction using the vendored pdf.js. The pure helpers
// are unit tested; extractPdfText runs only in the side panel where chrome and
// the DOM exist.

import { MIN_TEXT_CHARS } from "./errors.js";

export const MAX_PDF_PAGES = 30;

export function isPdfUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    // Matches a .pdf path regardless of any query string, since the query is
    // not part of url.pathname.
    if (/\.pdf$/i.test(url.pathname)) return true;
    // arXiv serves PDFs from a /pdf/ path with no .pdf extension.
    if (url.hostname.endsWith("arxiv.org") && /^\/pdf\//i.test(url.pathname)) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export function pageCap(numPages, maxPages = MAX_PDF_PAGES) {
  return Math.min(numPages, maxPages);
}

// When parsing yields too little text (scanned/image PDFs), the caller should
// fall back to the visual route rather than summarize nothing.
export function pdfNeedsVisionFallback(text) {
  return (text || "").trim().length < MIN_TEXT_CHARS;
}

// Fetch the PDF bytes (activeTab grants temporary access to the tab's origin)
// and extract text from up to maxPages pages with pdf.js.
export async function extractPdfText(url, maxPages = MAX_PDF_PAGES) {
  const pdfjs = await import(chrome.runtime.getURL("vendor/pdf.mjs"));
  pdfjs.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL(
    "vendor/pdf.worker.mjs"
  );
  const data = await (await fetch(url)).arrayBuffer();
  const doc = await pdfjs.getDocument({ data }).promise;
  const count = pageCap(doc.numPages, maxPages);

  const pages = [];
  for (let i = 1; i <= count; i += 1) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    pages.push(content.items.map((item) => item.str).join(" "));
  }
  return pages.join("\n\n").trim();
}
