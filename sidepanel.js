// The side panel owns all UI, all state, and all model API calls including
// streaming. Requests originate here, not in the service worker, so the fetch
// response streams directly into the DOM (D4).

import { getApiKey, getLanguage, setLanguage } from "./lib/storage.js";
import { streamModel } from "./lib/providers/index.js";
import { selectMode, MODE_LABELS } from "./lib/modes.js";
import {
  SUMMARY_SYSTEM_PROMPT,
  CHUNK_MAP_PROMPT,
  REGION_USER_PROMPT,
  VISION_SYSTEM_PROMPT,
  FOLLOWUP_SYSTEM_PROMPT,
  composeSystemPrompt,
} from "./lib/prompts.js";
import { estimateTokens, chunkText } from "./lib/chunk.js";
import { sourceRect, isValidRect } from "./lib/crop.js";
import { bytesToBase64 } from "./lib/image.js";
import { isPdfUrl, extractPdfText, pdfNeedsVisionFallback } from "./lib/pdf.js";
import { redact } from "./lib/redact.js";
import { addEntry, searchEntries } from "./lib/history.js";
import { get as storageGet, set as storageSet } from "./lib/storage.js";
import { buildMessages } from "./lib/conversation.js";
import { preflight, textError, titleFor, messageFor } from "./lib/errors.js";
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

const captureModeSelect = document.getElementById("capture-mode");
const languageSelect = document.getElementById("language");
const domainModeSelect = document.getElementById("domain-mode");
const emptyState = document.getElementById("empty-state");
const modeBadge = document.getElementById("mode-badge");
const methodBadge = document.getElementById("method-badge");
const redactBadge = document.getElementById("redact-badge");
const privacyToggle = document.getElementById("privacy");
const historyView = document.getElementById("history-view");
const historySearch = document.getElementById("history-search");
const historyList = document.getElementById("history-list");
const historyToggle = document.getElementById("history-toggle");
const counter = document.getElementById("counter");
const skeleton = document.getElementById("skeleton");
const cards = document.getElementById("cards");
const errorBox = document.getElementById("error");
const errorTitle = document.getElementById("error-title");
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
// Output language code and the domain-mode override ("auto" resolves per URL).
let language = "en";
let modeOverride = domainModeSelect.value;
// When on, identifiers are masked before any text leaves the browser.
let privacyMode = false;

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
  hide(emptyState, cards, errorBox, counter, methodBadge, modeBadge, redactBadge, historyView, copyButton, downloadButton);
  show(skeleton);
}

function showEmptyState() {
  hide(skeleton, cards, errorBox, counter, methodBadge, modeBadge, redactBadge, historyView, copyButton, downloadButton);
  show(emptyState);
}

// Show the domain mode that shaped the summary, as a header badge.
function setModeBadge(modeKey) {
  modeBadge.textContent = MODE_LABELS[modeKey] || modeKey;
  show(modeBadge);
}

// Resolve the effective mode: the manual override, or auto-detected from URL.
function effectiveMode(rawUrl) {
  return modeOverride === "auto" ? selectMode(rawUrl) : modeOverride;
}

// Name the capture or extraction method that produced the summary, as a badge.
function setBadge(method) {
  const labels = {
    readability: "Readability",
    heuristic: "Heuristic",
    selection: "Selection",
    region: "Region",
    pdf: "PDF",
  };
  methodBadge.textContent = labels[method] || method;
  show(methodBadge);
}

// A one-line status in place of the cards: drag prompts, section progress, etc.
function showStatus(message) {
  counter.textContent = message;
  hide(emptyState, skeleton, cards, errorBox, methodBadge, modeBadge, redactBadge, historyView, copyButton, downloadButton);
  show(counter);
}

// Long pages are read section by section; show progress in place of tokens.
function showCounter(done, total) {
  showStatus(`Reading section ${done} of ${total}`);
}

function showError({ code, message }, action) {
  hide(emptyState, skeleton, cards, counter, methodBadge, modeBadge, redactBadge, historyView, copyButton, downloadButton);
  errorTitle.textContent = titleFor(code);
  errorMessage.textContent = message || messageFor(code);
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
  const bytes = new Uint8Array(await cropped.arrayBuffer());
  return { mimeType: "image/png", data: bytesToBase64(bytes) };
}

// Collect a full model response without rendering, for the map step.
async function collectModel(args) {
  let full = "";
  for await (const delta of streamModel(args)) full += delta;
  return full;
}

