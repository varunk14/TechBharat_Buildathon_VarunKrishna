# Product Requirements Document

**Project:** Lens — in-page summarization for Chrome
**Type:** Manifest V3 Chrome Extension
**Build window:** Under 24 hours
**Status:** Pre-development

---

## 1. Problem

A knowledge worker spends the day inside a browser: long email threads, dense internal wikis, dashboards with forty metrics, sixty-comment pull requests, regulatory PDFs, research papers. The information they need is almost always already on screen. The cost is the reading.

The current workaround is manual: select text, copy, switch tabs, paste into a chatbot, ask for a summary, switch back, lose your place. That loop is slow enough that most people skim instead. Skimming is where details get missed.

## 2. Solution

A Chrome extension that removes the loop. One shortcut, and whatever is on screen is summarized in place, in a structured form the user can act on, without leaving the tab.

## 3. Non-goals

Explicitly out of scope. Do not build these.

- A browser agent that clicks, fills forms, or navigates on the user's behalf. This project is about comprehension, not automation.
- Publishing to the Chrome Web Store. A loadable unpacked build is sufficient.
- User accounts, cloud sync, or any server-side persistence.
- A settings panel beyond the API key and output language.

## 4. Target user

A professional who reads 20+ dense pages a day and needs the substance of each in under 30 seconds, with enough traceability to trust it.

## 5. Success metrics

These are the exact criteria the project is evaluated against.

| Metric | Target | How it is measured |
|---|---|---|
| Page coverage | Usable summary on every page in the test set | Run the eight-page test set |
| Faithfulness | Zero invented facts across five spot-checked summaries | Compare summary claims to page content |
| Compression | 90 percent or more length reduction, key points intact | Read page and summary side by side |
| Time to first token | Under 3 seconds at p50, 2,000-word page, normal broadband | Observed live |
| Effort to invoke | Two clicks or one shortcut, no copy-paste | Observed live |
| Failure honesty | Blocked pages produce a clear error, never a fake summary | Test one unreadable page |

## 6. The test set

Every feature decision traces back to these eight pages. They are the acceptance environment.

| # | URL | Primary challenge |
|---|---|---|
| 1 | https://paradigmit.ai/ | JS-rendered marketing site, little prose |
| 2 | https://www.thehindu.com/ | News homepage, not an article; heavy ads |
| 3 | https://www.eenadu.net/ | Telugu script, homepage layout |
| 4 | https://docs.python.org/3.13/library/sched.html | Static docs with code blocks |
| 5 | https://play.grafana.org/d/000000110/business-metrics | Canvas/SVG charts, no useful text layer |
| 6 | https://github.com/anthropics/claude-agent-sdk-python/pull/1076 | SPA, lazy-loaded comments |
| 7 | https://arxiv.org/pdf/1706.03762 | PDF in Chrome's built-in viewer |
| 8 | https://www.seangoedecke.com/llms-reward-expertise/ | Clean blog post (baseline) |

Pages 5 and 7 will defeat any text-only extension. They are the differentiators.

---

## 7. Functional requirements

### 7.1 Invocation (P0)

- Toolbar icon opens the side panel on any `http` or `https` page.
- Keyboard shortcut `Ctrl+Shift+S` (`Cmd+Shift+S` on macOS) does the same.
- Nothing is captured or transmitted until the user takes one of these deliberate actions. No background scraping, no content scripts registered at page load.

### 7.2 Capture modes (P0)

Three modes, selectable in the panel header:

1. **Whole page** — default. Extract the main readable content.
2. **Selection** — summarize only the user's current text selection.
3. **Region** — the user drags a rectangle; the extension screenshots and crops that area and summarizes it visually.

### 7.3 Content extraction (P0)

Extraction runs as a ladder, stopping at the first success:

1. Readability (Mozilla) on a cloned document.
2. Heuristic DOM walk: visible leaf blocks, junk tags excluded, heading hierarchy preserved as markdown.
3. Screenshot plus vision model.
4. Honest failure with a reason.

Must handle: single-page applications, lazy-loaded content, same-origin iframes, and pages longer than the model context window.

The extraction method used must be recorded and displayed in the UI as a badge.

### 7.4 Structured output (P0)

Not prose. The model returns fixed markdown sections, rendered as separate cards:

- `TL;DR` — two lines maximum
- `Key Points` — 4 to 7 specific claims from the page
- `Numbers` — figures, dates, percentages, prices, metrics, copied exactly
- `Actions & Decisions` — anything the reader must do, any decision, any deadline

Absent sections render as "None found", never omitted silently.

### 7.5 Streaming (P0)

- Skeleton loader visible within 100 ms of invocation.
- First model token rendered within 3 seconds for a 2,000-word page.
- Section cards populate progressively as the stream fills them.
- For long pages requiring chunking, a progress counter ("Reading section 3 of 6") appears immediately in place of tokens.

### 7.6 Follow-up questions (P0)

- A persistent input at the bottom of the panel.
- Questions are answered against the already-captured context. No re-capture, no re-extraction.
- Conversation history is kept for the life of the panel session.
- If the answer is not in the captured content, the model must say so rather than answer from general knowledge.

