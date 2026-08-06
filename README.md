# Glance

A Chrome extension that summarizes whatever is on screen, in place, without leaving the tab. One keyboard shortcut turns a long article, pull request, dashboard or paper into a two-line summary, key points, extracted numbers and action items.


## Why

The information a knowledge worker needs is almost always already on screen. The cost is the reading. The usual workaround — select, copy, switch tab, paste into a chatbot, switch back — is slow enough that most people skim instead, and skimming is where details get missed. Glance removes that loop.

## Features

- Invocation from the toolbar icon or `Ctrl+Shift+S` (`Cmd+Shift+S` on macOS)
- Three capture modes: whole page, current text selection, or a dragged screen region
- Extraction that survives single-page applications, lazy-loaded content and pages longer than the model context window
- PDF summarization: `.pdf` URLs are parsed page by page, with a visual fallback for scanned documents
- Vision summaries: charts and dashboards without a text layer are read from a screenshot, and illegible values are reported as illegible rather than guessed
- Structured output: two-line summary, key points, numbers, actions and decisions
- Output in English, Hindi, Telugu, Tamil, Bengali or Marathi
- Domain-aware summaries: a GitHub pull request, a news page and API docs each get an appropriate shape, shown as a badge
- Follow-up questions against the captured page, with no re-capture
- Streaming responses with progress visible in under two seconds
- Copy to clipboard and export as markdown
- Searchable local history of past summaries
- Privacy mode: emails, phone numbers, PAN, Aadhaar and card numbers are masked before anything leaves the browser, with a visible count
- Honest failure: unreadable pages produce a specific reason, never a fabricated summary

## Install

This is an unpacked development build. It is not on the Chrome Web Store.

1. Clone the repository.
   ```
   git clone https://github.com/varunk14/TechBharat_Buildathon_VarunKrishna.git
   cd TechBharat_Buildathon_VarunKrishna
   ```
2. Open `chrome://extensions` in Chrome.
3. Enable **Developer mode** using the toggle in the top right.
4. Click **Load unpacked** and select the cloned folder.
5. The Glance icon appears in the toolbar. Pin it for convenience.

## API key

Glance calls a model API using a key you supply. No key is bundled with the extension or committed to this repository.

1. Obtain a Google AI Studio API key from https://aistudio.google.com/apikey
2. Right-click the Glance toolbar icon and choose **Options**.
3. Paste the key and click Save.

The key is stored in `chrome.storage.local`. It stays on your machine and is sent only to the model API endpoint declared in the manifest. Deleting it from the options page removes it completely.

**Disclosure:** when you invoke a summary, the readable content of the current page (or your selection, or a screenshot of the region you draw) is sent to the Google Gemini API to generate the summary. Nothing is sent without that deliberate action, and no other destination is reachable from the extension. Privacy mode additionally masks emails, phone numbers, PAN, Aadhaar and card numbers before anything leaves the browser.

## Usage

| Action | How |
|---|---|
| Summarize the page | Press `Ctrl+Shift+S`, or click the toolbar icon |
| Summarize a selection | Highlight text, then invoke |
| Summarize a chart or region | Open the panel, choose Region, drag a rectangle |
| Summarize a PDF | Open the PDF and invoke as usual |
| Change the output language | Pick a language in the panel bar; the summary re-runs |
| Ask a follow-up | Type in the box at the bottom of the panel and press Enter |
| Export | Use Copy or Download in the panel header |
| Find a past summary | Click History and search by title, address or content |
| Mask personal data | Tick Privacy before summarizing; the count of masked items is shown |

## Permissions

Every permission requested, and why.

| Permission | Reason |
|---|---|
| `activeTab` | Grants access to a single tab, and only after you click the icon or press the shortcut. There is no standing access to any site. |
| `scripting` | Injects the extraction script on demand at the moment of invocation, not at page load. |
| `storage` | Stores your API key and local summary history on this device. |
| `sidePanel` | Renders the interface in the side panel rather than a popup, so it does not close when you click the page. |
| `tabs` | Reads the URL and title of the active tab to choose an appropriate summary format. |
| `https://generativelanguage.googleapis.com/*` | The only network destination the extension can reach. |

Not requested: `<all_urls>`, `webRequest`, `cookies`, `history`, `downloads`.

Nothing is captured or transmitted without a deliberate action. There is no background scraping and no content script registered at page load.

## Architecture

Plain HTML, CSS and ES modules. No bundler and no build step — Chrome loads the files directly.

| Component | Runs in | Responsibility |
|---|---|---|
| `background.js` | Service worker | Opens the side panel, captures tab screenshots |
| `content.js` | The webpage | Extracts text, draws the region overlay, highlights sources |
| `sidepanel.js` | Extension page | Interface, state, and all model API calls |
| `options.js` | Extension page | API key and language preferences |

Model requests originate in the side panel rather than the service worker. The side panel is a full extension page and can stream a `fetch` response directly into the DOM; routing through the service worker would add latency and risk the worker being evicted mid-stream.

Content extraction runs as a ladder, stopping at the first success: Readability on a cloned document, then a heuristic DOM walk that preserves heading structure, then a screenshot summarized visually, then an explicit failure with a reason.

Provider-specific code is isolated in `lib/providers/`. Supporting a different model means adding one adapter file.

## Vendored files

Bundled directly rather than installed, since the extension ships without dependencies.

| File | Source | Version |
|---|---|---|
| `vendor/Readability.js` | https://github.com/mozilla/readability | 0.5.0 |
| `vendor/pdf.mjs` | https://github.com/mozilla/pdf.js | 4.2.67 |
| `vendor/pdf.worker.mjs` | https://github.com/mozilla/pdf.js | 4.2.67 |

## Development

```
npm install
npm test              # run the unit test suite
npm run test:watch    # watch mode
```

After editing `background.js` or `manifest.json`, reload the extension in `chrome://extensions`.
After editing `content.js`, reload the extension and refresh the target page.

## Limitations

- Chrome blocks all extensions from reading internal browser pages (`chrome://`, the Web Store). Glance reports this rather than failing silently.
- Cross-origin iframes cannot be read. This is a browser security boundary, not a bug.
- Summary quality depends on the model and on how much readable structure the page exposes.
- Privacy mode masks identifiers in text before it is sent. A region screenshot is an image, which cannot be text-masked before upload; there, identifiers are masked in the generated summary instead, so they never appear in the panel, the export or the history.

## Licence

MIT
