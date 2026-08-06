// Service worker. Responsibilities are limited to opening the side panel on
// icon click and shortcut, and later capturing the visible tab for screenshots.
// No extraction logic, no model calls, no UI. See PRD 9.3.

// Open the side panel and ask it to summarize the invoked tab. The click or
// shortcut is the user gesture that grants activeTab access to that tab, so the
// panel must summarize this exact tab while the grant holds. The target tab id
// is stashed in session storage for the just-opening panel to pick up on load,
// and a message wakes a panel that is already open.
// Handle the icon click ourselves rather than letting Chrome open the panel
// automatically. Only the onClicked path gives us the invoked tab to summarize.
// This is set explicitly to false because a true value set in an earlier build
// persists in the browser and would otherwise suppress the onClicked event.
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: false })
  .catch((error) => console.error("Could not set side panel behaviour", error));

async function requestSummary(tab) {
  if (!tab?.id) return;
  // open() must run inside the gesture, so call it before any other await.
  await chrome.sidePanel.open({ windowId: tab.windowId });
  // Written after open() so it never races ahead of the gesture requirement.
  // The panel reacts to this write through storage.session.onChanged, which is
  // delivered whenever the panel loads, so there is no open-versus-read timing
  // race.
  await chrome.storage.session.set({ summarizeTabId: tab.id });
}

chrome.action.onClicked.addListener((tab) => {
  requestSummary(tab);
});

chrome.commands.onCommand.addListener((command, tab) => {
  if (command !== "open-side-panel") return;
  requestSummary(tab);
});

// Capture the visible tab for region mode. The side panel cannot call
// captureVisibleTab itself (it is not the active tab), so it asks the worker,
// which has the activeTab grant from the invoking gesture.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "CAPTURE_TAB") return;
  chrome.tabs
    .captureVisibleTab(message.windowId, { format: "png" })
    .then(sendResponse)
    .catch((error) => {
      console.error("captureVisibleTab failed", error);
      sendResponse(null);
    });
  return true;
});
