// Domain-aware mode selection. Maps a tab URL to a summary shape (GitHub PR,
// email, issue tracker, research paper, docs, news) with a generic fallback.
// Pure and unit tested; the prompt fragments live in lib/prompts.js.

const MATCHERS = [
  {
    key: "github-pr",
    test: (url) =>
      url.hostname === "github.com" && /\/pull\/\d+/.test(url.pathname),
  },
  { key: "gmail", test: (url) => url.hostname === "mail.google.com" },
  {
    key: "jira",
    test: (url) =>
      url.hostname.endsWith(".atlassian.net") || url.hostname.includes("jira"),
  },
  { key: "paper", test: (url) => url.hostname.endsWith("arxiv.org") },
  {
    key: "docs",
    test: (url) =>
      url.hostname.startsWith("docs.") || url.pathname.includes("/docs/"),
  },
  {
    key: "news",
    test: (url) =>
      /(^|\.)(thehindu\.com|eenadu\.net|bbc\.com|nytimes\.com|reuters\.com)$/.test(
        url.hostname
      ),
  },
];

export const MODE_LABELS = {
  "github-pr": "GitHub PR",
  gmail: "Email",
  jira: "Jira",
  paper: "Paper",
  docs: "Docs",
  news: "News",
  generic: "General",
};

export function selectMode(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return "generic";
  }
  for (const matcher of MATCHERS) {
    if (matcher.test(url)) return matcher.key;
  }
  return "generic";
}
