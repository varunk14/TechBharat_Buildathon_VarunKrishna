// The side panel is a full extension page. It will own all UI, all state, and
// all model API calls including streaming. Model requests originate here, not in
// the service worker, so a fetch response can stream directly into the DOM (D4).

// MVP 1: the panel is a static shell. The only wired control is the settings
// link, which opens the options page. Capture, extraction and streaming arrive
// in later MVPs.
document.getElementById("open-settings").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});
