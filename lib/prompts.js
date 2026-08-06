// The single home for prompt text (CLAUDE.md architecture boundary). No prompt
// string may be inlined at a call site. The structured multi-section prompt and
// the per-domain modes are added in MVP 3 and MVP 10.

// MVP 2: a plain summary instruction, enough to prove the streaming path end to
// end. It is deliberately simple and gets replaced by the structured prompt.
export const SUMMARY_SYSTEM_PROMPT = [
  "You summarize the content of a web page for a busy reader.",
  "Be faithful: use only what the page states, and never invent facts.",
  "Copy any figures, dates and names exactly as they appear.",
  "Keep it short and skimmable.",
].join(" ");
