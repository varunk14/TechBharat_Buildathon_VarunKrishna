# Project rules

This file governs all work in this repository. Read it fully before making any change.

---

## Start of every session

Do these three things before writing code, in this order:

1. Read `progress.txt`. It is the source of truth for what is done, what is in progress, and what comes next.
2. Read the section of `PRD.md` covering the current MVP.
3. Confirm with the user which MVP is being worked on before starting.

Do not infer the current state from the code alone. `progress.txt` records decisions and known issues that the code does not express.

## End of every meaningful step

Update `progress.txt` before the commit, not after. The update and the code change belong in the same commit.

---

## Commit message rules

These rules are absolute. Violating any of them requires amending the commit.

### Never include AI attribution of any kind

The following must never appear in a commit message, commit body, commit trailer, PR description, code comment, or any file in this repository:

- `Co-Authored-By: Claude` or any co-author trailer naming an AI
- `Generated with Claude Code` or any similar generation notice
- The strings `Claude`, `Anthropic`, `AI-generated`, `AI-assisted`, `LLM`, `Copilot`, or `ChatGPT` used to describe authorship
- Any robot emoji, sparkle emoji, or other AI-associated symbol
- Any URL pointing to an AI product as an attribution

This applies to the visible message and to trailers. Before every commit, check the full message including trailers. If a trailer was added automatically, remove it and re-commit.

The commit history must read as though written by a single human engineer.

### Never use emoji in commit messages

No emoji anywhere in a commit subject or body. Plain text only.

### Format

Conventional Commits. Subject line under 72 characters, imperative mood, lowercase after the type prefix, no trailing period.

```
<type>(<scope>): <what changed>

<why it changed, and any consequence a reader needs to know>
```

Allowed types: `feat`, `fix`, `refactor`, `perf`, `test`, `docs`, `chore`, `build`.

Scope is the area touched: `extract`, `panel`, `background`, `provider`, `prompts`, `storage`, `manifest`, `tests`, `docs`.

### The message must be understandable by an outsider

Someone who has never seen this repository should understand what changed and why from the message alone. Name the concrete behaviour, not the file.

Good:

```
feat(extract): add heuristic fallback for pages Readability rejects

Readability returns null on dashboards and marketing sites that have no
article element. The fallback walks visible leaf nodes, skips nav, footer
and script tags, and preserves heading levels as markdown so the model can
see document structure. Grafana and paradigmit.ai now return usable text
instead of an empty string.
```

```
fix(panel): preserve multi-byte characters across stream chunks

TextDecoder was decoding each network chunk independently, which split
Telugu and Devanagari characters that span a chunk boundary and produced
replacement characters mid-word. Passing { stream: true } makes the decoder
hold incomplete sequences until the next chunk arrives.
```

```
perf(panel): move model requests out of the service worker

Streaming through a runtime port added roughly 400ms before the first
token and dropped the stream whenever the worker was evicted. The side
panel is a full extension page and can fetch directly, so the port and its
reconnection logic are removed.
```

Bad, and why:

- `update files` — says nothing
- `fix bug` — which bug
- `feat: added new stuff to extraction` — past tense, vague
- `WIP` — do not commit work in progress to the main branch
- `feat(extract): update extract.js` — names the file, not the behaviour
- Anything containing an emoji or an AI attribution trailer

### Commit granularity

One commit per logical change. Do not bundle an unrelated refactor into a feature commit. Do not split one coherent change across five commits.

At minimum, commit once per completed MVP. Within an MVP, commit at each point where the code is in a working state.

---

## Git workflow

- `main` is the only long-lived branch.
- Work directly on `main` for this project. The 24-hour window does not justify branch overhead.
- Push after every MVP is complete and its tests pass. Never push a broken `main`.
- Before pushing, run the test suite and confirm the extension still loads unpacked without console errors.
- Never force-push.
- Never commit `.env`, any file containing a key, or `node_modules/`.

Sequence at the end of each MVP:

```
npm test
git add -A
git status          # confirm no keys, no node_modules, no stray files
git commit -m "..." # then verify: git log -1 --format=%B
git push origin main
```