// Stream a structured summary into the cards. Accepts text and/or an image.
// Returns the parsed sections, or null if the model produced nothing.
async function streamStructured(
  apiKey,
  { userText, image, systemPrompt = SUMMARY_SYSTEM_PROMPT, maskOutput = false }
) {
  // A screenshot cannot be text-redacted before upload, so for vision captures
  // in privacy mode the model's OUTPUT is masked instead: identifiers the model
  // read off the image never reach the cards, the export or the history.
  const view = (text) => (maskOutput ? redact(text).text : text);
  let full = "";
  let receivedAny = false;
  for await (const delta of streamModel({
    apiKey,
    systemPrompt,
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
    renderCards(parseSections(view(full)));
  }

  if (!receivedAny) return null;
  if (maskOutput) {
    const { count } = redact(full);
    redactBadge.textContent = `${count} redacted`;
    show(redactBadge);
  }
  const sections = parseSections(view(full));
  renderCards(sections, { final: true });
  return sections;
}

// Summarize extracted text: one streamed pass when it fits, otherwise a
// map-reduce that condenses each chunk in parallel, then structures the notes.
async function summarizeText(apiKey, text, systemPrompt) {
  if (estimateTokens(text) <= SINGLE_PASS_TOKEN_LIMIT) {
    return streamStructured(apiKey, { userText: text, systemPrompt });
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
  return streamStructured(apiKey, { userText: combined, systemPrompt });
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
      systemPrompt: composeSystemPrompt(FOLLOWUP_SYSTEM_PROMPT, {
        langCode: language,
      }),
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

// Redact when privacy mode is on, and surface the count as a badge. Runs
// before setContext and the request body are built, so redacted values never
// reach the network in the summary or in follow-ups.
function applyPrivacy(text) {
  if (!privacyMode) return text;
  const { text: cleaned, count } = redact(text);
  redactBadge.textContent = `${count} redacted`;
  show(redactBadge);
  return cleaned;
}

// Store the finished summary for export, reveal the export buttons, and add it
// to the local history (capped in lib/history.js).
async function finalizeSummary(sections, title, url) {
  if (!sections) {
    showError({
      code: "MODEL_DECLINED",
      message: "The model returned no summary.",
    });
    return;
  }
  lastSummary = { title, url, sections };
  show(copyButton, downloadButton);

  const entry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title,
    url,
    timestamp: Date.now(),
    sections,
  };
  const list = (await storageGet("history")) || [];
  await storageSet("history", addEntry(list, entry));
}

// Render the history list, filtered by the search box, newest first.
async function renderHistory() {
  const list = (await storageGet("history")) || [];
  const matches = searchEntries(list, historySearch.value);
  historyList.textContent = "";
  if (!matches.length) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = list.length ? "No matches." : "No summaries yet.";
    historyList.append(empty);
    return;
  }
  for (const item of matches) {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "history-row";
    const title = document.createElement("strong");
    title.textContent = item.title || "Untitled";
    const meta = document.createElement("span");
    meta.className = "muted";
    meta.textContent = `${new Date(item.timestamp).toLocaleString()} · ${item.url}`;
    row.append(title, meta);
    row.addEventListener("click", () => {
      // Restore the stored summary into the cards for reading and export.
      hide(historyView, emptyState, errorBox, counter);
      renderCards(item.sections, { final: true });
      show(cards);
      lastSummary = { title: item.title, url: item.url, sections: item.sections };
      show(copyButton, downloadButton);
    });
    historyList.append(row);
  }
}

function toggleHistory() {
  if (historyView.hidden) {
    hide(emptyState, skeleton, cards, errorBox, counter);
    show(historyView);
    renderHistory();
  } else {
    hide(historyView);
    if (lastSummary) show(cards);
    else showEmptyState();
  }
}

async function summarizePage(apiKey, tab) {
  // A PDF has no readable DOM to inject into; parse its bytes with pdf.js.
  if (isPdfUrl(tab.url ?? "")) {
    await summarizePdf(apiKey, tab);
    return;
  }

  const page = await extractPage(tab.id);
  const readableChars = page?.text?.trim().length ?? 0;
  const thin = textError(readableChars);
  if (thin) {
    // Offer the visual route: screenshot the page and summarize it as an image.
    showError(thin, {
      label: "Summarize visually",
      onClick: () => summarizeVisibleTab(tab),
    });
    return;
  }
  const mode = effectiveMode(tab.url ?? "");
  setModeBadge(mode);
  setBadge(page.method);
  const cleaned = applyPrivacy(page.text);
  setContext({ text: cleaned, title: page.title, url: page.url });
  const systemPrompt = composeSystemPrompt(SUMMARY_SYSTEM_PROMPT, {
    modeKey: mode,
    langCode: language,
  });
  const sections = await summarizeText(apiKey, cleaned, systemPrompt);
  finalizeSummary(sections, page.title, page.url);
}

// Screenshot the visible tab and summarize it as an image. The core is shared
// by the "summarize visually" button and the PDF fallback; it assumes an API
// key and the running guard are already handled by the caller.
async function visualSummarize(apiKey, tab) {
  const dataUrl = await chrome.runtime.sendMessage({
    type: "CAPTURE_TAB",
    windowId: tab.windowId,
  });
  if (!dataUrl) {
    showError({ code: "NETWORK", message: "Could not capture the screen." });
    return;
  }
  const image = { mimeType: "image/png", data: dataUrl.split(",")[1] };
  setBadge("region");
  setContext({ image, text: "", title: tab.title, url: tab.url });
  const sections = await streamStructured(apiKey, {
    userText: REGION_USER_PROMPT,
    image,
    systemPrompt: composeSystemPrompt(VISION_SYSTEM_PROMPT, { langCode: language }),
    maskOutput: privacyMode,
  });
  finalizeSummary(sections, tab.title, tab.url);
}

// The "summarize visually" fallback button handler: owns the running guard and
// key check, then runs the shared visual summary.
async function summarizeVisibleTab(tab) {
  if (running) return;
  running = true;
  showSkeleton();
  try {
    const apiKey = await getApiKey();
    if (!apiKey) {
      showError({ code: "NO_KEY", message: messageFor("NO_KEY") });
      return;
    }
    await visualSummarize(apiKey, tab);
  } catch (error) {
    console.error("Visual summary failed:", error?.code || "", error?.message || error);
    showError(error?.code ? error : { code: "NETWORK", message: messageFor("NETWORK") });
  } finally {
    running = false;
  }
}

// Parse a PDF's text with pdf.js and summarize it. Falls back to the visual
// route when parsing yields too little text (scanned or image-only PDFs).
async function summarizePdf(apiKey, tab) {
  showStatus("Reading the PDF…");
  let text = "";
  try {
    text = await extractPdfText(tab.url);
  } catch (error) {
    console.error("PDF parse failed:", error?.message || error);
  }

  if (pdfNeedsVisionFallback(text)) {
    await visualSummarize(apiKey, tab);
    return;
  }

  const mode = effectiveMode(tab.url ?? "");
  setModeBadge(mode);
  setBadge("pdf");
  const cleaned = applyPrivacy(text);
  setContext({ text: cleaned, title: tab.title, url: tab.url });
  const systemPrompt = composeSystemPrompt(SUMMARY_SYSTEM_PROMPT, {
    modeKey: mode,
    langCode: language,
  });
  const sections = await summarizeText(apiKey, cleaned, systemPrompt);
  finalizeSummary(sections, tab.title, tab.url);
}

async function summarizeSelection(apiKey, tab) {
  const text = await getSelectionText(tab.id);
  if (!text.trim()) {
    // A gentle prompt rather than an error: the user may have picked Selection
    // mode before highlighting anything. They can select, then click Summarize.
    showStatus("Select some text on the page, then click Summarize.");
    return;
  }
  const mode = effectiveMode(tab.url ?? "");
  setModeBadge(mode);
  setBadge("selection");
  const cleaned = applyPrivacy(text);
  setContext({ text: cleaned, title: tab.title, url: tab.url });
  const systemPrompt = composeSystemPrompt(SUMMARY_SYSTEM_PROMPT, {
    modeKey: mode,
    langCode: language,
  });
  const sections = await summarizeText(apiKey, cleaned, systemPrompt);
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
    systemPrompt: composeSystemPrompt(VISION_SYSTEM_PROMPT, { langCode: language }),
    maskOutput: privacyMode,
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

    const restriction = preflight(tab.url ?? "");
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
      : { code: "NETWORK", message: messageFor("NETWORK") };
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

languageSelect.addEventListener("change", () => {
  language = languageSelect.value;
  setLanguage(language);
  reSummarize();
});

domainModeSelect.addEventListener("change", () => {
  modeOverride = domainModeSelect.value;
  reSummarize();
});

privacyToggle.addEventListener("change", () => {
  privacyMode = privacyToggle.checked;
  reSummarize();
});

historyToggle.addEventListener("click", toggleHistory);
historySearch.addEventListener("input", renderHistory);

// Restore the saved output language so it persists across sessions.
getLanguage().then((saved) => {
  language = saved;
  languageSelect.value = saved;
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
