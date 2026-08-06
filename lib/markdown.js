// Parses the four fixed sections out of the model's Markdown and assembles the
// document used for copy and download. Kept free of DOM code so the parsing and
// filename logic can be unit tested; the side panel does the actual rendering.

// The canonical section names and their render order (PRD 7.4).
export const SECTIONS = ["TL;DR", "Key Points", "Numbers", "Actions & Decisions"];

// Split Markdown into a map of heading -> body text. Works on a partial,
// mid-stream response: a section still being written is returned with whatever
// text has arrived so far. Text with no level-two heading yields {}.
export function parseSections(markdown) {
  const sections = {};
  if (!markdown) return sections;

  let current = null;
  let buffer = [];
  const flush = () => {
    if (current !== null) sections[current] = buffer.join("\n").trim();
  };

  for (const line of markdown.split("\n")) {
    const heading = /^##\s+(.+?)\s*$/.exec(line);
    if (heading) {
      flush();
      current = heading[1].trim();
      buffer = [];
    } else if (current !== null) {
      buffer.push(line);
    }
  }
  flush();
  return sections;
}

// Look up a section tolerantly, so a small heading variation from the model
// (case, spacing, punctuation) still maps to the intended card.
export function getSection(sections, name) {
  const normalize = (value) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
  const target = normalize(name);
  for (const key of Object.keys(sections)) {
    if (normalize(key) === target) return sections[key];
  }
  return "";
}

// Assemble the full Markdown document for copy and download. Absent sections
// are written as "None found" rather than dropped.
export function buildExportMarkdown({ title, url, sections }) {
  const lines = [`# ${title || "Summary"}`, ""];
  if (url) lines.push(`Source: ${url}`, "");
  for (const name of SECTIONS) {
    lines.push(`## ${name}`);
    lines.push(getSection(sections, name).trim() || "None found");
    lines.push("");
  }
  return `${lines.join("\n").trim()}\n`;
}

// Turn a page title into a filesystem-safe download name. Characters that are
// reserved on Windows or Unix paths are replaced so a title like "Docs: a/b"
// cannot escape the filename or break the download.
export function safeFilename(title, dateStr) {
  const base =
    (title || "summary")
      .replace(/[\/\\:*?"<>|]+/g, "-")
      .replace(/\s+/g, " ")
      .replace(/^\.+/, "")
      .trim()
      .slice(0, 80)
      .trim() || "summary";
  return `${base}-${dateStr}.md`;
}
