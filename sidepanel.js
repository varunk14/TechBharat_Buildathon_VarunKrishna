// The side panel owns all UI, all state, and all model API calls including
// streaming. Requests originate here, not in the service worker, so the fetch
// response streams directly into the DOM (D4).

import { getApiKey } from "./lib/storage.js";
import { streamModel } from "./lib/providers/index.js";
import { SUMMARY_SYSTEM_PROMPT } from "./lib/prompts.js";
import {
  SECTIONS,
  parseSections,
  getSection,
  buildExportMarkdown,
  safeFilename,
} from "./lib/markdown.js";

const skeleton = document.getElementById("skeleton");
const cards = document.getElementById("cards");
const errorBox = document.getElementById("error");
const errorMessage = document.getElementById("error-message");
const errorCode = document.getElementById("error-code");
const errorAction = document.getElementById("error-action");
const copyButton = document.getElementById("copy");
const downloadButton = document.getElementById("download");

// The most recent completed summary, held for copy and download.
let lastSummary = null;

// Build one card per section once, and keep a handle to each body element so
// streaming updates only touch text, never rebuild the DOM.
const cardBodies = new Map();
for (const name of SECTIONS) {
  const card = document.createElement("section");
  card.className = "card";
  const heading = document.createElement("h2");
  heading.textContent = name;
  const body = document.createElement("div");
  body.className = "card-body";
  card.append(heading, body);
  cards.append(card);
  cardBodies.set(name, body);
}

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

// Render one section's body as a bullet list when it looks like one, otherwise
// as plain text. Content is written with textContent, never innerHTML, so
// model output can never inject markup.
function renderCardBody(body, content, { final }) {
  body.textContent = "";
  const trimmed = content.trim();

  if (!trimmed) {
    // Mid-stream a not-yet-reached section stays quiet; only the finished
    // summary commits to "None found".
    body.textContent = final ? "None found" : "…";
    body.classList.add("muted");
    return;
  }

  body.classList.remove("muted");
  const lines = trimmed.split("\n");
  const isList = lines.some((line) => /^\s*[-*]\s+/.test(line));

  if (isList) {
    const list = document.createElement("ul");
    for (const line of lines) {
      const item = line.replace(/^\s*[-*]\s+/, "").trim();
      if (!item) continue;
      const li = document.createElement("li");
      li.textContent = item;
      list.append(li);
    }
    body.append(list);
  } else {
    body.textContent = trimmed;
  }
}

function renderCards(sections, { final } = { final: false }) {
  for (const name of SECTIONS) {
    renderCardBody(cardBodies.get(name), getSection(sections, name), { final });
  }
}

function showSkeleton() {
  hide(cards, errorBox, copyButton, downloadButton);
  show(skeleton);
}

function showError({ code, message }, action) {
  hide(skeleton, cards, copyButton, downloadButton);
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
  let full = "";
  let receivedAny = false;
  for await (const delta of streamModel({
    apiKey,
    systemPrompt: SUMMARY_SYSTEM_PROMPT,
    userText: page.text,
  })) {
    if (!receivedAny) {
      // Swap the skeleton for cards the moment the first token lands.
      hide(skeleton);
      show(cards);
      receivedAny = true;
    }
    full += delta;
    renderCards(parseSections(full));
  }

  if (!receivedAny) {
    showError({
      code: "MODEL_DECLINED",
      message: "The model returned no summary for this page.",
    });
    return;
  }

  const sections = parseSections(full);
  renderCards(sections, { final: true });
  lastSummary = { title: page.title, url: page.url, sections };
  show(copyButton, downloadButton);
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

function currentMarkdown() {
  return buildExportMarkdown(lastSummary);
}

async function copySummary() {
  if (!lastSummary) return;
  await navigator.clipboard.writeText(currentMarkdown());
  copyButton.textContent = "Copied";
  setTimeout(() => (copyButton.textContent = "Copy"), 1500);
}

function downloadSummary() {
  if (!lastSummary) return;
  const today = new Date().toISOString().slice(0, 10);
  const blob = new Blob([currentMarkdown()], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = safeFilename(lastSummary.title, today);
  anchor.click();
  URL.revokeObjectURL(url);
}

document
  .getElementById("open-settings")
  .addEventListener("click", () => chrome.runtime.openOptionsPage());
document.getElementById("summarize").addEventListener("click", summarize);
copyButton.addEventListener("click", copySummary);
downloadButton.addEventListener("click", downloadSummary);

// Summarize the active page as soon as the panel opens.
summarize();