### 7.7 Export (P0)

- Copy to clipboard as markdown.
- Download as a `.md` file named from the page title and date.

### 7.8 Graceful failure (P0)

Every failure produces a specific, readable explanation and an error code. Never an empty panel, never a fabricated summary.

| Condition | Code | User-facing message |
|---|---|---|
| `chrome://`, `edge://`, `about:`, `devtools:` URL | `RESTRICTED_SCHEME` | Chrome blocks all extensions from reading internal browser pages. This is a browser security rule, not a limitation of this extension. |
| Chrome Web Store URL | `WEBSTORE` | Chrome blocks extensions from running on the Web Store. |
| Non-web scheme (`file:`, `ftp:`) | `NOT_WEB` | This extension only works on http and https pages. |
| Extracted text under 200 characters | `NO_TEXT` | Only N characters of readable text found. This page is likely canvas or image based. Summarize it visually instead? |
| No API key stored | `NO_KEY` | No API key set. Open settings to add one. |
| HTTP 401 / 403 | `AUTH` | Your API key was rejected. Check it in settings. |
| HTTP 429 | `RATE_LIMIT` | Rate limited by the API. Wait a few seconds and retry. |
| Fetch throws | `NETWORK` | Could not reach the API. Check your internet connection. |
| Model returns `Cannot Summarize` | `MODEL_DECLINED` | The page content was too fragmentary to summarize. Reason shown below. |

### 7.9 Stretch features (P1, in priority order)

1. **Vision summaries** — region screenshot summarized by a vision model. Unlocks the Grafana test page. Highest value.
2. **PDF handling** — detect `.pdf` URLs, fetch and parse with pdf.js. Unlocks the arXiv test page.
3. **Domain-aware modes** — different prompt shape per site: GitHub PR, Gmail thread, Jira board, research paper, documentation, news. Covers four of the eight test pages.
4. **Multilingual output** — summarize into English, Hindi, Telugu, Tamil, Bengali, or Marathi; correctly summarize pages already in those scripts.
5. **Local history** — searchable list of past summaries with source URL and timestamp.
6. **Privacy mode** — detect and redact emails, phone numbers, PAN and Aadhaar style identifiers before anything leaves the browser. Show the redaction count.
7. **Inline highlighting** — each key point carries a verbatim source phrase; clicking scrolls the page to it and highlights it.
8. **Cross-tab synthesis** — select up to three open tabs, produce one comparative summary.

---

## 8. Non-functional requirements

### 8.1 Constraints

- Manifest V3.
- No API keys committed to the repository or shipped in the bundle. The key is user-supplied and stored in `chrome.storage.local`.
- No network destination other than the model API is permitted in `host_permissions`.
- Request only permissions actually used. Each must be justifiable in one sentence.

### 8.2 Permissions and justification

| Permission | Justification |
|---|---|
| `activeTab` | Grants access to one tab only, and only after the user clicks the icon or presses the shortcut. No standing access to any site. |
| `scripting` | Injects the extraction script on demand at the moment of invocation, not at page load. |
| `storage` | Stores the user's own API key and local summary history. Never transmitted. |
| `sidePanel` | Renders the UI without a popup that closes on click-away, which would destroy follow-up context. |
| `tabs` | Reads the URL and title of the active tab to select a domain-aware mode. |
| `host_permissions: <model API origin>` | The only network destination reachable by the extension. |

Explicitly not requested: `<all_urls>`, `webRequest`, `cookies`, `history`, `downloads`.

### 8.3 Performance budget

| Stage | Budget |
|---|---|
| Panel skeleton painted | 100 ms |
| Content script injected and extraction complete | 1200 ms |
| Request dispatched | 1400 ms |
| First token rendered | 3000 ms |
| Full summary complete, 2000-word page | 8000 ms |

Levers, in order of impact: call the API from the side panel rather than the service worker; extract less junk; cap `max_tokens` at 1500; parallelize chunk summarization with `Promise.all`.

---

## 9. Technical architecture

### 9.1 Stack decision

Plain HTML, CSS, and JavaScript with ES modules. No bundler, no framework, no build step.

Rationale: Chrome loads extension files directly from disk. Introducing Vite or a framework costs hours of bundler and service-worker configuration and produces zero user-visible value. The UI is a single panel of roughly 250 lines of DOM code.

UI surface is the Chrome Side Panel API, not a popup. Popups close on any click outside them, which would destroy the follow-up conversation state.

### 9.2 Model provider

**Primary: Google Gemini Flash.** Chosen for a free tier suitable for a hackathon, low latency, native image input for the Grafana page, and strong Indic script handling for the Telugu page.

All provider-specific code lives in `lib/providers/`. Swapping providers means writing one new adapter file that satisfies the `streamModel` interface. Do not let provider details leak into UI or extraction code.

### 9.3 Component responsibilities

| Component | Runs in | Responsibility |
|---|---|---|
| `background.js` | Service worker | Open the side panel on icon click and shortcut. Capture visible tab for screenshots. Nothing else. |
| `content.js` | The webpage | Extract text. Draw the region-selection overlay. Highlight source phrases. |
| `sidepanel.js` | Extension page | All UI. All model API calls, including streaming. All state. |
| `options.js` | Extension page | API key entry and deletion. Language preference. |