Always run `git log -1 --format=%B` after committing to inspect the full message including trailers. If anything prohibited appears, run `git commit --amend` and fix it before pushing.

---

## Code rules

### Language and structure

- Plain JavaScript, ES modules. No TypeScript, no framework, no bundler, no build step.
- One responsibility per file. If a file exceeds roughly 250 lines, split it.
- No default exports except for a module's single primary function.
- Use `async/await`. Do not chain `.then()`.

### Architecture boundaries

These boundaries must not be crossed:

- `background.js` contains only side panel opening and tab screenshot capture. No extraction logic, no model calls, no UI.
- `content.js` never calls the model API and never touches `chrome.storage`. It reads the DOM and replies to messages.
- All model API calls happen in `sidepanel.js`, through `lib/providers/`.
- Provider-specific request shapes, header names, and response parsing live only in `lib/providers/`. If a provider name appears anywhere else in the codebase, that is a bug.
- Prompt text lives only in `lib/prompts.js`. Never inline a prompt string at a call site.

### Error handling

- Every `catch` produces a typed error object `{ code, message }` from the table in PRD section 7.8.
- Never swallow an error silently. Never show a raw exception string to the user.
- Never render an empty state where a summary should be. Show the reason instead.

### Comments

- Comment why, not what. Do not narrate the code.
- Every non-obvious workaround gets one line explaining the failure it prevents. The `devicePixelRatio` multiplication, the `{ stream: true }` flag, the `return true` in message listeners, and the document clone before Readability all require such a comment.
- No comment may mention AI assistance.

### Dependencies

- No npm dependencies in the shipped extension. Vendored files only, in `vendor/`, with the source URL and version recorded in `README.md`.
- Dev dependencies for testing are permitted and live in `devDependencies`.

---

## Testing rules

Every MVP ships with both:

1. **Unit tests** in `tests/`, run with `npm test` (Vitest). These cover pure functions: chunking, redaction, section parsing, language detection, crop coordinate maths, URL preflight classification.
2. **A manual checklist entry** in `docs/TESTING.md`, covering behaviour that cannot be unit tested: does the shortcut open the panel, does the region overlay crop correctly, does the Telugu output render.

Rules:

- Write the test before or alongside the code, never as a later cleanup pass.
- A test must fail if the behaviour regresses. A test that passes against a stubbed-out implementation is worthless.
- DOM-dependent code is tested against a minimal fixture string, not against the live internet.
- Do not mock the thing you are testing.
- Never mark an MVP complete with a failing or skipped test. If a test must be disabled, record it in `progress.txt` under Known Issues with a reason.

---

## Documentation rules

### README

Written for a stranger with no context. It must contain, in order: what the extension does in two sentences, a screenshot, install steps for an unpacked build, how to obtain and enter an API key, the permission table with justifications, the architecture summary, the vendored file list with versions, and how to run the tests.

No emoji. No marketing language. No mention of AI assistance in authorship. Describing the extension's use of a language model as a product feature is correct and expected; describing the code as AI-written is not.

### progress.txt

Follow the format already in the file. Append to the log; never rewrite history in it. Keep the "Next action" line accurate at all times, since it is the first thing read in a fresh session.

---

## Things that will break this project

Check these before asking why something does not work.

- Missing `return true` in a `chrome.runtime.onMessage` listener causes a silent `undefined` response with no error.
- Forgetting `devicePixelRatio` when cropping a screenshot offsets the crop on any scaled or retina display.
- Omitting `{ stream: true }` from `TextDecoder.decode` corrupts multi-byte characters at chunk boundaries. English is unaffected, which makes this invisible until the Telugu test.
- Readability mutates the document it is given. Always pass `document.cloneNode(true)`.
- Editing `background.js` requires reloading the extension in `chrome://extensions`. Editing `content.js` additionally requires refreshing the target page.
- A popup surface loses all state on click-away. This project uses the side panel for that reason.
- Sending raw `innerText` to the model produces summaries about the cookie banner.
