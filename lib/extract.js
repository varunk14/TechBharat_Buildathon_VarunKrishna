// Content extraction ladder: Readability on a cloned document, then a heuristic
// DOM walk, then the caller reports an honest failure. See PRD 7.3.
//
// This file is injected into the page as a classic script (alongside content.js)
// and is also imported for side-effect by the unit tests, so it uses no ES
// module syntax and exposes its functions on globalThis.GlanceExtract instead.

(function () {
  "use strict";

  // Subtrees that never carry article content and only add noise.
  const JUNK = new Set([
    "SCRIPT", "STYLE", "NOSCRIPT", "NAV", "FOOTER", "ASIDE",
    "SVG", "CANVAS", "TEMPLATE", "FORM", "BUTTON", "SELECT",
  ]);

  // Elements whose text is taken whole rather than recursed into.
  const BLOCK = new Set([
    "P", "LI", "BLOCKQUOTE", "FIGCAPTION", "TD", "TH", "DD", "DT",
  ]);

  const HEADINGS = { H1: 1, H2: 2, H3: 3, H4: 4, H5: 5, H6: 6 };

  function headingPrefix(tagName) {
    const level = HEADINGS[tagName];
    return level ? "#".repeat(level) : "";
  }

  function normalize(text) {
    return (text || "").replace(/\s+/g, " ").trim();
  }

  function isHidden(el) {
    if (el.hidden || el.getAttribute("aria-hidden") === "true") return true;
    const view = el.ownerDocument && el.ownerDocument.defaultView;
    if (view && typeof view.getComputedStyle === "function") {
      const style = view.getComputedStyle(el);
      if (style && (style.display === "none" || style.visibility === "hidden")) {
        return true;
      }
    }
    return false;
  }

  // Walk the tree and emit each visible block once, preserving heading levels as
  // markdown so the model can see document structure. Repeated blocks (shared
  // navigation text, duplicated callouts) are dropped after their first use.
  function heuristicExtractMarkdown(root) {
    if (!root) return "";
    const lines = [];
    const seen = new Set();

    function push(line, dedupKey) {
      const key = dedupKey.toLowerCase();
      if (!key) return;
      if (seen.has(key)) return;
      seen.add(key);
      lines.push(line);
    }

    function walk(node) {
      for (const el of node.children) {
        const tag = el.tagName;
        if (JUNK.has(tag) || isHidden(el)) continue;

        if (tag === "PRE") {
          // Preserve code block formatting; do not collapse its whitespace.
          const code = el.textContent.replace(/\s+$/, "");
          if (code.trim()) push("```\n" + code + "\n```", normalize(code));
          continue;
        }

        const level = HEADINGS[tag];
        if (level) {
          const text = normalize(el.textContent);
          if (text) push(`${"#".repeat(level)} ${text}`, text);
          continue;
        }

        if (BLOCK.has(tag)) {
          const text = normalize(el.textContent);
          if (text) push(tag === "LI" ? `- ${text}` : text, text);
          continue;
        }

        walk(el);
      }
    }

    walk(root);
    return lines.join("\n\n");
  }

  // Run the ladder. Readability mutates the document it is given, so it always
  // receives a deep clone. Falls back to the heuristic walk when Readability
  // returns nothing substantial (dashboards, marketing pages, homepages).
  function extract(doc, ReadabilityCtor) {
    if (ReadabilityCtor) {
      try {
        const article = new ReadabilityCtor(doc.cloneNode(true)).parse();
        const text = article && article.textContent ? article.textContent.trim() : "";
        if (text.length >= 200) {
          return { method: "readability", title: article.title || doc.title, text };
        }
      } catch (error) {
        // Readability throws on some malformed documents; fall through.
      }
    }

    const body = doc.body || doc.documentElement;
    return {
      method: "heuristic",
      title: doc.title,
      text: heuristicExtractMarkdown(body),
    };
  }

  globalThis.GlanceExtract = { extract, heuristicExtractMarkdown, headingPrefix };
})();
