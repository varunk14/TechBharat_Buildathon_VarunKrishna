// Injected on demand into the active tab at the moment of invocation, never at
// page load. Reads the DOM and replies to messages. Never calls the model API
// and never touches chrome.storage. See PRD 9.3.

// MVP 2: return raw innerText. The extraction ladder (Readability, heuristic
// walk, vision) replaces this in MVP 4.

// The script is re-injected on every invocation. Guard so a second injection
// does not register a duplicate listener that would answer the same message
// twice.
if (!window.__glanceListenerRegistered) {
  window.__glanceListenerRegistered = true;

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type !== "EXTRACT_PAGE") return;

    const text = document.body ? document.body.innerText : "";
    const trimmed = text.trim();
    sendResponse({
      title: document.title,
      url: location.href,
      text,
      wordCount: trimmed ? trimmed.split(/\s+/).length : 0,
    });
    // innerText is read synchronously, so the response is sent before this
    // listener returns. Returning true here would leave the port open forever.
  });
}
