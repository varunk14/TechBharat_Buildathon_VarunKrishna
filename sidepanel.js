// The side panel owns all UI, all state, and all model API calls including
// streaming. Requests originate here, not in the service worker, so the fetch
// response streams directly into the DOM (D4).

import { getApiKey } from "./lib/storage.js";
import { streamModel } from "./lib/providers/index.js";
import {
  SUMMARY_SYSTEM_PROMPT,
  CHUNK_MAP_PROMPT,
  REGION_USER_PROMPT,
  FOLLOWUP_SYSTEM_PROMPT,
} from "./lib/prompts.js";
import { estimateTokens, chunkText } from "./lib/chunk.js";
import { sourceRect, isValidRect } from "./lib/crop.js";
import { buildMessages } from "./lib/conversation.js";
import {
  SECTIONS,
  parseSections,
  getSection,
  buildExportMarkdown,
  safeFilename,
} from "./lib/markdown.js";

// Below this many estimated tokens a page is summarized in one request; above
// it, the page is chunked and summarized map-reduce to stay within budget.
const SINGLE_PASS_TOKEN_LIMIT = 6000;
// Minimum readable characters before a page counts as summarizable (PRD 7.8).
const MIN_TEXT_CHARS = 200;

const captureModeSelect = document.getElementById("capture-mode");
const emptyState = document.getElementById("empty-state");
const methodBadge = document.getElementById("method-badge");
const counter = document.getElementById("counter");
const skeleton = document.getElementById("skeleton");
const cards = document.getElementById("cards");
const errorBox = document.getElementById("error");
const errorMessage = document.getElementById("error-message");
const errorCode = document.getElementById("error-code");
const errorAction = document.getElementById("error-action");
const copyButton = document.getElementById("copy");
const downloadButton = document.getElementById("download");
const transcript = document.getElementById("transcript");
const followupInput = document.getElementById("followup-input");

// The most recent completed summary, held for copy and download.
let lastSummary = null;
// The last tab summarized, so the in-panel Summarize button can re-run it.
let lastTabId = null;
// Guards against two triggers (on-load read and wake message) racing.
let running = false;
// The captured page text or image that follow-up questions are answered against.
let capturedContext = null;
// Follow-up conversation turns for the life of this panel session.
let history = [];
// The selected capture mode: "page", "selection" or "region".
let captureMode = captureModeSelect.value;

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
  hide(emptyState, cards, errorBox, counter, methodBadge, copyButton, downloadButton);
  show(skeleton);
}

function showEmptyState() {
  hide(skeleton, cards, errorBox, counter, methodBadge, copyButton, downloadButton);
  show(emptyState);
}

// Name the capture or extraction method that produced the summary, as a badge.
function setBadge(method) {
  const labels = {
    readability: "Readability",
    heuristic: "Heuristic",
    selection: "Selection",
    region: "Region",
  };
  methodBadge.textContent = labels[method] || method;
  show(methodBadge);
}

// A one-line status in place of the cards: drag prompts, section progress, etc.
function showStatus(message) {
  counter.textContent = message;
  hide(emptyState, skeleton, cards, errorBox, methodBadge, copyButton, downloadButton);
  show(counter);
}

// Long pages are read section by section; show progress in place of tokens.
function showCounter(done, total) {
  showStatus(`Reading section ${done} of ${total}`);
}

function showError({ code, message }, action) {
  hide(emptyState, skeleton, cards, counter, methodBadge, copyButton, downloadButton);
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

// Inject the extraction code on demand. Readability and lib/extract.js load
// first so the content script can use them; all three guard against re-running,
// so re-injecting on each run is safe.
async function injectContentScript(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["vendor/Readability.js", "lib/extract.js", "content.js"],
  });
}

async function extractPage(tabId) {
  await injectContentScript(tabId);
  return chrome.tabs.sendMessage(tabId, { type: "EXTRACT_PAGE" });
}

async function getSelectionText(tabId) {
  await injectContentScript(tabId);
  const response = await chrome.tabs.sendMessage(tabId, { type: "GET_SELECTION" });
  return response?.text ?? "";
}

