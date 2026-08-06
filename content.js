// Injected on demand into the active tab at the moment of invocation, never at
// page load. Reads the DOM and replies to messages. Never calls the model API
// and never touches chrome.storage. See PRD 9.3. Injected together with
// vendor/Readability.js and lib/extract.js, which provide the Readability
// constructor and globalThis.GlanceExtract.

// The script is re-injected on every invocation. Guard so a second injection
// does not register a duplicate listener that would answer the same message
// twice.
if (!window.__glanceListenerRegistered) {
  window.__glanceListenerRegistered = true;

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  // Scroll through the page to trigger lazy-loaded and intersection-observed
  // content, then return to where the user was so the page is not disturbed.
  // The step count is capped so a very long page cannot blow the latency
  // budget priming content the summary may not even need.
  async function primeLazyContent() {
    const startY = window.scrollY;
    const height = document.body ? document.body.scrollHeight : 0;
    const step = window.innerHeight || 800;
    const maxSteps = 15;
    for (let i = 1; i <= maxSteps && i * step < height; i += 1) {
      window.scrollTo(0, i * step);
      await sleep(30);
    }
    window.scrollTo(0, startY);
  }

  // Resolve once the DOM has been quiet for a short spell, or when a hard
  // timeout fires, so a single-page app that never fully settles cannot hang
  // extraction forever.
  function waitForStable(quietMs = 300, hardTimeoutMs = 1500) {
    return new Promise((resolve) => {
      const target = document.body || document.documentElement;
      let quietTimer;
      const finish = () => {
        observer.disconnect();
        clearTimeout(quietTimer);
        clearTimeout(hardTimer);
        resolve();
      };
      const observer = new MutationObserver(() => {
        clearTimeout(quietTimer);
        quietTimer = setTimeout(finish, quietMs);
      });
      observer.observe(target, { childList: true, subtree: true, characterData: true });
      quietTimer = setTimeout(finish, quietMs);
      const hardTimer = setTimeout(finish, hardTimeoutMs);
    });
  }

  // Pull text from same-origin iframes. Cross-origin frames throw on access,
  // which is a browser security boundary, not an error to surface.
  function extractSameOriginIframes() {
    const parts = [];
    for (const frame of document.querySelectorAll("iframe")) {
      try {
        const doc = frame.contentDocument;
        if (!doc || !doc.body) continue;
        const text = globalThis.GlanceExtract.heuristicExtractMarkdown(doc.body);
        if (text && text.trim().length > 40) parts.push(text);
      } catch (error) {
        // Cross-origin frame; skip by design.
      }
    }
    return parts.join("\n\n");
  }

  // Enough text on the first try that priming and settling would only add
  // latency without adding content.
  const QUICK_ENOUGH_CHARS = 800;

  async function extractPage() {
    const readability = typeof Readability !== "undefined" ? Readability : null;

    // Try immediately. Most pages already have their content in the DOM, so
    // this avoids the priming and settle delay entirely. Only when the first
    // pass is thin (lazy-loaded or single-page apps) do we scroll, wait for the
    // DOM to settle, and try again.
    let result = globalThis.GlanceExtract.extract(document, readability);
    if (result.text.trim().length < QUICK_ENOUGH_CHARS) {
      await primeLazyContent();
      await waitForStable();
      result = globalThis.GlanceExtract.extract(document, readability);
    }

    const iframeText = extractSameOriginIframes();
    const text = iframeText ? `${result.text}\n\n${iframeText}` : result.text;
    const trimmed = text.trim();

    return {
      method: result.method,
      title: result.title || document.title,
      url: location.href,
      text,
      wordCount: trimmed ? trimmed.split(/\s+/).length : 0,
      lang: document.documentElement.lang || "",
    };
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type !== "EXTRACT_PAGE") return;
    // Extraction is async (it waits for the DOM to settle), so the listener must
    // return true to keep the message port open until sendResponse is called.
    extractPage().then(sendResponse);
    return true;
  });
}
