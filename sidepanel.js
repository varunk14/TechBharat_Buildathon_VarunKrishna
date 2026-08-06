// The side panel owns all UI, all state, and all model API calls including
// streaming. Requests originate here, not in the service worker, so the fetch
// response streams directly into the DOM (D4).

import { getApiKey } from "./lib/storage.js";
import { streamModel } from "./lib/providers/index.js";
import { SUMMARY_SYSTEM_PROMPT } from "./lib/prompts.js";

const skeleton = document.getElementById("skeleton");
const output = document.getElementById("summary-output");
const errorBox = document.getElementById("error");
const errorMessage = document.getElementById("error-message");
const errorCode = document.getElementById("error-code");
const errorAction = document.getElementById("error-action");

// Minimal URL classification for MVP 2. The full table from PRD 7.8, with unit
// tests, is built in MVP 7.
function preflightError(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return { code: "NOT_WEB", message: "This page cannot be summarized." };
  }
  if (url.protocol === "http:" || url.protocol === "https:") return null;
  if (["chrome:", "edge:", "about:", "devtools:"].includes(url.protocol)) {
    return {
      code: "RESTRICTED_SCHEME",
      message:
        "Chrome blocks all extensions from reading internal browser pages. " +
        "This is a browser security rule, not a limitation of this extension.",
    };
  }
  return {
    code: "NOT_WEB",
    message: "This extension only works on http and https pages.",
  };
}

function show(element) {
  element.hidden = false;
}

function hide(...elements) {
  for (const element of elements) element.hidden = true;
}

function showSkeleton() {
  hide(output, errorBox);
  show(skeleton);
}

function showError({ code, message }, action) {
  hide(skeleton, output);
  errorMessage.textContent = message;
  errorCode.textContent = code;
  if (action) {
    errorAction.textContent = action.label;
    errorAction.onclick = action.onClick;
    show(errorAction);
  } else {
    hide(errorAction);
  }
  show(errorBox);
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

// Inject the content script on demand and ask it for the page text. The script
// guards against double-registration, so re-injecting on each run is safe.
async function extractPage(tabId) {
  await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
  return chrome.tabs.sendMessage(tabId, { type: "EXTRACT_PAGE" });
}

async function streamSummary(apiKey, page) {
  output.textContent = "";
  let receivedAny = false;
  for await (const delta of streamModel({
    apiKey,
    systemPrompt: SUMMARY_SYSTEM_PROMPT,
    userText: page.text,
  })) {
    if (!receivedAny) {
      // Swap the skeleton for real text the moment the first token lands.
      hide(skeleton);
      show(output);
      receivedAny = true;
    }
    output.textContent += delta;
  }
  if (!receivedAny) {
    showError({
      code: "MODEL_DECLINED",
      message: "The model returned no summary for this page.",
    });
  }
}

async function summarize() {
  // Paint the skeleton before any async work so it is visible within the 100ms
  // budget, ahead of the network round-trip.
  showSkeleton();

  try {
    const tab = await getActiveTab();
    if (!tab?.id) {
      showError({ code: "NO_TAB", message: "No active tab to summarize." });
      return;
    }

    const restriction = preflightError(tab.url ?? "");
    if (restriction) {
      showError(restriction);
      return;
    }

    const apiKey = await getApiKey();
    if (!apiKey) {
      showError(
        { code: "NO_KEY", message: "No API key set. Open settings to add one." },
        { label: "Open settings", onClick: () => chrome.runtime.openOptionsPage() }
      );
      return;
    }

    const page = await extractPage(tab.id);
    if (!page?.text?.trim()) {
      showError({
        code: "NO_TEXT",
        message:
          "No readable text found on this page. It is likely canvas or image based.",
      });
      return;
    }

    await streamSummary(apiKey, page);
  } catch (error) {
    // A thrown provider error already carries a typed code; anything else is
    // treated as a network failure rather than shown as a raw exception.
    const typed = error?.code
      ? error
      : {
          code: "NETWORK",
          message: "Could not reach the API. Check your internet connection.",
        };
    showError(typed);
  }
}

document
  .getElementById("open-settings")
  .addEventListener("click", () => chrome.runtime.openOptionsPage());
document.getElementById("summarize").addEventListener("click", summarize);

// Summarize the active page as soon as the panel opens.
summarize();