Critical design rule: **API calls originate in the side panel, not the service worker.** The side panel is a full extension page with host permissions and can stream a `fetch` response directly into the DOM. Routing streams through the service worker requires a long-lived port and risks the worker being terminated mid-stream.

### 9.4 File layout

```
lens/
  manifest.json
  background.js
  content.js
  sidepanel.html
  sidepanel.js
  sidepanel.css
  options.html
  options.js
  options.css
  lib/
    extract.js          content extraction ladder
    chunk.js            token estimation and map-reduce
    prompts.js          system prompts and domain modes
    redact.js           PII detection and masking
    storage.js          chrome.storage wrappers
    markdown.js         section parsing and rendering
    providers/
      gemini.js         streaming adapter
      index.js          provider selection
  vendor/
    Readability.js
    pdf.mjs
    pdf.worker.mjs
  icons/
    icon16.png icon48.png icon128.png
  tests/
    *.test.js
  docs/
    TESTING.md
  PRD.md
  CLAUDE.md
  progress.txt
  README.md
  .gitignore
```

### 9.5 Data flow, whole-page capture

```
User presses Ctrl+Shift+S
  -> background.js opens side panel
  -> sidepanel.js paints skeleton (100ms)
  -> sidepanel.js runs preflight on tab URL
  -> chrome.scripting.executeScript injects content.js
  -> sendMessage EXTRACT_PAGE
  -> content.js primes lazy content, waits for DOM stability, runs extraction ladder
  -> returns { method, title, url, text, wordCount, lang }
  -> sidepanel.js optionally redacts, selects domain mode, chunks if needed
  -> sidepanel.js opens streaming fetch to provider
  -> tokens append to DOM, sections parse progressively
  -> on completion, save to history
```

---

## 10. MVP breakdown

Twelve increments. Each ends in a committable, testable state. MVP 0 through 7 constitute the complete required feature set; 8 through 12 are stretch goals in strict priority order.

| MVP | Name | Budget | Exit criteria |
|---|---|---|---|
| 0 | Repository and scaffold | 45 min | Repo connected, all empty files present, extension loads unpacked without errors |
| 1 | Shell and settings | 1 h 15 | Icon and shortcut both open the side panel; API key saves and reads back |
| 2 | First streaming summary | 2 h 30 | Any blog page produces a streaming summary from raw `innerText` |
| 3 | Structured output and export | 1 h 30 | Four section cards render; copy and download markdown both work |
| 4 | Robust extraction | 3 h | All eight test pages return non-empty text or an honest failure |
| 5 | Selection and region capture | 2 h | Three capture modes work; region overlay crops correctly on a scaled display |
| 6 | Follow-up questions | 1 h 30 | Two consecutive questions answered without re-capture |
| 7 | Failure handling | 1 h | Every row in section 7.8 produces its specified message |
| 8 | Vision summaries | 2 h | Grafana chart region produces a trend description |
| 9 | PDF handling | 1 h | arXiv PDF produces a paper-shaped summary |
| 10 | Domain modes and language | 1 h 30 | Mode badge changes across test pages; Telugu output renders correctly |
| 11 | History and privacy | 1 h 30 | History is searchable; redaction count displayed |
| 12 | Polish, README, demo | 1 h 30 | README complete; demo rehearsed three times; backup video recorded |

Cumulative to MVP 7: approximately 13.5 hours. Everything after that is optional and ordered by demo value.

**Hard rule: do not begin MVP N+1 until MVP N's tests pass and its commit is pushed.**

---

## 11. Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Bundler or framework rabbit hole | High if React is used | No build step. Decided in 9.1. |
| Grafana page returns nothing usable | Certain without vision | MVP 8 exists specifically for this. Auto-offer screenshot mode when extraction is thin. |
| arXiv PDF unreadable by content script | Certain | MVP 9 uses pdf.js from the side panel, which can fetch the bytes directly. |
| Telugu text corrupted in transit | High if `TextDecoder` misused | `decode(value, { stream: true })` is mandatory. Covered by unit test. |
| Screenshot crop offset on retina display | High | Multiply all crop coordinates by `devicePixelRatio`. Covered by unit test. |
| Free tier rate limit hit during demo | Medium | Cache the last successful summary per URL. Have a second API key ready. |
| Running out of time | High, 24-hour window | MVP order is strict priority order. Stopping after MVP 7 still ships every required feature. |

---

## 12. Definition of done

The project is complete when:

- All eight test pages produce either a usable summary or a specific, accurate failure message.
- The full flow from shortcut to first token is under 3 seconds on a 2,000-word page.
- Five randomly spot-checked summaries contain zero claims absent from their source page.
- `chrome://settings` produces the `RESTRICTED_SCHEME` message.
- The repository contains no API key in any file or in any commit in its history.
- Every permission in the manifest can be justified in one sentence.
- The README allows a stranger to install and run the extension without asking a question.