// Crop the captured screenshot to the drawn region and return it as base64.
// Coordinates are scaled by devicePixelRatio inside sourceRect.
async function cropImage(dataUrl, rect, dpr) {
  const blob = await (await fetch(dataUrl)).blob();
  const bitmap = await createImageBitmap(blob);
  const { sx, sy, sw, sh } = sourceRect(rect, dpr);
  const canvas = new OffscreenCanvas(sw, sh);
  const context = canvas.getContext("2d");
  context.drawImage(bitmap, sx, sy, sw, sh, 0, 0, sw, sh);
  const cropped = await canvas.convertToBlob({ type: "image/png" });
  const data = await blobToBase64(cropped);
  return { mimeType: "image/png", data };
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    // Strip the "data:image/png;base64," prefix; the API wants raw base64.
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// Collect a full model response without rendering, for the map step.
async function collectModel(args) {
  let full = "";
  for await (const delta of streamModel(args)) full += delta;
  return full;
}

// Stream a structured summary into the cards. Accepts text and/or an image.
// Returns the parsed sections, or null if the model produced nothing.
async function streamStructured(apiKey, { userText, image }) {
  let full = "";
  let receivedAny = false;
  for await (const delta of streamModel({
    apiKey,
    systemPrompt: SUMMARY_SYSTEM_PROMPT,
    userText,
    image,
  })) {
    if (!receivedAny) {
      // Swap the skeleton or counter for cards the moment the first token lands.
      hide(skeleton, counter);
      show(cards);
      receivedAny = true;
    }
    full += delta;
    renderCards(parseSections(full));
  }

  if (!receivedAny) return null;
  const sections = parseSections(full);
  renderCards(sections, { final: true });
  return sections;
}

// Summarize extracted text: one streamed pass when it fits, otherwise a
// map-reduce that condenses each chunk in parallel, then structures the notes.
async function summarizeText(apiKey, text) {
  if (estimateTokens(text) <= SINGLE_PASS_TOKEN_LIMIT) {
    return streamStructured(apiKey, { userText: text });
  }

  const chunks = chunkText(text);
  let done = 0;
  showCounter(done, chunks.length);
  const notes = await Promise.all(
    chunks.map((chunk) =>
      collectModel({ apiKey, systemPrompt: CHUNK_MAP_PROMPT, userText: chunk }).then(
        (note) => {
          done += 1;
          showCounter(done, chunks.length);
          return note;
        }
      )
    )
  );

  const combined = notes
    .map((note, index) => `Section ${index + 1}:\n${note}`)
    .join("\n\n");
  return streamStructured(apiKey, { userText: combined });
}

// Set what follow-up questions are answered against, reset the conversation for
// the new capture, and enable the input.
function setContext(context) {
  capturedContext = context;
  history = [];
  transcript.textContent = "";
  followupInput.disabled = false;
  followupInput.placeholder = "Ask a follow-up about this";
}

function appendBubble(role, text) {
  const bubble = document.createElement("div");
  bubble.className = `bubble ${role}`;
  bubble.textContent = text;
  transcript.append(bubble);
  transcript.scrollTop = transcript.scrollHeight;
  return bubble;
}

// Answer a follow-up against the captured context, with no re-capture. The
// context and running history are sent as a multi-turn conversation.
async function askFollowup(question) {
  if (!capturedContext) return;
  const apiKey = await getApiKey();
  if (!apiKey) {
    appendBubble("system", "No API key set. Open settings to add one.");
    return;
  }

  appendBubble("user", question);
  const answer = appendBubble("model", "…");
  try {
    const contents = buildMessages(
      capturedContext.text || "",
      history,
      question,
      capturedContext.image
    );
    let full = "";
    for await (const delta of streamModel({
      apiKey,
      systemPrompt: FOLLOWUP_SYSTEM_PROMPT,
      contents,
    })) {
      full += delta;
      answer.textContent = full;
      transcript.scrollTop = transcript.scrollHeight;
    }
    answer.textContent = full || "No answer returned.";
    history.push({ role: "user", text: question }, { role: "model", text: full });
  } catch (error) {
    console.error("Follow-up failed:", error?.code || "", error?.message || error);
    answer.textContent = "Could not get an answer. Please retry.";
  }
}

// Store the finished summary for export and reveal the export buttons.
function finalizeSummary(sections, title, url) {
  if (!sections) {
    showError({
      code: "MODEL_DECLINED",
      message: "The model returned no summary.",
    });
    return;
  }
  lastSummary = { title, url, sections };
  show(copyButton, downloadButton);
}

async function summarizePage(apiKey, tab) {
  const page = await extractPage(tab.id);
  const readableChars = page?.text?.trim().length ?? 0;
  if (readableChars < MIN_TEXT_CHARS) {
    showError({
      code: "NO_TEXT",
      message:
        `Only ${readableChars} characters of readable text found. This page ` +
        "is likely canvas or image based.",
    });
    return;
  }
  setBadge(page.method);
  setContext({ text: page.text, title: page.title, url: page.url });
  const sections = await summarizeText(apiKey, page.text);
  finalizeSummary(sections, page.title, page.url);
}

async function summarizeSelection(apiKey, tab) {
  const text = await getSelectionText(tab.id);
  if (!text.trim()) {
    // A gentle prompt rather than an error: the user may have picked Selection
    // mode before highlighting anything. They can select, then click Summarize.
    showStatus("Select some text on the page, then click Summarize.");
    return;
  }
  setBadge("selection");
  setContext({ text, title: tab.title, url: tab.url });
  const sections = await summarizeText(apiKey, text);
  finalizeSummary(sections, tab.title, tab.url);
}

async function summarizeRegion(apiKey, tab) {
  await injectContentScript(tab.id);
  showStatus("Drag a rectangle on the page, or press Escape to cancel.");
  const result = await chrome.tabs.sendMessage(tab.id, { type: "START_REGION" });

  if (!result || result.cancelled) {
    showEmptyState();
    return;
  }
  if (!isValidRect(result.rect)) {
    showError({
      code: "REGION_TOO_SMALL",
      message: "That region was too small. Drag a larger rectangle and retry.",
    });
    return;
  }

  showSkeleton();
  const dataUrl = await chrome.runtime.sendMessage({
    type: "CAPTURE_TAB",
    windowId: tab.windowId,
  });
  if (!dataUrl) {
    showError({ code: "NETWORK", message: "Could not capture the screen." });
    return;
  }

  const image = await cropImage(dataUrl, result.rect, result.dpr);
  setBadge("region");
  setContext({ image, text: "", title: tab.title, url: tab.url });
  const sections = await streamStructured(apiKey, {
    userText: REGION_USER_PROMPT,
    image,
  });
  finalizeSummary(sections, tab.title, tab.url);
}

async function summarizeTab(tabId) {
  if (running) return;
  running = true;
  // Paint the skeleton before any async work so it is visible within the 100ms
  // budget, ahead of the network round-trip.
  showSkeleton();

  try {
    const tab = await chrome.tabs.get(tabId);
    lastTabId = tabId;

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

    if (captureMode === "selection") {
      await summarizeSelection(apiKey, tab);
    } else if (captureMode === "region") {
      await summarizeRegion(apiKey, tab);
    } else {
      await summarizePage(apiKey, tab);
    }
  } catch (error) {
    // Log the real error so a generic NETWORK message can never hide an actual
    // code fault during development. A thrown provider error already carries a
    // typed code; anything else is treated as a network failure rather than
    // shown to the user as a raw exception.
    console.error(
      "Summarize failed:",
      error?.code || "",
      error?.message || error?.stack || error
    );
    const typed = error?.code
      ? error
      : {
          code: "NETWORK",
          message: "Could not reach the API. Check your internet connection.",
        };
    showError(typed);
  } finally {
    running = false;
  }
}

// The background worker stashes the tab to summarize when the icon or shortcut
// is used, because only that gesture grants activeTab access to the page. Read
// and clear it, then summarize that exact tab.
async function runRequestedSummary() {
  const { summarizeTabId } = await chrome.storage.session.get("summarizeTabId");
  if (summarizeTabId == null) {
    if (!lastSummary) showEmptyState();
    return;
  }
  await chrome.storage.session.remove("summarizeTabId");
  summarizeTab(summarizeTabId);
}

// Re-run for whichever tab the panel last summarized. Only reliable while the
// activeTab grant on that tab still holds (same tab, not navigated away).
function reSummarize() {
  if (lastTabId != null) summarizeTab(lastTabId);
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
document.getElementById("summarize").addEventListener("click", reSummarize);
copyButton.addEventListener("click", copySummary);
downloadButton.addEventListener("click", downloadSummary);
captureModeSelect.addEventListener("change", () => {
  captureMode = captureModeSelect.value;
  // Re-run in the new mode straight away, reusing the already-granted tab, so
  // the user does not have to click the icon again after switching modes.
  reSummarize();
});

// Enter sends a follow-up; the answer streams into the transcript with no
// re-capture of the page.
followupInput.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" || event.shiftKey) return;
  event.preventDefault();
  const question = followupInput.value.trim();
  if (!question) return;
  followupInput.value = "";
  askFollowup(question);
});

// The background worker writes the tab to summarize into session storage when
// the icon or shortcut is used. React to that write so invocation works whether
// the panel was already open or just opened; the newValue guard ignores the
// removal we do after reading it.
chrome.storage.session.onChanged.addListener((changes) => {
  if (changes.summarizeTabId?.newValue != null) runRequestedSummary();
});

// Also check once on load, in case the tab id was written before this panel
// finished loading and its onChanged listener was attached.
runRequestedSummary();
