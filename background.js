// Service worker. Responsibilities are limited to opening the side panel on
// icon click and shortcut, and later capturing the visible tab for screenshots.
// No extraction logic, no model calls, no UI. See PRD 9.3.

// Clicking the toolbar icon opens the side panel rather than a popup, which
// would lose all follow-up state on click-away (D2). This behaviour is a
// runtime setting, so it is re-applied every time the worker starts.
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error("Could not set side panel behaviour", error));

// The keyboard shortcut is a separate path from the icon click and must open
// the panel explicitly. chrome.sidePanel.open requires a user gesture; the
// command invocation itself is that gesture, so this must not be deferred.
chrome.commands.onCommand.addListener((command, tab) => {
  if (command !== "open-side-panel" || !tab) return;
  chrome.sidePanel
    .open({ windowId: tab.windowId })
    .catch((error) => console.error("Could not open side panel", error));
});
